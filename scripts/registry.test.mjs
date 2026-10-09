import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, root } from './catalog.mjs';
import { registryDocument } from './registry.mjs';

const site = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const origin = site.repository.replace(/\/$/, '');
const commit = '0123456789abcdef0123456789abcdef01234567';
const count = (text, needle) => text.split(needle).length - 1;

test('the document names the catalog and the release first', async () => {
  const text = registryDocument(await loadCatalog(), site, commit);
  const body = text.slice(text.indexOf('\n\n') + 2);
  assert.ok(body.startsWith(`catalog!:\n  origin: ${JSON.stringify(origin)}\n\ncatalog/release!:\n  origin: ${JSON.stringify(origin)}\n  commit: "${commit}"\n`));
  assert.equal(count(text, '  commit: '), 1);
});

// A rule cannot mint an entity, and cannot see one another rule created in
// the same commit, so every identity is asserted directly, never through
// `this:`.
test('identities are asserted by content, with no this:', async () => {
  const templates = await loadCatalog();
  const text = registryDocument(templates, site, commit);
  assert.ok(!/^\s*this:/m.test(text));
  for (const t of templates) {
    assert.ok(text.includes(`catalog/entry!:\n  slug: ${JSON.stringify(t.slug)}\n`), t.slug);
    for (const f of t.files) {
      assert.ok(text.includes(`catalog/file!:\n  slug: ${JSON.stringify(t.slug)}\n  path: ${JSON.stringify(f.file)}\n`), `${t.slug}/${f.file}`);
    }
  }
});

test('each template is published whole: entry, features and files', async () => {
  const templates = await loadCatalog();
  const text = registryDocument(templates, site, commit);
  assert.equal(count(text, 'catalog/publish!:'), templates.length);
  assert.equal(count(text, 'catalog/publish-feature!:'), templates.reduce((n, t) => n + t.features.length, 0));
  assert.equal(count(text, 'catalog/publish-file!:'), templates.reduce((n, t) => n + t.files.length, 0));
  for (const t of templates) {
    const publish = `catalog/publish!:\n  origin: ${JSON.stringify(origin)}\n  slug: ${JSON.stringify(t.slug)}\n  name: ${JSON.stringify(t.name)}\n`;
    assert.ok(text.includes(publish), t.slug);
    assert.ok(text.includes(`  preview: !include/asset ../../templates/${t.slug}/${t.images[0].file}\n`), t.slug);
    for (const feature of t.features) {
      assert.ok(text.includes(`catalog/publish-feature!:\n  slug: ${JSON.stringify(t.slug)}\n  feature: ${JSON.stringify(feature)}\n`), feature);
    }
  }
});

test('template files are published as assets, never evaluated', async () => {
  const templates = await loadCatalog();
  const text = registryDocument(templates, site, commit);
  for (const t of templates) {
    for (const f of t.files) {
      assert.ok(text.includes([
        'catalog/publish-file!:',
        `  slug: ${JSON.stringify(t.slug)}`,
        `  path: ${JSON.stringify(f.file)}`,
        `  description: ${JSON.stringify(f.description)}`,
        `  optional: ${f.optional === true}`,
        `  content: !include/asset ../../templates/${t.slug}/${f.file}`,
      ].join('\n')), `${t.slug}/${f.file}`);
    }
  }
  // Only the asset include reaches a source file: no plain or text include.
  assert.ok(!/!include(\/text)? /.test(text));
});

test('only the commit differs between publishes of the same catalog', async () => {
  const templates = await loadCatalog();
  const first = registryDocument(templates, site, commit);
  const next = registryDocument(templates, site, 'f'.repeat(40));
  assert.equal(next.replace('f'.repeat(40), commit), first);
});

// Values are data. Anything a manifest says must stay a string literal, never
// become a variable, a symbol, a URI reference or a new key.
test('manifest text is written as quoted literals', async () => {
  const [first] = await loadCatalog();
  const hostile = { ...first, summary: '?this: id:x\n  extra!: yes # "quoted"', features: ['a: b', '{name}'] };
  const text = registryDocument([hostile], site, commit);
  assert.ok(text.includes(`  summary: ${JSON.stringify(hostile.summary)}\n`));
  assert.ok(text.includes(`  feature: ${JSON.stringify('a: b')}\n`));
  assert.ok(text.includes(`  feature: ${JSON.stringify('{name}')}\n`));
  assert.ok(!/^\s*extra!:/m.test(text));
});

test('links point at the configured gallery and repository', async () => {
  const [first] = await loadCatalog();
  const text = registryDocument([first], { ...site, url: 'https://example.test/gallery/', repository: 'https://github.com/o/r', branch: 'trunk' }, commit);
  assert.ok(text.includes(`  origin: "https://github.com/o/r"\n`));
  assert.ok(text.includes(`  page: "https://example.test/gallery/templates/${first.slug}/"`));
  assert.ok(text.includes(`  source: "https://github.com/o/r/tree/trunk/templates/${first.slug}"`));
});

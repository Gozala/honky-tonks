import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, root } from './catalog.mjs';
import { registryDocument } from './registry.mjs';

const site = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const commit = '0123456789abcdef0123456789abcdef01234567';

test('every catalog template is asserted under one revision, with the catalog record last', async () => {
  const templates = await loadCatalog();
  const { revision, text } = registryDocument(templates, site, commit);
  assert.match(revision, /^[a-f0-9]{16}$/);
  for (const t of templates) {
    assert.ok(text.includes(`  this: id:honky-tonks/template/${t.slug}\n`), t.slug);
    assert.ok(text.includes(`  preview: !include/asset ../../templates/${t.slug}/${t.images[0].file}\n`), t.slug);
  }
  assert.equal(text.split('honky/template!:').length - 1, templates.length);
  assert.equal(text.split(`  revision: "${revision}"`).length - 1, templates.length + 1);
  assert.ok(text.trimEnd().endsWith(`honky/catalog!:\n  this: id:honky-tonks/catalog\n  revision: "${revision}"\n  commit: "${commit}"`));
});

test('the revision follows content: same catalog, same revision; any change, a new one', async () => {
  const templates = await loadCatalog();
  const { revision } = registryDocument(templates, site, commit);
  assert.equal(registryDocument(structuredClone(templates), site, commit).revision, revision);
  const edited = structuredClone(templates);
  edited[0].summary += ' Edited.';
  assert.notEqual(registryDocument(edited, site, commit).revision, revision);
  assert.notEqual(registryDocument(templates.slice(1), site, commit).revision, revision, 'removing a template changes the listing');
});

test('the commit is recorded on the catalog without changing the revision', async () => {
  const templates = await loadCatalog();
  const first = registryDocument(templates, site, commit);
  const next = registryDocument(templates, site, 'f'.repeat(40));
  assert.equal(next.revision, first.revision);
  assert.ok(next.text.includes(`  commit: "${'f'.repeat(40)}"`));
  assert.equal(next.text.split('  commit: ').length - 1, 1, 'only the catalog record carries it');
});

// Values are data. Anything a manifest says must stay a string literal, never
// become a variable, a symbol, a URI reference or a new key.
test('manifest text is written as quoted literals', async () => {
  const [first] = await loadCatalog();
  const hostile = { ...first, summary: '?this: id:x\n  extra!: yes # "quoted"', features: ['a: b', '{name}'] };
  const { text } = registryDocument([hostile], site, commit);
  assert.ok(text.includes(`  summary: ${JSON.stringify(hostile.summary)}\n`));
  assert.ok(text.includes(`  features: ${JSON.stringify('• a: b\n• {name}')}\n`));
  assert.ok(!/^\s*extra!:/m.test(text));
});

test('links point at the configured gallery and repository', async () => {
  const [first] = await loadCatalog();
  const { text } = registryDocument([first], { ...site, url: 'https://example.test/gallery/', repository: 'https://github.com/o/r', branch: 'trunk' }, commit);
  assert.ok(text.includes(`  page: "https://example.test/gallery/templates/${first.slug}/"`));
  assert.ok(text.includes(`  source: "https://github.com/o/r/tree/trunk/templates/${first.slug}"`));
});

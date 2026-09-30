import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse, stringify } from 'yaml';
import { loadCatalog, pageCatalog, root } from './catalog.mjs';
async function fixture(run) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'honky-catalog-test-'));
  try {
    const directory = path.join(tmp, 'test-template');
    await mkdir(directory);
    await writeFile(path.join(directory, 'template.yaml'), stringify({
      schemaVersion: 1, slug: 'test-template', name: 'Test template',
      summary: 'Catalog validation fixture', description: 'Independent of bundled templates.',
      category: 'Test', version: '1.0.0', license: 'MIT',
      author: { name: 'Test author', url: null, contact: null },
      features: ['Repeated notation heads'],
      images: [{ file: 'preview.svg', alt: 'Preview', caption: 'Fixture preview' }],
      files: [{ file: 'app.yaml', description: 'Fixture notation' }],
      entrypoint: 'test-app', compatibility: 'Test only', notes: 'Test only',
    }));
    await writeFile(path.join(directory, 'app.yaml'), 'test-app!:\n  title: First\ntest-app!:\n  title: Second\n');
    await writeFile(path.join(directory, 'preview.svg'), '<svg><rect width="1" height="1"/></svg>');
    await run(tmp);
  } finally { await rm(tmp, { recursive: true, force: true }); }
}
async function change(tmp, update) {
  const p = path.join(tmp, 'test-template/template.yaml');
  const value = parse(await readFile(p, 'utf8'));
  update(value);
  await writeFile(p, stringify(value));
}
test('bundled templates preserve notation bytes and file order', async () => {
  const templates = await loadCatalog();
  assert.ok(templates.length > 0);
  for (const t of templates) for (const f of t.files) {
    assert.equal(f.source, await readFile(path.join(root, 'templates', t.slug, f.file), 'utf8'));
    assert.match(f.sha256, /^[a-f0-9]{64}$/);
  }
});
test('page catalog excludes optional payloads without changing source downloads', async () => {
  const templates = await loadCatalog();
  const original = structuredClone(templates);
  const pages = pageCatalog(templates);
  for (const [i, t] of templates.entries()) for (const [j, f] of t.files.entries()) {
    const rendered = pages[i].files[j];
    assert.equal(rendered.source, f.optional ? '' : f.source);
    const { source: originalSource, ...metadata } = f;
    const { source: pageSource, ...renderedMetadata } = rendered;
    assert.deepEqual(renderedMetadata, metadata);
  }
  assert.deepEqual(templates, original);
  const sample = [{ files: [{ file: 'media.yaml', optional: true, source: 'optional payload' }] }];
  assert.ok(!JSON.stringify(pageCatalog(sample)).includes('optional payload'));
});
test('rejects unsafe contacts, missing files, and escaping paths', async () => {
  for (const mutate of [
    t => { t.author.contact = 'javascript:alert(1)'; },
    t => { t.files[0].file = '../outside.yaml'; },
    t => { t.images[0].file = 'missing.png'; },
    t => { t.slug = 'another-slug'; },
    t => { t.files[0].optional = 'false'; },
  ]) await fixture(async tmp => { await change(tmp, mutate); await assert.rejects(loadCatalog(tmp)); });
});
test('rejects duplicate manifest keys but accepts repeated Tonk heads', async () => {
  await fixture(async tmp => {
    await loadCatalog(tmp);
    const p = path.join(tmp, 'test-template/template.yaml');
    await writeFile(p, (await readFile(p, 'utf8')) + '\nname: Duplicate\n');
    await assert.rejects(loadCatalog(tmp), /unique|same|map keys/i);
  });
});
test('rejects active SVG and symlink source files', async () => {
  await fixture(async tmp => {
    await change(tmp, t => { t.images[0].file = 'preview.svg'; });
    await writeFile(path.join(tmp, 'test-template/preview.svg'), '<svg><script>alert(1)</script></svg>');
    await assert.rejects(loadCatalog(tmp), /passive/);
  });
  await fixture(async tmp => {
    const p = path.join(tmp, 'test-template/app.yaml');
    await rm(p);
    const outside = path.join(tmp, '.outside.yaml');
    await writeFile(outside, 'test-app!:\n  title: Outside\n');
    await symlink(outside, p);
    await assert.rejects(loadCatalog(tmp), /escapes/);
  });
});

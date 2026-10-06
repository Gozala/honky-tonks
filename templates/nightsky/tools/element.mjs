#!/usr/bin/env node
// Read-only Tonk access. Export an element's define source or prepare an exact guarded transaction.
// This tool never commits, pushes, retracts, or changes the selected space.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [operation, ...args] = process.argv.slice(2);
const usage = 'node tools/element.mjs export --space SPACE --name nightsky-sky --out sky\nnode tools/element.mjs plan --space SPACE --snapshot sky.snapshot.json --source sky.js --out change.notation';
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--space', '--name', '--out', '--snapshot', '--source'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error(usage);
  options[args[i]] = args[i + 1];
}
const allowed = operation === 'export' ? ['--space', '--name', '--out'] : operation === 'plan' ? ['--space', '--snapshot', '--source', '--out'] : [];
if (!allowed.length || Object.keys(options).length !== allowed.length || allowed.some(key => !options[key])) throw new Error(usage);
const cli = process.env.TONK_BIN ? [process.env.TONK_BIN] : ['npx', '--yes', '@tonk/cli@0.6.14'];
const hash = source => createHash('sha256').update(source).digest('hex');
const tonk = (read, input) => {
  const result = spawnSync(cli[0], [...cli.slice(1), '--space', options['--space'], ...read], { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error('Cannot read the element; check the selected space and CLI. No changes made.');
  return JSON.parse(result.stdout);
};
// An element's tag is the name `id:<tag>`; its methods are one fact each under
// `xyz.tonk.element.method/<key>` on the entity that name points at. This exact
// dry run reads the name, the `define` method and the description together.
const query = name => {
  const data = tonk(['eval', '-', '--dry-run', '--json'], `name:\n  this: id:${name}\n  entity: ?entity\nxyz.tonk.element.method:\n  this: ?entity\n  define: ?define\nxyz.tonk.element:\n  this: ?entity\n  description: ?description\n`);
  const group = label => data.matches_before?.filter(match => match.label === label).flatMap(match => match.results.map(row => ({ this: row.this, ...row.fields })));
  const rows = { names: group('name'), methods: group('xyz.tonk.element.method'), descriptions: group('xyz.tonk.element') };
  if (Object.values(rows).some(value => !Array.isArray(value))) throw new Error('Unexpected Tonk query format. Use a CLI with `tonk element`.');
  return rows;
};
function current(name) {
  if (!/^nightsky-[a-z0-9-]+$/.test(name)) throw new Error('Choose an exact namespaced Nightsky element tag.');
  const rows = query(name), names = rows.names.filter(row => !row.this || row.this === 'id:' + name);
  if (names.length !== 1 || typeof names[0].entity !== 'string') throw new Error('Element tag must resolve exactly once.');
  const entity = names[0].entity, of = list => list.filter(row => row.this === entity);
  const methods = of(rows.methods), descriptions = of(rows.descriptions);
  if (methods.length !== 1 || typeof methods[0].define !== 'string') throw new Error('Named entity must carry exactly one define method.');
  if (descriptions.length !== 1 || typeof descriptions[0].description !== 'string') throw new Error('Named entity must carry exactly one description.');
  // Re-deriving carries the description and `define` only. Refuse an element
  // with other methods rather than dropping them from the replacement.
  const listed = tonk(['element', '--json']), row = (Array.isArray(listed?.rows) ? listed.rows : []).filter(item => item.tag === name);
  if (row.length !== 1 || row[0].entity !== entity || JSON.stringify(row[0].methods) !== '["define"]') throw new Error('This helper edits elements defined by a single define method. Resolve other methods before editing.');
  return { name, entity, description: descriptions[0].description, define: methods[0].define };
}
function writeFresh(file, content) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
}
if (operation === 'export') {
  const data = current(options['--name']);
  const sourceFile = options['--out'] + '.js', snapshotFile = options['--out'] + '.snapshot.json';
  if (fs.existsSync(sourceFile) || fs.existsSync(snapshotFile)) throw new Error('Choose a new output prefix; exports never overwrite files.');
  writeFresh(sourceFile, data.define);
  writeFresh(snapshotFile, JSON.stringify({ format: 1, space: options['--space'], ...data, sha256: hash(data.define) }, null, 2) + '\n');
  console.log(`Exported ${data.name}. Edit ${sourceFile}; keep ${snapshotFile} unchanged.`);
} else {
  const snapshot = JSON.parse(fs.readFileSync(options['--snapshot'], 'utf8'));
  if (snapshot.format !== 1 || snapshot.space !== options['--space'] || typeof snapshot.define !== 'string' || typeof snapshot.description !== 'string' || snapshot.sha256 !== hash(snapshot.define)) throw new Error('Snapshot identity or bytes do not match. Re-export from the intended space.');
  const live = current(snapshot.name);
  if (live.entity !== snapshot.entity || live.define !== snapshot.define || live.description !== snapshot.description) throw new Error('Element changed since export. Re-export and merge your edit; no transaction written.');
  const define = fs.readFileSync(options['--source'], 'utf8');
  if (define === live.define) throw new Error('Source is unchanged.');
  if (!/^\s*(?:\/\/[^\n]*\n\s*)*\(\)\s*=>/.test(define)) throw new Error('Keep the source a `() => …` factory that returns the element class.');
  if (/customElements\.define\(/.test(define)) throw new Error('Return the class instead; the runtime registers the tag.');
  if (/(?:globalThis|window|view)\.Song\b/.test(define)) throw new Error('Use the public Nightsky namespace.');
  if (Buffer.byteLength(define) > 2 * 1024 * 1024) throw new Error('Element source exceeds the 2 MiB helper limit; keep media in blobs.');
  // The alias, original entity and exact define source form one guard. The new
  // element re-derives from the guarded description, so a concurrent edit after
  // planning leaves the guard unbound and evaluation writes nothing. The tag's
  // name moves to the new definition; the old one stays as an unnamed value.
  const transaction = `# Review and dry-run before evaluation. A stale guard binds nothing and writes nothing.\nname:\n  this: id:${snapshot.name}\n  entity: ${snapshot.entity}\nname:\n  this: id:${snapshot.name}\n  entity: ?previous\nxyz.tonk.element.method:\n  this: ?previous\n  define: ${JSON.stringify(snapshot.define)}\nxyz.tonk.element:\n  this: ?previous\n  description: ?description\nelement!: &${snapshot.name}\n  description: ?description\n  method:\n    define: ${JSON.stringify(define)}\n`;
  writeFresh(options['--out'], transaction);
  console.log(`Wrote ${options['--out']}. Only ${snapshot.name} is targeted. Dry-run, inspect the matched row, then evaluate explicitly.`);
}

// Offline fixture checks; never connects to a Tonk space or uploads a recording.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { computeSpectralVersion } from './examples/build-audio-modules.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(tools), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nightsky-toolkit-test-'));
const run = (args, { env = {}, fail = false } = {}) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status === 0, !fail, (result.stderr || result.stdout).slice(0, 1000));
  return result;
};
try {
  const core = fs.readFileSync(path.join(root, 'core.yaml'), 'utf8');
  const block = core.split(/(?=^[a-z][a-z0-9./+!-]*!:\s*)/m).find(text => text.startsWith('element!: &nightsky-kit\n'));
  assert.ok(block);
  const kit = block.split('    define: |\n')[1].split('\n').map(line => line.startsWith('      ') ? line.slice(6) : line).join('\n').trimEnd() + '\n';
  const original = path.join(temp, 'kit.js'), rebuilt = path.join(temp, 'kit-rebuilt.js');
  fs.writeFileSync(original, kit);
  run(['tools/examples/build-audio-modules.mjs', original, rebuilt]);
  assert.equal(fs.readFileSync(rebuilt, 'utf8'), kit, 'Unchanged public build must be byte-identical');
  assert.ok(!/(?:globalThis|window|view)\.Song\b/.test(kit));
  const version = computeSpectralVersion();
  assert.ok(kit.includes(`spectralVersion: '${version}'`));
  run(['--check', rebuilt]);
  console.log('PASS exact public kit rebuild, namespacing and source fingerprint');

  const fake = path.join(temp, 'fake-tonk'), stateFile = path.join(temp, 'state.json');
  fs.writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('node:fs');const args=process.argv.slice(2);const state=JSON.parse(fs.readFileSync(process.env.NIGHTSKY_TEST_STATE,'utf8'));const group=(label,rows)=>({label,results:rows.map(({this:id,...fields})=>({this:id,fields}))});if(args.includes('element')&&args.includes('--json'))process.stdout.write(JSON.stringify({schemaVersion:'tonk.element-ls.v1',rows:state.elements.map(row=>({tag:state.names.find(name=>name.entity===row.this)?.this.slice(3)??null,entity:row.this,methods:row.methods||['define']}))}));else if(args.includes('eval')&&args.includes('--dry-run'))process.stdout.write(JSON.stringify({matches_before:[group('name',state.names),group('xyz.tonk.element.method',state.elements.map(row=>({this:row.this,define:row.define}))),group('xyz.tonk.element',state.elements.map(row=>({this:row.this,description:row.description})))],commits:{claims:0,entities:{}}}));else process.exit(88);\n`, { mode: 0o700 });
  const env = { TONK_BIN: fake, NIGHTSKY_TEST_STATE: stateFile };
  const name = 'nightsky-test-visual', entity = 'did:key:zTestElement', description = 'A test visual';
  const define = `// Test visual.\n() => class NightskyTestVisual extends HTMLElement {}\n`;
  const state = { names: [{ this: 'id:' + name, entity }], elements: [{ this: entity, define, description }, { this: 'did:key:zUnnamed', define: '() => class extends HTMLElement {}\n', description: 'Superseded' }] };
  const writeState = () => fs.writeFileSync(stateFile, JSON.stringify(state));
  writeState();
  const prefix = path.join(temp, 'visual'), snapshot = prefix + '.snapshot.json';
  const exportArgs = ['tools/element.mjs', 'export', '--space', 'test-space', '--name', name, '--out', prefix];
  run(exportArgs, { env });
  assert.equal(fs.readFileSync(prefix + '.js', 'utf8'), define);
  run(exportArgs, { env, fail: true });
  const plan = path.join(temp, 'change.notation');
  const planArgs = ['tools/element.mjs', 'plan', '--space', 'test-space', '--snapshot', snapshot, '--source', prefix + '.js', '--out', plan];
  run(planArgs, { env, fail: true }); // unchanged
  fs.writeFileSync(prefix + '.js', define.replace('() =>', `() => customElements.define('${name}', class extends HTMLElement {}) ||`));
  run(planArgs, { env, fail: true }); // registers the tag itself
  const changed = define + '// Changed visual.\n';
  fs.writeFileSync(prefix + '.js', changed);
  state.names[0].entity = 'did:key:zOther'; writeState();
  run(planArgs, { env, fail: true });
  state.names[0].entity = entity; state.elements[0].define = define + '// Other editor.\n'; writeState();
  run(planArgs, { env, fail: true });
  state.elements[0].define = define; state.elements[0].methods = ['connected', 'define']; writeState();
  run(planArgs, { env, fail: true }); // other methods would be dropped
  delete state.elements[0].methods; writeState();
  run(planArgs, { env });
  const text = fs.readFileSync(plan, 'utf8');
  assert.ok(text.includes(`this: id:${name}\n  entity: ${entity}`));
  assert.ok(text.includes('xyz.tonk.element.method:\n  this: ?previous\n  define: ' + JSON.stringify(define) + '\n'));
  assert.ok(text.includes(`element!: &${name}\n  description: ?description\n`));
  assert.ok(text.endsWith('  method:\n    define: ' + JSON.stringify(changed) + '\n'));
  assert.ok(!text.includes('space:home') && !text.includes('_\n'));
  console.log('PASS export preservation and unchanged/stale-alias/stale-source plan rejection');

  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let index = 0; index < 16000; index++) wav.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 220 * index / 8000) * (index % 4000 < 400 ? 1 : .15)), 44 + index * 2);
  const audio = path.join(temp, 'synthetic.wav'), output = path.join(temp, 'synthetic-analysis');
  fs.writeFileSync(audio, wav);
  run(['tools/scripts/prepare-analysis.mjs', '--input', audio, '--output', output, '--audio-blob', 'blob:TestToneFixture']);
  const manifest = JSON.parse(fs.readFileSync(output + '.manifest.json', 'utf8'));
  assert.equal(manifest.identity.algorithmVersion, version);
  assert.equal(manifest.identity.timestampConvention, 'pcm-seconds-v1');
  assert.equal(manifest.verification.exactSampleParity, true);
  assert.ok(manifest.verification.samples > 2048);
  assert.equal(manifest.identity.sourceFrames, 16000);
  console.log('PASS synthetic-audio decoding, lossless sidecar and matching runtime identity (no upload)');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

#!/usr/bin/env node
// Extract public text tooling from an already-synced Tonk query. No Tonk writes,
// network calls, package installation, script execution or file overwrites.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FILES = Object.freeze([
  'AGENTS.md', 'REMIXING.md',
  'cloudflare-relay/.gitignore', 'cloudflare-relay/AGENTS.md', 'cloudflare-relay/LICENSE', 'cloudflare-relay/README.md',
  'cloudflare-relay/package-lock.json', 'cloudflare-relay/package.json',
  'cloudflare-relay/relay.test.js', 'cloudflare-relay/setup-test.py', 'cloudflare-relay/setup.py',
  'cloudflare-relay/smoke.mjs', 'cloudflare-relay/vitest.config.js',
  'cloudflare-relay/worker.js', 'cloudflare-relay/wrangler.jsonc',
  'relay/Caddyfile.runtime-logging.example', 'relay/Caddyfile.site.example',
  'relay/LICENSE', 'relay/README.md', 'relay/package-lock.json', 'relay/package.json',
  'relay/relay-test.mjs', 'relay/server.mjs',
  'tools/README.md', 'tools/element.mjs',
  'tools/examples/audio-modules.mjs', 'tools/examples/build-audio-modules.mjs',
  'tools/examples/constellation-graph.mjs', 'tools/examples/frequency-bands.mjs',
  'tools/examples/orbital-motion.mjs', 'tools/examples/spectral-motifs.mjs',
  'tools/examples/spectral-sidecar.mjs', 'tools/examples/spectral-timeline.mjs',
  'tools/materialize-native.mjs', 'tools/scripts/prepare-analysis.mjs', 'tools/toolkit-test.mjs'
].sort());
export const MANIFEST_PATH = 'agent-files.manifest.json';
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
function safePath(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/.test(value)
    && value.split('/').every(part => part && (!part.startsWith('.') || part === '.gitignore'));
}
export function validateNativeFiles(rows, workspace) {
  if (!/^(?:id:|did:key:)[A-Za-z0-9:._/-]+$/.test(workspace || '')) throw new Error('Provide the exact source Nightsky workspace entity.');
  if (!Array.isArray(rows) || rows.length > 4096) throw new Error('Expected a bounded CLI query array.');
  const manifests = rows.filter(row => row && row.path === MANIFEST_PATH && row.this === workspace);
  if (manifests.length !== 1) throw new Error('The selected workspace must have exactly one current agent-file manifest.');
  const row = manifests[0];
  if (typeof row.text !== 'string' || Buffer.byteLength(row.text) > 32768 || !hashPattern.test(row.sha256 || '') || digest(row.text) !== row.sha256) throw new Error('Agent-file manifest bytes failed verification.');
  const manifest = JSON.parse(row.text);
  if (manifest.format !== 1 || manifest.version !== row.bundle || !hashPattern.test(manifest.version || '') || !Array.isArray(manifest.files) || manifest.files.length !== PUBLIC_FILES.length) throw new Error('Unsupported or incomplete agent-file manifest.');
  const entries = manifest.files.map((entry, index) => {
    if (!entry || Object.keys(entry).sort().join(',') !== 'bytes,path,sha256' || !safePath(entry.path) || entry.path !== PUBLIC_FILES[index] || !hashPattern.test(entry.sha256 || '') || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 256 * 1024) throw new Error('Manifest path, size or hash is outside the public file allowlist.');
    return { path: entry.path, sha256: entry.sha256, bytes: entry.bytes };
  });
  if (digest(JSON.stringify(entries)) !== manifest.version || entries.reduce((sum, entry) => sum + entry.bytes, 0) > 2 * 1024 * 1024) throw new Error('Agent-file bundle identity or size is invalid.');
  const current = rows.filter(item => item && item.bundle === manifest.version && item.path !== MANIFEST_PATH);
  if (current.length !== entries.length) throw new Error('Current bundle has duplicate, missing or unexpected file rows.');
  const files = entries.map(entry => {
    const matches = current.filter(item => item.path === entry.path);
    if (matches.length !== 1) throw new Error('Each manifest path must match exactly one current file row.');
    const item = matches[0];
    if (typeof item.text !== 'string' || item.sha256 !== entry.sha256 || Buffer.byteLength(item.text) !== entry.bytes || digest(item.text) !== entry.sha256) throw new Error('A carried file failed exact byte verification.');
    return { ...entry, text: item.text };
  });
  return { version: manifest.version, manifestText: row.text, files };
}
function checkDirectoryChain(directory) {
  const parent = path.dirname(directory);
  if (parent !== directory) checkDirectoryChain(parent);
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Output parents must be real existing directories, without symlinks.');
}
export function materializeNativeFiles(rows, workspace, output) {
  const verified = validateNativeFiles(rows, workspace), destination = path.resolve(output);
  checkDirectoryChain(path.dirname(destination));
  if (fs.existsSync(destination)) throw new Error('Choose a new output directory; existing files are never replaced.');
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const file of [...verified.files, { path: MANIFEST_PATH, text: verified.manifestText }]) {
    let parent = destination;
    for (const segment of file.path.split('/').slice(0, -1)) {
      parent = path.join(parent, segment);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { mode: 0o700 });
      const stat = fs.lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Refusing an unsafe output directory.');
    }
    const target = path.join(destination, file.path);
    const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, file.text, 'utf8'); } finally { fs.closeSync(fd); }
  }
  return { version: verified.version, files: verified.files.length, directory: destination };
}
export function readNativeQuery(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd), limit = 8 * 1024 * 1024;
    if (!stat.isFile() || stat.size > limit) throw new Error('Use a regular query JSON file of at most 8 MiB.');
    const bytes = Buffer.alloc(stat.size + 1); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null); if (!count) break; offset += count; }
    if (offset !== stat.size || fs.fstatSync(fd).size !== stat.size) throw new Error('The query file changed during the bounded read.');
    return JSON.parse(bytes.subarray(0, offset).toString('utf8'));
  } finally { fs.closeSync(fd); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--input', '--workspace', '--out'].includes(args[index]) || !args[index + 1] || options[args[index]]) throw new Error('Usage: node materialize-native.mjs --input QUERY.json --workspace ENTITY --out NEW_DIRECTORY');
    options[args[index]] = args[index + 1];
  }
  if (Object.keys(options).length !== 3) throw new Error('Provide --input, --workspace and a new --out directory.');
  console.log(JSON.stringify(materializeNativeFiles(readNativeQuery(options['--input']), options['--workspace'], options['--out'])));
}

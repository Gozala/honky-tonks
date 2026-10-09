// Deterministic build-time inclusion. Tonk receives a self-contained element factory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const BEGIN = '  // BEGIN GENERATED SONG MODULES';
const END = '  // END GENERATED SONG MODULES';
const spectralSourceNames = ['spectral-timeline', 'spectral-motifs', 'spectral-sidecar'];

// This same helper identifies offline-produced sidecars and the embedded module
// build. It hashes exact source bytes; changing defaults or hydration invalidates
// old analyses without relying on someone remembering to bump a version string.
export function computeSpectralVersion(sourceMap) {
  const sources = spectralSourceNames.map(name => {
    const key = `examples/${name}.mjs`;
    const source = sourceMap ? sourceMap[key] : fs.readFileSync(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
    if (typeof source !== 'string') throw new Error(`Missing spectral fingerprint source: ${key}`);
    return [key, source];
  });
  return createHash('sha256').update(JSON.stringify(sources)).digest('hex');
}

export function buildKit(kit, modules, additions = {}) {
  const start = kit.indexOf(BEGIN), end = kit.indexOf(END);
  if ((start < 0) !== (end < 0)) throw new Error('Incomplete generated Song.Modules block.');
  if (start >= 0) kit = kit.slice(0, start) + kit.slice(end + END.length).replace(/^\n/, '');
  const sources = [['examples/audio-modules.mjs', modules], ...Object.entries(additions)];
  const combined = sources.map(([, text]) => text.trimEnd()).join('\n\n');
  const exports = [...combined.matchAll(/^export (?:async )?function (\w+)\(/gm)].map(match => match[1]);
  const imports = [...combined.matchAll(/^import \{ ([\w, ]+) \} from '\.\/(spectral-timeline|spectral-motifs)\.mjs';$/gm)];
  for (const [, names] of imports) for (const name of names.split(',').map(value => value.trim())) if (!exports.includes(name)) throw new Error(`Missing embedded spectral import: ${name}`);
  const rawBody = combined.replace(/^import \{ [\w, ]+ \} from '\.\/(?:spectral-timeline|spectral-motifs)\.mjs';\n/gm, '').replace(/^export (?=(?:async )?function )/gm, '').trimEnd();
  const body = rawBody.replaceAll('globalThis.Song', 'globalThis.Nightsky').replaceAll('window.Song', 'window.Nightsky').replaceAll('view.Song', 'view.Nightsky').replaceAll('__song', '__nightsky').replaceAll('song-', 'nightsky-').replaceAll("'song.", "'nightsky.").replaceAll('"song.', '"nightsky.');
  if (!exports.length || /^(?:import|export)\b/m.test(body)) throw new Error('Song.Modules must contain only named function exports and no runtime imports.');
  if (new Set(exports).size !== exports.length) throw new Error('Duplicate Song.Modules export names.');
  const hash = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  const spectralVersion = additions['examples/spectral-sidecar.mjs'] ? computeSpectralVersion(additions) : null;
  // Notation canonicalizes blank lines. Match it so cleanup recognizes the installed kit.
  // Preserve other indentation: blindly indenting source changes its template literals.
  const block = `${BEGIN}\n  // Sources: ${sources.map(([name]) => name).join(', ')} — SHA-256 ${hash}\n  // Regenerate with examples/build-audio-modules.mjs; do not hand-edit this block.\n  (() => {\n${body.split('\n').map(line => line.trim() ? line : '').join('\n')}\n    globalThis.Nightsky.Modules = Object.freeze({ version: 1, ${spectralVersion ? `spectralVersion: '${spectralVersion}', ` : ''}${exports.join(', ')} });\n  })();\n${END}\n`;
  const anchor = "  document.dispatchEvent(new CustomEvent('nightsky-kit-ready'));";
  const position = kit.indexOf(anchor);
  if (position < 0 || kit.indexOf(anchor, position + anchor.length) >= 0) throw new Error('Expected one Song Kit ready anchor.');
  return kit.slice(0, position) + block + kit.slice(position);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), check = args.includes('--check');
  const paths = args.filter(arg => arg !== '--check');
  if (paths.length !== 2 || paths[0] === paths[1]) throw new Error('Usage: node tools/examples/build-audio-modules.mjs EXPORTED-KIT.js OUTPUT-KIT.js [--check]');
  const [input, output] = paths;
  const kit = fs.readFileSync(input, 'utf8');
  if (!kit.includes('globalThis.Nightsky') || /(?:globalThis|window|view)\.Song\b/.test(kit)) throw new Error('Expected an exported, namespaced nightsky-kit element.');
  const modules = fs.readFileSync(new URL('./audio-modules.mjs', import.meta.url), 'utf8');
  const additions = {};
  for (const name of ['frequency-bands', 'spectral-motifs', 'spectral-timeline', 'spectral-sidecar', 'orbital-motion', 'constellation-graph']) additions[`examples/${name}.mjs`] = fs.readFileSync(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
  const result = buildKit(kit, modules, additions);
  if (/(?:globalThis|window|view)\.Song\b/.test(result) || result.includes("'song-tick'")) throw new Error('Unnamespaced runtime in generated kit.');
  if (check) {
    if (fs.readFileSync(output, 'utf8') !== result) throw new Error('Generated Nightsky.Modules is stale.');
    console.log('PASS generated Nightsky.Modules matches its source');
  } else {
    fs.writeFileSync(output, result, {flag: 'wx'}); console.log(`Built ${output}`);
  }
}

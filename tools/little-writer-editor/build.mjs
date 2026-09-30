import fs from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
const root = import.meta.dirname;
const result = await build({
  entryPoints: {
    editor: path.join(root, 'src-js/editor/index.ts'),
    shell: path.join(root, 'src-js/index.ts'),
  },
  outdir: path.join(root, 'dist'),
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  minify: true,
});
const core = result.outputFiles.find((f) => f.path.endsWith('/editor.js')).text;
const shell = result.outputFiles.find((f) => f.path.endsWith('/shell.js')).text;
const appPath = path.resolve(root, '../../templates/little-writer/app.yaml');
const app = await fs.readFile(appPath, 'utf8');
// Replace only the editor core payload. Leave the application, shell, fonts,
// schemas, existing records, and save behavior untouched.
const payload =
  /globalThis\.__tonkProseEditor\s*=\s*\(\)\s*=>[^\n]*?atob\('([^']+)'\)/g;
if ([...app.matchAll(payload)].length !== 1)
  throw new Error('Expected exactly one editor payload');
await fs.writeFile(
  appPath,
  app.replace(payload, (match, old) =>
    match.replace(old, Buffer.from(core).toString('base64')),
  ),
);
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const loader = `globalThis.__tonkProseEditor=()=>URL.createObjectURL(new Blob([Uint8Array.from(atob('${Buffer.from(core).toString('base64')}'),c=>c.charCodeAt(0))],{type:'text/javascript'}));\n${shell}`;
await fs.writeFile(
  path.join(root, 'dist/sandbox.html'),
  `<!doctype html><meta charset="utf-8"><title>LittleWriter editor sandbox</title><style>body{max-width:800px;margin:40px auto;font:16px system-ui}tonk-prose{display:block;border:1px solid #ccc;min-height:400px;padding:24px}input,button{padding:8px;margin:12px}</style><h1>LittleWriter editor sandbox</h1><input placeholder="Click here to leave editor"><button id="reset">Reset numbered list</button><tonk-prose></tonk-prose><pre id="state"></pre><script type="module">${loader.replace(/<\/script/gi, '<\\/script')}\n{const p=document.querySelector('tonk-prose');p.addEventListener('ready',e=>{window.view=e.detail.editor.view;window.reset=()=>p.value='1. First item\\n2. Second item';reset();document.querySelector('#reset').onclick=reset;setInterval(()=>document.querySelector('#state').textContent=JSON.stringify({selection:view.state.selection.toJSON(),text:p.value},null,2),200);});}</script>`,
);
console.log('Rebuilt the LittleWriter editor payload and local sandbox.');

// Exercise the shipped 2.0 app and its CSS overrides with a local Tonk bridge.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const yaml = fs.readFileSync(
    path.resolve(__dirname, '../../templates/little-writer/app.yaml'),
    'utf8',
  );
  const html = yaml
    .slice(
      yaml.indexOf('    <!doctype html>'),
      yaml.indexOf('    </html>') + 11,
    )
    .split('\n')
    .map((l) => (l.startsWith('    ') ? l.slice(4) : l))
    .join('\n');
  const file = path.join(__dirname, 'dist/application.html');
  fs.writeFileSync(file, html);
  const browser = await chromium.launch();
  let page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const host = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const facts = new Map(),
      subscriptions = [];
    window.__testFacts = facts;
    const query = async (request) =>
      [...facts]
        .filter(
          ([id, row]) =>
            (typeof request.terms?.this !== 'string' ||
              request.terms.this === id) &&
            Object.values(request.predicate.with).every((d) =>
              Object.hasOwn(row, d.the),
            ),
        )
        .map(([id, row]) => ({
          this: id,
          fields: Object.fromEntries(
            Object.entries(request.predicate.with).map(([k, d]) => [
              k,
              row[d.the],
            ]),
          ),
        }));
    window.tonk = {
      ready: Promise.resolve(),
      context: { repo: 'did:key:test', branch: 'main' },
      fetch: async () =>
        new Response(
          JSON.stringify({
            display_name: 'Test author',
            profile: { subject: 'did:key:test-author' },
          }),
          { status: 200 },
        ),
      query,
      subscribe: (request) =>
        new ReadableStream({
          start(controller) {
            subscriptions.push({ request, controller });
          },
        }),
      transact: async ({ claims }) => {
        for (const c of claims) {
          const { parameters: p, predicate } = c.application;
          const row = facts.get(p.this) || {};
          for (const [k, v] of Object.entries(p)) {
            if (k === 'this') continue;
            const d = predicate.concept.with[k];
            if (c.op === 'retract') delete row[d.the];
            else row[d.the] = v;
          }
          facts.set(p.this, row);
        }
        for (const s of subscriptions)
          s.controller.enqueue(await query(s.request));
        return { ok: true };
      },
      open: () => {},
    };
  });
  try {
    const hostFile = path.join(__dirname, 'dist/host.html');
    fs.writeFileSync(
      hostFile,
      '<!doctype html><title>LittleWriter sandbox host</title>',
    );
    await host.goto('file://' + hostFile);
    await host.evaluate((html) => {
      document.body.replaceChildren();
      const frame = document.createElement('iframe');
      frame.setAttribute(
        'sandbox',
        'allow-scripts allow-downloads allow-forms',
      );
      frame.style = 'position:fixed;inset:0;width:100%;height:100%;border:0';
      document.body.append(frame);
      frame.srcdoc = html;
    }, html);
    page = host.frames().find((frame) => frame.parentFrame());
    await page.waitForFunction(
      () => window.__writer?.view && !window.__writer.busy,
    );
    await page.evaluate(() => window.__writer.restore('1. First item'));
    const editor = page.locator('#editorMount .ProseMirror');
    await editor.click();
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await page.waitForTimeout(250);
    const geometry = await page.evaluate(() => {
      const v = window.__writer.view,
        s = v.dom.getRootNode().getSelection();
      return {
        height: s.getRangeAt(0).getBoundingClientRect().height,
        markers: [...v.dom.querySelectorAll('li')].map(
          (li) => getComputedStyle(li).listStyleType,
        ),
      };
    });
    assert.ok(geometry.height >= 12);
    assert.deepEqual(geometry.markers, ['none', 'none']);
    await editor.pressSequentially('Second item');
    for (let i = 0; i < 3; i++) {
      await page.locator('#title').click();
      await editor.click();
    }
    await page.waitForFunction(() =>
      [...window.__testFacts.values()].some((r) =>
        String(r['xyz.tonk.writer.document/content']).includes(
          '2. Second item',
        ),
      ),
    );
    await page.getByRole('button', { name: 'Users', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Users on this document' })
      .waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Users', exact: true }).click();
    await page.locator('#chaticon').click();
    await page
      .getByRole('textbox', { name: 'Chat message' })
      .fill('Local regression check');
    await page.getByRole('textbox', { name: 'Chat message' }).press('Enter');
    await page.waitForFunction(() =>
      [...window.__testFacts.values()].some(
        (r) => r['xyz.tonk.writer.chat/body'] === 'Local regression check',
      ),
    );
    await host.screenshot({
      path: path.join(__dirname, 'dist/application-regression.png'),
    });
    assert.deepEqual(errors, []);
    assert.ok(!(await page.evaluate(() => window.__writer.error)));
    console.log(
      'PASS: shipped LittleWriter 2.0 loads, list markers/caret survive app styling and focus changes, document edits save, users/chat work.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

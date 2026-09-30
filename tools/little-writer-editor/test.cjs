const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(
    'file://' + require('node:path').join(__dirname, 'dist/sandbox.html'),
  );
  await p.waitForFunction(() => window.view);
  const e = p.locator('.ProseMirror');
  const seed = async (text) => {
    await p.locator('tonk-prose').evaluate((p, t) => (p.value = t), text);
    await e.click();
    await e.press('ControlOrMeta+End');
  };
  const settle = () => p.waitForTimeout(250);
  const value = () => p.locator('tonk-prose').evaluate((p) => p.value);
  const caret = async () => {
    const r = await p.evaluate(() => {
      const s = view.dom.getRootNode().getSelection();
      const r = s.getRangeAt(0).getBoundingClientRect();
      return {
        height: r.height,
        text: view.state.selection.$head.parent.textContent,
        pos: view.state.selection.head,
      };
    });
    assert.ok(r.height >= 12, 'Invisible caret ' + JSON.stringify(r));
  };
  try {
    for (const prefix of ['1. ', '- ']) {
      await seed(prefix + 'Alpha');
      await e.press('Enter');
      await settle();
      await caret();
      for (const key of [
        'ArrowLeft',
        'ArrowLeft',
        'ArrowRight',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
      ]) {
        await e.press(key);
        await caret();
      }
      await e.press('ControlOrMeta+End');
      await e.pressSequentially('Beta');
      await settle();
      assert.equal(await p.locator('tonk-prose li').count(), 2);
      for (let i = 0; i < 4; i++) {
        const before = await value();
        await p.locator('input').click();
        await p.locator('tonk-prose li').last().click();
        await caret();
        assert.equal(await value(), before);
      }
      await e.press('ControlOrMeta+End');
      await e.press('Tab');
      await settle();
      assert.equal(await p.locator('tonk-prose li li').count(), 1);
      await e.press('Shift+Tab');
      await settle();
      assert.equal(await p.locator('tonk-prose li li').count(), 0);
      await caret();
      await e.press('Enter');
      await settle();
      await caret();
      await e.press('Enter');
      await e.pressSequentially('Outside');
      await settle();
      assert.equal(await p.locator('tonk-prose li').count(), 2);
    }
    await seed('1. Alpha');
    await e.press('Home');
    await e.press('ArrowRight');
    await e.press('Enter');
    await settle();
    assert.equal(await p.locator('tonk-prose li').count(), 2);
    await seed('9. Alpha\n10. Bravo\n11. Charlie');
    await p.evaluate(() => {
      const v = window.view;
      let end;
      v.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent.includes('Bravo'))
          end = pos + 1 + node.content.size;
      });
      v.dispatch(
        v.state.tr.setSelection(
          v.state.selection.constructor.create(v.state.doc, end),
        ),
      );
      v.focus();
    });
    await e.press('Enter');
    await e.pressSequentially('Inserted');
    await settle();
    assert.match(await value(), /11\. Inserted/);
    assert.equal(await p.locator('tonk-prose li').count(), 4);
    assert.match(await value(), /12\. Charlie/);
    await caret();
    await e.press('ControlOrMeta+z');
    await settle();
    await e.press('ControlOrMeta+Shift+z');
    await settle();
    assert.match(await value(), /Inserted/);
    await seed('- [ ] Task');
    await p.locator('.md-task-checkbox').click();
    await settle();
    assert.match(await value(), /\[x\] Task/);
    await seed('Plain');
    await e.press('ControlOrMeta+a');
    await e.pressSequentially('1. Fast');
    await e.press('Enter');
    await e.pressSequentially('Next');
    await settle();
    assert.equal(await p.locator('tonk-prose li').count(), 2);
    assert.match(await value(), /2\. Next/);
    assert.deepEqual(errors, []);
    await p.screenshot({
      path: require('node:path').join(
        __dirname,
        'dist/editor-interactions.png',
      ),
    });
    console.log(
      'PASS focus, arrows, empty item caret, indent/outdent and exit',
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../templates/nightsky/core.yaml', import.meta.url), 'utf8');

test('workspace views query existing selections without requiring an active track', () => {
  const view = source.split(/(?=^[a-z][a-z0-9./+!-]*!:\s*)/m).find(block => block.startsWith('view!:\n  this: nightsky\n'));
  const selections = [...view.matchAll(/<tonk-display\b[^>]*model="nightsky-active-track"[^>]*>/g)];
  assert.equal(selections.length, 4, 'room and song editor query selections in both views');
  for (const [display] of selections) {
    assert.ok(!display.includes('entity='), 'directory mode tolerates an absent selection');
    assert.ok(display.includes('view="selection"'));
  }
  assert.equal([...view.matchAll(/<nightsky-workspace-room workspace="\{this\}"/g)].length, 2);
});

test('workspace room handles empty, selected, switched and cleared tracks independently', () => {
  class Element {
    constructor() { this.attrs = new Map(); this.children = []; this.isConnected = true; }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    setAttribute(name, value) {
      this.attrs.set(name, value);
      if (this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback();
    }
    append(...elements) { for (const element of elements) { element.parent = this; element.isConnected = this.isConnected; this.children.push(element); } }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; this.isConnected = false; }
    querySelector(selector) { if (selector === 'nightsky-player') return this.player ||= new Element(); return null; }
    closest() { return this.intro; }
    addEventListener(type, handler) { this.listeners ||= new Map(); this.listeners.set(type, handler); }
    removeEventListener(type) { this.listeners.delete(type); }
    replaceChildren() { this.children = []; }
    querySelectorAll() { return this.rows || []; }
  }
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const classes = source.slice(source.indexOf('      class ActiveRoom extends HTMLElement'), source.indexOf('      class SharedListeningSetup extends HTMLElement'));
  const { ActiveRoom, WorkspaceRoom } = vm.runInNewContext(`${classes}\n({ ActiveRoom, WorkspaceRoom })`, {
    HTMLElement: Element, MutationObserver: Observer,
    validEntity: value => typeof value === 'string' && value.startsWith('id:'),
    endpoint: scope => { if (scope !== 'test-scope') throw new Error('Invalid scope'); },
    document: { createElement: tag => tag === 'nightsky-active-room' ? new ActiveRoom() : new Element() },
  });
  const room = new WorkspaceRoom();
  room.setAttribute('workspace', 'id:workspace');
  room.setAttribute('with', 'test-scope');
  room.connectedCallback();
  assert.equal(room._empty.hidden, false);
  assert.ok(room._empty.innerHTML.includes('<nightsky-player empty>'));
  assert.equal(room._room.children.length, 0);

  const selection = (workspace, track) => ({ dataset: { workspace, track } });
  room.rows = [selection('id:other-workspace', 'id:other-track')];
  room._observer.callback();
  assert.equal(room._room.children.length, 0, 'another workspace cannot select our song');

  room.rows.push(selection('id:workspace', 'id:first-track'));
  room._observer.callback();
  assert.equal(room._empty.hidden, true);
  assert.equal(room._empty.isConnected, false, 'idle player disconnects after selection');
  assert.equal(room._room.children.length, 1);
  assert.equal(room._room.children[0].getAttribute('entity'), 'id:first-track');
  const player = room._room.children[0];
  room._observer.callback();
  assert.equal(room._room.children[0], player, 'unchanged selection keeps the mounted player');

  room.rows[1].dataset.track = 'id:second-track';
  room._observer.callback();
  assert.equal(room._room.children.length, 1);
  assert.equal(room._room.children[0].getAttribute('entity'), 'id:second-track');

  room.setAttribute('workspace', 'id:other-workspace');
  assert.equal(room._room.children[0].getAttribute('entity'), 'id:other-track');
  room.rows = [];
  room._observer.callback();
  assert.equal(room._empty.hidden, false);
  assert.equal(room._room.children.length, 0);
  room.rows = [selection('id:other-workspace', '_')];
  room._observer.callback();
  assert.equal(room._room.children.length, 0, 'unbound values never mount a player');
  let add;
  room.intro = { querySelector: () => ({ openPanel: value => { add = value; } }) };
  room.listeners.get('nightsky-songs')({ detail: { add: true } });
  assert.equal(add, true, 'add action opens this workspace song editor');
  room.listeners.get('nightsky-songs')({ detail: { add: false } });
  assert.equal(add, false, 'Songs action opens the same editor for switching tracks');
  room.disconnectedCallback();
  assert.equal(room.listeners.has('nightsky-songs'), false, 'song listener cleans up on disconnect');
  assert.equal(room._observer.connected, false);
  room.connectedCallback();
  assert.equal(room.children.length, 2, 'reconnection does not duplicate the room');
  assert.equal(room._observer.connected, true);
});

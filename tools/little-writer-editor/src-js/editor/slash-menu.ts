// The `/` block menu and the `[[` note picker.
//
// Notion's slash menu, over markdown: every entry inserts a line
// prefix (`## `, `- [ ] `, `> [!note] `) or a block node, and the
// reparse loop does the rest — the file never knows a menu was
// involved. Typing `/` at the start of a line (or after a space) opens
// the menu; the characters typed after it filter the entries; Enter
// picks; Escape closes and leaves the text as typed; a query that
// matches nothing closes it too (Notion's behaviour), so `/` in prose
// stays writable.
//
// The same popup, in "notes" mode, is the note picker: `[[` (typed, or
// inserted by the `Link to note` entry) searches the host's notes
// through `searchNotes` and offers to create one through `createNote`
// (extension.ts). Picking replaces `[[query` with a standard link,
// `[Title](id:…)`. `[[` is an input trigger only; the file always
// stores the link.
//
// State is the trigger span `{from, to}` plus the mode; the query is
// the document text between them, so undo/redo and out-of-band edits
// keep the menu honest. The popup DOM lives beside the editor in the
// element's shadow root and is positioned from `coordsAtPos`.

import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node, NodeType } from "prosemirror-model";
import { schema } from "./schema";
import { parseMarkdown } from "./markdown";
import { isMarkup } from "./markup";
import { openMediaPicker, isBlankBlock } from "./media-picker";
import type { Registry } from "./extension";
import type { NoteRef, SlashContext, SlashItem } from "./api";

export type SlashMode = "blocks" | "notes";
export type SlashState = { mode: SlashMode; from: number; to: number } | null;

export const slashKey = new PluginKey<SlashState>("tonk-prose-slash");

type SlashMeta = { open: NonNullable<SlashState> } | { close: true };

const TRIGGER: Record<SlashMode, string> = { blocks: "/", notes: "[[" };

// ---------------------------------------------------------------------------
// Built-in entries
// ---------------------------------------------------------------------------

function prefixItem(
  id: string,
  label: string,
  group: string,
  prefix: string,
  icon: string,
  description: string,
  keywords: string[],
): SlashItem {
  return {
    id,
    label,
    group,
    icon,
    description,
    keywords,
    run: (context) => context.insertPrefix(prefix),
  };
}

/** The built-in menu, in display order. Notion's Basic and Media
 *  blocks that have a markdown form today. */
export const BUILTIN_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    group: "Basic",
    icon: "T",
    description: "Plain text",
    keywords: ["paragraph", "plain"],
    run: (context) => context.clearPrefix(),
  },
  prefixItem("h1", "Heading 1", "Basic", "# ", "H1", "Big section heading", ["heading", "title"]),
  prefixItem("h2", "Heading 2", "Basic", "## ", "H2", "Medium section heading", ["heading"]),
  prefixItem("h3", "Heading 3", "Basic", "### ", "H3", "Small section heading", ["heading"]),
  prefixItem("bullet", "Bulleted list", "Basic", "- ", "•", "A simple bulleted list", ["list", "ul", "unordered"]),
  prefixItem("number", "Numbered list", "Basic", "1. ", "1.", "A list with numbering", ["list", "ol", "ordered"]),
  prefixItem("todo", "To-do list", "Basic", "- [ ] ", "☐", "Track tasks with checkboxes", ["task", "checkbox", "check"]),
  prefixItem("quote", "Quote", "Basic", "> ", "❝", "Capture a quotation", ["blockquote"]),
  {
    id: "divider",
    label: "Divider",
    group: "Basic",
    icon: "—",
    description: "Visually divide blocks",
    keywords: ["hr", "rule", "line", "separator"],
    run: (context) =>
      insertBlockNode(context.view, schema.nodes.horizontal_rule.create(), false),
  },
  {
    id: "code",
    label: "Code",
    group: "Basic",
    icon: "</>",
    description: "A code block",
    keywords: ["snippet", "pre", "fence"],
    run: (context) => insertBlockNode(context.view, schema.nodes.code_block.create(), true),
  },
  prefixItem("callout", "Callout", "Basic", "> [!note] ", "💡", "Make writing stand out", ["note", "tip", "warning", "info", "alert", "important", "caution"]),
  prefixItem("toggle", "Toggle list", "Basic", "> [!toggle]- ", "▸", "Hide content inside a toggle", ["collapse", "fold", "details", "expand"]),
  {
    id: "link",
    label: "Link to note",
    group: "Basic",
    icon: "🔗",
    description: "Link to a note, or create one",
    keywords: ["page", "note", "wiki", "mention"],
    run: (context) => startNoteSearch(context.view),
  },
  {
    id: "image",
    label: "Image",
    group: "Media",
    icon: "🖼",
    description: "Upload or embed with a link",
    keywords: ["picture", "photo", "upload", "img"],
    run: (context) => openMediaPicker(context.view, "image"),
  },
];

/** The entries currently on offer: built-ins whose capability the host
 *  provides, then the host's own. */
export function availableItems(registry: Registry): SlashItem[] {
  const builtin = BUILTIN_ITEMS.filter(
    (item) => item.id !== "link" || registry.searchNotes !== null,
  );
  return [...builtin, ...registry.slashItems];
}

/** Entries matching `query`: prefix matches on id, label words, and
 *  keywords rank first, substring matches second; ties keep menu
 *  order. An empty query keeps everything. */
export function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored = items.map((item, index) => {
    const words = [
      item.id,
      item.label,
      ...item.label.split(/\s+/),
      ...(item.keywords ?? []),
    ].map((word) => word.toLowerCase());
    let score = 0;
    if (words.some((word) => word.startsWith(q))) score = 2;
    else if (words.some((word) => word.includes(q))) score = 1;
    return { item, index, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

// ---------------------------------------------------------------------------
// Document edits behind the entries
// ---------------------------------------------------------------------------

/** Leading block markers of `block` (`> `, `- `, `[ ] `, `# `), as a
 *  contiguous run from its start. Returns the run's text and size. */
function leadingMarkers(block: Node): { text: string; size: number } {
  let text = "";
  let size = 0;
  let done = false;
  block.forEach((child) => {
    if (done) return;
    if (child.isText && isMarkup(child)) {
      text += child.text ?? "";
      size += child.nodeSize;
    } else {
      done = true;
    }
  });
  return { text, size };
}

/** The `> ` run at the start of a marker text. */
function quotePrefixOf(markers: string): string {
  const match = /^(?:> )*/.exec(markers);
  return match ? match[0] : "";
}

function blockMarker(text: string): Node {
  return schema.text(text, [schema.marks.markup.create({ kind: "block", of: [] })]);
}

/** Put `prefix` at the start of the caret's line, keeping any quote
 *  context and replacing the line's own prefix (a heading's `# `, a
 *  list marker, a checkbox) — "turn into". With text before the caret
 *  on the line, the line is split and the prefix starts the new one.
 *  The prefix is plain text: the reparse loop materializes it. */
function insertPrefix(view: EditorView, prefix: string): void {
  const { state } = view;
  const { $from } = state.selection;
  const block = $from.parent;
  if (!block.isTextblock || block.type.spec.code) return;
  const blockStart = $from.start();
  const markers = leadingMarkers(block);
  const contentStart = blockStart + markers.size;
  const quote = quotePrefixOf(markers.text);
  const before = state.doc.textBetween(contentStart, $from.pos);
  const tr = state.tr;
  let at: number;
  if (before.trim() === "") {
    // Replace the line's own prefix (everything after the quote run up
    // to the caret, which is only markers and whitespace).
    at = blockStart + quote.length;
    tr.delete(at, $from.pos);
  } else {
    tr.split($from.pos);
    at = $from.pos + 2;
    if (quote) {
      const marker = blockMarker(quote);
      tr.insert(at, marker);
      at += marker.nodeSize;
    }
  }
  if (prefix) tr.insertText(prefix, at);
  tr.setSelection(TextSelection.create(tr.doc, at + prefix.length));
  view.dispatch(tr.scrollIntoView());
}

/** Remove the line's own prefix markers, keeping quote context — "turn
 *  into text". The reparse loop lifts the line out of its list. */
function clearPrefix(view: EditorView): void {
  const { state } = view;
  const { $from } = state.selection;
  const block = $from.parent;
  if (!block.isTextblock || block.type.spec.code) return;
  const blockStart = $from.start();
  const markers = leadingMarkers(block);
  const quote = quotePrefixOf(markers.text);
  if (markers.size <= quote.length) return;
  const tr = state.tr.delete(blockStart + quote.length, blockStart + markers.size);
  view.dispatch(tr.scrollIntoView());
}

/** Insert a block node: in place of the caret's line when it is blank,
 *  after it otherwise. `selectInside` puts the caret in the node (code
 *  block); otherwise a fresh paragraph follows it and takes the caret
 *  (divider). */
function insertBlockNode(view: EditorView, node: Node, selectInside: boolean): void {
  const { state } = view;
  const { $from } = state.selection;
  const tr = state.tr;
  let pos: number;
  if ($from.parent.isTextblock && isBlankBlock($from.parent) && canReplaceBlock($from, node.type)) {
    pos = $from.before();
    tr.replaceWith(pos, pos + $from.parent.nodeSize, node);
  } else {
    pos = $from.after();
    tr.insert(pos, node);
  }
  if (selectInside) {
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  } else {
    const after = pos + node.nodeSize;
    tr.insert(after, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  }
  view.dispatch(tr.scrollIntoView());
}

/** Whether the caret's block may be swapped for a node of `type`
 *  (a list item's first paragraph, for one, cannot become a rule). */
function canReplaceBlock($from: { index(depth?: number): number; node(depth?: number): Node }, type: NodeType): boolean {
  const index = $from.index(-1);
  return $from.node(-1).canReplaceWith(index, index + 1, type);
}

/** Parse `markdown` and insert its blocks: in place of a blank line,
 *  after the caret's line otherwise. */
function insertMarkdown(view: EditorView, markdown: string): void {
  const { state } = view;
  const { $from } = state.selection;
  const fragment = parseMarkdown(markdown).content;
  if (fragment.size === 0) return;
  const tr = state.tr;
  let pos: number;
  if ($from.parent.isTextblock && isBlankBlock($from.parent)) {
    pos = $from.before();
    tr.replaceWith(pos, pos + $from.parent.nodeSize, fragment);
  } else {
    pos = $from.after();
    tr.insert(pos, fragment);
  }
  const end = pos + fragment.size;
  tr.setSelection(TextSelection.near(tr.doc.resolve(end), -1));
  view.dispatch(tr.scrollIntoView());
}

/** Open the note picker at the caret by inserting its `[[` trigger. */
function startNoteSearch(view: EditorView): void {
  const { state } = view;
  const pos = state.selection.from;
  const tr = state.tr.insertText("[[", pos);
  tr.setSelection(TextSelection.create(tr.doc, pos + 2));
  tr.setMeta(slashKey, { open: { mode: "notes", from: pos, to: pos + 2 } } satisfies SlashMeta);
  view.dispatch(tr.scrollIntoView());
}

/** Replace the `[[query` span with a standard link to `note`. */
function insertNoteLink(view: EditorView, span: { from: number; to: number }, note: NoteRef): void {
  const title = note.title.replace(/[[\]]/g, (char) => `\\${char}`) || note.id;
  const text = `[${title}](${note.id})`;
  const tr = view.state.tr.insertText(text, span.from, span.to);
  tr.setMeta(slashKey, { close: true } satisfies SlashMeta);
  tr.setSelection(TextSelection.create(tr.doc, span.from + text.length));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function makeContext(view: EditorView): SlashContext {
  return {
    view,
    insertPrefix: (prefix) => insertPrefix(view, prefix),
    clearPrefix: () => clearPrefix(view),
    insertMarkdown: (markdown) => insertMarkdown(view, markdown),
  };
}

/** Remove the typed `/query`, close the menu, then run the entry. */
function applyItem(view: EditorView, span: { from: number; to: number }, item: SlashItem): void {
  const tr = view.state.tr.delete(span.from, span.to);
  tr.setMeta(slashKey, { close: true } satisfies SlashMeta);
  tr.setSelection(TextSelection.create(tr.doc, span.from));
  view.dispatch(tr);
  item.run(makeContext(view));
  view.focus();
}

// ---------------------------------------------------------------------------
// Trigger detection and state
// ---------------------------------------------------------------------------

/** `/` opens the menu only at the start of a line's content (after its
 *  markers) or after whitespace — a slash inside a word or a URL is
 *  just a slash. */
function canOpenSlash(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock || parent.type.spec.code) return false;
  const before = parent.childBefore($pos.parentOffset);
  if (!before.node) return true;
  if (before.node.isText && isMarkup(before.node)) return true;
  const text = parent.textBetween(0, $pos.parentOffset);
  return /\s$/.test(text);
}

/** The state after `tr`, given the previous state: keep the span while
 *  the trigger text is intact, the caret sits inside the span's line
 *  after the trigger, and (in blocks mode) some entry still matches. */
function trackState(tr: Transaction, prev: NonNullable<SlashState>, registry: Registry): SlashState {
  let { from } = prev;
  if (tr.docChanged) {
    const mapped = tr.mapping.mapResult(from, -1);
    if (mapped.deleted) return null;
    from = mapped.pos;
  }
  if (!tr.selection.empty) return null;
  const { $head } = tr.selection;
  if (from > tr.doc.content.size) return null;
  const $from = tr.doc.resolve(from);
  if (!$from.parent.isTextblock || $from.start() !== $head.start()) return null;
  const trigger = TRIGGER[prev.mode];
  const to = $head.pos;
  if (to < from + trigger.length) return null;
  const text = tr.doc.textBetween(from, to);
  if (!text.startsWith(trigger) || /\n/.test(text)) return null;
  if (prev.mode === "notes" && text.includes("]]")) return null;
  if (prev.mode === "blocks") {
    const query = text.slice(trigger.length);
    if (query && filterItems(availableItems(registry), query).length === 0) return null;
  }
  return from === prev.from && to === prev.to ? prev : { mode: prev.mode, from, to };
}

// ---------------------------------------------------------------------------
// The popup
// ---------------------------------------------------------------------------

type Row =
  | { kind: "item"; item: SlashItem }
  | { kind: "note"; note: NoteRef }
  | { kind: "create"; title: string };

class SlashMenuView {
  readonly dom: HTMLDivElement;
  #view: EditorView;
  readonly #registry: Registry;
  #rows: Row[] = [];
  #selected = 0;
  #renderedQuery: string | null = null;
  #notesFor: string | null = null;
  #notes: NoteRef[] = [];
  #searching = false;
  #busy: string | null = null;
  #error: string | null = null;
  readonly #onScroll = () => this.#position();

  constructor(view: EditorView, registry: Registry) {
    this.#view = view;
    this.#registry = registry;
    this.dom = document.createElement("div");
    this.dom.className = "md-slash-menu";
    this.dom.hidden = true;
    this.dom.setAttribute("role", "listbox");
    // Clicks on the menu must not move the editor's caret or blur it.
    this.dom.addEventListener("mousedown", (event) => event.preventDefault());
    view.dom.parentElement?.append(this.dom);
  }

  update(view: EditorView): void {
    this.#view = view;
    const state = slashKey.getState(view.state);
    if (!state) {
      if (!this.dom.hidden) this.#hide();
      return;
    }
    const query = view.state.doc
      .textBetween(state.from, state.to)
      .slice(TRIGGER[state.mode].length);
    if (this.dom.hidden) {
      this.dom.hidden = false;
      window.addEventListener("scroll", this.#onScroll, true);
    }
    if (state.mode === "notes") this.#search(query);
    if (query !== this.#renderedQuery) {
      this.#selected = 0;
      this.#error = null;
    }
    this.#renderedQuery = query;
    this.#render(state.mode, query);
    this.#position();
  }

  destroy(): void {
    this.#hide();
    this.dom.remove();
  }

  #hide(): void {
    this.dom.hidden = true;
    this.#renderedQuery = null;
    this.#busy = null;
    this.#error = null;
    window.removeEventListener("scroll", this.#onScroll, true);
  }

  /** Kick off (or reuse) the host search for `query`. */
  #search(query: string): void {
    if (this.#notesFor === query) return;
    this.#notesFor = query;
    const search = this.#registry.searchNotes;
    if (!search) {
      this.#notes = [];
      return;
    }
    this.#searching = true;
    Promise.resolve()
      .then(() => search(query))
      .then(
        (notes) => {
          if (this.#notesFor !== query) return;
          this.#notes = notes;
          this.#searching = false;
          this.#rerender();
        },
        () => {
          if (this.#notesFor !== query) return;
          this.#notes = [];
          this.#searching = false;
          this.#rerender();
        },
      );
  }

  #rerender(): void {
    const state = slashKey.getState(this.#view.state);
    if (!state || this.dom.hidden) return;
    const query = this.#view.state.doc
      .textBetween(state.from, state.to)
      .slice(TRIGGER[state.mode].length);
    this.#render(state.mode, query);
    this.#position();
  }

  #rowsFor(mode: SlashMode, query: string): Row[] {
    if (mode === "blocks") {
      return filterItems(availableItems(this.#registry), query).map((item) => ({
        kind: "item",
        item,
      }));
    }
    const rows: Row[] = this.#notes.map((note) => ({ kind: "note", note }));
    const title = query.trim();
    if (title && this.#registry.createNote) {
      const exact = this.#notes.some(
        (note) => note.title.toLowerCase() === title.toLowerCase(),
      );
      const create: Row = { kind: "create", title };
      if (exact) rows.push(create);
      else rows.unshift(create);
    }
    return rows;
  }

  #render(mode: SlashMode, query: string): void {
    this.#rows = this.#rowsFor(mode, query);
    if (this.#selected >= this.#rows.length) this.#selected = Math.max(0, this.#rows.length - 1);
    this.dom.replaceChildren();
    if (this.#busy) {
      this.dom.append(message(this.#busy));
      return;
    }
    if (this.#error) this.dom.append(message(this.#error, true));
    let group: string | null = null;
    this.#rows.forEach((row, index) => {
      const rowGroup = row.kind === "item" ? row.item.group : row.kind === "create" ? "" : "Notes";
      if (rowGroup && rowGroup !== group) {
        group = rowGroup;
        const heading = document.createElement("div");
        heading.className = "md-slash-group";
        heading.textContent = rowGroup;
        this.dom.append(heading);
      }
      this.dom.append(this.#rowElement(row, index));
    });
    if (this.#rows.length === 0) {
      this.dom.append(
        message(mode === "notes" && this.#searching ? "Searching…" : "No matches"),
      );
    }
  }

  #rowElement(row: Row, index: number): HTMLElement {
    const element = document.createElement("div");
    element.className = "md-slash-item";
    element.setAttribute("role", "option");
    if (index === this.#selected) {
      element.classList.add("is-selected");
      element.setAttribute("aria-selected", "true");
    }
    const icon = document.createElement("span");
    icon.className = "md-slash-icon";
    const text = document.createElement("span");
    text.className = "md-slash-text";
    const label = document.createElement("span");
    label.className = "md-slash-label";
    const description = document.createElement("span");
    description.className = "md-slash-desc";
    if (row.kind === "item") {
      icon.textContent = row.item.icon ?? "";
      label.textContent = row.item.label;
      description.textContent = row.item.description ?? "";
    } else if (row.kind === "note") {
      icon.textContent = "📄";
      label.textContent = row.note.title;
      description.textContent = row.note.detail ?? "";
    } else {
      icon.textContent = "+";
      label.textContent = `Create "${row.title}"`;
      description.textContent = "New note";
    }
    text.append(label);
    if (description.textContent) text.append(description);
    element.append(icon, text);
    element.addEventListener("mouseenter", () => {
      this.#selected = index;
      this.#markSelected();
    });
    element.addEventListener("click", (event) => {
      event.preventDefault();
      this.#selected = index;
      this.pick();
    });
    return element;
  }

  #markSelected(): void {
    const options = this.dom.querySelectorAll(".md-slash-item");
    options.forEach((option, index) => {
      option.classList.toggle("is-selected", index === this.#selected);
      option.setAttribute("aria-selected", index === this.#selected ? "true" : "false");
    });
  }

  /** Place the popup under the trigger's line (above it when there is
   *  no room below). Fixed positioning keeps it clear of the host's
   *  overflow clipping. */
  #position(): void {
    const state = slashKey.getState(this.#view.state);
    if (!state || this.dom.hidden) return;
    let coords: { left: number; top: number; bottom: number };
    try {
      coords = this.#view.coordsAtPos(state.from);
    } catch {
      return;
    }
    const menu = this.dom;
    menu.style.position = "fixed";
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const gap = 4;
    let left = coords.left;
    let top = coords.bottom + gap;
    if (top + height > window.innerHeight && coords.top - gap - height > 0) {
      top = coords.top - gap - height;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  move(delta: number): void {
    if (this.#rows.length === 0) return;
    this.#selected = (this.#selected + delta + this.#rows.length) % this.#rows.length;
    this.#markSelected();
    const option = this.dom.querySelectorAll(".md-slash-item")[this.#selected];
    (option as HTMLElement | undefined)?.scrollIntoView?.({ block: "nearest" });
  }

  /** Apply the selected row. */
  pick(): void {
    const state = slashKey.getState(this.#view.state);
    if (!state) return;
    const row = this.#rows[this.#selected];
    if (!row) return;
    const span = { from: state.from, to: state.to };
    if (row.kind === "item") {
      applyItem(this.#view, span, row.item);
      return;
    }
    if (row.kind === "note") {
      insertNoteLink(this.#view, span, row.note);
      return;
    }
    const create = this.#registry.createNote;
    if (!create) return;
    this.#busy = `Creating "${row.title}"…`;
    this.#render("notes", row.title);
    Promise.resolve()
      .then(() => create(row.title))
      .then(
        (note) => {
          this.#busy = null;
          const current = slashKey.getState(this.#view.state);
          if (!current) return;
          insertNoteLink(this.#view, { from: current.from, to: current.to }, note);
        },
        (error: unknown) => {
          this.#busy = null;
          this.#error = `Could not create the note: ${
            error instanceof Error ? error.message : String(error)
          }`;
          this.#rerender();
        },
      );
  }
}

function message(text: string, error = false): HTMLElement {
  const element = document.createElement("div");
  element.className = error ? "md-slash-message is-error" : "md-slash-message";
  element.textContent = text;
  return element;
}

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

export function slashMenu(registry: Registry): Plugin<SlashState> {
  let menu: SlashMenuView | null = null;
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => null,
      apply(tr, prev) {
        const meta = tr.getMeta(slashKey) as SlashMeta | undefined;
        if (meta && "close" in meta) return null;
        if (meta && "open" in meta) return meta.open;
        if (!prev) return null;
        return trackState(tr, prev, registry);
      },
    },
    view(view) {
      menu = new SlashMenuView(view, registry);
      return {
        update: (next) => menu?.update(next),
        destroy: () => {
          menu?.destroy();
          menu = null;
        },
      };
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (slashKey.getState(view.state)) return false;
        if (text === "/" && canOpenSlash(view.state, from)) {
          const tr = view.state.tr.insertText("/", from, to);
          tr.setMeta(slashKey, {
            open: { mode: "blocks", from, to: from + 1 },
          } satisfies SlashMeta);
          view.dispatch(tr);
          return true;
        }
        if (text === "[" && registry.searchNotes) {
          const $from = view.state.doc.resolve(from);
          if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
          const before = view.state.doc.textBetween(Math.max($from.start(), from - 1), from);
          if (before !== "[") return false;
          const tr = view.state.tr.insertText("[", from, to);
          tr.setMeta(slashKey, {
            open: { mode: "notes", from: from - 1, to: from + 1 },
          } satisfies SlashMeta);
          view.dispatch(tr);
          return true;
        }
        return false;
      },
      handleKeyDown(view, event) {
        if (!menu || !slashKey.getState(view.state)) return false;
        switch (event.key) {
          case "ArrowDown":
            menu.move(1);
            return true;
          case "ArrowUp":
            menu.move(-1);
            return true;
          case "Enter":
          case "Tab":
            menu.pick();
            return true;
          case "Escape":
            view.dispatch(view.state.tr.setMeta(slashKey, { close: true } satisfies SlashMeta));
            return true;
          default:
            return false;
        }
      },
    },
  });
}

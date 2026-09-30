import { markdownTransaction } from './remote-update';
// The heavy chunk: ProseMirror assembly for `<tonk-prose>`. Loaded
// by the shell (`../index.ts`) via dynamic import on the first
// element connect — nothing here may be imported *statically* from
// the shell (types excepted).

import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { schema } from "./schema";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { diffText } from "./diff";
import { isPlainTextblock } from "./markup";
import { buildInputRules } from "./input-rules";
import { buildKeymap, baseKeymap } from "./keymap";
import { keymap } from "prosemirror-keymap";
import { reparse, reparseKey, normalizeTransaction } from "./reparse";
import { reveal } from "./reveal";
import { placeholder, placeholderKey } from "./placeholder";
import { imagePreview } from "./image-preview";
import { taskList } from "./task-list";
import { codeBlocks } from "./code-block";
import { createRegistry, extendKey } from "./extension";
import { callouts } from "./callout";
import { links } from "./links";
import { mediaPicker } from "./media-picker";
import { slashMenu } from "./slash-menu";
import type { EditorOptions, ProseEditor, ProseExtension } from "./api";

/** Parse pasted plain text as markdown — Typora's paste behavior —
 *  and serialize copied/cut content back to real markdown.
 *
 *  Copy needs an explicit serializer: the default one flattens the
 *  *editor* doc (materialized marker text and all), so a copied list
 *  or blockquote loses its `- `/`> ` structure and inline markers leak
 *  through. Routing copy through `serializeMarkdown` (demarkup → the
 *  markdown serializer) reproduces the same clean markdown the whole
 *  document round-trips through. Pastes into code contexts keep the
 *  default (verbatim) handling. */
function markdownClipboardPlugin(): Plugin {
  return new Plugin({
    props: {
      clipboardTextParser(text, $context) {
        // Falsy result falls through to the default (verbatim) path.
        if ($context.parent.type.spec.code) return null as unknown as Slice;
        const doc = parseMarkdown(text);
        // maxOpen produces the natural open depths so pasting a
        // single paragraph mid-sentence splices inline.
        return Slice.maxOpen(doc.content);
      },
      clipboardTextSerializer(slice) {
        // Wrap the slice's fragment in a doc so the block serializer
        // (list/quote/heading prefixes) runs over it, then strip the
        // trailing newline `closeBlock` adds after the last block.
        const doc = schema.node("doc", null, slice.content);
        return serializeMarkdown(doc).replace(/\n$/, "");
      },
    },
  });
}

export function createEditor(
  parent: HTMLElement,
  options: EditorOptions,
): ProseEditor {
  injectStylesheet(parent);

  let readOnly = options.readOnly;

  // Host-provided behaviour and the space scope, shared by reference
  // with the plugins that need them (extension.ts).
  const registry = createRegistry({
    scope: options.scope,
    onNavigate: options.onNavigate,
  });

  const state = EditorState.create({
    doc: parseMarkdown(options.doc),
    plugins: [
      // Reparse first: its plugin view sees every transaction, and
      // its state must be reset by flush metas before anything else
      // reads it. The slash menu comes next so its keys (arrows,
      // Enter, Escape) win over every keymap while it is open. Order
      // among the rest is not load-bearing except code-block arrow
      // keys before the base keymap.
      reparse(),
      reveal(),
      slashMenu(registry),
      mediaPicker(registry),
      buildInputRules(schema),
      ...codeBlocks(),
      buildKeymap(),
      keymap(baseKeymap),
      history(),
      dropCursor(),
      gapCursor(),
      placeholder(options.placeholder),
      imagePreview(registry),
      taskList(),
      callouts(),
      links(registry),
      markdownClipboardPlugin(),
    ],
  });

  const view = new EditorView(parent, {
    state,
    editable: () => !readOnly,
    attributes: { class: "md-doc" },
    dispatchTransaction(tr) {
      if (tr.getMeta('writer-format') && !view.composing) normalizeTransaction(tr, reparseKey.getState(view.state)?.dirty);
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged && !tr.getMeta("writer-remote")) {
        options.onChange(serializeMarkdown(next.doc));
      }
    },
  });

  return {
    view,

    getMarkdown(): string {
      return serializeMarkdown(view.state.doc);
    },

    setMarkdown(markdown: string): void {
      // A programmatic write that already matches the buffer (the
      // common case when our own `change` round-trips back through a
      // store) is a no-op — replacing the doc with an identical one
      // would still reset the selection and fight the user's caret.
      if (markdown === serializeMarkdown(view.state.doc)) return;

      const tr = markdownTransaction(view.state, markdown);
      view.dispatch(tr);
    },

    setReadOnly(next: boolean): void {
      readOnly = next;
      // Re-run the `editable` prop.
      view.setProps({});
    },

    setPlaceholder(text: string): void {
      view.dispatch(view.state.tr.setMeta(placeholderKey, text));
    },

    setScope(scope: string | null): void {
      if (scope === registry.scope) return;
      registry.scope = scope;
      // Blob previews are keyed by scope; announce the change so they
      // recompute. Meta-only: not a document edit, no `change` event.
      view.dispatch(view.state.tr.setMeta(extendKey, true));
    },

    extend(extension: ProseExtension): void {
      registry.apply(extension);
      view.dispatch(view.state.tr.setMeta(extendKey, true));
    },

    focus(): void {
      view.focus();
    },

    destroy(): void {
      view.destroy();
    },
  };
}

/** Editor document stylesheet, injected once per root node (the
 *  shell's shadow root in practice). Everything routes through the
 *  `--tonk-prose-*` variables the shell defines on the host. */
function injectStylesheet(parent: HTMLElement): void {
  const root = parent.getRootNode();
  const container = root instanceof ShadowRoot ? root : document.head;
  if (container.querySelector("style[data-tonk-prose-editor]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-tonk-prose-editor", "");
  style.textContent = EDITOR_STYLESHEET + BLOCKS_STYLESHEET;
  container.append(style);
}

const EDITOR_STYLESHEET = `
  .md-doc {
    font-family: var(--tonk-prose-font);
    font-size: var(--tonk-prose-font-size);
    line-height: 1.6;
    color: var(--tonk-prose-fg);
    padding: var(--tonk-prose-padding);
    max-width: var(--tonk-prose-max-width);
    margin: 0 auto;
    outline: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    caret-color: var(--tonk-prose-accent);
    height: 100%;
    box-sizing: border-box;
  }

  .md-doc ::selection { background: var(--tonk-prose-selection); }

  .md-doc p { margin: 0 0 0.75em; }

  .md-doc h1, .md-doc h2, .md-doc h3,
  .md-doc h4, .md-doc h5, .md-doc h6 {
    font-family: var(--tonk-prose-heading-font);
    line-height: 1.25;
    margin: 1.1em 0 0.5em;
    font-weight: 650;
  }
  .md-doc h1:first-child, .md-doc h2:first-child,
  .md-doc h3:first-child, .md-doc p:first-child { margin-top: 0; }
  .md-doc h1 { font-size: 1.9em; }
  .md-doc h2 { font-size: 1.5em; }
  .md-doc h3 { font-size: 1.25em; }
  .md-doc h4 { font-size: 1.05em; }
  .md-doc h5 { font-size: 1em; }
  .md-doc h6 { font-size: 0.9em; color: var(--tonk-prose-fg-muted); }

  .md-doc blockquote {
    margin: 0 0 0.75em;
    padding: 0 1em;
    border-left: 3px solid var(--tonk-prose-border);
    color: var(--tonk-prose-blockquote);
  }

  .md-doc ul, .md-doc ol { padding-left: 1.6em; margin: 0 0 0.75em; }
  .md-doc li > p { margin-bottom: 0.25em; }

  /* Task-list checkbox: the rendered stand-in for a hidden "[ ] "
     source prefix (task-list.ts). Nudged into the gutter so the
     text still aligns with the bullet column, and drawn in the
     accent color. The list bullet on an item that owns a checkbox
     reads as redundant, but it stays (Typora keeps it too) while
     the checkbox sits inline just before the text. */
  .md-doc .md-task-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 1em;
    height: 1em;
    margin: 0 0.35em 0 0;
    vertical-align: -0.12em;
    border: 1.5px solid var(--tonk-prose-border);
    border-radius: 3px;
    background: var(--tonk-prose-bg);
    cursor: pointer;
    position: relative;
    flex: none;
  }
  .md-doc .md-task-checkbox:checked {
    background: var(--tonk-prose-accent);
    border-color: var(--tonk-prose-accent);
  }
  .md-doc .md-task-checkbox:checked::after {
    content: "";
    position: absolute;
    left: 0.28em;
    top: 0.08em;
    width: 0.22em;
    height: 0.5em;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .md-doc hr {
    border: none;
    border-top: 2px solid var(--tonk-prose-border);
    margin: 1.5em 0;
  }

  .md-doc a {
    color: var(--tonk-prose-link);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
  .md-doc a:hover { text-decoration-thickness: 2px; }

  .md-doc del {
    text-decoration: line-through;
    text-decoration-color: var(--tonk-prose-fg-muted);
  }

  .md-doc mark {
    background: var(--tonk-prose-highlight-bg);
    color: var(--tonk-prose-highlight-fg);
    border-radius: 2px;
    padding: 0 0.1em;
  }

  .md-doc code {
    font-family: var(--tonk-prose-mono);
    font-size: 0.875em;
    background: var(--tonk-prose-code-bg);
    color: var(--tonk-prose-code-fg);
    border-radius: 4px;
    padding: 0.15em 0.35em;
  }

  .md-doc img {
    max-width: 100%;
    border-radius: var(--tonk-prose-radius);
  }

  /* Expanded-image previews: the widget that follows the (usually
     hidden) source text. Block display gives the picture its own
     line, Typora-style; the source text above it reads as a
     caption while editing. */
  .md-image-preview {
    display: block;
    margin: 0.25em 0;
  }
  .md-image-broken {
    min-width: 6em;
    min-height: 2.5em;
    border: 1px dashed var(--tonk-prose-border);
    color: var(--tonk-prose-fg-muted);
    font-size: 0.8em;
  }

  /* Embedded code editors. The <tonk-code> element brings its own
     frame; the wrapper only spaces it. The plain fallback mimics a
     quiet code surface. */
  .md-code-block { margin: 0 0 0.75em; }
  .md-code-block-plain {
    font-family: var(--tonk-prose-mono);
    font-size: 0.875em;
    background: var(--tonk-prose-code-bg);
    color: var(--tonk-prose-code-fg);
    border: 1px solid var(--tonk-prose-border);
    border-radius: var(--tonk-prose-radius);
    padding: 0.75em 1em;
    white-space: pre-wrap;
    overflow-x: auto;
  }
  .md-code-block-plain code {
    background: none;
    padding: 0;
    font-size: inherit;
  }

  /* ——— The Typora reveal ———
     Markers are literal text (.md-markup spans), hidden at rest and
     revealed by two selection-driven decorations (see reveal.ts):

       md-active — the caret's textblock. Reveals *block* markers
                   (.md-block: the heading "# " prefix), which
                   belong to the whole line.
       md-edit   — the caret's edit range (the mark run it touches).
                   Reveals *inline* markers only for that span: the
                   caret in bold shows its "**", in a link its "["
                   and "](url)"; other spans stay rendered.

     ProseMirror may paint the md-edit class onto the marker span
     itself or onto a decoration span nested inside it, so both
     shapes are matched. Reveal only while the editor is focused —
     an unfocused editor reads as rendered markdown, Typora-style. */
  .md-markup {
    display: none;
    color: var(--tonk-prose-marker);
    font-weight: 400;
    font-style: normal;
  }
  /* Reveal a marker as real, full-size text when the caret is in its
     block (block markers) or touches its span (inline markers, via the
     md-edit edit range). The edit range anchors from either side, so a
     span's markers appear as the caret approaches its boundary — and
     because the revealed marker is real visible text, native caret
     movement and typing stop at the boundary with nothing hidden to
     skip over. ProseMirror may paint md-edit onto the marker span
     itself or onto a decoration nested inside it, so both are matched. */
  .ProseMirror-focused .md-active .md-markup.md-block,
  .ProseMirror-focused .md-markup.md-edit,
  .ProseMirror-focused .md-markup:has(.md-edit) {
    display: inline;
  }

  /* List prefixes are real editable source text. Keep them visible at all
     times rather than swapping native markers on focus or shrinking text
     beneath the caret. This also gives marker-only items a full-height caret. */
  .md-doc li { list-style: none; }
  .md-doc li > p .md-markup.md-block {
    display: inline !important;
    color: inherit;
    font-size: inherit;
  }
  .md-doc li > p { min-height: 1.5em; }
  .md-doc li > p .md-task-checkbox { display: inline-block; }

  /* Placeholder (empty doc): ghost text via CSS content. */
  .tonk-prose-empty::before {
    content: attr(data-placeholder);
    color: var(--tonk-prose-fg-muted);
    font-style: italic;
    float: left;
    height: 0;
    pointer-events: none;
  }

  /* ProseMirror needs these for correct behavior. */
  .ProseMirror { position: relative; }
  .ProseMirror-hideselection *::selection { background: transparent; }
  .ProseMirror-selectednode { outline: 2px solid var(--tonk-prose-accent); }
  .ProseMirror-gapcursor {
    display: none;
    pointer-events: none;
    position: absolute;
  }
  .ProseMirror-gapcursor:after {
    content: "";
    display: block;
    position: absolute;
    top: -2px;
    width: 20px;
    border-top: 1px solid var(--tonk-prose-fg);
    animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
  }
  @keyframes ProseMirror-cursor-blink { to { visibility: hidden; } }
  .ProseMirror-focused .ProseMirror-gapcursor { display: block; }
`;

/** Styles for the block features layered on the markdown editor: the
 *  slash menu, callouts and toggles, media previews, the media picker,
 *  and note-link cards. Same `--tonk-prose-*` contract. */
const BLOCKS_STYLESHEET = `
  /* ——— Slash menu / note picker ——— */
  .md-slash-menu {
    position: fixed;
    z-index: 20;
    min-width: 17rem;
    max-width: 24rem;
    max-height: 20rem;
    overflow-y: auto;
    padding: 0.25rem 0;
    background: var(--tonk-prose-bg);
    color: var(--tonk-prose-fg);
    border: 1px solid var(--tonk-prose-border);
    border-radius: var(--tonk-prose-radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    font-family: var(--tonk-prose-font);
    font-size: 0.9em;
    line-height: 1.3;
    white-space: normal;
  }
  .md-slash-menu[hidden] { display: none; }
  .md-slash-group {
    padding: 0.45rem 0.75rem 0.2rem;
    font-size: 0.72em;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tonk-prose-fg-muted);
  }
  .md-slash-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
  }
  .md-slash-item.is-selected { background: var(--tonk-prose-selection); }
  .md-slash-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid var(--tonk-prose-border);
    border-radius: 4px;
    background: var(--tonk-prose-code-bg);
    font-size: 0.8em;
    font-weight: 600;
  }
  .md-slash-text { display: flex; flex-direction: column; min-width: 0; }
  .md-slash-label { font-weight: 500; }
  .md-slash-desc {
    font-size: 0.85em;
    color: var(--tonk-prose-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .md-slash-message {
    padding: 0.5rem 0.75rem;
    color: var(--tonk-prose-fg-muted);
    font-style: italic;
  }
  .md-slash-message.is-error { color: #cf222e; font-style: normal; }

  /* ——— Callouts and toggles ——— */
  .md-doc blockquote.md-callout {
    --md-callout-accent: var(--tonk-prose-accent);
    margin: 0 0 0.75em;
    padding: 0.55em 0.9em;
    border-left: 3px solid var(--md-callout-accent);
    border-radius: var(--tonk-prose-radius);
    background: color-mix(in srgb, var(--md-callout-accent) 9%, transparent);
    color: var(--tonk-prose-fg);
  }
  .md-doc blockquote.md-callout > :last-child { margin-bottom: 0; }
  .md-doc .md-callout-head { font-weight: 600; }
  .md-doc .md-callout-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    margin-right: 0.4em;
    user-select: none;
  }
  .md-doc .md-callout-icon { font-style: normal; }
  .md-doc .md-callout-chevron {
    appearance: none;
    -webkit-appearance: none;
    width: 1.2em;
    height: 1.2em;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tonk-prose-fg-muted);
    font: inherit;
    line-height: 1;
    cursor: pointer;
    transform: rotate(90deg);
    transition: transform 120ms ease;
  }
  .md-doc .md-collapsed .md-callout-chevron { transform: none; }
  .md-doc .md-callout.md-collapsed > :not(.md-callout-head) { display: none; }
  .md-doc blockquote.md-callout.md-toggle {
    border-left: 0;
    background: none;
    padding: 0 0 0 0.2em;
    border-radius: 0;
  }
  .md-doc .md-callout-note, .md-doc .md-callout-info { --md-callout-accent: #0969da; }
  .md-doc .md-callout-tip { --md-callout-accent: #1a7f37; }
  .md-doc .md-callout-important { --md-callout-accent: #8250df; }
  .md-doc .md-callout-warning { --md-callout-accent: #9a6700; }
  .md-doc .md-callout-caution { --md-callout-accent: #cf222e; }

  /* ——— Media previews ——— */
  .md-media { display: block; margin: 0.25em 0; }
  .md-media-loading, .md-media-broken {
    display: inline-block;
    min-width: 6em;
    padding: 0.4em 0.7em;
    border: 1px dashed var(--tonk-prose-border);
    border-radius: var(--tonk-prose-radius);
    color: var(--tonk-prose-fg-muted);
    font-size: 0.85em;
  }
  .md-media-broken { border-style: solid; }
  .md-doc .md-video-preview, .md-doc .md-audio-preview {
    display: block;
    max-width: 100%;
    border-radius: var(--tonk-prose-radius);
  }
  .md-doc .md-audio-preview { width: 100%; max-width: 32rem; }
  .md-file-card {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
    max-width: 100%;
    padding: 0.5em 0.8em;
    border: 1px solid var(--tonk-prose-border);
    border-radius: var(--tonk-prose-radius);
    background: var(--tonk-prose-code-bg);
    font-size: 0.9em;
  }
  .md-file-card-name { overflow-wrap: anywhere; }
  .md-file-card-action {
    margin-left: auto;
    padding: 0.2em 0.6em;
    border: 1px solid var(--tonk-prose-border);
    border-radius: 4px;
    color: var(--tonk-prose-fg);
    text-decoration: none;
    white-space: nowrap;
  }

  /* ——— Media picker ——— */
  .md-media-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    margin: 0.25em 0 0.75em;
    padding: 0.75em 0.9em;
    border: 1px solid var(--tonk-prose-border);
    border-radius: var(--tonk-prose-radius);
    background: var(--tonk-prose-code-bg);
    font-size: 0.9em;
    white-space: normal;
  }
  .md-media-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }
  .md-media-picker-close {
    appearance: none;
    border: 0;
    background: none;
    color: var(--tonk-prose-fg-muted);
    font: inherit;
    font-size: 1.2em;
    line-height: 1;
    cursor: pointer;
  }
  .md-media-picker-row { display: flex; align-items: center; gap: 0.5em; margin: 0; }
  .md-media-picker-url {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.35em 0.6em;
    border: 1px solid var(--tonk-prose-border);
    border-radius: 4px;
    background: var(--tonk-prose-bg);
    color: var(--tonk-prose-fg);
    font: inherit;
  }
  .md-media-picker-button {
    display: inline-block;
    padding: 0.35em 0.8em;
    border: 1px solid var(--tonk-prose-border);
    border-radius: 4px;
    background: var(--tonk-prose-bg);
    color: var(--tonk-prose-fg);
    font: inherit;
    cursor: pointer;
  }
  .md-media-picker-hint, .md-media-picker-status {
    color: var(--tonk-prose-fg-muted);
    font-size: 0.9em;
  }
  .md-media-picker-status:empty { display: none; }
  .md-media-picker-status.is-error { color: #cf222e; }

  /* ——— Note links and cards ——— */
  .md-doc .md-entity-link { text-decoration-style: dotted; }
  .md-doc .md-link-card-body {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    max-width: 100%;
    padding: 0.35em 0.75em;
    border: 1px solid var(--tonk-prose-border);
    border-radius: var(--tonk-prose-radius);
    cursor: pointer;
    user-select: none;
  }
  .md-doc .md-link-card-body:hover { background: var(--tonk-prose-code-bg); }
  .md-doc .md-link-card-title {
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: var(--tonk-prose-border);
    text-underline-offset: 0.15em;
  }
  .md-doc .md-link-card-detail { color: var(--tonk-prose-fg-muted); font-size: 0.85em; }
  /* At rest the card stands in for the link; with the caret in the
     block (focused editor) the source reveals and the card steps aside. */
  .md-doc p.md-link-card:not(.md-active) > a,
  .md-doc:not(.ProseMirror-focused) p.md-link-card > a { display: none; }
  .md-doc.ProseMirror-focused p.md-link-card.md-active .md-link-card-body { display: none; }
`;

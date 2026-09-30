// Callouts and toggles: blockquotes with a head line.
//
//   > [!tip] Ship small          a callout — icon, tinted box, title
//   > Body is ordinary markdown.
//
//   > [!toggle]- Meeting notes   a toggle — chevron, collapsed (`-`)
//   > Hidden until expanded.     or open (`+`); fold state is content
//
// The head marker (`[!type]`, fold flag, space) is literal block-marker
// text (markup.ts), hidden at rest and revealed with the caret in the
// quote like `> ` itself. This plugin adds everything visual on top,
// purely as decorations:
//
//   • the blockquote gets `md-callout md-callout-<type>` (colour and
//     icon by type), `md-toggle` for a toggle, `md-foldable` when the
//     head carries a fold flag, and `md-collapsed` while folded;
//   • the head paragraph gets `md-callout-head`;
//   • a badge widget before the head text draws the chevron and icon.
//
// A collapsed toggle hides its body only while the selection is
// OUTSIDE the quote: the caret can never be trapped in hidden content,
// and editing a toggle shows all of it, like editing any quote shows
// its markers. Clicking the chevron flips the fold flag in the source
// (`-` ↔ `+`) through a transaction, the same way the task checkbox
// flips its `[ ]`, so undo, serialize, and reparse all see it.

import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { schema } from "./schema";
import { calloutHeadOf, isMarkup } from "./markup";
import type { CalloutHead } from "./markup";

export const calloutKey = new PluginKey<DecorationSet>("tonk-prose-callout");

/** Default icon per type. GitHub's five, plus `info`. A title that
 *  starts with an emoji supplies its own icon instead. */
const ICONS: Record<string, string> = {
  note: "ℹ️",
  info: "ℹ️",
  tip: "💡",
  important: "❗",
  warning: "⚠️",
  caution: "🔥",
};

const LEADING_EMOJI = /^\s*\p{Extended_Pictographic}/u;

type HeadInfo = {
  head: CalloutHead;
  /** The head paragraph and its position. */
  para: Node;
  paraPos: number;
  /** Position of the coalesced marker text node (`> [!tip] `). */
  markerPos: number;
  markerText: string;
};

/** The callout head of blockquote `quote` at `pos`, when its first
 *  child is a paragraph whose first (marker) text node ends with a
 *  callout head. */
function headOf(quote: Node, pos: number): HeadInfo | null {
  const para = quote.firstChild;
  if (!para || para.type !== schema.nodes.paragraph) return null;
  const first = para.firstChild;
  if (!first || !isMarkup(first) || !first.text) return null;
  const stripped = first.text.replace(/^(?:> )+/, "");
  const head = calloutHeadOf(stripped);
  // The marker node must be exactly the head (title text is a separate
  // node with different marks), or this is some other block marker.
  if (!head || head.marker !== stripped) return null;
  // Title from the rest of the paragraph, for the emoji rule.
  head.title = para.textContent.slice(first.text.length);
  const paraPos = pos + 1;
  return { head, para, paraPos, markerPos: paraPos + 1, markerText: first.text };
}

/** Flip the fold flag at `foldPos` (`-` ↔ `+`); insert a `-` when the
 *  head has no flag yet. The character inherits the marker's mark from
 *  its neighbours, so it stays hidden syntax. */
function toggleFold(view: EditorView, foldPos: number): void {
  const { state } = view;
  const current = state.doc.textBetween(foldPos, foldPos + 1);
  const tr = state.tr;
  if (current === "-") tr.insertText("+", foldPos, foldPos + 1);
  else if (current === "+") tr.insertText("-", foldPos, foldPos + 1);
  else tr.insertText("-", foldPos);
  view.dispatch(tr);
}

function iconFor(head: CalloutHead): string {
  if (head.type === "toggle") return "";
  if (LEADING_EMOJI.test(head.title)) return "";
  return ICONS[head.type] ?? ICONS.note;
}

function makeBadge(
  head: CalloutHead,
  foldable: boolean,
  collapsed: boolean,
  foldPos: number,
) {
  return (view: EditorView): HTMLElement => {
    const badge = document.createElement("span");
    badge.className = "md-callout-badge";
    badge.setAttribute("contenteditable", "false");
    if (foldable) {
      const chevron = document.createElement("button");
      chevron.type = "button";
      chevron.className = "md-callout-chevron";
      chevron.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
      chevron.textContent = "▸";
      // The document owns the fold state; the button is a view of it.
      chevron.addEventListener("mousedown", (event) => event.preventDefault());
      chevron.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFold(view, foldPos);
      });
      badge.append(chevron);
    }
    const glyph = iconFor(head);
    if (glyph) {
      const icon = document.createElement("span");
      icon.className = "md-callout-icon";
      icon.textContent = glyph;
      badge.append(icon);
    }
    return badge;
  };
}

function computeCallouts(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  const { from: selFrom, to: selTo } = state.selection;
  state.doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.blockquote) return true;
    const info = headOf(node, pos);
    if (!info) return true;
    const { head } = info;
    const end = pos + node.nodeSize;
    const isToggle = head.type === "toggle";
    const foldable = isToggle || head.fold !== "";
    const inside = selFrom < end && selTo > pos;
    const collapsed = foldable && head.fold === "-" && !inside;

    const classes = ["md-callout", `md-callout-${head.type}`];
    if (isToggle) classes.push("md-toggle");
    if (foldable) classes.push("md-foldable");
    if (collapsed) classes.push("md-collapsed");
    decorations.push(
      Decoration.node(pos, end, {
        class: classes.join(" "),
        "data-callout": head.type,
      }),
    );
    decorations.push(
      Decoration.node(info.paraPos, info.paraPos + info.para.nodeSize, {
        class: "md-callout-head",
      }),
    );
    // The fold flag sits right after the `]`; that is also where one
    // goes when the head has none yet.
    const foldPos = info.markerPos + info.markerText.indexOf("]") + 1;
    decorations.push(
      Decoration.widget(
        info.markerPos,
        makeBadge(head, foldable, collapsed, foldPos),
        {
          // side: -1 → before the (hidden) marker text, so a caret at
          // the line start lands after the badge.
          side: -1,
          key: `callout:${head.type}:${head.fold}:${collapsed}:${foldPos}:${iconFor(head)}`,
        },
      ),
    );
    // Nested quotes may be callouts of their own.
    return true;
  });
  return DecorationSet.create(state.doc, decorations);
}

export function callouts(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: calloutKey,
    state: {
      init: (_config, state) => computeCallouts(state),
      apply(tr, prev, _old, state) {
        // Selection matters too: a collapsed toggle opens while the
        // caret is inside it.
        if (!tr.docChanged && !tr.selectionSet) return prev;
        return computeCallouts(state);
      },
    },
    props: {
      decorations(state) {
        return calloutKey.getState(state);
      },
    },
  });
}

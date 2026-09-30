import { TextSelection } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseMarkdown } from './markdown';
import { diffText } from './diff';
import { isPlainTextblock } from './markup';
import { normalizeTransaction } from './reparse';
/** Document position just after the last leading top-level block that
 *  `a` and `b` share (compared by `Node.eq`). Positions returned are
 *  in `a`'s coordinate space, at block boundaries, so a replace from
 *  here never splits a block. */
function commonPrefixEnd(a: Node, b: Node): number {
  const n = Math.min(a.childCount, b.childCount);
  let pos = 0;
  for (let i = 0; i < n; i++) {
    if (!a.child(i).eq(b.child(i))) break;
    pos += a.child(i).nodeSize;
  }
  return pos;
}

/** Size (in document units) of the shared trailing block run of `a`
 *  and `b`, not overlapping the already-matched prefix that ends at
 *  `prefixEnd` in `a`. */
function commonSuffixLen(a: Node, b: Node, prefixEnd: number): number {
  let ai = a.childCount - 1;
  let bi = b.childCount - 1;
  let size = 0;
  while (ai >= 0 && bi >= 0) {
    const child = a.child(ai);
    // Don't let the suffix reach back past the prefix boundary.
    if (a.content.size - size - child.nodeSize < prefixEnd) break;
    if (!child.eq(b.child(bi))) break;
    size += child.nodeSize;
    ai--;
    bi--;
  }
  return size;
}

/** The single top-level child of `doc` spanning exactly `[from, to)`,
 *  when that range is one whole block — otherwise null (the range is
 *  empty, spans several blocks, or doesn't align to a block boundary).
 *  Used to decide whether the changed span can take the intra-block
 *  character diff. */
function singleTextblockAt(
  doc: Node,
  from: number,
  to: number,
): { node: Node } | null {
  if (to <= from) return null;
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (pos === from && pos + node.nodeSize === to) {
      return node.isTextblock ? { node } : null;
    }
    pos += node.nodeSize;
    if (pos > from) break;
  }
  return null;
}

/** A textblock whose content is entirely text (markers included —
 *  they're text too). For such a block, document offsets equal text
 *  offsets, so a character-level text diff maps straight to positions.
 *  Mirrors the reparse loop's eligibility rule. */
function isPureText(node: Node): boolean {
  return isPlainTextblock(node);
}


export function markdownTransaction(state: EditorState, markdown: string) {
      const next = parseMarkdown(markdown);
      const current = state.doc;

      // Narrow to the span of top-level blocks that actually differ,
      // keeping a common prefix and suffix of blocks intact. An
      // out-of-band change usually touches one block, so the rest —
      // and any caret inside them — stay untouched.
      const from = commonPrefixEnd(current, next);
      const suffix = commonSuffixLen(current, next, from);
      const oldTo = current.content.size - suffix;
      const newTo = next.content.size - suffix;

      const tr = state.tr;

      // Intra-block refinement: when the differing span is exactly one
      // pure-text block on each side, diff the text and replace only
      // the changed characters. In a pure-text block document offsets
      // are text offsets (the reparse-loop invariant), so a caret in
      // the block's unchanged head or tail survives — the whole point
      // of an incremental update. `+1` steps past the block's opening
      // token to reach its text content.
      const oldBlock = singleTextblockAt(current, from, oldTo);
      const newBlock = singleTextblockAt(next, from, newTo);
      if (
        oldBlock &&
        newBlock &&
        isPureText(oldBlock.node) &&
        isPureText(newBlock.node) &&
        oldBlock.node.sameMarkup(newBlock.node) &&
        oldBlock.node.textContent !== newBlock.node.textContent
      ) {
        const d = diffText(oldBlock.node.textContent, newBlock.node.textContent);
        const base = from + 1;
        const insert = newBlock.node.textContent.slice(d.bFrom, d.bTo);
        if (insert.length > 0) {
          tr.replaceWith(base + d.aFrom, base + d.aTo, newBlock.node.content.cut(d.bFrom, d.bTo));
        } else {
          tr.delete(base + d.aFrom, base + d.aTo);
        }
      } else {
        tr.replaceWith(from, oldTo, next.slice(from, newTo).content);
      }

      const selection = state.selection;
      if (oldBlock && newBlock && isPureText(oldBlock.node) && isPureText(newBlock.node) && selection instanceof TextSelection) {
        const d = diffText(oldBlock.node.textContent, newBlock.node.textContent);
        const mapEnd = (pos: number) => {
          if (pos < from + 1 || pos > oldTo - 1) return tr.mapping.map(pos, -1);
          const offset = pos - from - 1;
          const nextOffset = offset <= d.aFrom ? offset : offset >= d.aTo ? offset + d.bTo - d.bFrom - (d.aTo - d.aFrom) : d.bTo;
          return from + 1 + Math.min(nextOffset, newBlock.node.content.size);
        };
        tr.setSelection(TextSelection.between(tr.doc.resolve(mapEnd(selection.anchor)), tr.doc.resolve(mapEnd(selection.head))));
      } else {
        tr.setSelection(selection.map(tr.doc, tr.mapping));
      }
      tr.setMeta('writer-remote', true).setMeta('addToHistory', false);
      normalizeTransaction(tr);
      return tr;
}

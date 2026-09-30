// Entity links: `[Title](id:vault/n/slug)`.
//
// A link whose destination is an entity URI (`id:`, `did:`, … — any
// scheme that is not a web scheme, see extension.ts) is an in-app
// link. Clicking one never reaches the browser: it goes to the
// registry's `navigate`, which the shell turns into a bubbling
// `navigate` DOM event (`detail.open` = the URI) for the host to
// bind to a command, and the host's own hook if it registered one.
// Web links open in a new tab on Mod-click, or on a plain click when
// the editor is read-only.
//
// Rendering, as decorations only (the document never changes):
//
//   • every entity-link text run gets `md-entity-link`;
//   • a paragraph whose only content is one entity link becomes a
//     card: the paragraph gets `md-link-card`, and a widget after the
//     text draws the live title (from the host's `resolveNote`, or
//     the stored snapshot when unknown) with its detail line. At
//     rest the snapshot `<a>` is hidden and the card shows; with the
//     caret in the block the card hides and the source
//     `[Title](id:…)` reveals like any link — the editor's universal
//     rule.

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { schema } from "./schema";
import { isMarkup } from "./markup";
import { extendKey, isEntityHref } from "./extension";
import type { Registry } from "./extension";
import type { NoteRef } from "./api";

export const linksKey = new PluginKey<DecorationSet>("tonk-prose-links");

function makeCard(href: string, ref: NoteRef | null, snapshot: string, registry: Registry) {
  return (): HTMLElement => {
    const card = document.createElement("span");
    card.className = "md-link-card-body";
    card.setAttribute("contenteditable", "false");
    card.setAttribute("role", "link");
    const icon = document.createElement("span");
    icon.className = "md-link-card-icon";
    icon.textContent = "📄";
    const title = document.createElement("span");
    title.className = "md-link-card-title";
    title.textContent = ref?.title || snapshot || href;
    card.append(icon, title);
    if (ref?.detail) {
      const detail = document.createElement("span");
      detail.className = "md-link-card-detail";
      detail.textContent = ref.detail;
      card.append(detail);
    }
    card.title = href;
    // Keep the caret where it is; the card is a control, not text.
    card.addEventListener("mousedown", (event) => event.preventDefault());
    card.addEventListener("click", (event) => {
      event.preventDefault();
      registry.navigate(href);
    });
    return card;
  };
}

function computeLinks(doc: Node, registry: Registry): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let cardHref: string | null = null;
    let snapshot = "";
    let onlyLink = true;
    node.forEach((child, offset) => {
      if (!child.isText) {
        onlyLink = false;
        return;
      }
      if (isMarkup(child)) return;
      const link = child.marks.find((mark) => mark.type === schema.marks.link);
      const href = link ? (link.attrs.href as string) : "";
      if (link && isEntityHref(href)) {
        const from = pos + 1 + offset;
        decorations.push(
          Decoration.inline(from, from + child.nodeSize, { class: "md-entity-link" }),
        );
        if (cardHref === null) cardHref = href;
        else if (cardHref !== href) onlyLink = false;
        snapshot += child.text ?? "";
      } else if ((child.text ?? "").trim() !== "") {
        onlyLink = false;
      }
    });
    if (cardHref !== null && onlyLink && node.type === schema.nodes.paragraph) {
      const ref = registry.resolveNote ? registry.resolveNote(cardHref) : null;
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { class: "md-link-card" }),
      );
      decorations.push(
        Decoration.widget(
          pos + node.nodeSize - 1,
          makeCard(cardHref, ref, snapshot, registry),
          {
            side: 1,
            key: `card:${cardHref}:${ref?.title ?? ""}:${ref?.detail ?? ""}:${snapshot}`,
          },
        ),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export function links(registry: Registry): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: linksKey,
    state: {
      init: (_config, state) => computeLinks(state.doc, registry),
      apply(tr, prev) {
        return tr.docChanged || tr.getMeta(extendKey)
          ? computeLinks(tr.doc, registry)
          : prev;
      },
    },
    props: {
      decorations(state) {
        return linksKey.getState(state);
      },
      handleDOMEvents: {
        click(view, event) {
          const target = event.target as HTMLElement | null;
          const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
          if (!anchor || !view.dom.contains(anchor)) return false;
          const href = anchor.getAttribute("href") ?? "";
          if (isEntityHref(href)) {
            event.preventDefault();
            registry.navigate(href);
            return true;
          }
          if (event.metaKey || event.ctrlKey || !view.editable) {
            event.preventDefault();
            window.open(href, "_blank", "noopener");
            return true;
          }
          return false;
        },
      },
    },
  });
}

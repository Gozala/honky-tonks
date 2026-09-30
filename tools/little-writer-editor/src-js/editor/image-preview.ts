// Rendered media previews for expanded images.
//
// The document stores an image as its literal source text
// (`![alt](src)` under the `image_markup` mark — see markup.ts).
// This plugin renders the media itself: one widget decoration
// placed right after each source occurrence. At rest the source
// text is hidden (like every marker) and only the media shows;
// with the caret in the block, source and preview show side by
// side and edits to the source re-point the preview — allusion's
// collapsed/expanded image pair, with the reparse loop keeping
// text and preview coherent.
//
// One syntax, four kinds. `![name](src)` covers images, video,
// audio, and plain files; the kind is a property of the source, not
// of the syntax:
//
//   • a `blob:<hash>` source names a blob in the space. Its bytes are
//     fetched through the blob route (blob.ts) — the host's `with`
//     scope builds the URL — and the recorded Content-Type picks the
//     element. Inside a sealed guest a native `<img src>` can't reach
//     the route, so the bytes arrive as an object URL.
//   • an `https://` source goes straight to the element; the kind is
//     judged by the URL's extension, unknown extensions staying images.
//
// Widgets are keyed by scope + source string, so retyping an
// unrelated part of the block reuses the existing element (no
// flicker, no re-fetch).

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { isImageMarkup, matchImages } from "./markup";
import { isBlobEntity, kindOfType, kindOfUrl, resolveBlob } from "./blob";
import type { MediaKind } from "./blob";
import { extendKey } from "./extension";
import type { Registry } from "./extension";

export const imagePreviewKey = new PluginKey<DecorationSet>(
  "tonk-prose-image-preview",
);

/** The element for one media kind over a resolved URL. */
function mediaElement(
  kind: MediaKind,
  url: string,
  name: string,
  title: string | undefined,
): HTMLElement {
  switch (kind) {
    case "video": {
      const video = document.createElement("video");
      video.className = "md-video-preview";
      video.controls = true;
      video.preload = "metadata";
      video.src = url;
      if (title) video.title = title;
      return video;
    }
    case "audio": {
      const audio = document.createElement("audio");
      audio.className = "md-audio-preview";
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = url;
      if (title) audio.title = title;
      return audio;
    }
    case "file":
      return fileCard(url, name, title);
    default: {
      const img = document.createElement("img");
      img.className = "md-image-preview";
      img.src = url;
      img.alt = name;
      if (title) img.title = title;
      img.draggable = false;
      // Broken sources keep a visible, styleable footprint instead of
      // the browser's broken-image glyph soup.
      img.addEventListener("error", () => img.classList.add("md-image-broken"), {
        once: true,
      });
      return img;
    }
  }
}

/** A file that has no inline rendering: name, hint, and a download
 *  action. `download` on the anchor keeps the file name; for a blob
 *  the href is the object URL, so saving needs no second fetch. */
function fileCard(url: string, name: string, hint: string | undefined): HTMLElement {
  const card = document.createElement("span");
  card.className = "md-file-card";
  const icon = document.createElement("span");
  icon.className = "md-file-card-icon";
  icon.textContent = "📎";
  const label = document.createElement("span");
  label.className = "md-file-card-name";
  label.textContent = name || url;
  if (hint) label.title = hint;
  const action = document.createElement("a");
  action.className = "md-file-card-action";
  action.href = url;
  action.download = name || "";
  action.textContent = "Download";
  action.addEventListener("mousedown", (event) => event.stopPropagation());
  card.append(icon, label, action);
  return card;
}

function makePreview(
  alt: string,
  src: string,
  title: string | undefined,
  registry: Registry,
) {
  return (): HTMLElement => {
    const box = document.createElement("span");
    box.className = "md-media";
    box.setAttribute("contenteditable", "false");
    if (!isBlobEntity(src)) {
      box.append(mediaElement(kindOfUrl(src), src, alt, title));
      return box;
    }
    // A blob: show the name while the bytes load, then swap in the
    // element the content type calls for.
    box.classList.add("md-media-loading");
    box.textContent = alt || src;
    resolveBlob(registry.scope, src)
      .then(({ url, contentType }) => {
        box.textContent = "";
        box.classList.remove("md-media-loading");
        box.append(mediaElement(kindOfType(contentType), url, alt || src, title));
      })
      .catch(() => {
        box.classList.remove("md-media-loading");
        box.classList.add("md-media-broken");
        box.title = registry.scope
          ? "This file could not be loaded"
          : "No space scope: set the editor's `with` attribute";
      });
    return box;
  };
}

function computePreviews(doc: Node, registry: Registry): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !isImageMarkup(node) || !node.text) return true;
    for (const match of matchImages(node.text)) {
      const [source, alt, src, title] = match;
      decorations.push(
        Decoration.widget(
          pos + match.index + source.length,
          makePreview(alt, src, title, registry),
          // side: 1 → the widget sits after the source text, and a
          // caret at that position lands before the widget, next to
          // the text it edits. `key` enables element reuse.
          { side: 1, key: `media:${registry.scope ?? ""}:${source}` },
        ),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

export function imagePreview(registry: Registry): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: imagePreviewKey,
    state: {
      init: (_config, state) => computePreviews(state.doc, registry),
      apply(tr, prev) {
        // Recompute when the document changed or the scope did (an
        // `extend`/`setScope` meta); selection-only transactions map
        // the existing set for free.
        return tr.docChanged || tr.getMeta(extendKey)
          ? computePreviews(tr.doc, registry)
          : prev;
      },
    },
    props: {
      decorations(state) {
        return imagePreviewKey.getState(state);
      },
    },
  });
}

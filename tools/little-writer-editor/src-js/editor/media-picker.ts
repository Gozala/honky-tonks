// The transient "add media" card.
//
// Picking `/image` from the slash menu does not put anything in the
// document yet — a Notion-style empty media block has no markdown
// form, and the file must stay clean. Instead the picker lives in
// plugin state: a widget decoration drawn inside an empty paragraph,
// offering an upload and a "paste a link" field. Confirming inserts
// the `![name](src)` source text into that paragraph; the reparse loop
// turns it into an expanded image and the preview plugin draws it.
//
// Upload goes through the space's blob route (blob.ts). When the page
// defines `<tonk-upload>` the card hosts one — the same headless
// element every Tonk view uses — and listens for its `tonk-upload`
// event; otherwise a plain file input POSTs the bytes itself. Either
// way the note ends up holding `![<name>](blob:<hash>)`.
//
// The picker closes when the paragraph stops being empty (the user
// typed), when it is deleted, on Escape, or on its close button.

import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { schema } from "./schema";
import { isMarkup } from "./markup";
import { uploadBlob } from "./blob";
import type { MediaKind } from "./blob";
import type { Registry } from "./extension";

export type MediaPickerState = { pos: number; kind: MediaKind } | null;

export const mediaPickerKey = new PluginKey<MediaPickerState>(
  "tonk-prose-media-picker",
);

/** True when a textblock holds nothing but block markers and
 *  whitespace — an empty line, possibly inside a quote or list. */
export function isBlankBlock(node: Node): boolean {
  if (!node.isTextblock) return false;
  let blank = true;
  node.forEach((child) => {
    if (!child.isText) blank = false;
    else if (!isMarkup(child) && child.text!.trim() !== "") blank = false;
  });
  return blank;
}

const ACCEPT: Record<MediaKind, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  file: "",
};

const TITLE: Record<MediaKind, string> = {
  image: "Add an image",
  video: "Add a video",
  audio: "Add audio",
  file: "Add a file",
};

/** Open the picker at the caret: reuse the caret's line when it is
 *  blank, otherwise start a new paragraph after it. */
export function openMediaPicker(view: EditorView, kind: MediaKind): void {
  const { state } = view;
  const { $from } = state.selection;
  const tr = state.tr;
  let pos: number;
  if ($from.parent.isTextblock && isBlankBlock($from.parent)) {
    pos = $from.before();
  } else {
    pos = $from.after();
    tr.insert(pos, schema.nodes.paragraph.create());
  }
  const block = tr.doc.nodeAt(pos)!;
  tr.setSelection(TextSelection.create(tr.doc, pos + block.nodeSize - 1));
  tr.setMeta(mediaPickerKey, { pos, kind });
  view.dispatch(tr.scrollIntoView());
}

/** Detail of the `tonk-upload` event `<tonk-upload>` dispatches. */
type UploadDetail = { blob: string; contentType: string; name: string; size: number };

type TonkUploadLike = HTMLElement;

function makePicker(picker: { pos: number; kind: MediaKind }, registry: Registry) {
  return (view: EditorView): HTMLElement => {
    const card = document.createElement("div");
    card.className = "md-media-picker";
    card.setAttribute("contenteditable", "false");

    const close = () => {
      view.dispatch(view.state.tr.setMeta(mediaPickerKey, null));
      view.focus();
    };

    const insert = (source: string) => {
      const { state } = view;
      const block = state.doc.nodeAt(picker.pos);
      if (!block) return;
      const end = picker.pos + block.nodeSize - 1;
      const tr = state.tr.insertText(source, end).setMeta(mediaPickerKey, null);
      tr.setSelection(TextSelection.create(tr.doc, end + source.length));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    };

    const status = document.createElement("div");
    status.className = "md-media-picker-status";
    const say = (text: string, error = false) => {
      status.textContent = text;
      status.classList.toggle("is-error", error);
    };

    // Header: title + close.
    const header = document.createElement("div");
    header.className = "md-media-picker-header";
    const title = document.createElement("span");
    title.textContent = TITLE[picker.kind];
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "md-media-picker-close";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", close);
    header.append(title, closeButton);

    // Upload row.
    const uploadRow = document.createElement("div");
    uploadRow.className = "md-media-picker-row";
    const accept = ACCEPT[picker.kind];
    if (!registry.scope) {
      const note = document.createElement("span");
      note.className = "md-media-picker-hint";
      note.textContent = "Uploads need a space scope (the editor's `with` attribute). Paste a link instead.";
      uploadRow.append(note);
    } else if (customElements.get("tonk-upload")) {
      const upload = document.createElement("tonk-upload") as TonkUploadLike;
      upload.setAttribute("with", registry.scope);
      if (accept) upload.setAttribute("accept", accept);
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.setAttribute("slot", "trigger");
      trigger.className = "md-media-picker-button";
      trigger.textContent = "Upload";
      upload.append(trigger);
      upload.addEventListener("tonk-upload", (event) => {
        const detail = (event as CustomEvent<UploadDetail>).detail;
        if (detail && detail.blob) insert(`![${detail.name || ""}](${detail.blob})`);
      });
      uploadRow.append(upload);
    } else {
      const label = document.createElement("label");
      label.className = "md-media-picker-button";
      label.textContent = "Upload";
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;
      input.hidden = true;
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        say(`Uploading ${file.name}…`);
        try {
          const uploaded = await uploadBlob(registry.scope, file, file.name);
          insert(`![${uploaded.name || file.name}](${uploaded.entity})`);
        } catch (error) {
          say(`Upload failed: ${(error as Error).message}`, true);
        }
      });
      label.append(input);
      uploadRow.append(label);
    }

    // Link row.
    const form = document.createElement("form");
    form.className = "md-media-picker-row";
    const url = document.createElement("input");
    url.type = "url";
    url.className = "md-media-picker-url";
    url.placeholder =
      picker.kind === "image" ? "Paste an image link…" : "Paste a link…";
    url.autocomplete = "off";
    const embed = document.createElement("button");
    embed.type = "submit";
    embed.className = "md-media-picker-button";
    embed.textContent = "Embed";
    form.append(url, embed);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = url.value.trim();
      if (!value) return;
      insert(`![](${value})`);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    card.append(header, uploadRow, form, status);
    // Focus the link field once the widget is in the DOM.
    setTimeout(() => {
      if (card.isConnected) url.focus();
    }, 0);
    return card;
  };
}

function computeDecorations(
  state: { pos: number; kind: MediaKind } | null,
  doc: Node,
  registry: Registry,
): DecorationSet {
  if (!state) return DecorationSet.empty;
  const block = doc.nodeAt(state.pos);
  if (!block) return DecorationSet.empty;
  return DecorationSet.create(doc, [
    Decoration.widget(
      state.pos + block.nodeSize - 1,
      makePicker(state, registry),
      {
        side: 1,
        key: `media-picker:${state.pos}:${state.kind}`,
        // The card owns its events (inputs, buttons); ProseMirror must
        // not treat them as document edits or selection changes.
        stopEvent: () => true,
        ignoreSelection: true,
      },
    ),
  ]);
}

export function mediaPicker(registry: Registry): Plugin<MediaPickerState> {
  return new Plugin<MediaPickerState>({
    key: mediaPickerKey,
    state: {
      init: () => null,
      apply(tr, prev) {
        const meta = tr.getMeta(mediaPickerKey) as MediaPickerState | undefined;
        if (meta !== undefined) return meta;
        if (!prev || !tr.docChanged) return prev;
        const mapped = tr.mapping.mapResult(prev.pos);
        if (mapped.deleted) return null;
        const block = tr.doc.nodeAt(mapped.pos);
        if (!block || !isBlankBlock(block)) return null;
        return mapped.pos === prev.pos ? prev : { pos: mapped.pos, kind: prev.kind };
      },
    },
    props: {
      decorations(state) {
        return computeDecorations(mediaPickerKey.getState(state) ?? null, state.doc, registry);
      },
    },
  });
}

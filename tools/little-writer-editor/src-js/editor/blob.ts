// Blob routes and media kinds.
//
// A `blob:<base58 hash>` source names a content-addressed blob in the
// space (Dialog's blob store, exposed by the Tonk worker). Bytes are
// read from `GET /api/repository/{repo}/branch/{branch}/blob/{entity}`
// and uploaded with `POST …/blob` — the same routes `<tonk-blob-media>`
// and `<tonk-upload>` use. Both need the space scope,
// `"{branch}@{repo}"`, which the host passes as the element's `with`
// attribute. The URL builders mirror `tonk-display/src/blob_url.rs`.
//
// Inside a sealed guest a native `<img src="/api/…">` bypasses the
// relayed `fetch`, so bytes always travel through `fetch` and reach the
// media element as an object URL — never as the route URL itself.

/** Split `"{branch}@{repo}"` into its parts. A bare token is a repo on
 *  `main`. Null for an empty or still-templated (`{…}`) value. */
export function parseScope(
  scope: string | null | undefined,
): { branch: string; repo: string } | null {
  if (!scope || scope.includes("{")) return null;
  const at = scope.indexOf("@");
  const branch = at === -1 ? "main" : scope.slice(0, at);
  const repo = at === -1 ? scope : scope.slice(at + 1);
  if (!repo || !branch) return null;
  return { branch, repo };
}

/** True for a `blob:<hash>` entity reference (base58 payload). */
export function isBlobEntity(src: string): boolean {
  return /^blob:[1-9A-HJ-NP-Za-km-z]+$/.test(src);
}

export function blobReadUrl(scope: string | null, entity: string): string | null {
  const parts = parseScope(scope);
  if (!parts) return null;
  return `/api/repository/${parts.repo}/branch/${parts.branch}/blob/${entity}`;
}

export function blobWriteUrl(scope: string | null): string | null {
  const parts = parseScope(scope);
  if (!parts) return null;
  return `/api/repository/${parts.repo}/branch/${parts.branch}/blob`;
}

export type MediaKind = "image" | "video" | "audio" | "file";

/** The media kind a MIME type renders as. */
export function kindOfType(contentType: string): MediaKind {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)(?:[?#].*)?$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(?:[?#].*)?$/i;
const FILE_EXT = /\.(pdf|zip|gz|tar|7z|rar|doc|docx|xls|xlsx|ppt|pptx|csv|txt|md|json)(?:[?#].*)?$/i;

/** The media kind a plain URL renders as, judged by its extension.
 *  Unknown extensions stay images — the historical behaviour for
 *  `![alt](src)`, and the right default for CDN URLs without one. */
export function kindOfUrl(src: string): MediaKind {
  if (VIDEO_EXT.test(src)) return "video";
  if (AUDIO_EXT.test(src)) return "audio";
  if (FILE_EXT.test(src)) return "file";
  return "image";
}

/** A resolved blob: an object URL over its bytes plus the recorded
 *  content type. */
export type ResolvedBlob = { url: string; contentType: string };

/** In-flight and settled resolutions, keyed by scope + entity. Object
 *  URLs are kept for the page's lifetime; a blob's bytes never change,
 *  so re-rendering the same source reuses the URL instead of
 *  re-fetching. */
const resolved = new Map<string, Promise<ResolvedBlob>>();

/** Fetch a blob through the (relayed) `fetch` and wrap its bytes in an
 *  object URL. Rejects when the scope is unusable or the route fails. */
export function resolveBlob(scope: string | null, entity: string): Promise<ResolvedBlob> {
  const url = blobReadUrl(scope, entity);
  if (!url) return Promise.reject(new Error("no space scope for blob"));
  const key = `${scope}|${entity}`;
  let pending = resolved.get(key);
  if (!pending) {
    pending = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`blob read failed: ${response.status}`);
      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      const bytes = await response.blob();
      return { url: URL.createObjectURL(bytes), contentType };
    });
    // A failed fetch must not poison the cache: drop it so a later
    // render retries (the blob may still be hydrating from a remote).
    pending.catch(() => {
      if (resolved.get(key) === pending) resolved.delete(key);
    });
    resolved.set(key, pending);
  }
  return pending;
}

/** JSON body of a successful `POST …/blob` (tonk-worker `router/blob.rs`). */
export type UploadedBlob = {
  entity: string;
  contentType: string;
  name: string;
  size: number;
};

/** Upload a file's bytes to the space's blob store. Used when the
 *  `<tonk-upload>` element is not defined on the page, and for drop and
 *  paste; the request shape matches the element's exactly. */
export async function uploadBlob(
  scope: string | null,
  file: Blob,
  name: string,
): Promise<UploadedBlob> {
  const url = blobWriteUrl(scope);
  if (!url) throw new Error("no space scope for upload");
  const headers = new Headers();
  headers.set("content-type", file.type || "application/octet-stream");
  if (name) headers.set("x-tonk-blob-name", name);
  const response = await fetch(url, { method: "POST", headers, body: file });
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  const body = (await response.json()) as Partial<UploadedBlob>;
  if (typeof body.entity !== "string" || !body.entity) {
    throw new Error("upload response carried no entity");
  }
  return {
    entity: body.entity,
    contentType: body.contentType ?? (file.type || "application/octet-stream"),
    name: body.name ?? name,
    size: body.size ?? file.size,
  };
}

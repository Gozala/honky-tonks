// The extension registry: the mutable bag of host-provided behaviour
// (`ProseEditor.extend`) plus the space scope, shared by every plugin
// that needs it. Plugins hold the registry by reference and read it
// at use time, because `extend` and `setScope` arrive after the
// plugins were built — often after the first render.
//
// A change to the registry that affects rendering (a new
// `resolveNote`, a new scope) is announced with an empty transaction
// carrying `extendKey` meta, so decoration plugins recompute.

import { PluginKey } from "prosemirror-state";
import type { NoteRef, ProseExtension, SlashItem } from "./api";

export const extendKey = new PluginKey<null>("tonk-prose-extend");

export interface Registry {
  /** `"{branch}@{repo}"`, or null when the host gave none. */
  scope: string | null;
  /** Host-added slash entries (after the built-ins). */
  slashItems: SlashItem[];
  searchNotes: ((query: string) => Promise<NoteRef[]> | NoteRef[]) | null;
  createNote: ((title: string) => Promise<NoteRef>) | null;
  resolveNote: ((href: string) => NoteRef | null) | null;
  /** In-app navigation: the shell's DOM event first, then the host
   *  hook if one was registered. */
  navigate(href: string): void;
}

export function createRegistry(options: {
  scope: string | null;
  onNavigate: (href: string) => void;
}): Registry & { apply(extension: ProseExtension): void } {
  let hostNavigate: ((href: string) => void) | null = null;
  const registry = {
    scope: options.scope,
    slashItems: [] as SlashItem[],
    searchNotes: null as Registry["searchNotes"],
    createNote: null as Registry["createNote"],
    resolveNote: null as Registry["resolveNote"],
    navigate(href: string): void {
      options.onNavigate(href);
      hostNavigate?.(href);
    },
    apply(extension: ProseExtension): void {
      if (extension.slashItems) {
        // Replace by id so a host re-registering an entry doesn't
        // duplicate it.
        const ids = new Set(extension.slashItems.map((item) => item.id));
        registry.slashItems = [
          ...registry.slashItems.filter((item) => !ids.has(item.id)),
          ...extension.slashItems,
        ];
      }
      if (extension.searchNotes) registry.searchNotes = extension.searchNotes;
      if (extension.createNote) registry.createNote = extension.createNote;
      if (extension.resolveNote) registry.resolveNote = extension.resolveNote;
      if (extension.onNavigate) hostNavigate = extension.onNavigate;
    },
  };
  return registry;
}

/** True for a link destination the editor navigates in-app rather
 *  than handing to the browser: an entity URI (`id:`, `did:`, `blob:`,
 *  …) — anything with a scheme that is not a web/mail scheme. A
 *  relative or fragment destination has no scheme and is left to the
 *  browser too. */
export function isEntityHref(href: string): boolean {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
  if (!match) return false;
  const scheme = match[1].toLowerCase();
  return !WEB_SCHEMES.has(scheme);
}

const WEB_SCHEMES = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "ftp",
  "data",
  "file",
  "javascript",
]);

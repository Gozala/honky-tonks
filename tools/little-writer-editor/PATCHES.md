# Writer stability patches

This is the editor source corresponding to the Tonk Prose bundles previously embedded in Writer. `UPSTREAM.json` records their SHA-256 hashes. Sources were extracted from their source maps, because the checked-out TypeScript differed from those deployed bundles. Changes live in Writer's workspace; the original Tonk repository is untouched.

- `editor/reparse.ts`: preserve anchor and head across block/wrapper conversion; expose synchronous transaction normalization; wait during composition; don't postpone parsing on selection-only updates.
- `editor/index.ts`: normalize toolbar transactions before publishing state; suppress outward change events for remote transactions.
- `editor/remote-update.ts`: extracted incremental replacement implementation; retain selection ranges/direction; update structural formatting synchronously; exclude remote updates from local undo history.
- `index.ts`: delay outward change events during composition.

The build bundles these sources against dependencies in the Tonk checkout. Tests import this same snapshot. Upstream tests were additionally run against the patched modules on 13 September 2026 (29 passed).

## Marketing dashboard additions

- `editor/keymap.ts`: list-aware Enter flushes pending source parsing, splits/exits through ProseMirror, restores required source prefixes and ordered numbering, and maps selection into one undoable transaction. This prevents the source reparser from lifting new markerless items out of the list.
- `editor/index.ts`: keep list source prefixes visible at normal size, suppressing duplicate native markers consistently. Neither focus changes nor arrow navigation hide text beneath the caret; marker-only items retain a full-height caret.

Verified with `scripts/check-lists.cjs` against the actual bundled editor.

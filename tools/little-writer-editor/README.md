# LittleWriter editor development

The published app embeds a JavaScript/TypeScript Tonk Prose editor. This pinned source snapshot comes from the editor deployed in WriterSpace, including its earlier selection and remote-update fixes. No Rust build is required. See `UPSTREAM.json`, `PATCHES.md`, and `LICENSE` for provenance.

## Build and test

```sh
cd tools/little-writer-editor
npm ci
npx playwright install chromium
npm run build
npm test
```

The build replaces only the editor core payload in `templates/little-writer/app.yaml`. It also creates `dist/sandbox.html`, a standalone editor with an external focus target, reset button, and live selection/Markdown diagnostics. Open that file in a browser to explore clicking, typing, and navigation without a Tonk space or user documents.

The browser suite checks real keyboard/pointer interactions, including focus changes, arrow navigation, full-height caret geometry in empty list items, Enter continuation/exit, indentation/outdent, renumbering, undo/redo, rapid list creation, and task-checkbox toggling. It saves a screenshot in `dist/editor-interactions.png`. Tests currently run in Chromium; other engines have not been verified.

List prefixes stay visible as editable Markdown (`1. `, `- `) at normal font size, including while unfocused. This intentionally avoids exchanging source text for native markers as focus moves. The Enter command preserves prefixes across ProseMirror splits and the source reparser.

This changes no document data or autosave behavior. LittleWriter already schedules its own saves; the marketing dashboard's asset autosave is application-specific.

The suite also loads the full LittleWriter 2.0 template inside a restricted iframe with an in-memory Tonk bridge. It verifies the editor against the application CSS, saves document edits, and exercises the Users and Chat UI without touching any real space. The application focus rule keeps native list markers disabled so it does not duplicate the editable source prefixes.

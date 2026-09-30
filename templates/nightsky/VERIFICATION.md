# Runtime verification — 10 September 2026

The catalog checks validate metadata and preserve the Tonk notation bytes. Runtime checks below were performed separately with Tonk CLI 0.6.14 and Chromium browsers.

## Native Tonk

- Installed the required core in a disposable space with no production music, people, comments or relay configuration. Added the optional demo files in order.
- Confirmed all three demo blobs were absent before preparation. Clicking **Prepare demo** uploaded the included audio, artwork and feature bytes through the scoped native blob API. Independent reads matched every size, SHA-256 and activation binding. A mismatched activation tuple created no track.
- Joined with a name, played the Satie recording, clicked to seek and dragged a range. Submitted one comment containing text plus a Commons GIF, saved that GIF, then reimported all three files. The comment, attribution, shelf, track and analysis remained intact.
- Native song commands created two distinct tracks and separate comment roots. Selection replaced only the workspace pointer; an invalid target could not change it. Metadata edits changed only title/artist/album/year, leaving media, identity, comments and selection unchanged. Reimport preserved those independent records.
- The real **Edit details / Update details** form updated an inactive song without opening it. **Open song** mounted one player and its own conversation; returning to Satie restored its original text/GIF comment. Its player reported prepared analysis ready and WebGL rendering.
- The component helper was tested against the real CLI: exact target replacement, stale alias/source rejection, replay with zero changes, preservation of unrelated component identities and complete synthetic cleanup.

The full catalog Starter space was also installed in a fresh native space before Nightsky. All eight Starter files were evaluated in order. After adding Nightsky, exercising song/select/comment commands and reimporting its core, all 26 original components, 12 Starter data snapshots, vault schema and rendered home were unchanged. That test used the same schema/runtime before the final editor-only status message correction.

## Browser and audio boundaries

Two actual browser clients loaded the exact public runtime and Satie prepared assets through an isolated localhost fixture. Playback, pause, seek, clock readiness, ordered playback and unordered cursor channels, bidirectional star cursors and close/rejoin recovery passed. The fixture uses an owned local signalling relay; its comments are temporary HTTP data. Native comment persistence was tested separately above.

A generated-code regression test checks the namespaced audio adapter through an actual sky callback and nonzero band/uniform output. It rejects the old `view.Song` portability bug. Source tests also cover upload bounds, async cancellation, destination changes, hash mismatches, retries and metadata-only edits. The optional audio toolkit rebuilds the shipped kit byte-for-byte and verifies lossless synthetic sidecars.

The browser automation could not complete the native **Audio file** chooser: its file-picker hook timed out. An external-browser fallback was blocked by automatic approval review before opening the test invitation. Thus arbitrary file selection → Save as new song has source-level tests and native API/command coverage, but no completed end-to-end browser acceptance yet. The bundled demo's actual native upload was completed. This distinction is intentional.

Phone-width rendering was reviewed for the sky, including Canvas2D fallback, but sustained physical-phone memory/temperature and file-picker behavior were not measured. Same-Mac WebRTC testing does not certify restrictive-NAT connectivity or acoustic speaker alignment. No TURN service is included.

## Storage

The required core is 810,883 bytes and contains code/schema, the unified remix guide and 36 public development/setup text files. File contents are not rendered or executed by the app; media is not duplicated in the tool bundle. Audio is optional. The demo's native audio/art/analysis total 6,443,923 bytes; base64 payloads also remain in the imported notation and Tonk history. Clearing pending importer rows from normal rendering does not remove that history. Each catalog file is below 8 MiB. The exact module inputs and optional relay setup files are carried as non-rendered nightsky-agent-file rows with a versioned manifest. Credentials and deployment state are excluded.

The live VPS capability, production room IDs, original private recording and user comments are excluded. New rooms need their own relay and capability when shared listening is desired.

## Unified agent flow

The final workspace has one Make your own copy section and one copyable agent prompt. The separate Song settings, shared-listening and component-map controls are unmounted. The native song/select/update commands remain available to agents. The instructions start from the synced Tonk code and schema; no separate ZIP or custom copy program is required. A later fresh-agent exercise made an independent remix and deployed its own Cloudflare Worker with parent-agent assistance for media uploads, relay configuration, invitation creation and browser acceptance. Two clients passed playback, seek, pause and rejoin. This was an assisted exercise using the preceding prompt, not a blind or unattended benchmark of the final prompt.

The Cloudflare port passed 11 workerd runtime tests, including actual Durable Object hibernation/recovery, plus four setup tests and authenticated WebSocket smoke checks. Two actual local browser clients passed playback, seek, pause, named cursors and fresh-client rejoin through local Wrangler. At that local acceptance, all ten listening component hashes matched the then-current public runtime. See cloudflare-relay/browser-acceptance.json for historical source hashes and limitations; the later cursor update has separate verification below. No Cloudflare account was deployed in that local fixture, and the production VPS was unchanged. The assisted remix exercise above later used its own hosted Worker.

## Fresh-client guide refinement

The completed invite-to-remix review informed the revised starter and carried guide: current-name source selection, exact native eval recipes, transient command descriptors, authored rule joins, view compilation order, identity/account reuse, lazy reads, verified hosting, new blank home setup and deliberate invitation sharing. Prompt/fallback tests, concrete native read examples, a UUID identity dry-run and an exact transient-command descriptor dry-run pass. This refinement changes guidance only; listening runtime and application data are checked separately during guarded publication.

## Bounded guidance follow-up — 10 September 2026

The published follow-up adds pinned CLI version/help discovery, conditional exact-cache npm fallback, explicit exclusion of unrelated local source clues, and correct native variable/string serialization. The narrow prompt harness and native dry runs pass. Guarded publication and full readback preserve all 2,662 other native facts and eleven other components; no listening runtime or media changes. A preceding frozen prompt completed an assisted fresh-agent remix benchmark; this wording was not part of that run and has not had a second blind test.


## Final starter and timeline cursor

The final user-reviewed starter was checked in a freshly opened native demo: the current prompt rendered and copied, with Satie and the existing comment preserved. It has not had a second blind remix benchmark.

The approved timeline cursor changes only the local pointer over an enabled timeline: a 1 px × 32 px glowing line replaces the star. The WebRTC cursor packet format is unchanged. Cursor, UI, nested-shadow seek, canvas, installer-protection and real WebRTC regression harnesses pass. A browser running the public namespaced components verified direct range selection and click-to-seek. After guarded publication, a fresh native invite loaded the timeline marker and matching cursor styles; all other components and application data were preserved. This fresh native check did not repeat two-browser playback.

The submission pass changes documentation and the hashes of its carried documentation bundle only. Listening component bytes, prepared assets and native guide/prompt remain those already reviewed.

## Empty workspace selection — 30 September 2026

The workspace now queries existing `nightsky-active-track` selection rows in directory mode instead of requiring that concept on a workspace with no active pointer. The workspace-room component selects only its own row, shows an empty-state message until selection and removes the previous room when selection changes or clears.

CLI 0.6.14 installed the edited core in a disposable local space. Headless rendering passed with no active pointer and with two independent workspace selections. All seven catalog/selection tests pass, including empty, other-workspace, selected, switched, cleared, invalid and reconnect states. The selection component tests execute the shipped class source with a minimal DOM harness; headless rendering does not execute custom elements. No browser or audio playback acceptance was repeated for this change.

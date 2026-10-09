# Make it yours

Use **Make your own copy** at the top of Nightsky and give your agent the Tonk invite with this one prompt:

> Read the Nightsky remix guide carried in this Tonk and help me make it mine. For my own copy, create a new independent Tonk space using the supported native source/schema workflow, preserve the shared original, verify the chosen media and give me my new invite. In my intended space, help me change songs or artwork, edit the visuals or audio analysis, and set up shared listening if I ask. Inspect the native commands and carried guide/tool files before writing; preserve existing comments and unrelated apps. Use native blobs for media and the carried Cloudflare instructions for an optional private relay. Test the requested result in the browser and explain what changed.

Include the demo's **Share invite** if the agent has not joined; the copied scope and workspace IDs alone grant no access. No separate ZIP or custom copy program is required. The agent resolves the current `nightsky-remix-guide-main` name and follows that one guide's tested source recipe. It uses a fresh working folder and normally reuses your account, asks together for any missing song/visual/shared-listening choices, and creates your own space. Native facts, code and media can still fetch on demand after pull. Editing a joined reference replica would change that shared space.

The guide explains current named elements, transient commands, authored rules and the required view compilation order. The agent copies only your chosen native media, verifies ownership and hosting, tests the result, and returns your new Share invite. Only the new blank space's home is set to Nightsky. Source membership, relay credentials, unrequested comments and meaningful existing homes stay untouched. An intentionally returned Tonk invitation is allowed; relay and account credentials remain private.

For deeper work, the optional `nightsky-agent-file` bundle contains exact audio-module inputs, element editing tools and relay setup files. The native guide explains how the agent can read them into its working folder. This is optional development tooling, not a prerequisite for making a remix.

**Change a song through the agent.** First query `nightsky-track` and `nightsky-active-track` in the intended space. For a new recording, upload the exact audio and artwork files with `tonk --space YOUR_SPACE blob add FILE --type MIME`, verify their SHA256 values, inspect `show nightsky-song-add`, and submit a small native command with a fresh entity and request UUID. Its fields are `workspace`, `request`, `title`, `artist`, `album`, `year`, `duration` (whole seconds rounded up), `audio`, `cover`, `audio-sha256` and `cover-sha256`. Supply a verified small cover if the user has none. Reuse the command entity/UUID only when retrying the same pending addition. A new recording creates and selects a new track; earlier tracks and their comments remain intact.

Use `nightsky-song-select` with `workspace` and `selected` to open an existing complete track. Use `nightsky-song-update` with `workspace`, `track`, `title`, `artist`, `album` and `year` to edit only metadata, preserving its recording, comments and current selection. Inspect each native command and dry-run the notation before evaluating it. Query the resulting track and active pointer, then verify one player mounts. The browser can compute features locally; the optional sidecar workflow below removes that preparation wait.

| Change | Edit here |
| --- | --- |
| Song, artwork, title or artist | Native blob ingestion, `nightsky-track`, and `nightsky-song-add` / `select` / `update` commands |
| Star density, colour, trail brightness or orbital visuals | `nightsky-sky`: star seeding/palette, `prepareOrbit()`, shaders and Canvas2D fallback |
| Play button and its ripple | `nightsky-deck` and `nightsky-canvas` |
| Timeline appearance | `nightsky-scrubber`; keep one chosen appearance |
| Composer, feed or timed comment cards | `nightsky-marks`, `nightsky-dialogue`, `nightsky-moments` |
| Frequency bands, rhythm, quiet texture or recurring patterns | `tools/examples/`; rebuild the generated block of the `nightsky-kit` element |
| A new visual driven by audio or presence | `Nightsky.room(element)` and the events below |
| Playback scheduling or networking | `nightsky-player` or `nightsky-live` |
| Shared listening server | Your scoped `nightsky-relay` row; [Cloudflare setup](cloudflare-relay/README.md) |

Tonk holds the editable element source, schema, commands and views. This guide and the files in `tools/` also travel with it as the current `nightsky-agent-file` bundle. The catalog's `core.yaml` is an install source for a fresh space; it is not needed to edit the source already in a joined space.

## Edit one element

From this folder, with Node installed:

```sh
node tools/element.mjs export --space YOUR_SPACE --name nightsky-sky --out edits/sky
# Edit edits/sky.js. Keep edits/sky.snapshot.json unchanged.
node --check edits/sky.js
node tools/element.mjs plan --space YOUR_SPACE --snapshot edits/sky.snapshot.json --source edits/sky.js --out edits/sky-change.notation
npx --yes @tonk/cli@0.6.14 --space YOUR_SPACE eval edits/sky-change.notation --dry-run
```

An element is published under its tag (`id:nightsky-sky`), and its source is one `define` method: a `() => …` factory that returns the element class. Keep it that way; the runtime registers the tag itself. Inspect the diff and require one matching original element. Evaluate the same file when ready, reload the room, then export again and compare the installed source. The helper reads the tag's name binding, `define` method and description with the CLI and guards both the name and the exact original source. The plan re-derives the element with its current description, which moves the tag to the new definition; the previous definition stays on the branch, unnamed and no longer loaded. If someone changed it, re-export and merge. It never publishes by itself. A stale plan makes zero changes; the CLI reports this as an unbound `description` variable.

For schema or view edits, inspect `npx --yes @tonk/cli@0.6.14 --space YOUR_SPACE show CONCEPT` and author a small notation change. Keep `xyz.nightsky.*` attributes and namespaced command fields; do not edit lowered event bindings or compiled rules. Repeated YAML heads are intentional. Reimporting the original template is installation, not a source merge, and can restore bundled defaults.

## Connect another visual

```js
const N = globalThis.Nightsky, room = N.room(element);
let sample;
const tick = ({detail: frame}) => {
  const timeline = room.analysis;
  if (!timeline) return; // Keep a visible basic fallback.
  sample = timeline.sample(frame.t, sample);
  draw({
    phase: .02 * frame.t + .13 * sample.rhythmIntegrals[1],
    gentleLight: sample.afterglow[0],
    quietDetail: sample.texture[0]
  });
};
room.target.addEventListener('nightsky-tick', tick);
// Disconnect: room.target.removeEventListener('nightsky-tick', tick).
```

Wait for `nightsky-kit-ready` if `Nightsky` is not yet present. Seconds come from the shared media time, so integrals remain stable after a seek; do not accumulate render-frame deltas. Samples reuse arrays. `rhythm[11]` supplies immediate attack/release activity; `rhythmIntegrals[11]` drives motion. `levels[11]`, `texture[3]`, `harmonic[3]`, `percussive[3]`, `afterglow[3]` and `motif[4]` offer different light/shape signals. Frequency families are six fixed regions plus five borders; these are descriptors, not separated instruments. Smooth brightness independently of rhythmic movement.

`room.presence` emits `join`, `update`, `leave` and `change`; iterate `snapshot()` first. `Nightsky.emit(element, 'nightsky-toggle')` requests play/pause; `'nightsky-seek'` takes `{ms}`. `'nightsky-range-selection'` takes `{startMs,endMs,source}` or `null`. Preserve native keyboard controls and reduced motion when replacing their presentation.

Dialogue composes `nightsky-mark`, `nightsky-mark-author`, `nightsky-note`, `nightsky-gif` and `nightsky-gif-credit` on one comment entity. The mark's `track` and millisecond `start`/`end` bind it to that recording; text and GIF can coexist. `nightsky-saved-gif` is the shared shelf. Add future content alongside this structure instead of packing comments into JSON. A changed recording needs a new track ID; never retarget its old comments silently. The workspace's `nightsky-active-track` selects which room mounts. Metadata edits use `nightsky-song-update`; they keep that identity and selection.

## Prepared features and shared listening

[The small audio toolkit](tools/README.md) prepares a gzip sidecar for your exact native audio blob and rebuilds audio modules without touching the rest of the app. Upload ordinary media with `tonk blob add FILE`; a bare `blob:` reference does not upload bytes. Each alternate rendition needs its own verified features. Do not reuse the demo's sidecar for another song.

Local listening needs no relay. Ask the same agent to enable shared listening using the carried [Cloudflare relay guide](cloudflare-relay/README.md). It covers your account, a namespace derived from the destination space, current Free-plan quotas, private credentials, deployment and rollback. New song rooms work without allowlist edits, and the included workers.dev address needs no custom domain. After authenticated signalling checks, back up and change only the destination's `nightsky-relay` fact, then test two-browser playback, seek, pause, cursors and rejoin. Preserve any existing relay until acceptance succeeds.

For an existing self-hosted Node installation, [the relay reference](relay/README.md) documents its configuration and explicit room allowlist. Derive each room from the destination scope and selected track using the current `nightsky-live` implementation; do not reuse another space's room or capability. Room hashes are not authentication, and everyone able to read a relay capability can use its permitted namespace.

To carry these instructions in Tonk, first read `tonk --space YOUR_SPACE space agents get` and merge the relevant Nightsky section with existing instructions. Review that file, then deliberately run `tonk --space YOUR_SPACE space agents set merged-AGENTS.md` (or `--dry-run` first). The template never replaces other apps' agent context automatically.

# Optional remix tools

These files travel with Nightsky in its current `nightsky-agent-file` bundle. Read the native `nightsky-remix-guide` to materialize a verified copy into a fresh local folder. No separate website download is required. JavaScript tools need Node 22 or later; the materialization bootstrap also uses Python 3. Offline audio preparation needs `ffmpeg` and `ffprobe` on your PATH. CLI examples assume Tonk 0.6.14; use `npx --yes @tonk/cli@0.6.14` in place of `tonk` if needed. Nothing here uploads audio, executes carried files or publishes an app automatically.

## Make a new song's visuals ready immediately

1. Ask the agent to ingest your exact chosen recording with `tonk --space YOUR_SPACE blob add song.flac --type audio/flac`, verify its hash, and use the returned `blob:` reference in the native `nightsky-song-add` command described in [REMIXING.md](../REMIXING.md). Query `nightsky-track --json` to confirm the stored identity. For an existing track, obtain the exact stored bytes through Tonk's supported blob read/fetch workflow, verify them against that track's native blob, and use that rendition for analysis. Audio and artwork are native blobs, not remote URLs or base64 in element source.
2. Run from the template folder, replacing `blob:ACTUAL_AUDIO_REFERENCE`:

   ```sh
   node tools/scripts/prepare-analysis.mjs --input song.flac --output song-analysis --audio-blob blob:ACTUAL_AUDIO_REFERENCE
   ```

   This writes `song-analysis.gz` and `song-analysis.manifest.json`; existing outputs are never overwritten. It verifies lossless serialization at attack boundaries and random seeks before writing.
3. Upload the result with `tonk --space YOUR_SPACE blob add song-analysis.gz --type application/gzip`. Add one `nightsky-analysis-asset` record using these exact values:

   | Field | Value |
   | --- | --- |
   | `audio` | Manifest `identity.audioBlob` |
   | `sha256` | Manifest `identity.audioSha256` |
   | `blob` | Newly uploaded gzip blob reference |
   | `digest` | Manifest `gzip.sha256` |
   | `version` | Manifest `identity.algorithmVersion` |

   Use a fresh, personal name for that asset. Inspect the schema with `tonk --space YOUR_SPACE show nightsky-analysis-asset`, dry-run your notation, then evaluate it. Reload and check the player's `data-analysis-source="prepared"` and `data-analysis-state="ready"` attributes.

The manifest binds exact encoded audio bytes, source sample rate/frame count/channel count and `pcm-seconds-v1` timestamps. The player additionally checks decoded duration and its current source-derived algorithm version. A different file, trim, transcode or alternate rendition needs its own sidecar. Missing or mismatched features fall back to local analysis without delaying playback. Retain the old asset until its replacement is verified; never force a version string to make incompatible data load.

## Change the analysis, keep the interface

| Source input | Responsibility |
| --- | --- |
| `examples/frequency-bands.mjs` | Fixed bands and overlapping borders |
| `examples/spectral-timeline.mjs` | Track-relative rhythm, integrals, energy and quiet/harmonic/percussive texture |
| `examples/spectral-motifs.mjs` | Stable recurring spectral patterns |
| `examples/spectral-sidecar.mjs` | Validated lossless serialization/hydration |
| `examples/audio-modules.mjs` | Live feature plugins, renderer connection and optional audio effects |
| `examples/orbital-motion.mjs`, `examples/constellation-graph.mjs` | Reusable motion/graph helpers |

These are build inputs; the public runtime API is `Nightsky.Modules`. The builder translates the older internal `Song` adapter names into `Nightsky`, including window lookups, custom elements and events. The three spectral sources retain their exact fingerprint inputs.

Export `nightsky-kit` with [the element helper](../REMIXING.md#edit-one-element), edit the relevant source input, then build into a new file:

```sh
node tools/examples/build-audio-modules.mjs edits/kit.js edits/kit-rebuilt.js
node --check edits/kit-rebuilt.js
```

Use `kit-rebuilt.js` as the source for the guarded change plan. Only the generated block changes; the rest of the kit's `define` source, other elements, schema and data are preserved. Do not hand-edit its generated block. The builder computes `spectralVersion` from exact timeline, motif and codec source bytes. After changing any of those, regenerate your sidecars and verify the new bindings. An unchanged build is byte-identical to the shipped public kit.

Renderer-only edits such as trail exposure, light smoothing or colours do not require redoing audio analysis. Keep motion on media-time integrals and smooth only the light when reducing flicker; keep WebGL and Canvas2D versions consistent.

`element.mjs` defaults to `npx --yes @tonk/cli@0.6.14`. Set `TONK_BIN` to an already installed compatible executable if desired. Exports/plans only read Tonk and create new local files; explicit CLI evaluation remains the write step. Run `node tools/toolkit-test.mjs` for the offline contract checks.

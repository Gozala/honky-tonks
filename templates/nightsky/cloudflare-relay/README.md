# Nightsky Cloudflare relay

Optional signalling relay for a single Tonk space. Audio loads from Tonk; playback commands and cursors still travel over the existing WebRTC connection; no music, comments or messages are stored here. This package does not change an existing VPS relay.

The Worker uses a Free-compatible SQLite-backed Durable Object configuration and the included `workers.dev` address. It does not select or change the account's subscription. Review the current [Workers](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) limits; a free plan has quotas, not unlimited service. Inspect the existing plan when your authorization permits it. If Wrangler OAuth cannot read billing information, continue the authorized deployment with this Free-compatible configuration and report **account plan unverified**; do not claim a guaranteed Free entitlement or request broader permissions solely to inspect billing. Stop if an actual upgrade, payment or charge acceptance is required, and obtain the owner's authorization before proceeding.

## Free-plan quotas

Checked against official documentation on 10 September 2026. Account allowances are shared with your other Workers and Durable Objects; daily quotas reset at 00:00 UTC. The CPU limit is per request, and stored-data capacity is a total, not a daily allowance.

| Meter | Free allowance |
| --- | --- |
| Worker requests | 100,000 per day |
| Worker CPU | 10 ms per HTTP request |
| Durable Object requests | 100,000 per day |
| Durable Object active duration | 13,000 GB-seconds per day |
| SQLite rows read | 5 million per day |
| SQLite rows written | 100,000 per day |
| SQLite stored data | 5 GB total |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). Incoming WebSocket messages use a 20:1 ratio for Durable Object request accounting; connection setup also counts as a request. Outgoing messages are not charged as requests. Eligible hibernating time does not consume active duration. This relay writes no application data to SQL.

On Free, exhausted quotas cause affected operations to fail; they do not automatically upgrade the account to a paid plan. A Paid account follows its paid allowances and overage rules. Missing billing-read permission does not establish either plan and is not by itself a deployment blocker; record that uncertainty without changing the subscription.

## Set up with your agent

Use Node 22.12+ and Python 3. Run commands from this folder. Read `AGENTS.md` first.

1. Run `npm ci`, `npm test`, and `python3 setup-test.py`.
2. Run `npx wrangler login` and complete sign-in yourself. Select the intended Cloudflare account; obtain its account ID from the dashboard or `npx wrangler whoami`. The script requires it explicitly.
3. Configure without network mutations:
   ```sh
   python3 setup.py --name YOUR-UNIQUE-WORKER --account-id YOUR-32-HEX-ACCOUNT-ID --space-did YOUR-TONK-SPACE-DID
   ```
4. After reviewing the destination, add `--deploy` to the same command. This checks the worker name is unused, validates a dry-run bundle, deploys fail-closed, and installs a generated capability as a Worker secret. No token is printed or passed in command arguments. The result is saved to `.relay-private/capability.txt` (0600). If completing an interrupted deployment or updating this exact worker later, add `--update`; the helper also requires its matching private receipt.
5. Run `node smoke.mjs` to check the deployed private capability with two real WebSocket clients. After it passes, back up the intended space's existing `nightsky-relay` fact privately. Read the capability file in-process and update **only that destination space's `nightsky-relay` URL** through the supported Tonk workflow.
6. In the actual Tonk space, use two native browser clients to verify play, pause, seek, cursors and leave/rejoin. Create two new songs and verify their rooms work without any server allowlist edit. If acceptance fails, restore only the backed-up relay fact, checking first that no newer user edit would be overwritten. Keep the existing VPS available during acceptance.

Never paste the capability URL into a public issue, template, screenshot or log. Do not overwrite other songs, comments, components or global agent instructions.

The helper hashes the space DID into a stable `RELAY_NAMESPACE`. One configured namespace maps to one Durable Object; arbitrary rooms never allocate new objects. The capability authorizes all `nightsky-*` (and legacy `song-*`) rooms inside that namespace. New songs require no server allowlist edits. Room IDs are routing keys, not authorization: anyone holding the shared capability can join rooms in that space. Use separate Worker deployments for independent/private spaces.

The helper is not a deployed-service certification: run authenticated WebSocket and real two-browser acceptance after deployment. It intentionally performs no Tonk writes. Keep `.relay-private` for safe retry/update; back it up privately. Losing it prevents automatic overwrite of an existing Worker.

## Runtime and recovery

The wire protocol matches Nightsky's Node relay: peers/join/leave discovery, shallow validated SDP or ICE signals, and optional JSON ping/pong. Hibernation stores only socket membership, peer metadata, IP counts and token-bucket counters in WebSocket attachments. A new constructor reconstructs open sockets without sending duplicate joins. No timer, SQL message archive or media storage keeps the object awake. A changed `RELAY_AUTH_EPOCH` invalidates old attachments on reconstruction; rotate the token and epoch together, deploy, and verify old clients disconnect.

Cloudflare code deployments and transport failures can close sockets. The existing client reconnects and receives a new authoritative roster; it does not assume the old socket survives deployment. Local tests exercise actual workerd eviction in both hibernate and close modes, including negotiation after reconnect. The local runtime is not proof of internet/TURN connectivity or deployed quota behavior.

**Difference from Node:** there is no server timer doing Node's 30-second ping/dead-peer sweep. Timers would prevent hibernation. Quiet disconnected peers are removed when the platform detects their closed transport; detection has no claimed 30–60 second bound. Existing clients do not send a relay heartbeat. Reconnect restores current membership; a future negotiated application heartbeat could tighten this bound without changing the current protocol.

Limits: 256 concurrent sockets, 32 per IP, 64 rooms, 32 peers per room; 32KiB inbound JSON; 64KiB outbound roster; 120-message burst/60 per second per sender; separate bounded signalling and membership-control byte budgets. Workers does not expose a guaranteed Node-style `bufferedAmount`: the byte budget is a traffic bound, not proof of a measured client receive queue. Binary/deep arbitrary signalling payloads are rejected. Duplicate peer IDs never evict an incumbent. Failed membership delivery closes the affected recipient so it must rejoin.

Allowed origins default to `https://tonk.network` and literal `null` (Tonk's opaque-origin guest iframe, where views and their custom elements run); missing Origin is rejected. Origin is not authentication. `/health` is generic unauthenticated process liveness only. Observability is disabled because invocation logs can include query capabilities; don't use raw request logging or `wrangler tail` with real private URLs.

## Recorded local acceptance

On 10 September 2026, the local suite passed 11 actual workerd tests and four offline setup tests. Two external WebSocket clients passed authenticated signalling against Wrangler. Native browser UI checks on the same Mac then verified play and seek from both clients, propagated pause, cursor packets/sparkles, and a fresh second client rejoining after disconnect. Both clients converged on paused version 7 at 108934.85009765625 ms with zero active audio voices and prepared analysis. All ten listening-component hashes matched the template at that local acceptance. The later timeline cursor update changed sky/scrubber presentation; its separate checks are recorded in the repository's VERIFICATION.md. The older editor/guide are excluded from the original comparison. See [browser-acceptance.json](browser-acceptance.json) and [test-results.json](test-results.json). These results do not certify a deployed Cloudflare account, WAN connectivity, native Tonk persistence or acoustic synchronization.

## Local development

Create `.dev.vars` with an owner-only `RELAY_TOKEN` of at least 32 characters, then `npm run dev`. This binds 127.0.0.1:18772 only. Local config includes a test namespace and auth epoch; it must not be copied as a production identity. The package uses pinned tooling and has no runtime npm dependencies.

Official API references: [hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [test eviction API](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [SQLite migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/), [Workers logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

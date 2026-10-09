# Honky Tonks

A small, Git-backed gallery of Tonk application templates. Humans search a desktop table or mobile cards and open detail pages; agents read the same static HTML, `catalog.json`, `llms.txt`, and original YAML source. Download bundles contain each template's original YAML, manifest, and images.

- [Public gallery](https://goblinoats.github.io/honky-tonks/)
- [Contribute a template](CONTRIBUTING.md)
- [Tonk](https://tonk.xyz)

## Run locally

Requires Node 22.13+, npm, and `zip` (included on macOS and the Ubuntu CI runner) to build template download bundles.

```sh
npm ci
npm run dev
```

Open the URL printed by the server. After changing a manifest or template source while the dev server runs, run `npm run prepare:catalog`.

```sh
npm test
npm run build
```

The deployable site is `dist/client/`. It contains complete static HTML, assets, and source files. There is no server, database, or authentication requirement. Navigation and source reading work without client JavaScript.

The Sites starter uses Vinext/React. Build-time scripts validate ordinary YAML manifests separately from Tonk asserted notation, which is copied without reserialization. The gallery escapes source and descriptions rather than executing them.

## Add a template

Copy a folder under `templates/`, edit its manifest, add application YAML and images, and open a pull request. No application code changes are needed. Custom elements in a template are declared with Tonk's `element!` (the older `component` concept no longer exists). See [CONTRIBUTING.md](CONTRIBUTING.md).

Included templates live under `templates/`. Compatibility is stated in each manifest. Null contact fields fall back to this project's issue tracker.

## Static hosting

The GitHub Actions workflow validates PRs and deploys main to GitHub Pages. In **Settings → Pages**, select **GitHub Actions** as the source.

For a project subdirectory:

```sh
BASE_PATH=/honky-tonks npm run build
```

For a domain root, omit BASE_PATH. Upload the contents of `dist/client/` to any static host. No rewrite-to-index fallback is needed: each route has an index.html. Configure your host's 404 page from `404.html`.

`site.config.json` holds the public repository, branch, and Pages URL. Update it when transferring the project. The GitHub workflow derives the base path from the repository name. The build normalizes Vinext's nested export into a portable static artifact. `.openai/hosting.json` connects the optional Sites deployment and does not affect GitHub Pages.

## Registry space

The catalog is also published into a Tonk space as data, so agents and views can query it there. `.github/workflows/registry.yml` runs `npm run registry`, which writes three notation documents to `generated/registry/`:

- `00-schema.yaml`, copied from `registry/`: the catalog's concepts, the publish commands, the rules that reconcile the stored catalog with a publish, the `catalog/listing` and `catalog/listed-file` concepts readers query, and the views, including a search box over the template cards;
- `10-catalog.yaml`, generated from every `template.yaml`: the publish document. It asserts each identity (the catalog by its origin, an entry by its slug, a file by its entry's slug and path) and says what the catalog is now with transient commands: `catalog/release`, then per template `catalog/publish` with its whole entry, `catalog/publish-feature` per feature and `catalog/publish-file` per notation file. Images and notation files are stored as assets (`!include/asset`), never evaluated;
- `90-home.yaml`, copied from `registry/`: puts the searchable catalog on the space's home.

Pull requests evaluate them without committing. A merge to `main` publishes them with [tonk-publish-action](https://github.com/Gozala/tonk-publish-action), as one commit. Set the `TONK_INVITE` secret to an agent connection link for the registry space ("connect agent" in Tonk). Without the secret, the workflow still evaluates the documents against a scratch space on the runner.

The schema's inductive rules fire at commit: what a publish lists is asserted, and a member, feature or file the stored catalog holds but the publish no longer lists is retracted. Everything else stays as it is, so a publish that changes no template writes only the new commit. Required notation files install in path order, so a template whose files depend on each other numbers them. Query the current catalog with:

```sh
tonk --space SPACE query catalog/listing --json
tonk --space SPACE query catalog/listed-file --json
```

## Agent contract

`catalog.json` (schemaVersion 1) includes all metadata, ordered `files`, `optional` flags, SHA-256 and byte length, direct source links, and `entrypoint`. Paths are relative to the serving origin, including the configured base path. `llms.txt` describes discovery and evaluation. Each YAML also has a .txt companion for easy inline reading.

Only the manifest is standard YAML. Never parse/rewrite the application files with an ordinary mapping-based YAML parser: Tonk allows repeated heads such as `attribute!:`. Download and review sources, verify their hashes, then use the user's chosen space and `tonk eval --dry-run` before installation. Templates route their own home: each declares a `route!` for `/` pinned at `id:space/home-route`, so installing one replaces the space's home. Install into a new space unless the user wants that. `entrypoint` names the main concept; Tonk's installer routes `/` to it only for a template that does not route `/` itself. Optional sample data is a separate choice.

Build checks validate contribution structure and exported links. They do not execute community code or certify its behavior. Runtime review belongs in the PR.

## Project layout

```text
templates/<slug>/        contribution source of truth
app/                     gallery, details, agents, contribution pages
scripts/catalog.mjs      manifest and file validation
scripts/prepare.mjs      generated catalog and static source copies
scripts/check-output.mjs exported HTML, local link and checksum checks
scripts/registry.mjs     registry documents for the Tonk space
registry/                hand-written registry schema, views and home
generated/               ignored build-time data
public/content/          ignored generated source copies
.github/workflows/       PR checks and Pages deployment
```

## License

MIT for this repository. Contributions declare their own license in the manifest; bundled third-party assets keep their own licenses.

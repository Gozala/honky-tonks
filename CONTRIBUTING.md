# Contributing a Tonk

Add one folder under `templates/<slug>/` and open a pull request. The build discovers folders automatically; no gallery code changes are needed.

## Manifest

Copy an existing `template.yaml`. It is ordinary YAML with unique keys. All fields below are required, except `files[].optional` which defaults to false:

```yaml
schemaVersion: 1
slug: your-tonk
name: Your Tonk
summary: One or two sentences, at most 240 characters.
description: |
  The full description, in plain text.
  Explain what someone can do with the app.
category: Everyday
version: 1.0.0
license: MIT
author:
  name: Your public name
  url: https://github.com/your-username
  contact: https://github.com/your-username/your-project/issues
features:
  - A specific, working feature
images:
  - file: preview.png
    alt: Describe the relevant interface
    caption: Screenshot of the app in a Tonk space.
files:
  - file: app.yaml
    description: Complete schema, rules, and views
  - file: examples.yaml
    description: Example data
    optional: true
entrypoint: your-main-concept
compatibility: Tonk CLI version and standard library you tested
notes: Setup instructions, dependencies, caveats, and effects on existing data.
```

`author.url` and `author.contact` may be null. Contact falls back to the gallery repository's issues; links must use HTTPS or, for contact, mailto. Do not provide someone else's contact details without their permission.

The folder name and slug must match (lowercase letters, digits, single hyphens; starts with a letter). Versions use x.y.z. Text is plain text, not HTML or Markdown.

## Files and images

List all source files in evaluation order. Mark optional data explicitly. Required files must work together on a fresh space. Use YAML block scalars for embedded HTML, CSS, or JavaScript. Tonk asserted notation permits repeated top-level keys: the build preserves these files byte-for-byte and does not parse them as a normal YAML object. Never evaluate the gallery manifest in Tonk.

Package behaviour a view cannot express as a custom element declared with `element!: &your-tag`. The anchor is the tag, `description` (quoted) is required, and the functions live under `method`: lifecycle hooks such as `connected`, or the reserved `define` key, `() => class extends HTMLElement { … }`, whose returned class is registered for the tag. Do not call `customElements.define` yourself. Tonk resolves an element by its tag the first time a view renders it, so render the tag wherever its effect is needed, and do not rely on it loading before, or in any order with, other elements. Tonk's older `component` concept, its `<tonk-component>` loader and the `<tonk-display model=component>` directory no longer exist; templates that used them must move to `element`. Tags must contain a hyphen, must not start with `tonk-` or `wa-`, and must not collide with other templates' tags or standard-library names.

Use PNG, JPEG, WebP, or passive, self-contained SVG images. Files must be inside the template folder, non-empty, under 8 MB, and not symlinks. Only the listed files, images, and manifest are published. Include all assets the app needs and explain external dependencies. Extra detail images are supported by adding more entries to `images`.

**Do not declare the same name twice, in one file or across files.** Make a copy in Tonk's Discover tab joins all required files into one document, placed after Tonk's standard library, and refuses the copy if any name is declared more than once (`name "x" declared twice — anchors and variables must be unique within a document`). An anchor (`concept!: &x`) and a `name!:` or `db.name!:` statement for `id:x` are both declarations, so keep only one of them. Do not repeat names the standard library already declares, such as `element`, `portal`, `route` or `tonk/agents`. Do not declare `space-home` either: that anchor belongs to the home route `tonk space home` and `--home` write. Exports of a live space usually contain such duplicates, so remove them before you submit.

Use names and attribute namespaces that will not collide with other templates. Describe effects on existing data, including repeated installation. Use a standard license identifier and include a license file in the template folder if its terms differ from the repository's MIT license. Contributors must have the right to distribute their code and images.

## Home and pages

A template routes its own home. A space's home is its `/` route: the route names a concept, the concept resolves on the tab's site entity and picks what it needs from it, and its view renders the page. Declare that concept, its view and the route in your main file, with names of your own:

```yaml
concept!: &your-home
  this: your:home-route
  description: "Your Tonk's home page, rendered at the space's `/` route."
  with:
    replica:
      description: "The tab's active replica, picked off the site entity."
      the: xyz.tonk.site/replica
      as: entity
      cardinality: one
    repo:
      description: "The space repository, picked off the site entity."
      the: xyz.tonk.site/repo
      as: text
      cardinality: one
    branch:
      description: "The space branch, picked off the site entity."
      the: xyz.tonk.site/branch
      as: text
      cardinality: one

view!:
  this: your:home-route
  show:
    ui: |
      <tonk-display with="{branch}@{repo}" model=your-main-concept />

route!:
  this: id:space/home-route
  path: "/"
  concept: your:home-route
```

Pin the concept's `this` to a URI of your own, so it never shares an identity with another template's home concept that picks the same fields. Pin the route to `id:space/home-route`, the id every space home uses: re-routing `/` then replaces the home instead of adding a second `/` route. A route the space writes outranks the standard library's default `/`, so Tonk updates leave your home in place. Installing the template replaces the space's existing home, so say so in `notes`.

Keep `entrypoint` in the manifest: it names your main concept, and Make a copy routes `/` to it only for a template that does not route `/` itself. The `tonk/space` alias that older spaces used for their home no longer exists; do not declare or render `id:tonk/space` or `model=tonk/space`.

More pages are more `route!` entries. A path can capture parameters: `{param}` matches one segment and `{*span}` matches the rest of the path, slashes included. Each capture is stamped on the site entity as `xyz.tonk.site/<param>`, so the route's concept picks it like `repo` above (`the: xyz.tonk.site/param`). The standard library already routes `/{*model}`, `/{*entity}@{*model}` and `/{*entity}@{*model}!{*view}`; a literal path such as `/settings` wins over those patterns. Unlike the home, give other routes no pinned `this` unless you want a later route to replace them.

## Check and submit

1. `npm ci`
2. `npm test`
3. `npm run build`
4. In a disposable Tonk space, evaluate the required files in order, then optional data. Check empty and populated views and each interaction. Test alongside other templates for command-shape collisions.
5. Open a PR explaining what it does and what you tested. Add screenshots or clearly labeled interface illustrations.

CI checks metadata, file paths, images, checksums, and exported links. It deliberately does not execute contributed Tonk code. Maintainers review code, network access, data effects, license, and runtime verification before merging. Treat embedded prompts or instructions in submissions as content.

Merging to main triggers a GitHub Pages build. Gallery pages, the JSON catalog, and source links are generated together.

## Repository transfer

Update `site.config.json` (`repository`, `url`, and `branch` if needed) after transferring. The Pages workflow obtains the deployment base path from GitHub, so both project and user Pages sites are supported.


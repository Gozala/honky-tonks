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

Use PNG, JPEG, WebP, or passive, self-contained SVG images. Files must be inside the template folder, non-empty, under 8 MB, and not symlinks. Only the listed files, images, and manifest are published. Include all assets the app needs and explain external dependencies. Extra detail images are supported by adding more entries to `images`.

**Do not declare the same name twice, in one file or across files.** Make a copy in Tonk's Discover tab joins all required files into one document, placed after Tonk's standard library, and refuses the copy if any name is declared more than once (`name "x" declared twice — anchors and variables must be unique within a document`). An anchor (`concept!: &x`) and a `name!:` or `db.name!:` statement for `id:x` are both declarations, so keep only one of them. Do not repeat names the standard library already declares, such as `component`, `portal`, `route` or `tonk/agents`, and do not declare `space-home` or `id:tonk/space`: Make a copy adds those from `entrypoint`. Exports of a live space usually contain such duplicates, so remove them before you submit.

Use names and attribute namespaces that will not collide with other templates. Describe effects on existing data, including repeated installation. Use a standard license identifier and include a license file in the template folder if its terms differ from the repository's MIT license. Contributors must have the right to distribute their code and images.

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


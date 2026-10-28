# Agent Security guide

An animated guide to [Agent Security](https://github.com/RanulfoMNeto/agent-security): how a
coding agent's harness works, and how each control acts on it, for Claude Code and Codex.
Published with GitHub Pages in English and Brazilian Portuguese.

Each control is an independent chapter. The text scrolls on the left; a fixed drawing of the
harness on the right highlights and animates the part the text describes.

## Build

```sh
node scripts/build.mjs           # Node 18 or later, no dependencies
node scripts/build.mjs --check   # validate the locales without writing anything
```

The build writes one page per language: `dist/index.html` (English) and
`dist/pt-br/index.html`. Each page is self-contained, with its styles, script and text inline;
only the fonts load from Google Fonts. Open a page directly, or serve the folder:

```sh
python3 -m http.server -d dist
```

`SITE_URL` (the published address, such as `https://ranulfomneto.github.io/agent-security-guide/`)
adds canonical and `hreflang` links. The Pages workflow sets it.

## Layout

| Path | Content |
|---|---|
| `src/index.html` | Page template: header and drawing. `{{key}}` placeholders are filled from the locale |
| `src/styles.css` | Styles, dark and light themes |
| `src/chapters.js` | The chapters and what the drawing shows at each step. No text in any language |
| `src/app.js` | Rendering, animation and navigation |
| `src/locales/<tag>.json` | All text of one language |
| `scripts/build.mjs` | Validation and build |

## Add a language

1. Copy `src/locales/en.json` to `src/locales/<tag>.json`, where `<tag>` is a BCP 47 language
   tag (`es`, `fr`, `pt-PT`).
2. Fill `meta`: `lang` (the same tag), `path` (the URL folder, such as `es`), `label` (shown in
   the language switcher), `name`, `ogLocale`, `title`, `description` and `diagramLabel`.
3. Translate every other string, following the conventions below.
4. Run `node scripts/build.mjs --check`. It lists every missing or extra key, empty string and
   placeholder mismatch against `en.json`.
5. Build and look at the page in both themes and at phone width.

The switcher, the `hreflang` links and the Pages deployment pick up the new file without other
changes.

### Writing conventions

- `{token}`, `{n}`, `{total}` and `{name}` are placeholders. Keep them.
- `` `text` `` is shown as code and `*text*` as emphasis. There is no other markup.
- Commands, program output, paths, variable names, hook event names (`UserPromptSubmit`) and
  `[REDACTED]` stay as they are: they are what the reader will see on screen.
- `labels` holds the short texts in the drawing (moving packets, notes, terminal comments). The
  drawing shrinks a label that is too long for its box, so prefer short wording there.
- A list (`p`, `code`, `facts`) may have a different number of entries than in English.

## Publish

`.github/workflows/pages.yml` validates and builds on every push and pull request, and deploys
`dist/` to GitHub Pages on pushes to `main`. In the repository settings, Pages must use GitHub
Actions as its source.

## License

[MIT](LICENSE)

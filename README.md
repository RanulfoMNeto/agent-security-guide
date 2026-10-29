# Agent Security guide

An animated guide to [Agent Security](https://github.com/RanulfoMNeto/agent-security): how a
coding agent's harness works, and how each control acts on it, for Claude Code and Codex.
Published with GitHub Pages in English and Brazilian Portuguese.

The first chapter walks through the harness. Each of the others follows one example from start
to finish and shows a control acting on it. The drawing of the harness fills the window and the
text scrolls over its left side. Each chapter's example is a journey: the request leaves the
session and visits the prompt, the hook, the context, the model, the permissions, the tools, the
terminal and the network, and the answer comes back. Each step plays its part of the journey and
continues where the previous step left it; a lit trail marks the way already taken, the camera
follows the request, and a bar under the drawing names the current station, with pause, speed and
replay.

Each component of the harness appears once. The session is the agent's chat, the prompt an
editor tab, the terminal a terminal and the internet a browser; the others are glass cards in
which small cards carry the content, with a bar that marks its source or the decision taken. The
hook is a band between the model's side of the harness (prompt, context, model) and the
machine's side (terminal, tools, permissions), with one lane per event, so the request crosses
it at each of them: after the model asks for a tool, the PreToolUse hook comes before the
permission check, as in both agents. Each component shows a generic description; when the
request passes over it, it fills with the real content it handles: the prompt and the context as each
agent sends them to its API, the hook event's JSON in the lane of its event, the policy file that
decided, the command in the terminal. A selector with the agents' logos switches that content
between Claude Code and Codex.

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
| `src/index.html` | Page template: header, drawing and journey bar. Each arrow of the drawing is also the path a request takes. `{{key}}` placeholders are filled from the locale |
| `src/styles.css` | Styles, dark and light themes |
| `src/chapters.js` | The chapters as journeys: the stations each step visits and what it leaves in each component. No text in any language |
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

- `{token}` and `{key}` are placeholders for the sample credentials. Keep them.
- `` `text` `` is shown as code and `*text*` as emphasis. There is no other markup.
- Commands, program output, JSON, TOML, paths, variable names, hook event names
  (`UserPromptSubmit`) and `[REDACTED]` stay as they are: they are what the reader will see on
  screen. Labels inserted into JSON strings must not contain double quotes.
- `labels` holds the short texts in the drawing: moving packets, chat messages and the lines that
  fill the components. A filled line longer than its box is cut with an ellipsis, so prefer short
  wording there.
- A chapter has a `kick` (where it acts), a `name`, a `deck` and its `steps`; each step has a
  heading `h` and paragraphs `p`. A `p` list may have a different number of entries than in
  English.

## Publish

`.github/workflows/pages.yml` validates and builds on every push and pull request, and deploys
`dist/` to GitHub Pages on pushes to `main`. In the repository settings, Pages must use GitHub
Actions as its source.

## License

[MIT](LICENSE)

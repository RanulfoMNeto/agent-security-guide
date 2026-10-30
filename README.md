# Agent Security guide

An animated guide to [Agent Security](https://github.com/RanulfoMNeto/agent-security). It shows how
a coding agent's harness processes a request and how each Agent Security control acts on it. Each
chapter follows one example from the request to the agent's answer, with the real content of every
harness component (prompt, context, hook events, permission policy, terminal output, network
requests) in the format of the selected agent.

Published at <https://ranulfomneto.github.io/agent-security-guide/>.

## Chapters

| Chapter | Acts on | Content |
|---|---|---|
| How a harness works | Overview | The agent loop: session, prompt, hook, context, memory, model, permissions, tools and terminal; what a tool can reach without controls; the managed policy |
| Credential scanning | Hook | Prompts, tool requests and tool results are scanned for credentials before they reach the model or run |
| Locked permissions | Permissions | The permission profile is fixed: no mode approves every action, no command runs outside the sandbox, and some actions are denied in every mode |
| Command sandbox | Sandbox | Commands write only to the project and the package caches, and reach no local service |
| Credentials | Sandbox | Credential files, environment files and secret variables are out of reach of the agent and of the commands it runs |
| Allowed hosts | Proxy | Commands reach code hosting and package registries through a proxy; other hosts require approval or are refused |

## Availability

Each table lists what the guide currently covers. Adding a language or an agent adds a row.

### Languages

| Language | Locale | Path |
|---|---|---|
| English (default) | `en` | `/` |
| Português (Brasil) | `pt-BR` | `/pt-br/` |

### Agents

| Agent | API format | Policy shown |
|---|---|---|
| Claude Code | Messages API | Managed settings (`managed-settings.d/10-agent-security.json`) |
| Codex | Responses API | Requirements (`requirements.toml`) |

## Build

Requires Node.js 18 or later. There are no dependencies.

```sh
node scripts/build.mjs           # validate the sources, then write dist/
node scripts/build.mjs --check   # validate only
```

The build writes one page per locale: the default locale to `dist/index.html`, and every other
locale to `dist/<meta.path>/index.html`. Each page contains its styles, script and text; web fonts
are loaded from Google Fonts. Open a page directly, or serve `dist/` with any static HTTP server.

| Variable | Effect |
|---|---|
| `SITE_URL` | The published base URL, such as `https://<user>.github.io/<repository>/`. Adds canonical and `hreflang` links |

The build fails when:

- a locale differs in shape from the default locale: a missing or extra key, an empty string, or
  a `{placeholder}` that does not match;
- a chapter or step in `src/chapters.js` has no text in the default locale, or a text has no
  chapter or step;
- `src/chapters.js` references a label that is not defined, or a label is never used;
- `src/index.html` uses a `{{key}}` that is not text in the default locale;
- a locale's `meta.path` is invalid or is used by another locale.

## Repository layout

| Path | Content |
|---|---|
| `src/index.html` | Page template: header, diagram and player. Each arrow of the diagram is also the path a request takes. `{{key}}` placeholders are filled from the locale |
| `src/styles.css` | Styles and themes |
| `src/chapters.js` | Agent definitions, and the chapters as journeys: the stations each step visits and the content it leaves in each component. Holds no translatable text |
| `src/app.js` | Rendering, animation and navigation |
| `src/locales/<tag>.json` | All text of one locale |
| `scripts/build.mjs` | Validation and build |
| `.github/workflows/pages.yml` | Validation, build and deployment |

## Add a language

1. Copy the default locale (`DEFAULT` in `scripts/build.mjs`) to `src/locales/<tag>.json`, where
   `<tag>` is a BCP 47 language tag.
2. Fill `meta`:

   | Key | Content |
   |---|---|
   | `lang` | The language tag, as in the file name |
   | `path` | The URL folder of the page: lowercase letters, digits and hyphens. Empty only for the default locale |
   | `label` | Short name in the language switcher |
   | `name` | Name of the language, in that language |
   | `ogLocale` | Open Graph locale |
   | `title`, `description` | Page title and description |
   | `diagramLabel` | Accessible description of the diagram |

3. Translate every other string, following the conventions below.
4. Run `node scripts/build.mjs --check`. It lists every difference from the default locale.
5. Review the page in the light and dark themes and on a narrow screen.
6. Add a row to the languages table.

The language switcher, the `hreflang` links and the deployment include the new locale with no
other change.

## Add an agent

1. Add the agent to `AGENTS` in `src/chapters.js`:

   | Key | Content |
   |---|---|
   | `name` | Display name |
   | `logo` | Id of the agent's logo symbol in `src/index.html` |
   | `api` | The API whose message format the prompt, context and model show |
   | `shell`, `edit` | Names of the agent's shell tool and file-editing tool |
   | `tools` | Tool names, in display order |
   | `memory` | Memory files, each as `[path, label]` |

2. Add the logo as a `<symbol>` to the sprite in `src/index.html`, and a button with
   `data-agent="<id>"` to the agent selector.
3. Give the agent its content wherever content differs between agents: a value in every
   `per(...)` call, in the order of `AGENTS`, and a branch in the builders that select a structure
   by agent id (`CTX`, `HOOK_POST`).
4. Add a row to the agents table.

## Writing conventions

- Chapter text documents what Agent Security does, through the chapter's example.
- `{token}` and `{key}` are placeholders for the sample credentials. Keep them.
- `` `text` `` is shown as code and `*text*` as emphasis. There is no other markup.
- Commands, program output, JSON, TOML, paths, variable names, hook event names and `[REDACTED]`
  are literal and stay untranslated. Labels inserted into JSON strings must not contain double
  quotes.
- `labels` holds the short texts of the diagram: the request labels, the session messages and the
  lines that fill the components. A line longer than its box is cut with an ellipsis.
- A chapter has `kick` (the component it acts on), `name`, `deck` and `steps`. Each step has a
  heading `h` and paragraphs `p`; the number of paragraphs may differ between locales.

## Publish

`.github/workflows/pages.yml` validates and builds on every push and pull request, and deploys
`dist/` to GitHub Pages on pushes to `main`. In the repository settings, Pages must use GitHub
Actions as its source.

## License

[MIT](LICENSE)

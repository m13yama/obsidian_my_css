# Obsidian My CSS

Personal Obsidian CSS packaged as a lightweight community plugin so it can be installed and updated with BRAT.

## What It Includes

- Wider readable markdown line width.
- Compact academic typography with tighter body text, paragraphs, and lists.
- Wikipedia-inspired H1–H6 headings with thin H1/H2 dividers in Reading view and Live Preview, and in Source mode when its monospace option is disabled.
- Horizontally centered images and tables in Reading view and Live Preview.
- Smaller code blocks in Reading view and pink inline code with theme-aware colors.
- Body-sized code and non-italic LaTeX source in Source mode and Live Preview, with syntax highlighting preserved.
- Mermaid diagrams that fit the markdown column and open in a larger zoomable view when clicked.
- A full-width Source editor with left-aligned line numbers, optional wrapping,
  column rulers, a monospace font, and current-line highlighting.

The markdown line width can be changed from the plugin settings. It accepts CSS
width values such as `880px`, `72rem`, `calc(100% - 2rem)`, and `100%`. A bare
number is treated as pixels.

## Source Editor

Open **Settings → Obsidian My CSS → Source editor**. The source layout uses the
full pane width, with line numbers against the left edge, even when Obsidian's
**Readable line length** setting is enabled. These options apply to Source mode;
Reading view and Live Preview keep their existing layout and typography.

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable source editor layout | On | Full width with a small gap between the gutter and source text. Turn off to restore the original source layout. |
| Line wrapping | Wrap at editor edge | Choose wrapping or a single row per source line with horizontal scrolling. |
| Line numbers | On | Source-only line numbers that remain visible during horizontal scrolling. Click a number to select the line. Live Preview follows Obsidian's own line-number setting. |
| Monospace font | On | Obsidian's monospace font and uniform text/heading sizes, without heading dividers or extra heading spacing. |
| Highlight current line | On | A subtle background behind the cursor's line. |
| Show column rulers | Off | Vertical guides at the configured columns. |
| Ruler columns | `80, 120` | Up to 10 comma-separated column values from 1 to 1000. Press Apply or Enter to save. |

Ruler columns count half-width character cells from the start of a line; for
example, `80` places a guide after 80 cells. A monospace font provides consistent
alignment. Japanese full-width characters typically occupy two cells, and tabs
follow the editor's tab stops. Guides move with horizontal scrolling and never
change the Markdown or insert line breaks.

The command palette includes **Toggle source mode line wrapping** and
**Toggle source mode rulers**. Assign hotkeys in Obsidian's Hotkeys settings if
desired. Changes apply immediately to open source editors and are saved across
restarts. The source editor layout must be enabled for these options to take
effect.

## Note Typography

Note text uses a `1.4` line height, with `0.4em` paragraph margins in Reading view
and rendered Live Preview content. List items have `0.025em` of vertical padding
on each side. These are controlled by `--mycss-note-line-height`,
`--mycss-paragraph-spacing`, and `--mycss-list-spacing`. Body text size follows
Obsidian's font size setting.

Headings take their cues from [Wikipedia's Vector typography](https://github.com/wikimedia/mediawiki-skins-Vector/blob/master/resources/skins.vector.styles/typography.less),
adapted to Obsidian's theme colors and an academic layout. Source mode uses
uniform heading sizes when its Monospace font option is enabled.

| Heading | Size | Weight | Decoration |
| --- | --- | --- | --- |
| H1 | `1.6em` | Regular | Thin neutral divider |
| H2 | `1.3em` | Semibold | Thin neutral divider |
| H3 | `1.1em` | Bold | Compact spacing |
| H4–H6 | `1em` | Bold | Compact spacing |

H1/H2 use a serif font for supported characters, with the note font as a fallback.
When Obsidian's document language is Japanese, they use the note font throughout,
following Vector's Japanese font fallback. H3–H6 use the note font.

H1/H2 have `1.2em` above them; H3–H6 have `0.8em`. The gap below headings is
`0.25em`, with a tighter `0.2em` gap below H3. Adjacent paragraph/block margins
are adjusted so they do not enlarge these gaps. Authored blank lines in the
editor remain visible.

Customization variables are near the top of `styles.css`: `--mycss-h1-rule-color`,
`--mycss-h2-rule-color`, `--mycss-heading-rule-gap`, `--mycss-heading-title-font`,
`--mycss-heading-spacing-before`, `--mycss-heading-spacing-after`,
`--mycss-subheading-spacing-before`, `--mycss-h3-spacing-before`, and
`--mycss-h3-spacing-after`. Override the standard `--h1-size` through `--h6-size`
variables on `.markdown-rendered, .markdown-source-view.mod-cm6` to change sizes.

Images and tables are centered within their containing note column. Table cell
text keeps its existing alignment, and Live Preview tables retain their editing
controls and horizontal scroll container.

In Reading view, code blocks use `0.82em` text with a `1.3` line height and the theme's subtle
alternate background. Inline code uses `0.85em` text, pink lettering, and the
theme's neutral secondary background, with line height inherited from the
surrounding text. Pink is mixed with the theme's text color to suit light and dark modes.
Existing border, corner, and padding styles are kept. Code size and color tuning
variables (`--mycss-code-block-*` and `--mycss-inline-code-*`) are in `styles.css`.

In Source mode and Live Preview, code blocks, inline code, and LaTeX source use
`1em` text to match the surrounding body text and follow Obsidian's font size
setting. This also applies to rendered code in Live Preview. LaTeX source stays
non-italic, including inline and display-math source.

Rendered Mermaid diagrams are constrained to the markdown column so they do not
spill outside the page. Click a diagram to open a larger scrollable view with
zoom controls.

Machine-specific fonts and file explorer icons are configured separately with
local CSS snippets and are not bundled with this plugin.

## Install With BRAT

1. Push this repository to GitHub.
2. Create a GitHub release whose tag matches `manifest.json` `version`, for example `0.2.2`.
3. Attach these release assets:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian, install BRAT and add this repository as a beta plugin.
5. Enable `Obsidian My CSS` in Community plugins.

The included GitHub Actions workflow creates the release assets automatically when you push a tag like `0.1.0`.

## Release

```sh
git tag 0.2.2
git push origin 0.2.2
```

Before the next release, update the version in `manifest.json`, `package.json`, and
`package-lock.json`, commit the changes, then tag the same version.

## Verify Changes

No build step is required; CodeMirror is supplied by Obsidian at runtime.
With Node.js 18+ and Obsidian installed, run:

```sh
npm ci
npm test
```

The smoke test launches Obsidian with a disposable profile and vault under the
system temporary directory. It checks source layout, wrapping, Japanese text,
line numbers, rulers, mode switching, and setting persistence. It never attaches
to an existing Obsidian session. On Linux, the default executable is
`/opt/Obsidian/obsidian`; set `OBSIDIAN_BIN` to override it. Test screenshots are
saved under the temporary directory printed by the test.

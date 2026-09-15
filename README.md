# Obsidian My CSS

Personal Obsidian CSS packaged as a lightweight community plugin so it can be installed and updated with BRAT.

## What It Includes

- Wider readable markdown line width.
- Compact academic typography with tighter body text, paragraphs, and lists.
- Wikipedia-inspired H1–H6 headings with thin H1/H2 dividers in Reading view, Live Preview, and Source mode.
- Horizontally centered images and tables in Reading view and Live Preview.
- Smaller code blocks and pink inline code with theme-aware colors.
- Mermaid diagrams that fit the markdown column and open in a larger zoomable view when clicked.
- Material Icon Theme-like file and folder icons for the file explorer.

The markdown line width can be changed from the plugin settings. It accepts CSS
width values such as `880px`, `72rem`, `calc(100% - 2rem)`, and `100%`. A bare
number is treated as pixels.

Note text uses a `1.4` line height, with `0.4em` paragraph margins in Reading view
and rendered Live Preview content. List items have `0.025em` of vertical padding
on each side. These are controlled by `--mycss-note-line-height`,
`--mycss-paragraph-spacing`, and `--mycss-list-spacing`. Body text size follows
Obsidian's font size setting.

Headings take their cues from [Wikipedia's Vector typography](https://github.com/wikimedia/mediawiki-skins-Vector/blob/master/resources/skins.vector.styles/typography.less),
adapted to Obsidian's theme colors and an academic layout.

| Heading | Size | Weight | Decoration |
| --- | --- | --- | --- |
| H1 | `1.6em` | Regular | Thin neutral divider |
| H2 | `1.3em` | Semibold | Thin neutral divider |
| H3 | `1.1em` | Bold | Compact spacing |
| H4–H6 | `1em` | Bold | Compact spacing |

H1/H2 use a serif font for supported characters, with the note font as a fallback.
When Obsidian's document language is Japanese, they use the note font throughout,
following Vector's Japanese font fallback. H3–H6 use the note font.

H1/H2 have `0.8em` above them; H3–H6 have `0.5em`. The gap below headings is
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

Code blocks use `0.82em` text with a `1.3` line height and the theme's subtle
alternate background. Inline code uses `0.85em` text, pink lettering, and the
theme's neutral secondary background, with line height inherited from the
surrounding text. Pink is mixed with the theme's text color to suit light and dark modes.
Existing border, corner, and padding styles are kept. Code size and color tuning
variables (`--mycss-code-block-*` and `--mycss-inline-code-*`) are in `styles.css`.

Rendered Mermaid diagrams are constrained to the markdown column so they do not
spill outside the page. Click a diagram to open a larger scrollable view with
zoom controls.

The icon CSS expects a Nerd Font such as `PlemolJP Console NF` to be installed on the machine running Obsidian.

## Install With BRAT

1. Push this repository to GitHub.
2. Create a GitHub release whose tag matches `manifest.json` `version`, for example `0.1.3`.
3. Attach these release assets:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian, install BRAT and add this repository as a beta plugin.
5. Enable `Obsidian My CSS` in Community plugins.

The included GitHub Actions workflow creates the release assets automatically when you push a tag like `0.1.0`.

## Release

```sh
git tag 0.1.3
git push origin 0.1.3
```

Before the next release, update the `version` field in `manifest.json`, commit it, then tag the same version.

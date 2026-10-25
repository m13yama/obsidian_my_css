# Obsidian My CSS

Personal Obsidian CSS packaged as a lightweight community plugin so it can be installed and updated with BRAT.

## What It Includes

- Wider readable markdown line width.
- An always-visible core Bookmarks button in the note header, including notes
  that are not bookmarked yet.
- Compact academic typography with tighter body text, paragraphs, and lists.
- matcha.css-inspired H1–H6 headings with thin H1/H2 dividers in Reading view and Live Preview, and in Source mode when its monospace option is disabled.
- Theme-aware quotes, striped tables, dividers, rounded code and image corners, disclosure panels, and keyboard hints inspired by matcha.css.
- A fixed right-hand table of contents in Reading view, with hide/show controls and initially collapsed subsections.
- Horizontally centered images and tables in Reading view and Live Preview.
- Smaller code blocks in Reading view and pink inline code with theme-aware colors.
- Body-sized code and non-italic LaTeX source in Source mode and Live Preview, with syntax highlighting preserved.
- Mermaid diagrams that fit the markdown column and open in a larger zoomable view when clicked.
- A full-width Source editor with left-aligned line numbers, optional wrapping,
  column rulers, a monospace font, and current-line highlighting.

The markdown line width can be changed from the plugin settings. It accepts CSS
width values such as `880px`, `72rem`, `calc(100% - 2rem)`, and `100%`. A bare
number is treated as pixels.

## Bookmark Button

With the **Bookmarks** core plugin enabled, its bookmark button stays visible
at the top right of Markdown notes in Reading view, Live Preview, and Source
mode. Click it to open Obsidian's standard bookmark dialog: add the note, edit
its bookmark title or group, or remove an existing bookmark.

The button remains visible when the sidebar is collapsed. Keep **Settings →
Appearance → Show tab title bar** enabled to display the note header. This
changes the visibility of the existing core button; bookmarks are still managed
and saved by Obsidian. Disabling My CSS restores the normal button visibility.

## Reading View Table of Contents

Open **Settings → Obsidian My CSS → Reading view → Show table of contents** to
turn the feature on or off (on by default). Changes apply immediately to open
notes and are saved across restarts. Disabling it removes the entire navigation
column and restores the original note width.

**Treat H1 as title** is also on by default. H1 headings are treated as note
titles and omitted from the contents; their H2 sections appear at the top level.
Turn this setting off to include H1 headings in the hierarchy. It applies
immediately and is saved across restarts. The contents list contains only note
headings, with no generated "Beginning" item.

Drag the left edge of the contents to adjust its width, or enter a pixel value
in **Table of contents width** and press **Apply** or Enter. The default is
`224px`, with a range of `160`–`600px`. The width is shared by open notes and saved
across restarts. **Reset** or a double-click on the divider restores the default.
The divider also supports Left/Right arrow keys (10px, or 50px with Shift),
Home/End for the available limits, and Escape to cancel a drag. Smaller panes
limit the displayed width to fit without changing the saved preference.

The contents stay on the right while the note scrolls, using the existing note
font, compact spacing, and theme colors. The interaction takes cues from
[Wikipedia's table of contents](https://www.mediawiki.org/wiki/Reading/Web/Desktop_Improvements/Features/Table_of_contents):

- Initially only top-level headings appear. Click a heading's arrow to expand or
  collapse its subsections; click its text to jump to that heading.
- Levels follow the note's actual hierarchy, including notes starting at H2 or
  skipping a heading level. H2–H6 are included, along with H1 when
  **Treat H1 as title** is off.
- The current section is emphasized; a collapsed ancestor is emphasized when
  the current subsection is hidden. Scrolling does not expand branches.
- **hide** collapses the column to a contents button; click it to show the list
  again. This visibility preference is saved. Branches start collapsed when
  opening another note or returning to Reading view.
- In panes narrower than 760px, a button opens the contents over the note.
  Selecting a heading or pressing Escape closes it.

Notes without eligible headings (including H1-only notes with the title setting
on) have no contents column. Live Preview, Source mode,
embedded notes, and print output do not receive a contents panel. The plugin
does not insert a TOC into Markdown files.

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

Headings and common note components take their cues from
[matcha.css 3.0.1](https://github.com/lowlighter/matcha), adapted to Obsidian's theme
colors and note font size. Styles are bundled locally, with no CDN dependency.
The compact body spacing, centered media, pink inline code, source editor tools,
and Mermaid zoom remain specific to this plugin. Source mode uses uniform
heading sizes when its Monospace font option is enabled.

| Heading | Size | Weight | Decoration |
| --- | --- | --- | --- |
| H1 | `2em` | Bold | Thin neutral divider |
| H2 | `1.5em` | Bold | Thin neutral divider |
| H3 | `1.25em` | Bold | — |
| H4 | `1em` | Bold | — |
| H5 | `0.875em` | Bold | — |
| H6 | `0.85em` | Bold | Muted text color |

All headings use the note font, including Japanese text, with a `1.25` line height.
Sizes scale with Obsidian's font size setting.

Headings have a gap of `1.5` times the body font size above them and `1` times
below. Adjacent paragraph/block margins are adjusted so they do not enlarge these
gaps. Authored blank lines in the editor remain visible.

Customization variables are near the top of `styles.css`: `--mycss-h1-rule-color`,
`--mycss-h2-rule-color`, `--mycss-heading-rule-gap`, `--mycss-heading-title-font`,
`--mycss-heading-spacing-before`, `--mycss-heading-spacing-after`,
`--mycss-subheading-spacing-before`, `--mycss-h3-spacing-before`, and
`--mycss-h3-spacing-after`. Override the standard `--h1-size` through `--h6-size`
variables on `.markdown-rendered, .markdown-source-view.mod-cm6` to change sizes.

Quotes use a neutral `4px` rule and muted text; horizontal dividers also use a
`4px` rule. Tables have a shaded bold header, alternating row backgrounds, and
their original cell padding and alignment. Colors follow the active Obsidian
theme in light and dark modes. Native callout colors and table editing controls
are retained.

Rendered HTML `<details>` panels have a bordered, rounded container and a shaded
summary when open. `<kbd>` hints and images use the same `6px` corner radius as
code. Component customization variables are `--mycss-component-border-color`,
`--mycss-component-background`, `--mycss-component-radius`,
and `--mycss-table-header-background`.

Images and tables are centered within their containing note column. Table cell
padding, text alignment, and caption placement keep the theme's original layout.
Live Preview tables retain their editing controls and horizontal scroll container,
with cell padding applied by Obsidian to the editable wrapper only.

In Reading view, code blocks use `0.82em` text with a `1.3` line height and the theme's subtle
alternate background. Inline code uses `0.85em` text, pink lettering, and the
theme's neutral secondary background, with line height inherited from the
surrounding text. Pink is mixed with the theme's text color to suit light and dark modes.
Code uses `6px` corners, and rendered code blocks have padding equal to the body
font size. Code size and color tuning variables (`--mycss-code-block-*` and
`--mycss-inline-code-*`) are in `styles.css`.

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
2. Create a GitHub release whose tag matches `manifest.json` `version`, for example `0.3.2`.
3. Attach these release assets:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian, install BRAT and add this repository as a beta plugin.
5. Enable `Obsidian My CSS` in Community plugins.

The included GitHub Actions workflow creates the release assets automatically when you push a tag like `0.1.0`.

## Release

```sh
git tag 0.3.2
git push origin 0.3.2
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
line numbers, rulers, and mode switching, plus Reading view contents, branch
controls, H1 title handling, duplicate-heading navigation, split/narrow panes,
live heading updates, mouse and keyboard resizing, width settings, and setting
persistence. It never attaches
to an existing Obsidian session. On Linux, the default executable is
`/opt/Obsidian/obsidian`; set `OBSIDIAN_BIN` to override it. Test screenshots are
saved under the temporary directory printed by the test.

# Obsidian My CSS

Personal Obsidian CSS packaged as a lightweight community plugin so it can be installed and updated with BRAT.

## What It Includes

- Wider readable markdown line width.
- Full-width baselines for H1 and H2 headings in Reading view, Live Preview, and Source mode.
- Mermaid diagrams that fit the markdown column and open in a larger zoomable view when clicked.
- Material Icon Theme-like file and folder icons for the file explorer.

The markdown line width can be changed from the plugin settings. It accepts CSS
width values such as `880px`, `72rem`, `calc(100% - 2rem)`, and `100%`. A bare
number is treated as pixels.

H1 headings use a 2px accent-colored baseline; H2 headings use a subtler 1px
divider. Both have a small gap between the text and the line, with colors that
follow the active theme. To customize them, override `--mycss-h1-rule-color`,
`--mycss-h2-rule-color`, and `--mycss-heading-rule-gap` in a CSS snippet. Their
defaults are near the top of `styles.css`.

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

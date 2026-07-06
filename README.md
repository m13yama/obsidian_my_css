# Obsidian My CSS

Personal Obsidian CSS packaged as a lightweight community plugin so it can be installed and updated with BRAT.

## What It Includes

- Wider readable markdown line width.
- Material Icon Theme-like file and folder icons for the file explorer.

The markdown line width can be changed from the plugin settings. It accepts CSS
width values such as `880px`, `72rem`, `calc(100% - 2rem)`, and `100%`. A bare
number is treated as pixels.

The icon CSS expects a Nerd Font such as `PlemolJP Console NF` to be installed on the machine running Obsidian.

## Install With BRAT

1. Push this repository to GitHub.
2. Create a GitHub release whose tag matches `manifest.json` `version`, for example `0.1.1`.
3. Attach these release assets:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian, install BRAT and add this repository as a beta plugin.
5. Enable `Obsidian My CSS` in Community plugins.

The included GitHub Actions workflow creates the release assets automatically when you push a tag like `0.1.0`.

## Release

```sh
git tag 0.1.1
git push origin 0.1.1
```

Before the next release, update the `version` field in `manifest.json`, commit it, then tag the same version.

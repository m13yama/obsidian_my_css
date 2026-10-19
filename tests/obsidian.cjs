const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { copyFile, mkdir, mkdtemp, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { chromium } = require("playwright");

// Always create a disposable vault and profile; never attach to a user's session.
async function main() {
  const root = await mkdtemp(join(tmpdir(), "mycss-source-obsidian-"));
  const vault = join(root, "vault");
  const profile = join(root, "profile");
  const pluginDir = join(vault, ".obsidian/plugins/obsidian-my-css");
  await mkdir(pluginDir, { recursive: true });
  await mkdir(profile, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    await copyFile(resolve(__dirname, "..", file), join(pluginDir, file));
  }
  await writeFile(join(profile, "obsidian.json"), JSON.stringify({
    vaults: { c550000000000001: { path: vault, ts: Date.now(), open: true } }, updateDisabled: true,
  }));
  await writeFile(join(vault, ".obsidian/community-plugins.json"), '["obsidian-my-css"]');
  await writeFile(join(vault, ".obsidian/app.json"), JSON.stringify({
    livePreview: true, readableLineLength: true, showLineNumber: false,
    showInlineTitle: false, propertiesInDocument: "hidden",
  }));
  let launchLog = "";
  const child = spawn(process.env.OBSIDIAN_BIN || "/opt/Obsidian/obsidian", [
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu",
    "--no-first-run", "--ozone-platform=headless",
  ], { env: { ...process.env, XDG_CONFIG_HOME: join(root, "config") }, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", error => { launchLog += error.message; });
  child.stdout.on("data", data => { launchLog += data; });
  child.stderr.on("data", data => { launchLog += data; });
  let browser;
  let page;
  const errors = [];
  try {
    let endpoint;
    for (let attempt = 0; attempt < 100; attempt++) {
      endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(launchLog)?.[1];
      if (endpoint) break;
      if (child.exitCode !== null || child.signalCode) throw new Error(launchLog);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(endpoint, `Obsidian did not start: ${launchLog}`);
    browser = await chromium.connectOverCDP(endpoint);
    page = browser.contexts()[0].pages()[0];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.waitForFunction(() => window.app?.workspace?.layoutReady);
    assert.equal(await page.evaluate(() => app.vault.adapter.basePath), vault);
    const trust = page.getByRole("button", { name: "Trust author and enable plugins" });
    if (await trust.count()) await trust.click();
    await page.evaluate(() => app.plugins.enablePlugin("obsidian-my-css"));
    await page.setViewportSize({ width: 1500, height: 1000 });
    const source = ["# Heading", "0123456789".repeat(30), "日本語の長い行です。".repeat(30),
      "- A list item", "```js", "const value = 1;", "```", "Last line"].join("\n");
    await page.evaluate(async source => {
      const file = await app.vault.create("source.md", source);
      await app.workspace.getLeaf(false).openFile(file, { state: { mode: "source", source: true } });
      app.workspace.activeLeaf.view.editor.setCursor({ line: 1, ch: 0 });
    }, source);
    await page.locator(".mycss-source-editor").waitFor();
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const settings = async values => {
      await page.evaluate(async values => {
        const plugin = app.plugins.plugins["obsidian-my-css"];
        Object.assign(plugin.settings, values);
        plugin.applySettings();
        await plugin.saveSettings();
      }, values);
      await settle();
    };
    const layout = () => page.evaluate(() => {
      const root = document.querySelector(".markdown-source-view");
      const editor = root.querySelector(".cm-editor");
      const cm = app.workspace.activeLeaf.view.editor.cm;
      const content = root.querySelector(".cm-content");
      const gutter = root.querySelector(".mycss-source-line-numbers");
      const box = element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        root: box(root), editor: box(editor), sizer: box(root.querySelector(".cm-sizer")), content: box(content),
        gutter: gutter && box(gutter), lines: [...content.querySelectorAll(".cm-line")].map(box),
        numbers: gutter && [...gutter.children].filter(el => el.style.visibility !== "hidden")
          .map(el => ({ text: el.textContent, ...box(el) })),
        wrap: cm.lineWrapping, scrollWidth: cm.scrollDOM.scrollWidth, clientWidth: cm.scrollDOM.clientWidth,
        rulers: [...editor.querySelectorAll(".mycss-source-ruler")].map(box),
        rulerVisible: !!editor.querySelector(".mycss-source-rulers:not([hidden])"),
        text: cm.state.doc.toString(),
      };
    });
    await settle();
    let current = await layout();
    assert(current.wrap, "Source wraps by default");
    assert(Math.abs(current.sizer.x - current.editor.x) < 2, "Source starts at the editor's left edge");
    assert(current.sizer.width > 880, "Source uses the full pane even with readable line length enabled");
    assert(current.scrollWidth <= current.clientWidth + 2, "Wrapped lines do not overflow horizontally");
    assert.equal(current.numbers.length, 8);
    for (let index = 0; index < current.numbers.length; index++) {
      assert.equal(current.numbers[index].text, String(index + 1));
      assert(Math.abs(current.numbers[index].y - current.lines[index].y) < 2, "Gutters align with wrapped and heading lines");
    }
    await settings({ sourceShowRulers: true });
    current = await layout();
    assert.equal(current.rulers.length, 2);
    assert(current.rulerVisible);
    const expectedRuler = await page.evaluate(() => {
      const cm = app.workspace.activeLeaf.view.editor.cm;
      const range = document.createRange();
      const line = [...cm.contentDOM.querySelectorAll(".cm-line")][1];
      range.setStart(line.firstChild, 0);
      range.setEnd(line.firstChild, 80);
      return range.getBoundingClientRect().right;
    });
    assert(Math.abs(current.rulers[0].x - expectedRuler) < 2, "Ruler follows 80 monospace characters");
    await settings({ sourceLineWrap: false });
    current = await layout();
    assert(!current.wrap, "CodeMirror recognizes wrapping is off");
    assert(current.scrollWidth > current.clientWidth + 100, "Long lines can scroll horizontally");
    assert(Math.abs(current.lines[1].height - current.lines[7].height) < 1, "Unwrapped lines occupy one row");
    const beforeScroll = current;
    await page.evaluate(() => { app.workspace.activeLeaf.view.editor.cm.scrollDOM.scrollLeft = 200; });
    await settle();
    current = await layout();
    assert(Math.abs(current.gutter.x - beforeScroll.gutter.x) < 1, "Line numbers stay fixed while scrolling");
    assert(Math.abs(current.rulers[0].x - beforeScroll.rulers[0].x + 200) < 2, "Rulers scroll with source text");
    await page.evaluate(() => { app.workspace.activeLeaf.view.editor.cm.scrollDOM.scrollLeft = 0; });
    await settings({ sourceLineWrap: true });
    await page.setViewportSize({ width: 700, height: 1000 });
    await settle();
    current = await layout();
    assert(current.scrollWidth <= current.clientWidth + 2, "Narrow panes wrap Japanese and unbroken text");
    await page.setViewportSize({ width: 1500, height: 1000 });
    await settle();
    await page.locator(".mycss-source-line-numbers .cm-gutterElement").filter({ hasText: /^4$/ }).click();
    assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getSelection()), "- A list item\n");
    assert.equal((await layout()).text, source, "Presentation leaves Markdown unchanged");

    // Live Preview uses the original width, wrapping, and native line number setting.
    await page.evaluate(() => app.workspace.activeLeaf.setViewState({
      type: "markdown", state: { file: "source.md", mode: "source", source: false },
    }));
    await page.locator(".markdown-source-view.is-live-preview").waitFor();
    await settle();
    assert.equal(await page.locator(".mycss-source-editor").count(), 0);
    current = await layout();
    assert(current.sizer.width <= 880 && current.sizer.x > current.editor.x + 10);
    assert.equal(current.gutter.width, 0);
    assert(!current.rulerVisible);
    const liveContent = current.content;
    await settings({ sourceEditorEnabled: false });
    current = await layout();
    assert.deepEqual(current.content, liveContent, "Hidden source gutters do not alter Live Preview layout");
    await settings({ sourceEditorEnabled: true });
    await page.evaluate(() => {
      app.vault.setConfig("showLineNumber", true);
      app.workspace.updateOptions();
    });
    await settle();
    assert(await page.locator(".cm-lineNumbers").isVisible(), "Native line numbers still appear in Live Preview");
    await page.evaluate(() => app.workspace.activeLeaf.setViewState({
      type: "markdown", state: { file: "source.md", mode: "source", source: true },
    }));
    await page.locator(".mycss-source-editor").waitFor();
    assert(!await page.locator(".cm-lineNumbers").isVisible(), "Source numbers do not duplicate native numbers");
    await settings({ sourceLineNumbers: false });
    assert.equal((await layout()).gutter.width, 0);
    assert(!await page.locator(".cm-lineNumbers").isVisible(), "Source can hide numbers even if the native setting is enabled");

    // Commands update the current editor without changing document contents.
    await page.evaluate(() => app.commands.executeCommandById("obsidian-my-css:toggle-source-line-wrap"));
    await settle();
    assert(!(await layout()).wrap);
    await page.evaluate(() => app.commands.executeCommandById("obsidian-my-css:toggle-source-line-wrap"));
    await settle();
    assert((await layout()).wrap);
    await page.evaluate(() => app.commands.executeCommandById("obsidian-my-css:toggle-source-rulers"));
    await settle();
    assert(!(await layout()).rulerVisible);
    await settings({ sourceShowRulers: true });

    // Validate settings through the public plugin methods and persistence on reload.
    assert.deepEqual(await page.evaluate(async () => {
      const plugin = app.plugins.plugins["obsidian-my-css"];
      const invalid = await plugin.setSourceRulerColumns("80, nope");
      const unchanged = plugin.settings.sourceRulerColumns;
      const valid = await plugin.setSourceRulerColumns("120, 80, 80");
      const normalized = plugin.settings.sourceRulerColumns;
      return { invalid, unchanged, valid, normalized };
    }), { invalid: false, unchanged: "80, 120", valid: true, normalized: "80, 120" });
    assert.deepEqual(await page.evaluate(async () => {
      const plugin = app.plugins.plugins["obsidian-my-css"];
      const results = [];
      for (const value of ["", "0", "1001", "1.5", "80,", "1,2,3,4,5,6,7,8,9,10,11"]) {
        results.push(await plugin.setSourceRulerColumns(value));
      }
      return results;
    }), Array(6).fill(false), "Invalid columns do not replace saved ruler positions");
    await page.evaluate(async () => {
      await app.plugins.disablePlugin("obsidian-my-css");
      await app.plugins.enablePlugin("obsidian-my-css");
    });
    await page.locator(".mycss-source-editor").waitFor();
    assert.equal(await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].settings.sourceLineNumbers), false);
    await settings({ sourceEditorEnabled: false });
    assert.equal(await page.locator(".mycss-source-editor, .mycss-source-rulers, .mycss-source-line-numbers").count(), 0);
    await settings({ sourceEditorEnabled: true, sourceLineNumbers: true });
    await page.evaluate(() => {
      app.workspace.activeLeaf.view.editor.setCursor({ line: 1, ch: 0 });
      app.workspace.activeLeaf.view.editor.focus();
    });
    await settle();
    const finalRuler = await page.evaluate(() => {
      const cm = app.workspace.activeLeaf.view.editor.cm;
      const line = [...cm.contentDOM.querySelectorAll(".cm-line")][1];
      const range = document.createRange();
      range.setStart(line.firstChild, 0);
      range.setEnd(line.firstChild, 80);
      return { expected: range.getBoundingClientRect().right,
        actual: document.querySelector(".mycss-source-ruler").getBoundingClientRect().x };
    });
    assert(Math.abs(finalRuler.expected - finalRuler.actual) < 2, "Rulers use source font metrics after mode switches and plugin reloads");
    await page.locator(".notice").first().waitFor({ state: "hidden", timeout: 10000 });
    await page.screenshot({ path: join(root, "source-editor.png") });

    // Reading navigation uses the complete metadata outline, not just rendered
    // headings; duplicated names must still navigate to the correct source line.
    const paragraph = "A paragraph of note content. 日本語の本文です。\n\n".repeat(25);
    const tocSource = `# Note title\n\nIntroduction.\n\n## Overview\n\n${paragraph}### Details\n\n${paragraph}` +
      `##### Deep detail\n\n${paragraph}## 日本語の見出し\n\n${paragraph}` +
      `### Repeated\n\n${paragraph}### Repeated\n\n${paragraph}` +
      `## Final\n\n\`\`\`md\n# Not a heading\n\`\`\`\n\n${paragraph}` +
      `Setext section\n--------------\n\n${paragraph}`;
    await page.evaluate(async source => {
      const file = await app.vault.create("contents.md", source);
      await app.workspace.activeLeaf.openFile(file, { state: { mode: "preview" } });
    }, tocSource);
    const toc = page.locator(".mycss-reading-toc");
    const visibleLinks = () => page.locator(".mycss-toc-link:visible").allTextContents();
    await toc.waitFor();
    const topSections = ["Overview", "日本語の見出し", "Final", "Setext section"];
    assert.equal(await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].settings.readingTocH1AsTitle), true,
      "H1 titles are omitted by default when no preference has been saved");
    assert.deepEqual(await visibleLinks(), topSections);
    assert.deepEqual(await toc.locator(".mycss-toc-link").allTextContents(),
      ["Overview", "Details", "Deep detail", "日本語の見出し", "Repeated", "Repeated", "Final", "Setext section"],
      "The list contains only eligible headings, with no generated Beginning item");
    assert(await page.locator('.markdown-preview-view h1[data-heading="Note title"]').isVisible(), "H1 remains visible in the note");

    // Exercise the actual H1 setting, its immediate hierarchy change, and persistence.
    const toggleTitleSetting = async () => {
      await page.evaluate(() => {
        app.setting.open();
        app.setting.openTabById("obsidian-my-css");
      });
      await page.locator(".setting-item").filter({ has: page.getByText("Treat H1 as title", { exact: true }) })
        .locator(".checkbox-container").click();
      await page.evaluate(() => app.setting.close());
    };
    await toggleTitleSetting();
    assert.deepEqual(await visibleLinks(), ["Note title"], "Turning the title setting off restores H1 as the root");
    await toc.getByRole("button", { name: "Expand subsections: Note title", exact: true }).click();
    assert.deepEqual(await visibleLinks(), ["Note title", ...topSections]);
    await page.waitForFunction(async () => (await app.plugins.plugins["obsidian-my-css"].loadData()).readingTocH1AsTitle === false);
    await page.evaluate(async () => {
      await app.plugins.disablePlugin("obsidian-my-css");
      await app.plugins.enablePlugin("obsidian-my-css");
    });
    await toc.getByRole("link", { name: "Note title", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].settings.readingTocH1AsTitle), false);
    assert.deepEqual(await visibleLinks(), ["Note title"], "The saved off preference survives reload");
    await toggleTitleSetting();
    assert.deepEqual(await visibleLinks(), topSections, "Turning the setting on promotes sections immediately");
    assert.equal(await toc.locator('[aria-current="location"]').count(), 0, "The title and introduction do not activate a synthetic item");
    const tocBounds = async () => page.evaluate(() => {
      const box = element => {
        const { x, y, width, right } = element.getBoundingClientRect();
        return { x, y, width, right };
      };
      return { nav: box(document.querySelector(".mycss-reading-toc")),
        preview: box(document.querySelector(".mycss-has-toc > .markdown-preview-view")) };
    });
    // Mouse and settings controls share a persistent width preference.
    const resizer = toc.getByRole("separator", { name: "Resize contents" });
    const savedTocWidth = () => page.evaluate(() => app.plugins.plugins["obsidian-my-css"].settings.readingTocWidth);
    const waitForTocWidth = (width) => page.waitForFunction(width =>
      Math.abs(document.querySelector(".mycss-reading-toc").getBoundingClientRect().width - width) < 1, width);
    const dragToc = async (delta, finish = true) => {
      const box = await resizer.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - delta, box.y + 20, { steps: 5 });
      if (finish) await page.mouse.up();
    };
    await waitForTocWidth(224);
    await dragToc(96);
    await waitForTocWidth(320);
    assert.equal(await savedTocWidth(), 320, "Dragging left widens the right-hand contents");
    assert.equal(await page.locator("body.mycss-resizing-toc").count(), 0);
    assert.deepEqual(await visibleLinks(), topSections, "Resizing preserves the outline");
    await dragToc(40, false);
    await waitForTocWidth(360);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await waitForTocWidth(320);
    assert.equal(await savedTocWidth(), 320, "Escape cancels a drag");
    await dragToc(-400);
    await waitForTocWidth(160);
    await resizer.focus();
    await page.keyboard.press("ArrowLeft");
    await waitForTocWidth(170);
    await page.keyboard.press("Shift+ArrowLeft");
    await waitForTocWidth(220);
    await resizer.dblclick({ position: { x: 4, y: 20 } });
    await waitForTocWidth(224);

    await page.evaluate(() => {
      app.setting.open();
      app.setting.openTabById("obsidian-my-css");
    });
    const tocWidthSetting = page.locator(".setting-item").filter({ has: page.getByText("Table of contents width", { exact: true }) });
    const tocWidthInput = tocWidthSetting.getByRole("spinbutton");
    await tocWidthInput.fill("360");
    await tocWidthSetting.getByRole("button", { name: "Apply", exact: true }).click();
    await waitForTocWidth(360);
    await tocWidthSetting.getByRole("button", { name: "Reset", exact: true }).click();
    await waitForTocWidth(224);
    assert.equal(await tocWidthInput.inputValue(), "224");
    await tocWidthInput.fill("159");
    await tocWidthInput.press("Enter");
    assert.equal(await savedTocWidth(), 224, "An out-of-range width does not replace the saved value");
    await tocWidthInput.fill("340");
    await tocWidthInput.press("Enter");
    await waitForTocWidth(340);
    await page.evaluate(() => app.setting.close());
    await dragToc(-20);
    await waitForTocWidth(320);
    await page.waitForFunction(async () => (await app.plugins.plugins["obsidian-my-css"].loadData()).readingTocWidth === 320);
    await page.evaluate(async () => {
      await app.plugins.disablePlugin("obsidian-my-css");
      await app.plugins.enablePlugin("obsidian-my-css");
    });
    await toc.waitFor();
    await waitForTocWidth(320);
    assert.equal(await savedTocWidth(), 320, "The dragged width survives plugin reload");
    const shownBounds = await tocBounds();
    assert(shownBounds.nav.x >= shownBounds.preview.right - 1, "Contents are to the right, without overlapping the note");
    const overviewToggle = toc.getByRole("button", { name: "Expand subsections: Overview", exact: true });
    await overviewToggle.focus();
    await page.keyboard.press("Enter");
    assert((await visibleLinks()).includes("Details"), "Keyboard activation expands subsections");
    assert(!(await visibleLinks()).includes("Deep detail"), "Deeper branches start collapsed too");
    await toc.getByRole("button", { name: "Expand subsections: Details", exact: true }).click();
    assert((await visibleLinks()).includes("Deep detail"), "Skipped heading levels retain their hierarchy");
    await toc.getByRole("button", { name: "Contents: hide", exact: true }).click();
    assert.equal(await page.locator(".mycss-toc-list:visible").count(), 0);
    assert((await tocBounds()).preview.width > shownBounds.preview.width + 100, "Hiding contents releases note width");
    await toc.getByRole("button", { name: "Show contents", exact: true }).click();
    await waitForTocWidth(320);
    assert((await visibleLinks()).includes("Deep detail"), "Hide/show retains expanded branches");
    await toc.getByRole("button", { name: "Expand subsections: 日本語の見出し", exact: true }).click();
    await toc.getByRole("link", { name: "Repeated", exact: true }).nth(1).click();
    await page.waitForFunction(() => {
      const view = app.workspace.activeLeaf.view;
      const target = app.metadataCache.getFileCache(view.file).headings.filter(h => h.heading === "Repeated")[1];
      return Math.abs(view.previewMode.getScroll() - target.position.start.line) < 1;
    });
    assert(Math.abs((await tocBounds()).nav.y - shownBounds.nav.y) < 1, "Contents stay fixed during note scrolling");
    await page.waitForFunction(() => document.querySelector('.mycss-toc-link[aria-current="location"]')?.textContent === "Repeated");
    await toc.getByRole("button", { name: "Collapse subsections: 日本語の見出し", exact: true }).click();
    assert.equal(await toc.locator('[aria-current="location"]').textContent(), "日本語の見出し");
    await toc.getByRole("link", { name: "Overview", exact: true }).click();
    await page.waitForFunction(() => {
      const view = app.workspace.activeLeaf.view;
      const heading = app.metadataCache.getFileCache(view.file).headings.find(h => h.heading === "Overview");
      return Math.abs(view.previewMode.getScroll() - heading.position.start.line) < 1;
    });
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.applyScroll(0));
    await page.waitForFunction(() => !document.querySelector('.mycss-toc-link[aria-current="location"]'));
    assert.deepEqual((await visibleLinks()).slice(0, 3), ["Overview", "Details", "Deep detail"]);
    await page.screenshot({ path: join(root, "reading-toc.png") });

    // Metadata updates refresh the contents without resetting open branches.
    await page.evaluate(async () => {
      const file = app.workspace.activeLeaf.view.file;
      const source = await app.vault.read(file);
      await app.vault.modify(file, `An introduction.\n\n${source}\n\n## Added later\n\nText.`);
    });
    await toc.getByRole("link", { name: "Added later", exact: true }).waitFor();
    assert((await visibleLinks()).includes("Deep detail"));

    // Each pane gets its own outline and unique accessible control IDs.
    await page.evaluate(async () => {
      const file = await app.vault.create("other.md", "# Other note\n\n## Child\n\nText.");
      const leaf = app.workspace.getLeaf("split", "vertical");
      await leaf.openFile(file, { state: { mode: "preview" } });
    });
    await page.waitForFunction(() => document.querySelectorAll(".mycss-reading-toc").length === 2);
    assert.equal(await toc.getByRole("link", { name: "Other note", exact: true, includeHidden: true }).count(), 0);
    assert.equal(await toc.getByRole("link", { name: "Child", exact: true, includeHidden: true }).count(), 1);
    assert.equal(await page.evaluate(() => {
      const ids = [...document.querySelectorAll(".mycss-reading-toc [id]")].map(el => el.id);
      return ids.length === new Set(ids).size;
    }), true);
    await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].setReadingTocWidth(360));
    assert.deepEqual(await page.locator(".mycss-has-toc").evaluateAll(elements =>
      elements.map(el => el.style.getPropertyValue("--mycss-toc-width"))), ["360px", "360px"],
      "Changing the width updates every open contents panel");
    await page.evaluate(() => app.workspace.activeLeaf.detach());
    await page.waitForFunction(() => document.querySelectorAll(".mycss-reading-toc").length === 1);

    // Narrow panes start with a button, retain full note width, and close on Escape.
    await page.setViewportSize({ width: 700, height: 1000 });
    await page.locator(".mycss-toc-narrow.mycss-toc-collapsed").waitFor();
    await toc.getByRole("button", { name: "Show contents", exact: true }).click();
    assert(await toc.getByRole("link", { name: "Overview", exact: true }).isVisible());
    await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].setReadingTocWidth(600));
    await settle();
    const narrowBounds = await tocBounds();
    assert(narrowBounds.nav.x >= narrowBounds.preview.x && narrowBounds.nav.right <= narrowBounds.preview.right,
      "An oversized saved width fits inside a narrow pane");
    assert.equal(await savedTocWidth(), 600, "Responsive fitting preserves the preferred width");
    await page.screenshot({ path: join(root, "reading-toc-narrow.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".mycss-toc-list:visible").count(), 0);
    await toc.getByRole("button", { name: "Show contents", exact: true }).click();
    await toc.getByRole("link", { name: "Final", exact: true }).click();
    assert.equal(await page.locator(".mycss-toc-list:visible").count(), 0);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.waitForFunction(() => !document.querySelector(".mycss-toc-narrow"));
    assert(await toc.getByRole("link", { name: "Overview", exact: true }).isVisible());
    await waitForTocWidth(600);
    await dragToc(100);
    await waitForTocWidth(600);
    assert.equal(await savedTocWidth(), 600, "Dragging cannot exceed the width limit");
    await page.setViewportSize({ width: 1200, height: 1000 });
    await settle();
    assert((await tocBounds()).preview.width >= 360, "A wide contents panel preserves space for the note");
    assert.equal(await savedTocWidth(), 600);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await waitForTocWidth(600);
    await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].setReadingTocWidth(320));

    // The actual settings toggle removes the column, and off survives reload.
    await page.evaluate(() => {
      app.setting.open();
      app.setting.openTabById("obsidian-my-css");
    });
    await page.locator(".setting-item").filter({ has: page.getByText("Show table of contents", { exact: true }) })
      .locator(".checkbox-container").click();
    await page.waitForFunction(() => !document.querySelector(".mycss-reading-toc"));
    await page.evaluate(() => app.setting.close());
    assert.equal(await page.locator(".mycss-has-toc").count(), 0);
    await page.evaluate(async () => {
      await app.plugins.disablePlugin("obsidian-my-css");
      await app.plugins.enablePlugin("obsidian-my-css");
    });
    assert.equal(await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].settings.readingTocEnabled), false);
    assert.equal(await toc.count(), 0);
    await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].setReadingTocSetting("readingTocEnabled", true));
    await toc.waitFor();
    await toc.getByRole("button", { name: "Contents: hide", exact: true }).click();
    await page.evaluate(async () => {
      await app.plugins.disablePlugin("obsidian-my-css");
      await app.plugins.enablePlugin("obsidian-my-css");
    });
    await toc.getByRole("button", { name: "Show contents", exact: true }).waitFor();
    assert.equal(await page.locator(".mycss-toc-list:visible").count(), 0, "Visibility preference survives reload");
    await toc.getByRole("button", { name: "Show contents", exact: true }).click();

    for (const sourceMode of [false, true]) {
      await page.evaluate(source => app.workspace.activeLeaf.setViewState({
        type: "markdown", state: { file: "contents.md", mode: "source", source },
      }), sourceMode);
      await page.waitForFunction(() => !document.querySelector(".mycss-reading-toc"));
      assert.equal(await page.locator(".mycss-has-toc").count(), 0);
    }
    await page.evaluate(async () => {
      const file = await app.vault.create("no-headings.md", "Just text.\n\n```md\n# Code, not a heading\n```");
      await app.workspace.activeLeaf.openFile(file, { state: { mode: "preview" } });
    });
    await settle();
    assert.equal(await toc.count(), 0, "Notes without headings have no contents panel");
    await page.evaluate(async () => {
      const file = await app.vault.create("title-only.md", "Only title\n==========\n\nText.");
      await app.workspace.activeLeaf.openFile(file, { state: { mode: "preview" } });
    });
    await page.waitForFunction(() => app.metadataCache.getFileCache(app.workspace.activeLeaf.view.file)?.headings?.length === 1);
    await settle();
    assert.equal(await toc.count(), 0, "H1-only notes have no empty panel when H1 is a title");
    await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].setReadingTocSetting("readingTocH1AsTitle", false));
    await toc.waitFor();
    assert.deepEqual(await visibleLinks(), ["Only title"], "Setext H1 follows the same title setting");
    await page.evaluate(() => app.plugins.plugins["obsidian-my-css"].setReadingTocSetting("readingTocH1AsTitle", true));
    assert.equal(await toc.count(), 0);
    await page.evaluate(async () => {
      const file = await app.vault.create("multiple-titles.md", "# First title\n\n## First section\n\n### Child\n\n# Second title\n\n### Second section\n\nText.");
      await app.workspace.activeLeaf.openFile(file, { state: { mode: "preview" } });
    });
    await toc.waitFor();
    assert.deepEqual(await visibleLinks(), ["First section", "Second section"],
      "Omitted H1 titles still separate sections when later heading levels are skipped");
    await page.evaluate(() => app.workspace.activeLeaf.openFile(app.vault.getAbstractFileByPath("contents.md"), { state: { mode: "preview" } }));
    await toc.waitFor();
    assert(!(await visibleLinks()).includes("Details"), "Newly opened notes start collapsed");
    await page.evaluate(() => {
      document.body.removeClass("theme-light");
      document.body.addClass("theme-dark");
    });
    await page.screenshot({ path: join(root, "reading-toc-dark.png") });
    assert.equal(await page.evaluate(async () => {
      const text = await app.vault.read(app.vault.getAbstractFileByPath("contents.md"));
      return text;
    }), `An introduction.\n\n${tocSource}\n\n## Added later\n\nText.`, "TOC interactions never edit note contents");
    await page.evaluate(() => app.plugins.disablePlugin("obsidian-my-css"));
    assert.equal(await page.locator(".mycss-reading-toc, .mycss-has-toc").count(), 0);
    assert.equal(await page.locator(".mycss-toc-resizer, .mycss-resizing-toc").count(), 0);
    assert.equal(await page.locator('[style*="--mycss-toc-width"]').count(), 0);
    assert.equal(await page.locator(".mycss-source-editor, .mycss-source-rulers, .mycss-source-line-numbers").count(), 0);
    assert.deepEqual(errors, [], "No runtime errors");
    console.log(`Source editor and Reading view TOC smoke tests passed. Screenshots: ${root}`);
  } catch (error) {
    if (page) await page.screenshot({ path: join(root, "failure.png") }).catch(() => {});
    console.error(`Test artifacts: ${root}`, errors);
    throw error;
  } finally {
    await browser?.close();
    child.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

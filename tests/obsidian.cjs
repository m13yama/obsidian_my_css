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
    await page.evaluate(() => app.plugins.disablePlugin("obsidian-my-css"));
    assert.equal(await page.locator(".mycss-source-editor, .mycss-source-rulers, .mycss-source-line-numbers").count(), 0);
    assert.deepEqual(errors, [], "No runtime errors");
    console.log(`Source editor smoke test passed. Screenshot: ${join(root, "source-editor.png")}`);
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

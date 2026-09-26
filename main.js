const { Modal, Notice, Plugin, PluginSettingTab, Setting, setIcon, editorLivePreviewField } = require("obsidian");
const { Prec } = require("@codemirror/state");
const { Decoration, EditorView, GutterMarker, ViewPlugin, gutter } = require("@codemirror/view");

const DEFAULT_SETTINGS = {
  markdownLineWidth: "880px",
  sourceEditorEnabled: true,
  sourceLineWrap: true,
  sourceLineNumbers: true,
  sourceMonospace: true,
  sourceHighlightActiveLine: true,
  sourceShowRulers: false,
  sourceRulerColumns: "80, 120",
};

function parseRulerColumns(value) {
  const parts = String(value ?? "").trim().split(/[\s,、]+/);
  if (parts.length > 10 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const columns = parts.map(Number);
  if (columns.some((column) => column < 1 || column > 1000)) return null;
  return [...new Set(columns)].sort((a, b) => a - b);
}

function isSourceEditor(state) {
  // Only Markdown source editors have this field set explicitly to false.
  return state.field(editorLivePreviewField, false) === false;
}

class SourceLineNumber extends GutterMarker {
  constructor(number, active = false) {
    super();
    this.number = number;
    this.elementClass = active ? "mycss-active-line-number" : "";
  }

  eq(other) {
    return this.number === other.number && this.elementClass === other.elementClass;
  }

  toDOM(view) {
    return view.dom.ownerDocument.createTextNode(String(this.number));
  }
}

function sourceEditorExtension(settings) {
  if (!settings.sourceEditorEnabled) return [];

  const classes = [
    "mycss-source-editor",
    settings.sourceLineWrap ? "mycss-source-wrap" : "mycss-source-nowrap",
    settings.sourceLineNumbers ? "mycss-source-numbers" : "mycss-source-no-numbers",
    ...(settings.sourceMonospace ? ["mycss-source-monospace"] : []),
  ].join(" ");
  const columns = settings.sourceShowRulers ? parseRulerColumns(settings.sourceRulerColumns) : [];

  return [
    EditorView.editorAttributes.of((view) => isSourceEditor(view.state) ? { class: classes } : {}),
    // Use a separate gutter so Live Preview still follows Obsidian's own setting.
    Prec.high(gutter({
      class: "mycss-source-line-numbers",
      lineMarker(view, line) {
        if (!settings.sourceLineNumbers || !isSourceEditor(view.state)) return null;
        const number = view.state.doc.lineAt(line.from).number;
        const active = view.state.doc.lineAt(view.state.selection.main.head).number === number;
        return new SourceLineNumber(number, active);
      },
      lineMarkerChange: (update) => update.selectionSet ||
        isSourceEditor(update.startState) !== isSourceEditor(update.state),
      initialSpacer: (view) => new SourceLineNumber("9".repeat(String(view.state.doc.lines).length)),
      updateSpacer: (spacer, update) => {
        const number = "9".repeat(String(update.state.doc.lines).length);
        return spacer.number === number ? spacer : new SourceLineNumber(number);
      },
      domEventHandlers: {
        mousedown(view, line, event) {
          if (event.button !== 0 || !isSourceEditor(view.state)) return false;
          const from = view.state.doc.lineAt(line.from).from;
          const to = view.state.doc.lineAt(line.from).to;
          view.dispatch({ selection: { anchor: from, head: Math.min(to + 1, view.state.doc.length) } });
          view.focus();
          event.preventDefault();
          return true;
        },
      },
    })),
    EditorView.decorations.of((view) => {
      if (!settings.sourceHighlightActiveLine || !isSourceEditor(view.state)) return Decoration.none;
      const positions = [...new Set(view.state.selection.ranges
        .filter((range) => range.empty)
        .map((range) => view.state.doc.lineAt(range.head).from))].sort((a, b) => a - b);
      return Decoration.set(positions.map((position) =>
        Decoration.line({ class: "mycss-source-active-line" }).range(position)));
    }),
    ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view;
        this.measureContext = view.dom.ownerDocument.createElement("canvas").getContext("2d");
        this.overlay = view.dom.ownerDocument.createElement("div");
        this.overlay.className = "mycss-source-rulers";
        this.overlay.setAttribute("aria-hidden", "true");
        this.lines = columns.map(() => {
          const line = view.dom.ownerDocument.createElement("div");
          line.className = "mycss-source-ruler";
          this.overlay.appendChild(line);
          return line;
        });
        view.dom.appendChild(this.overlay);
        this.measure();
      }

      update(update) {
        if (update.geometryChanged || update.transactions.length) this.measure();
      }

      measure() {
        this.view.requestMeasure({
          key: this,
          read: (view) => {
            if (!columns.length || !isSourceEditor(view.state) || !view.inView) return null;
            const editor = view.dom.getBoundingClientRect();
            const content = view.contentDOM.getBoundingClientRect();
            const scroller = view.scrollDOM.getBoundingClientRect();
            const firstLine = view.contentDOM.querySelector(".cm-line");
            const win = view.dom.ownerDocument.defaultView;
            const padding = firstLine ? parseFloat(win.getComputedStyle(firstLine).paddingLeft) || 0 : 0;
            // CodeMirror can retain Live Preview's cached character width after a
            // mode change. Measure the currently applied font for accurate rulers.
            const font = win.getComputedStyle(view.contentDOM);
            this.measureContext.font = font.font;
            const characterWidth = this.measureContext.measureText("0000000000").width / 10 +
              (parseFloat(font.letterSpacing) || 0);
            const gutters = view.dom.querySelector(".cm-gutters");
            const left = Math.max(scroller.left, gutters?.getBoundingClientRect().right ?? scroller.left);
            return {
              left: left - editor.left,
              top: Math.max(0, content.top - editor.top),
              right: Math.max(0, editor.right - scroller.left - view.scrollDOM.clientWidth),
              positions: columns.map((column) => content.left + padding + column * characterWidth - left),
            };
          },
          write: (layout) => {
            this.overlay.hidden = !layout;
            if (!layout) return;
            this.overlay.style.left = `${layout.left}px`;
            this.overlay.style.top = `${layout.top}px`;
            this.overlay.style.right = `${layout.right}px`;
            this.lines.forEach((line, index) => { line.style.left = `${layout.positions[index]}px`; });
          },
        });
      }

      destroy() {
        this.overlay.remove();
      }
    }, { eventHandlers: { scroll() { this.measure(); } } }),
  ];
}

const MERMAID_SVG_SELECTOR = ".block-language-mermaid svg, .mermaid svg";
const MERMAID_ZOOM_MIN = 0.25;
const MERMAID_ZOOM_MAX = 4;
const MERMAID_ZOOM_STEP = 0.15;

function normalizeMarkdownLineWidth(value) {
  const trimmed = String(value ?? "").trim();

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  return trimmed;
}

function isValidCssWidth(value) {
  if (!value) {
    return false;
  }

  if (typeof CSS !== "undefined" && CSS.supports) {
    return CSS.supports("width", value);
  }

  return /^(?:\d+(\.\d+)?(?:px|rem|em|ch|vw|vh|vmin|vmax|%)|auto)$/.test(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseSvgLength(value) {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function getSvgViewBoxSize(svg) {
  const viewBox = svg.getAttribute("viewBox");

  if (!viewBox) {
    return null;
  }

  const parts = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [, , width, height] = parts;

  return width > 0 && height > 0 ? { width, height } : null;
}

function getSvgNaturalSize(svg) {
  const viewBoxSize = getSvgViewBoxSize(svg);

  if (viewBoxSize) {
    return viewBoxSize;
  }

  const width = parseSvgLength(svg.getAttribute("width"));
  const height = parseSvgLength(svg.getAttribute("height"));

  if (width && height) {
    return { width, height };
  }

  const bounds = svg.getBoundingClientRect();

  return {
    width: Math.max(bounds.width, 320),
    height: Math.max(bounds.height, 180),
  };
}

function getClickedMermaidSvg(event) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return null;
  }

  if (target.closest(".mycss-mermaid-zoom-modal")) {
    return null;
  }

  if (target.closest("a")) {
    return null;
  }

  const svg = target.closest("svg");

  if (!svg || !svg.matches(MERMAID_SVG_SELECTOR)) {
    return null;
  }

  return svg;
}

function createMermaidZoomIconButton(parentEl, icon, label) {
  const button = parentEl.createEl("button", {
    cls: "clickable-icon mycss-mermaid-zoom-button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

module.exports = class ObsidianMyCssPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.sourceExtensions = [];
    this.registerEditorExtension(this.sourceExtensions);
    this.applySettings();
    this.addSettingTab(new ObsidianMyCssSettingTab(this.app, this));
    this.registerDomEvent(document, "click", (event) => this.openMermaidZoom(event));
    this.addCommand({
      id: "toggle-source-line-wrap",
      name: "Toggle source mode line wrapping",
      callback: () => this.setSourceSetting("sourceLineWrap", !this.settings.sourceLineWrap),
    });
    this.addCommand({
      id: "toggle-source-rulers",
      name: "Toggle source mode rulers",
      callback: () => this.setSourceSetting("sourceShowRulers", !this.settings.sourceShowRulers),
    });
  }

  onunload() {
    document.body.style.removeProperty("--file-line-width");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    const normalizedLineWidth = normalizeMarkdownLineWidth(this.settings.markdownLineWidth);
    this.settings.markdownLineWidth = isValidCssWidth(normalizedLineWidth)
      ? normalizedLineWidth
      : DEFAULT_SETTINGS.markdownLineWidth;

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof value === "boolean" && typeof this.settings[key] !== "boolean") this.settings[key] = value;
    }
    const columns = parseRulerColumns(this.settings.sourceRulerColumns);
    this.settings.sourceRulerColumns = columns ? columns.join(", ") : DEFAULT_SETTINGS.sourceRulerColumns;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  applySettings() {
    document.body.style.setProperty("--file-line-width", this.settings.markdownLineWidth);
    this.sourceExtensions.splice(0, this.sourceExtensions.length, sourceEditorExtension({ ...this.settings }));
    this.app.workspace.updateOptions();
  }

  async setSourceSetting(key, value) {
    this.settings[key] = value;
    this.applySettings();
    await this.saveSettings();
  }

  async setSourceRulerColumns(value) {
    const columns = parseRulerColumns(value);
    if (!columns) {
      new Notice("Enter up to 10 columns between 1 and 1000, separated by commas (for example, 80, 120).");
      return false;
    }
    await this.setSourceSetting("sourceRulerColumns", columns.join(", "));
    return true;
  }

  async setMarkdownLineWidth(value) {
    const normalizedLineWidth = normalizeMarkdownLineWidth(value);

    if (!isValidCssWidth(normalizedLineWidth)) {
      new Notice("Use a valid CSS width value, such as 880px, 72rem, or 100%.");
      return false;
    }

    this.settings.markdownLineWidth = normalizedLineWidth;
    this.applySettings();
    await this.saveSettings();
    return true;
  }

  openMermaidZoom(event) {
    const svg = getClickedMermaidSvg(event);

    if (!svg) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    new MermaidZoomModal(this.app, svg).open();
  }
};

class ObsidianMyCssSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    let lineWidthInput;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian My CSS" });

    new Setting(containerEl)
      .setName("Markdown display width")
      .setDesc(
        "Readable markdown line width. Use any CSS width value, such as 880px, " +
          "72rem, calc(100% - 2rem), or 100%. A bare number is treated as pixels.",
      )
      .addText((text) => {
        lineWidthInput = text;
        text
          .setPlaceholder(DEFAULT_SETTINGS.markdownLineWidth)
          .setValue(this.plugin.settings.markdownLineWidth);

        text.inputEl.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.preventDefault();
          const saved = await this.plugin.setMarkdownLineWidth(text.getValue());

          if (saved) {
            text.setValue(this.plugin.settings.markdownLineWidth);
          }
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Apply")
          .setCta()
          .onClick(async () => {
            const saved = await this.plugin.setMarkdownLineWidth(lineWidthInput.getValue());

            if (saved) {
              lineWidthInput.setValue(this.plugin.settings.markdownLineWidth);
            }
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Reset")
          .onClick(async () => {
            await this.plugin.setMarkdownLineWidth(DEFAULT_SETTINGS.markdownLineWidth);
            lineWidthInput.setValue(this.plugin.settings.markdownLineWidth);
          });
      });

    containerEl.createEl("h3", { text: "Source editor" });
    const addToggle = (name, description, key) => new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle) => toggle.setValue(this.plugin.settings[key])
        .onChange((value) => this.plugin.setSourceSetting(key, value)));

    addToggle("Enable source editor layout",
      "Use the full pane width and align source text and gutters to the left. These settings apply only to Source mode.",
      "sourceEditorEnabled");
    new Setting(containerEl)
      .setName("Line wrapping")
      .setDesc("Wrap at the right edge of the editor, or keep long lines on one row and scroll horizontally.")
      .addDropdown((dropdown) => dropdown
        .addOption("wrap", "Wrap at editor edge")
        .addOption("off", "No wrapping (horizontal scroll)")
        .setValue(this.plugin.settings.sourceLineWrap ? "wrap" : "off")
        .onChange((value) => this.plugin.setSourceSetting("sourceLineWrap", value === "wrap")));
    addToggle("Line numbers", "Show line numbers at the left edge. Click a number to select that line.", "sourceLineNumbers");
    addToggle("Monospace font", "Use Obsidian's monospace font with uniform heading and text sizes for editing source.", "sourceMonospace");
    addToggle("Highlight current line", "Subtly highlight the line containing the cursor.", "sourceHighlightActiveLine");
    addToggle("Show column rulers", "Display vertical guides at the configured columns.", "sourceShowRulers");

    let rulerInput;
    const applyColumns = async () => {
      if (await this.plugin.setSourceRulerColumns(rulerInput.getValue())) {
        rulerInput.setValue(this.plugin.settings.sourceRulerColumns);
      }
    };
    new Setting(containerEl)
      .setName("Ruler columns")
      .setDesc("Comma-separated columns, for example 80, 120. Each guide follows that many half-width characters; use a monospace font for alignment. Up to 10 guides, from 1 to 1000.")
      .addText((text) => {
        rulerInput = text;
        text.setPlaceholder(DEFAULT_SETTINGS.sourceRulerColumns).setValue(this.plugin.settings.sourceRulerColumns);
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void applyColumns();
          }
        });
      })
      .addButton((button) => button.setButtonText("Apply").onClick(applyColumns))
      .addButton((button) => button.setButtonText("Reset").onClick(async () => {
        await this.plugin.setSourceRulerColumns(DEFAULT_SETTINGS.sourceRulerColumns);
        rulerInput.setValue(this.plugin.settings.sourceRulerColumns);
      }));
  }
}

class MermaidZoomModal extends Modal {
  constructor(app, sourceSvg) {
    super(app);
    this.sourceSvg = sourceSvg;
    this.scale = 1;
    this.svgSize = getSvgNaturalSize(sourceSvg);
  }

  onOpen() {
    this.modalEl.addClass("mycss-mermaid-zoom-modal");
    this.contentEl.empty();

    const toolbarEl = this.contentEl.createDiv({ cls: "mycss-mermaid-zoom-toolbar" });
    toolbarEl.createDiv({ cls: "mycss-mermaid-zoom-title", text: "Mermaid diagram" });

    const controlsEl = toolbarEl.createDiv({ cls: "mycss-mermaid-zoom-controls" });
    const zoomOutButton = createMermaidZoomIconButton(controlsEl, "zoom-out", "Zoom out");
    this.scaleLabelEl = controlsEl.createDiv({ cls: "mycss-mermaid-zoom-scale" });
    const zoomInButton = createMermaidZoomIconButton(controlsEl, "zoom-in", "Zoom in");
    const resetButton = controlsEl.createEl("button", {
      cls: "mycss-mermaid-zoom-text-button",
      text: "100%",
      attr: { "aria-label": "Reset zoom", title: "Reset zoom", type: "button" },
    });
    const fitButton = createMermaidZoomIconButton(controlsEl, "maximize-2", "Fit to view");

    this.viewportEl = this.contentEl.createDiv({ cls: "mycss-mermaid-zoom-viewport" });
    this.frameEl = this.viewportEl.createDiv({ cls: "mycss-mermaid-zoom-frame" });
    this.surfaceEl = this.frameEl.createDiv({ cls: "mycss-mermaid-zoom-surface" });

    const svgClone = this.sourceSvg.cloneNode(true);
    svgClone.setAttribute("width", String(this.svgSize.width));
    svgClone.setAttribute("height", String(this.svgSize.height));
    svgClone.style.width = `${this.svgSize.width}px`;
    svgClone.style.height = `${this.svgSize.height}px`;
    this.surfaceEl.appendChild(svgClone);

    zoomOutButton.addEventListener("click", () => this.setScale(this.scale - MERMAID_ZOOM_STEP));
    zoomInButton.addEventListener("click", () => this.setScale(this.scale + MERMAID_ZOOM_STEP));
    resetButton.addEventListener("click", () => this.setScale(1));
    fitButton.addEventListener("click", () => this.fitToViewport());
    this.viewportEl.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      this.setScale(this.scale + (event.deltaY < 0 ? MERMAID_ZOOM_STEP : -MERMAID_ZOOM_STEP));
    });

    this.setScale(1);
  }

  setScale(scale) {
    this.scale = clamp(scale, MERMAID_ZOOM_MIN, MERMAID_ZOOM_MAX);
    this.frameEl.style.width = `${this.svgSize.width * this.scale}px`;
    this.frameEl.style.height = `${this.svgSize.height * this.scale}px`;
    this.surfaceEl.style.width = `${this.svgSize.width}px`;
    this.surfaceEl.style.height = `${this.svgSize.height}px`;
    this.surfaceEl.style.transform = `scale(${this.scale})`;
    this.scaleLabelEl.setText(`${Math.round(this.scale * 100)}%`);
  }

  fitToViewport() {
    const bounds = this.viewportEl.getBoundingClientRect();
    const horizontalPadding = 48;
    const verticalPadding = 48;
    const scale = Math.min(
      1,
      (bounds.width - horizontalPadding) / this.svgSize.width,
      (bounds.height - verticalPadding) / this.svgSize.height,
    );

    this.setScale(scale);
  }
}

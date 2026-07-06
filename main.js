const { Modal, Notice, Plugin, PluginSettingTab, Setting, setIcon } = require("obsidian");

const DEFAULT_SETTINGS = {
  markdownLineWidth: "880px",
};

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
    this.applySettings();
    this.addSettingTab(new ObsidianMyCssSettingTab(this.app, this));
    this.registerDomEvent(document, "click", (event) => this.openMermaidZoom(event));
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
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  applySettings() {
    document.body.style.setProperty("--file-line-width", this.settings.markdownLineWidth);
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

const { Component, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, setIcon, editorLivePreviewField } = require("obsidian");
const { Prec } = require("@codemirror/state");
const { Decoration, EditorView, GutterMarker, ViewPlugin, gutter } = require("@codemirror/view");

const DEFAULT_SETTINGS = {
  markdownLineWidth: "880px",
  readingTocEnabled: true,
  readingTocCollapsed: false,
  readingTocH1AsTitle: true,
  readingTocWidth: 224,
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

const READING_TOC_MIN_WIDTH = 160;
const READING_TOC_MAX_WIDTH = 600;

function parseReadingTocWidth(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const width = Number(text);
  return width >= READING_TOC_MIN_WIDTH && width <= READING_TOC_MAX_WIDTH ? width : null;
}

let readingTocId = 0;

// Keep navigation outside the virtualized preview so every heading is available,
// including off-screen headings and repeated names. Scroll by source line.
class ReadingTableOfContents extends Component {
  constructor(plugin, view) {
    super();
    this.plugin = plugin;
    this.view = view;
    this.host = view.previewMode.containerEl;
    this.win = this.host.ownerDocument.defaultView;
    this.id = `mycss-toc-${++readingTocId}`;
    this.expanded = new Set();
    this.entries = [];
    this.narrowOpen = false;
    this.labels = this.host.matches(":lang(ja)")
      ? { contents: "目次", hide: "非表示", show: "目次を表示", expand: "下位見出しを表示", collapse: "下位見出しを隠す",
        resize: "目次の幅を調整", resizeHint: "ドラッグまたは左右キーで幅を調整。ダブルクリックで初期値に戻す。" }
      : { contents: "Contents", hide: "hide", show: "Show contents", expand: "Expand subsections", collapse: "Collapse subsections",
        resize: "Resize contents", resizeHint: "Drag or use Left/Right to resize. Double-click to reset." };
  }

  onload() {
    this.host.addClass("mycss-has-toc");
    this.nav = this.host.createEl("nav", {
      cls: "mycss-reading-toc", attr: { id: `${this.id}-nav`, "aria-label": this.labels.contents },
    });
    this.resizer = this.nav.createDiv({ cls: "mycss-toc-resizer", attr: {
      role: "separator", tabindex: "0", "aria-orientation": "vertical",
      "aria-label": this.labels.resize, "aria-controls": this.nav.id, title: this.labels.resizeHint,
    } });
    this.registerDomEvent(this.resizer, "pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary || this.drag) return;
      event.preventDefault();
      this.resizer.focus({ preventScroll: true });
      this.drag = { pointerId: event.pointerId, x: event.clientX,
        width: this.nav.getBoundingClientRect().width, savedWidth: this.plugin.settings.readingTocWidth };
      this.resizer.setPointerCapture(event.pointerId);
      this.host.ownerDocument.body.addClass("mycss-resizing-toc");
    });
    this.registerDomEvent(this.resizer, "pointermove", (event) => {
      if (this.drag?.pointerId !== event.pointerId) return;
      const width = Math.round(clamp(this.drag.width + this.drag.x - event.clientX,
        READING_TOC_MIN_WIDTH, this.maxWidth()));
      void this.plugin.setReadingTocWidth(width, false);
    });
    this.registerDomEvent(this.resizer, "pointerup", (event) => {
      if (this.drag?.pointerId === event.pointerId) this.finishResize(true);
    });
    for (const event of ["pointercancel", "lostpointercapture"]) {
      this.registerDomEvent(this.resizer, event, () => this.finishResize(false));
    }
    this.registerDomEvent(this.win, "blur", () => this.finishResize(false));
    this.registerDomEvent(this.resizer, "dblclick", () => {
      void this.plugin.setReadingTocWidth(DEFAULT_SETTINGS.readingTocWidth);
    });
    this.registerDomEvent(this.resizer, "keydown", (event) => {
      if (event.key === "Escape" && this.drag) {
        this.finishResize(false);
      } else {
        const step = event.shiftKey ? 50 : 10;
        const current = this.nav.getBoundingClientRect().width;
        const widths = { ArrowLeft: current + step, ArrowRight: current - step,
          Home: READING_TOC_MIN_WIDTH, End: this.maxWidth() };
        if (!(event.key in widths) || this.drag) return;
        void this.plugin.setReadingTocWidth(Math.round(clamp(widths[event.key], READING_TOC_MIN_WIDTH, this.maxWidth())));
      }
      event.preventDefault();
      event.stopPropagation();
    });
    const header = this.nav.createDiv({ cls: "mycss-toc-header" });
    this.title = header.createEl("span", { cls: "mycss-toc-title", text: this.labels.contents });
    this.toggle = header.createEl("button", {
      cls: "mycss-toc-toggle", attr: { type: "button", "aria-controls": this.id },
    });
    this.list = this.nav.createEl("ul", { cls: "mycss-toc-list", attr: { id: this.id } });
    this.registerDomEvent(this.toggle, "click", () => {
      if (this.narrow) {
        this.narrowOpen = !this.narrowOpen;
        this.updateVisibility();
      } else {
        void this.plugin.setReadingTocSetting("readingTocCollapsed", !this.plugin.settings.readingTocCollapsed);
      }
    });
    this.registerDomEvent(this.nav, "keydown", (event) => {
      if (event.key === "Escape" && this.narrow && this.narrowOpen) {
        this.narrowOpen = false;
        this.updateVisibility();
        this.toggle.focus();
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this.registerDomEvent(this.host, "scroll", () => this.scheduleActiveUpdate(), { capture: true, passive: true });
    const observer = new this.win.ResizeObserver(() => {
      const narrow = this.host.clientWidth < 760;
      if (narrow !== this.narrow) {
        this.finishResize(false);
        this.narrow = narrow;
        this.narrowOpen = false;
        this.updateVisibility();
      }
      this.updateWidth();
    });
    observer.observe(this.host);
    this.register(() => observer.disconnect());
    this.narrow = this.host.clientWidth < 760;
    this.updateVisibility();
  }

  updateVisibility() {
    const collapsed = this.narrow ? !this.narrowOpen : this.plugin.settings.readingTocCollapsed;
    this.collapsed = collapsed;
    if (collapsed) this.finishResize(false);
    this.host.toggleClass("mycss-toc-narrow", this.narrow);
    this.host.toggleClass("mycss-toc-collapsed", collapsed);
    this.list.hidden = collapsed;
    this.title.hidden = collapsed;
    this.toggle.setAttribute("aria-expanded", String(!collapsed));
    this.toggle.setAttribute("aria-label", collapsed ? this.labels.show : `${this.labels.contents}: ${this.labels.hide}`);
    this.toggle.title = collapsed ? this.labels.show : this.labels.hide;
    this.toggle.empty();
    if (collapsed) setIcon(this.toggle, "list-tree");
    else this.toggle.setText(this.labels.hide);
    this.updateWidth();
  }

  maxWidth() {
    const available = this.host.clientWidth;
    // Retain room for the note on desktop; overlays stay inside narrow panes.
    return available ? Math.max(1, Math.min(READING_TOC_MAX_WIDTH, available - (this.narrow ? 16 : 360)))
      : READING_TOC_MAX_WIDTH;
  }

  updateWidth() {
    if (this.disposed) return;
    const max = this.maxWidth();
    if (max < READING_TOC_MIN_WIDTH) this.finishResize(false);
    const width = Math.min(this.plugin.settings.readingTocWidth, max);
    this.host.style.setProperty("--mycss-toc-width", `${width}px`);
    this.resizer.hidden = this.collapsed || max < READING_TOC_MIN_WIDTH;
    this.resizer.setAttribute("aria-valuemin", String(Math.min(READING_TOC_MIN_WIDTH, max)));
    this.resizer.setAttribute("aria-valuemax", String(max));
    this.resizer.setAttribute("aria-valuenow", String(width));
  }

  finishResize(save) {
    if (!this.drag) return;
    const { pointerId, savedWidth } = this.drag;
    this.drag = null;
    this.host.ownerDocument.body.removeClass("mycss-resizing-toc");
    if (this.resizer.hasPointerCapture(pointerId)) this.resizer.releasePointerCapture(pointerId);
    if (save) void this.plugin.saveSettings();
    else void this.plugin.setReadingTocWidth(savedWidth, false);
  }

  update(headings) {
    const h1AsTitle = this.plugin.settings.readingTocH1AsTitle;
    const signature = JSON.stringify([h1AsTitle,
      headings.map((heading) => [heading.level, heading.heading, heading.position.start.line])]);
    const fileChanged = this.file !== this.view.file;
    if (!fileChanged && this.signature === signature) return;
    if (fileChanged) {
      this.expanded.clear();
      this.narrowOpen = false;
      this.list.scrollTop = 0;
    }
    this.file = this.view.file;
    this.signature = signature;
    this.list.empty();
    this.entries = [];
    const stack = [];
    const occurrences = new Map();
    for (const heading of headings) {
      while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
      // A title still starts a new section, so later headings must not nest
      // under the previous title's subsections when H1 is omitted.
      if (h1AsTitle && heading.level === 1) continue;
      const parent = stack[stack.length - 1];
      // Use heading text and occurrence, rather than line number, to retain open
      // branches when paragraphs above them are edited.
      const base = JSON.stringify([heading.level, heading.heading]);
      const occurrence = (occurrences.get(base) || 0) + 1;
      occurrences.set(base, occurrence);
      const entry = { level: heading.level, line: heading.position.start.line,
        key: `${base}:${occurrence}`, parent, label: heading.heading };
      if (parent && !parent.children) {
        parent.children = parent.item.createEl("ul", {
          cls: "mycss-toc-children", attr: { id: `${this.id}-branch-${this.entries.length}` },
        });
        parent.button = parent.row.createEl("button", {
          cls: "mycss-toc-branch-toggle", attr: { type: "button", "aria-controls": parent.children.id },
        });
        setIcon(parent.button, "chevron-right");
        parent.button.addEventListener("click", () => {
          if (this.expanded.has(parent.key)) this.expanded.delete(parent.key);
          else this.expanded.add(parent.key);
          this.updateBranch(parent);
          this.updateActive();
        });
        this.updateBranch(parent);
      }
      entry.item = (parent ? parent.children : this.list).createEl("li", { cls: "mycss-toc-item" });
      entry.row = entry.item.createDiv({ cls: "mycss-toc-row" });
      entry.link = this.createLink(entry.row, heading.heading, entry.line);
      this.entries.push(entry);
      stack.push(entry);
    }
    const keys = new Set(this.entries.map((entry) => entry.key));
    this.expanded = new Set([...this.expanded].filter((key) => keys.has(key)));
    this.updateVisibility();
    this.scheduleActiveUpdate();
  }

  createLink(parent, label, line) {
    const link = parent.createEl("a", {
      cls: "mycss-toc-link", text: label, attr: { href: `#${encodeURIComponent(label)}` },
    });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.narrow) {
        this.narrowOpen = false;
        this.updateVisibility();
      }
      // Obsidian resolves the line even if the target has not been rendered yet.
      this.view.leaf.setEphemeralState({ line, focus: true });
      this.scheduleActiveUpdate();
    });
    return link;
  }

  updateBranch(entry) {
    const expanded = this.expanded.has(entry.key);
    entry.children.hidden = !expanded;
    entry.button.setAttribute("aria-expanded", String(expanded));
    entry.button.setAttribute("aria-label", `${expanded ? this.labels.collapse : this.labels.expand}: ${entry.label}`);
  }

  scheduleActiveUpdate() {
    if (this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;
      this.updateActive();
    });
  }

  updateActive() {
    const line = this.view.previewMode.getScroll();
    if (!Number.isFinite(line)) return;
    let active;
    for (const entry of this.entries) {
      if (entry.line > line + 0.5) break;
      active = entry;
    }
    // Highlight the visible ancestor without opening branches during scrolling.
    for (let parent = active?.parent; parent; parent = parent.parent) {
      if (!this.expanded.has(parent.key)) active = parent;
    }
    const link = active?.link;
    if (this.activeLink !== link) {
      this.activeLink?.removeAttribute("aria-current");
      link?.setAttribute("aria-current", "location");
      this.activeLink = link;
    }
  }

  onunload() {
    this.disposed = true;
    this.finishResize(false);
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    this.nav.remove();
    this.host.style.removeProperty("--mycss-toc-width");
    this.host.removeClass("mycss-has-toc", "mycss-toc-narrow", "mycss-toc-collapsed");
  }
}

module.exports = class ObsidianMyCssPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.readingTocs = new Map();
    this.sourceExtensions = [];
    this.registerEditorExtension(this.sourceExtensions);
    this.applySettings();
    this.addSettingTab(new ObsidianMyCssSettingTab(this.app, this));
    this.registerDomEvent(document, "click", (event) => this.openMermaidZoom(event));
    const refreshTocs = () => this.scheduleReadingTocs();
    this.registerEvent(this.app.workspace.on("layout-change", refreshTocs));
    this.registerEvent(this.app.workspace.on("active-leaf-change", refreshTocs));
    this.registerEvent(this.app.workspace.on("file-open", refreshTocs));
    this.registerEvent(this.app.metadataCache.on("changed", refreshTocs));
    this.app.workspace.onLayoutReady(refreshTocs);
    this.register(() => window.clearTimeout(this.readingTocTimer));
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
    for (const toc of this.readingTocs.values()) this.removeChild(toc);
    this.readingTocs.clear();
    document.body.style.removeProperty("--file-line-width");
  }

  scheduleReadingTocs() {
    window.clearTimeout(this.readingTocTimer);
    this.readingTocTimer = window.setTimeout(() => this.syncReadingTocs(), 0);
  }

  syncReadingTocs() {
    const views = new Set();
    if (this.settings.readingTocEnabled) {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || view.getMode() !== "preview" || !view.file) continue;
        const headings = this.app.metadataCache.getFileCache(view.file)?.headings || [];
        if (!headings.some((heading) => !this.settings.readingTocH1AsTitle || heading.level !== 1)) continue;
        views.add(view);
        let toc = this.readingTocs.get(view);
        if (!toc) {
          toc = this.addChild(new ReadingTableOfContents(this, view));
          this.readingTocs.set(view, toc);
        }
        toc.update(headings);
        toc.updateVisibility();
      }
    }
    for (const [view, toc] of this.readingTocs) {
      if (!views.has(view)) {
        this.removeChild(toc);
        this.readingTocs.delete(view);
      }
    }
  }

  async setReadingTocSetting(key, value) {
    this.settings[key] = value;
    this.syncReadingTocs();
    await this.saveSettings();
  }

  async setReadingTocWidth(value, save = true) {
    const width = parseReadingTocWidth(value);
    if (width === null) {
      new Notice(`Enter a whole-number width from ${READING_TOC_MIN_WIDTH} to ${READING_TOC_MAX_WIDTH} pixels.`);
      return false;
    }
    this.settings.readingTocWidth = width;
    for (const toc of this.readingTocs.values()) toc.updateWidth();
    if (save) await this.saveSettings();
    return true;
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
    this.settings.readingTocWidth = parseReadingTocWidth(this.settings.readingTocWidth) ?? DEFAULT_SETTINGS.readingTocWidth;
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
    this.scheduleReadingTocs();
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

    containerEl.createEl("h3", { text: "Reading view" });
    new Setting(containerEl)
      .setName("Show table of contents")
      .setDesc("Show a fixed table of contents on the right in Reading view. Subsections start collapsed; use the arrows to expand them.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.readingTocEnabled)
        .onChange((value) => this.plugin.setReadingTocSetting("readingTocEnabled", value)));
    new Setting(containerEl)
      .setName("Treat H1 as title")
      .setDesc("Omit H1 titles from the table of contents and show their sections at the top level. Turn off to include H1 headings.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.readingTocH1AsTitle)
        .onChange((value) => this.plugin.setReadingTocSetting("readingTocH1AsTitle", value)));

    let tocWidthInput;
    const applyTocWidth = async () => {
      if (await this.plugin.setReadingTocWidth(tocWidthInput.getValue())) {
        tocWidthInput.setValue(String(this.plugin.settings.readingTocWidth));
      }
    };
    new Setting(containerEl)
      .setName("Table of contents width")
      .setDesc(`Width in pixels (${READING_TOC_MIN_WIDTH}–${READING_TOC_MAX_WIDTH}). You can also drag the left edge of the contents. Narrow panes fit the width to the available space.`)
      .addText((text) => {
        tocWidthInput = text;
        text.setPlaceholder(String(DEFAULT_SETTINGS.readingTocWidth)).setValue(String(this.plugin.settings.readingTocWidth));
        text.inputEl.type = "number";
        text.inputEl.min = String(READING_TOC_MIN_WIDTH);
        text.inputEl.max = String(READING_TOC_MAX_WIDTH);
        text.inputEl.step = "1";
        text.inputEl.setAttribute("aria-label", "Table of contents width in pixels");
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void applyTocWidth();
          }
        });
      })
      .addButton((button) => button.setButtonText("Apply").onClick(applyTocWidth))
      .addButton((button) => button.setButtonText("Reset").onClick(async () => {
        await this.plugin.setReadingTocWidth(DEFAULT_SETTINGS.readingTocWidth);
        tocWidthInput.setValue(String(this.plugin.settings.readingTocWidth));
      }));

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

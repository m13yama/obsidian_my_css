const { Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  markdownLineWidth: "880px",
};

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

module.exports = class ObsidianMyCssPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.applySettings();
    this.addSettingTab(new ObsidianMyCssSettingTab(this.app, this));
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

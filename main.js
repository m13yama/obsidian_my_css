const { Plugin } = require("obsidian");

module.exports = class ObsidianMyCssPlugin extends Plugin {
  async onload() {
    // Obsidian automatically loads styles.css while this plugin is enabled.
  }
};

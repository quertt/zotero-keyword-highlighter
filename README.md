# Keyword Highlighter for Zotero

A Zotero 8 plugin that automatically highlights user-defined keywords in the PDF reader.

## Features

- Define keyword lists organized into named categories
- Highlight all keywords in the currently open PDF with a single shortcut
- Keywords are highlighted using Zotero's built-in PDF search engine
- Highlights are temporary (not saved as annotations) – re-apply whenever needed
- Settings are saved persistently across sessions

## Installation

1. Download the latest `.xpi` file from the [Releases](../../releases) page
2. In Zotero: **Tools → Add-ons → gear icon → Install Plugin From File**
3. Select the downloaded `.xpi` file
4. Restart Zotero

## Usage

### Setting up keywords

Go to **Tools → Keyword Highlighter …** to open the settings dialog.

- Add categories with **+ Kategorie hinzufügen**
- Enter a category name and comma-separated keywords
- Click **Speichern** to save

### Highlighting keywords

1. Open a PDF in the Zotero reader (double-click any PDF attachment)
2. Press **Ctrl+Shift+H** to highlight all keywords

Alternatively: right-click any item in your library → **Keywords hervorheben (Ctrl+Shift+H)**

> **Note:** Highlights are temporary and disappear when the PDF is closed. Press Ctrl+Shift+H again after reopening.

## Requirements

- Zotero 7.0 or later (tested on Zotero 8)
- Windows, macOS, or Linux

## Development

The plugin uses Zotero's bootstrap architecture and the internal pdf.js `findController` to trigger highlighting.

```
keyword-highlighter/
├── manifest.json          # Plugin metadata
├── bootstrap.js           # Lifecycle hooks (startup/shutdown)
├── chrome.manifest        # Chrome URL registration
├── prefs.js               # Default preferences
└── content/
    ├── keywordHighlighter.js  # Main plugin logic
    ├── settings.html          # Settings dialog UI
    └── settings.js            # Settings dialog logic
```

To build the `.xpi` file:

```bash
cd keyword-highlighter
zip -r keyword-highlighter.xpi manifest.json bootstrap.js prefs.js chrome.manifest content/
```

## Publishing

This plugin is listed in the [Zotero Plugin Directory](https://www.zotero.org/support/plugins).

## License

MIT License – see [LICENSE](LICENSE) for details.

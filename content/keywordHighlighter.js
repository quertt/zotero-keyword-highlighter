/**
 * Keyword Highlighter for Zotero 8
 * Ctrl+Shift+H: Highlights user-defined keywords in the PDF reader.
 * Supports: English, German, Spanish, French
 */

KeywordHighlighter = {

  id: null,
  version: null,
  rootURI: null,
  initialized: false,
  addedElementIDs: [],
  _keyHandlers: [],
  _strings: null,

  PREF_KEY: "extensions.keyword-highlighter.categories",

  // ── Lokalisierung ─────────────────────────────────────────────────────────
  _loadStrings() {
    if (this._strings) return this._strings;
    try {
      this._strings = Services.strings.createBundle(
        "chrome://keyword-highlighter/locale/keyword-highlighter.properties"
      );
    } catch (e) {
      Zotero.logError(e);
      this._strings = null;
    }
    return this._strings;
  },

  _str(key) {
    try {
      return this._loadStrings().GetStringFromName(key);
    } catch (e) {
      // Fallback: englischer Hardcode-Text
      const fallback = {
        "tools.menu.label":          "Keyword Highlighter",
        "settings.title":            "Keyword Highlighter",
        "settings.category.placeholder": "Category name",
        "settings.keywords.label":   "Keywords (comma-separated)",
        "settings.add.category":     "+ Add category",
        "settings.save":             "Save",
        "settings.cancel":           "Cancel",
        "alert.no.keywords":         "No keywords defined.\nPlease go to Tools \u2192 Keyword Highlighter\u2026",
        "alert.no.pdf":              "No PDF open.\nPlease open a PDF first, then press Ctrl+Shift+H.",
        "settings.hint":             "Tip: Press Ctrl+Shift+H while a PDF is open to start keyword highlighting.",
      };
      return fallback[key] || key;
    }
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  init({ id, version, rootURI }) {
    if (this.initialized) return;
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.initialized = true;
  },

  addToAllWindows() {
    for (let win of Zotero.getMainWindows()) {
      if (!win.ZoteroPane) continue;
      this.addToWindow(win);
    }
  },

  removeFromAllWindows() {
    for (let win of Zotero.getMainWindows()) {
      if (!win.ZoteroPane) continue;
      this.removeFromWindow(win);
    }
  },

  addToWindow(win) {
    const doc = win.document;

    // Clean up legacy context menu elements from older plugin versions
    doc.getElementById("kwhl-ctx-sep")?.remove();
    doc.getElementById("kwhl-ctx-menuitem")?.remove();

    // Tools-Menü
    const toolsPopup = doc.getElementById("menu_ToolsPopup");
    if (toolsPopup && !doc.getElementById("kwhl-tools-menuitem")) {
      const mi = doc.createXULElement("menuitem");
      mi.id = "kwhl-tools-menuitem";
      mi.setAttribute("label", this._str("tools.menu.label"));
      mi.addEventListener("command", () => this.openSettingsDialog(win));
      toolsPopup.appendChild(mi);
      this._storeElement(mi.id);
    }

    // Shortcut am Hauptfenster
    const keyHandler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "H") {
        e.preventDefault();
        e.stopPropagation();
        this.highlight(win).catch(err => Zotero.logError(err));
      }
    };
    win.addEventListener("keydown", keyHandler, true);
    this._keyHandlers.push({ win, handler: keyHandler });

    // Shortcut auch im Reader-iframe registrieren
    this._watchForReaders(win);
  },

  removeFromWindow(win) {
    const doc = win.document;
    for (const id of this.addedElementIDs) doc.getElementById(id)?.remove();
    this._keyHandlers = this._keyHandlers.filter(({ win: w, handler }) => {
      if (w === win) { win.removeEventListener("keydown", handler, true); return false; }
      return true;
    });
  },

  _storeElement(id) {
    if (!this.addedElementIDs.includes(id)) this.addedElementIDs.push(id);
  },

  _watchForReaders(win) {
    const interval = win.setInterval(() => {
      for (const reader of (Zotero.Reader?._readers || [])) {
        const iw = reader?._iframeWindow;
        if (!iw || iw.__kwhlRegistered) continue;
        iw.__kwhlRegistered = true;
        iw.addEventListener("keydown", (e) => {
          if (e.ctrlKey && e.shiftKey && e.key === "H") {
            e.preventDefault();
            e.stopPropagation();
            this.highlight(win).catch(err => Zotero.logError(err));
          }
        }, true);
      }
    }, 1000);
    win.setTimeout(() => win.clearInterval(interval), 600000);
  },

  // ── Preferences ───────────────────────────────────────────────────────────
  _loadCategories() {
    try {
      const raw = Zotero.Prefs.get(this.PREF_KEY, true);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [
      { name: "Methods",  keywords: ["method", "methodology", "approach"] },
      { name: "Results",  keywords: ["result", "finding", "outcome"] },
      { name: "Theory",   keywords: ["theory", "model", "framework"] }
    ];
  },

  _saveCategories(cats) {
    Zotero.Prefs.set(this.PREF_KEY, JSON.stringify(cats), true);
  },

  // ── Settings dialog ───────────────────────────────────────────────────────
  openSettingsDialog(win) {
    const args = {
      categories: this._loadCategories(),
      strings: {
        title:       this._str("settings.title"),
        placeholder: this._str("settings.category.placeholder"),
        kwLabel:     this._str("settings.keywords.label"),
        addCat:      this._str("settings.add.category"),
        save:        this._str("settings.save"),
        cancel:      this._str("settings.cancel"),
        hint:        this._str("settings.hint"),
      },
      callback: (result) => this._saveCategories(result)
    };
    win.openDialog(
      "chrome://keyword-highlighter/content/settings.html",
      "kwhl-settings",
      "chrome,dialog,modal,resizable,centerscreen,width=620,height=520",
      args
    );
  },

  // ── Highlight ─────────────────────────────────────────────────────────────
  async highlight(win) {
    try {
    const categories = this._loadCategories();
    const keywords = categories.flatMap(c => c.keywords.filter(k => k.trim()));

    if (!keywords.length) {
      win.alert(this._str("alert.no.keywords"));
      return;
    }

    const reader = (Zotero.Reader?._readers || []).findLast(r => r?._iframeWindow);
    if (!reader) {
      win.alert(this._str("alert.no.pdf"));
      return;
    }

    const iframeWin = reader._iframeWindow;
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const keywordsJson = JSON.stringify(escaped);

    const script = `
      (function() {
        var app = window.PDFViewerApplication;
        if (!app || !app.findController) return;
        var bus = app.findController._eventBus || app.eventBus;
        bus.dispatch("find", {
          source:          window,
          type:            "",
          query:           ${keywordsJson},
          caseSensitive:   false,
          entireWord:      false,
          highlightAll:    true,
          findPrevious:    false,
          matchDiacritics: false,
        });
      })();
    `;

    const scriptEl = iframeWin.document.createElement("script");
    scriptEl.textContent = script;
    iframeWin.document.head.appendChild(scriptEl);
    scriptEl.remove();
  } catch (err) {
    Zotero.logError(err);
  }
  }
};

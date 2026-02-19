/**
 * Keyword Highlighter for Zotero 8
 * Ctrl+Shift+H: Hebt alle definierten Keywords im PDF-Reader hervor.
 */

KeywordHighlighter = {

  id: null,
  version: null,
  rootURI: null,
  initialized: false,
  addedElementIDs: [],
  _keyHandlers: [],

  COLORS: {
    "Gelb":    "#ffd400",
    "Rot":     "#ff6666",
    "Grün":    "#5fb236",
    "Blau":    "#2ea8e5",
    "Lila":    "#a28ae5",
    "Magenta": "#e56eee",
    "Orange":  "#f19837",
    "Grau":    "#aaaaaa"
  },

  PREF_KEY: "extensions.keyword-highlighter.categories",

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

    // Tools-Menü
    const toolsPopup = doc.getElementById("menu_ToolsPopup");
    if (toolsPopup && !doc.getElementById("kwhl-tools-menuitem")) {
      const mi = doc.createXULElement("menuitem");
      mi.id = "kwhl-tools-menuitem";
      mi.setAttribute("label", "Keyword Highlighter \u2026");
      mi.addEventListener("command", () => this.openSettingsDialog(win));
      toolsPopup.appendChild(mi);
      this._storeElement(mi.id);
    }

    // Kontextmenü
    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (itemMenu && !doc.getElementById("kwhl-ctx-sep")) {
      const sep = doc.createXULElement("menuseparator");
      sep.id = "kwhl-ctx-sep";
      const mi2 = doc.createXULElement("menuitem");
      mi2.id = "kwhl-ctx-menuitem";
      mi2.setAttribute("label", "Keywords hervorheben (Ctrl+Shift+H)");
      mi2.addEventListener("command", () => this.highlight(win));
      itemMenu.appendChild(sep);
      itemMenu.appendChild(mi2);
      this._storeElement(sep.id);
      this._storeElement(mi2.id);
    }

    // Shortcut am Hauptfenster
    const keyHandler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "H") {
        e.preventDefault();
        e.stopPropagation();
        this.highlight(win);
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

  // Wartet auf Reader und registriert Shortcut im iframe
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
            this.highlight(win);
          }
        }, true);
      }
    }, 1000);
    win.setTimeout(() => win.clearInterval(interval), 600000);
  },

  // ── Preferences ──────────────────────────────────────────────────────────────
  _loadCategories() {
    try {
      const raw = Zotero.Prefs.get(this.PREF_KEY, true);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [
      { name: "Methoden",   color: "#2ea8e5", keywords: ["Methode", "Methodologie", "Ansatz"] },
      { name: "Ergebnisse", color: "#5fb236", keywords: ["Ergebnis", "Befund", "Resultat"] },
      { name: "Theorie",    color: "#ffd400", keywords: ["Theorie", "Modell", "Framework"] }
    ];
  },

  _saveCategories(cats) {
    Zotero.Prefs.set(this.PREF_KEY, JSON.stringify(cats), true);
  },

  // ── Settings dialog ──────────────────────────────────────────────────────────
  openSettingsDialog(win) {
    const args = {
      categories: this._loadCategories(),
      callback: (result) => this._saveCategories(result)
    };
    win.openDialog(
      "chrome://keyword-highlighter/content/settings.html",
      "kwhl-settings",
      "chrome,dialog,modal,resizable,centerscreen,width=640,height=540",
      args
    );
  },

  // ── Hauptfunktion ─────────────────────────────────────────────────────────────
  async highlight(win) {
    const categories = this._loadCategories();
    const keywords = categories.flatMap(c => c.keywords.filter(k => k.trim()));

    if (!keywords.length) {
      win.alert("Keine Schlagwörter definiert.\nBitte unter Tools → Keyword Highlighter … Kategorien anlegen.");
      return;
    }

    const reader = (Zotero.Reader?._readers || []).findLast(r => r?._iframeWindow);
    if (!reader) {
      win.alert("Kein PDF geöffnet.\nBitte zuerst eine PDF im Reader öffnen, dann Ctrl+Shift+H drücken.");
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
  }
};

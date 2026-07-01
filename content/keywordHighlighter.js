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
    // Run indefinitely so readers opened at any time get the shortcut registered.
    // The __kwhlRegistered flag prevents duplicate listeners.
    win.setInterval(() => {
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

    // Keywords wrapped in "..." require whole-word matching. Strip the quotes
    // and record those keywords separately so the injected script can enforce
    // word-boundary checks after PDF.js highlights them.
    const exactKeywordsSet = new Set();
    const processedCategories = categories.map(c => ({
      ...c,
      keywords: c.keywords
        .map(k => {
          const t = k.trim();
          if (t.length > 2 && t.startsWith('"') && t.endsWith('"')) {
            const stripped = t.slice(1, -1).trim();
            exactKeywordsSet.add(stripped.toLowerCase());
            return stripped;
          }
          return t;
        })
        .filter(k => k),
    }));

    const keywords = processedCategories.flatMap(c => c.keywords.filter(k => k.trim()));

    if (!keywords.length) {
      win.alert(this._str("alert.no.keywords"));
      return;
    }

    const selectedTabID = win.Zotero_Tabs?.selectedID;
    const reader = selectedTabID
      ? (Zotero.Reader?._readers || []).find(r => r.tabID === selectedTabID && r?._iframeWindow)
      : (Zotero.Reader?._readers || []).findLast(r => r?._iframeWindow);
    if (!reader) {
      win.alert(this._str("alert.no.pdf"));
      return;
    }

    const iframeWin = reader._iframeWindow;
    const iframeDoc = iframeWin.document;

    // All keywords combined for the find dispatch
    const keywordsJson = JSON.stringify(keywords);
    // Exact (quoted) keywords that need whole-word enforcement in the injected script
    const exactKeywordsJson = JSON.stringify([...exactKeywordsSet]);
    // Category data for per-keyword coloring
    const defaultColors = ["#FFD700", "#00cc44", "#ff4455", "#00b7ff", "#cc88ff", "#FFA07A", "#98FB98"];
    const categoryDataJson = JSON.stringify(
      processedCategories.map((c, i) => ({
        keywords: c.keywords.filter(k => k.trim()).map(k => k.trim().toLowerCase()),
        color: c.color || defaultColors[i % defaultColors.length],
      }))
    );

    const scriptEl = iframeDoc.createElement("script");
    scriptEl.textContent = `
      (function() {
        var app = window.PDFViewerApplication;
        if (!app || !app.findController) return;

        var categoryData = ${categoryDataJson};

        // Build a lookup: lowercase keyword -> color
        var kwColor = {};
        categoryData.forEach(function(cat) {
          cat.keywords.forEach(function(kw) { kwColor[kw] = cat.color; });
        });

        // Keywords that require whole-word matching (were entered with "quotes").
        // PDF.js is dispatched with entireWord:false for all keywords so they are
        // found as substrings first; non-whole-word matches are then suppressed here.
        var exactSet = {};
        ${exactKeywordsJson}.forEach(function(k) { exactSet[k] = true; });

        // Inject CSS into the nested viewer iframe
        var bus = app.findController._eventBus || app.eventBus;

        document.querySelectorAll('iframe').forEach(function(f) {
          try {
            var doc = f.contentDocument;
            if (!doc || !doc.head) return;

            // Returns true when the highlight group sits at a word boundary.
            // NOTE: textContent on cross-document nodes in Gecko returns a DOM
            // string wrapper, not a plain JS primitive. RegExp.test() and even
            // charCodeAt() can behave unexpectedly on such values. We coerce
            // every string through String() before inspection.
            function isWholeWord(spans) {
              function isWordChar(c) {
                if (!c) return false;
                var code = String(c).charCodeAt(0);
                return (code >= 65 && code <= 90) ||   // A–Z
                       (code >= 97 && code <= 122) ||  // a–z
                       (code >= 48 && code <= 57)  ||  // 0–9
                       code === 95;                    // _
              }

              function charAt(str, pos) {
                var s = String(str || '');
                return pos === 'last' ? s.slice(-1) : s.charAt(0);
              }

              function prevChar(node) {
                var sib = node.previousSibling;
                if (sib) return charAt(sib.textContent, 'last');
                var par = node.parentNode;
                if (par) {
                  var parSib = par.previousSibling;
                  if (parSib) return charAt(parSib.textContent, 'last');
                }
                return '';
              }

              function nextChar(node) {
                var sib = node.nextSibling;
                var t = String(sib ? sib.textContent || '' : '');
                var c = t.charAt(0);

                // If a hyphen follows, the word may continue past it —
                // either as an infix (well-known) or a line-break hyphen
                // ("stress-" + "es" across lines). Look past the hyphen.
                if (c === '-') {
                  var afterHyphen = t.slice(1).charAt(0);
                  if (afterHyphen) return afterHyphen;
                  // Hyphen was the only character in this text node (end-of-line).
                  // Check the first character of the next text item.
                  var par = node.parentNode;
                  if (par && par.nextSibling) {
                    return String(par.nextSibling.textContent || '').charAt(0);
                  }
                  return c;
                }

                if (c) return c;

                // No adjacent sibling text — check the parent text item's neighbor.
                var par2 = node.parentNode;
                if (par2) {
                  var parSib = par2.nextSibling;
                  if (parSib) return String(parSib.textContent || '').charAt(0);
                }
                return '';
              }

              var pc = prevChar(spans[0]);
              var nc = nextChar(spans[spans.length - 1]);
              return !isWordChar(pc) && !isWordChar(nc);
            }

            function applyColor(spans) {
              // textStripped: hyphens stripped from non-last spans, joined without separator.
              // textHyphen:   raw join, hyphens preserved (genuine compounds like "well-known").
              var parts = spans.map(function(el, i) {
                var t = String(el.textContent || '');
                return (i < spans.length - 1) ? t.replace(/-$/, '') : t;
              });
              var textStripped = parts.join('').trim().toLowerCase();
              var textHyphen   = spans.map(function(el) { return String(el.textContent || ''); }).join('').trim().toLowerCase();

              var color = kwColor[textStripped] || kwColor[textHyphen];
              var matchedKw = kwColor[textStripped] ? textStripped
                            : kwColor[textHyphen]   ? textHyphen
                            : null;

              // Multi-word keywords that span text items (e.g. "residual stress" across a
              // line break) produce kerning-split sub-spans. Joining them gives "residualstress"
              // (no space). Match by comparing stripped against keywords with spaces removed.
              if (!color) {
                for (var kw in kwColor) {
                  if (kw.replace(/\s+/g, '') === textStripped) {
                    color = kwColor[kw];
                    matchedKw = kw;
                    break;
                  }
                }
              }

              if (!color) {
                // Partial match fallback
                for (var kw in kwColor) {
                  if (textStripped.includes(kw) || kw.includes(textStripped) ||
                      textHyphen.includes(kw)   || kw.includes(textHyphen)) {
                    color = kwColor[kw];
                    matchedKw = kw;
                    break;
                  }
                }
              }

              // Whole-word enforcement: if this keyword was entered with quotes,
              // suppress the highlight when it is not at a word boundary.
              if (matchedKw && exactSet[matchedKw] && !isWholeWord(spans)) {
                spans.forEach(function(el) {
                  el.style.setProperty('background-color', 'transparent');
                });
                return;
              }

              var hex = color || '#FFD700';
              var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
              spans.forEach(function(el) {
                el.style.setProperty('background-color', 'rgb(' + r + ' ' + g + ' ' + b + ' / 1)');
              });
            }

            // Process all highlights in document order, grouping .begin/.end fragments
            function colorAllHighlights() {
              var all = Array.from(doc.querySelectorAll('.textLayer .highlight'));
              var i = 0;
              while (i < all.length) {
                if (all[i].classList.contains('begin')) {
                  var group = [all[i++]];
                  while (i < all.length) {
                    group.push(all[i]);
                    if (all[i++].classList.contains('end')) break;
                  }
                  applyColor(group);
                } else {
                  applyColor([all[i++]]);
                }
              }
            }

            colorAllHighlights();

            // Debounced observer: re-color whenever new highlights are added (e.g. pages rendered on scroll)
            var debounceTimer = null;
            var observer = new MutationObserver(function(mutations) {
              var relevant = mutations.some(function(m) {
                return Array.from(m.addedNodes).some(function(n) {
                  return n.nodeType === 1 && (n.classList?.contains('highlight') || n.querySelector?.('.highlight'));
                });
              });
              if (!relevant) return;
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(colorAllHighlights, 50);
            });
            observer.observe(doc.body, { childList: true, subtree: true });
          } catch(e) { console.log('[KWHL] nested iframe error:', e); }
        });

        // Clear any existing find state first so PDF.js treats this as a fresh
        // search even if the same query was previously active (prevents no-op).
        bus.dispatch("find", {
          source: window, type: "", query: "",
          caseSensitive: false, entireWord: false, highlightAll: false,
          findPrevious: false, matchDiacritics: false,
        });

        // Dispatch find for all keywords at once
        setTimeout(function() {
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
        }, 0);
      })();
    `;
    iframeDoc.head.appendChild(scriptEl);
    scriptEl.remove();
  } catch (err) {
    Zotero.logError(err);
  }
  }
};

/*
 * Keyword Highlighter for Zotero 8
 * bootstrap.js – Lifecycle entry point
 */

var KeywordHighlighter;
var chromeHandle;

function startup({ id, version, rootURI }, reason) {
  // Chrome registrieren für settings.html
  var aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "chrome.manifest");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "keyword-highlighter", rootURI + "content/"],
    ["locale",  "keyword-highlighter", "en-US", rootURI + "locale/en-US/"],
    ["locale",  "keyword-highlighter", "de-DE", rootURI + "locale/de-DE/"],
    ["locale",  "keyword-highlighter", "es-ES", rootURI + "locale/es-ES/"],
    ["locale",  "keyword-highlighter", "fr-FR", rootURI + "locale/fr-FR/"],
  ]);

  Services.scriptloader.loadSubScript(rootURI + "content/keywordHighlighter.js");
  KeywordHighlighter.init({ id, version, rootURI });
  KeywordHighlighter.addToAllWindows();
}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  KeywordHighlighter.removeFromAllWindows();
  KeywordHighlighter = undefined;
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function onMainWindowLoad({ window }) {
  KeywordHighlighter?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  KeywordHighlighter?.removeFromWindow(window);
}

function install(data, reason) {}
function uninstall(data, reason) {}

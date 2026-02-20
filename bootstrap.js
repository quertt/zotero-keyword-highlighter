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

  // highlight.py aus der XPI in den Temp-Ordner extrahieren
  try {
    var pySourceURI = rootURI + "content/highlight.py";
    var tmpDir = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile);
    tmpDir.append("keyword-highlighter");
    if (!tmpDir.exists()) {
      tmpDir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
    }
    var pyDestFile = tmpDir.clone();
    pyDestFile.append("highlight.py");

    // Datei lesen und schreiben
    var channel = Services.io.newChannel2(
      pySourceURI, null, null, null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Components.interfaces.nsIContentPolicy.TYPE_OTHER
    );
    var inputStream = channel.open();
    var sis = Components.classes["@mozilla.org/scriptableinputstream;1"]
                .createInstance(Components.interfaces.nsIScriptableInputStream);
    sis.init(inputStream);
    var data = "";
    var chunk;
    while ((chunk = sis.read(65536))) data += chunk;
    sis.close();

    var fos = Components.classes["@mozilla.org/network/file-output-stream;1"]
                .createInstance(Components.interfaces.nsIFileOutputStream);
    fos.init(pyDestFile, 0x02 | 0x08 | 0x20, 0o644, 0);
    var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
                      .createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(fos, "UTF-8");
    converter.writeString(data);
    converter.close();
    fos.close();

    Services.prefs.setStringPref("extensions.keyword-highlighter.scriptPath", pyDestFile.path);
    Zotero.log("KWH: highlight.py extrahiert nach " + pyDestFile.path);
  } catch (e) {
    Zotero.logError(e);
    Zotero.log("KWH: Fehler beim Extrahieren von highlight.py: " + e.message);
  }

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

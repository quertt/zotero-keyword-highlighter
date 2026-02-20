/* Keyword Highlighter – Settings UI */

var args = null;
var cats = [];
var S = {};  // lokalisierte Strings

try {
  args = window.arguments && window.arguments[0];
  if (args && args.categories) {
    cats = JSON.parse(JSON.stringify(args.categories));
  }
  if (args && args.strings) {
    S = args.strings;
  }
} catch (e) {
  console.error("KWH settings: Fehler beim Lesen der Argumente", e);
}

// UI-Texte setzen
if (S.title)  document.title = S.title;
if (S.addCat) document.getElementById("add").textContent  = S.addCat;
if (S.save)   document.getElementById("save").textContent = S.save;
if (S.cancel) document.getElementById("cancel").textContent = S.cancel;

function makeCatRow(cat, index) {
  var div = document.createElement("div");
  div.className = "cat";
  div.dataset.index = index;

  var header = document.createElement("div");
  header.className = "cat-header";

  var nameInput = document.createElement("input");
  nameInput.type        = "text";
  nameInput.className   = "cat-name";
  nameInput.value       = cat.name;
  nameInput.placeholder = S.placeholder || "Category name";

  var delBtn = document.createElement("button");
  delBtn.className   = "del";
  delBtn.textContent = "\u2715";
  delBtn.addEventListener("click", function() {
    cats = collectCats();
    cats.splice(parseInt(div.dataset.index), 1);
    renderCats();
  });

  header.appendChild(nameInput);
  header.appendChild(delBtn);

  var label = document.createElement("span");
  label.className   = "kw-label";
  label.textContent = S.kwLabel || "Keywords (comma-separated)";

  var textarea = document.createElement("textarea");
  textarea.className   = "cat-kws";
  textarea.textContent = cat.keywords.join(", ");

  div.appendChild(header);
  div.appendChild(label);
  div.appendChild(textarea);

  return div;
}

function renderCats() {
  var container = document.getElementById("cats");
  while (container.firstChild) container.removeChild(container.firstChild);
  cats.forEach(function(cat, i) { container.appendChild(makeCatRow(cat, i)); });
}

function collectCats() {
  return Array.from(document.querySelectorAll(".cat")).map(function(row) {
    var nameEl = row.querySelector(".cat-name");
    var kwsEl  = row.querySelector(".cat-kws");
    return {
      name:     nameEl ? nameEl.value.trim() : "",
      keywords: kwsEl
        ? kwsEl.value.split(",").map(function(k) { return k.trim(); }).filter(Boolean)
        : []
    };
  });
}

document.getElementById("add").addEventListener("click", function() {
  cats = collectCats();
  cats.push({ name: "", keywords: [] });
  renderCats();
});

document.getElementById("save").addEventListener("click", function() {
  try {
    if (args && typeof args.callback === "function") args.callback(collectCats());
  } catch (e) {
    console.error("KWH: Fehler beim Speichern", e);
  }
  window.close();
});

document.getElementById("cancel").addEventListener("click", function() { window.close(); });

renderCats();

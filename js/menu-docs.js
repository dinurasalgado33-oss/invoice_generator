import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml } from "./utils.js";
import { saveConfig, CONFIG_KINDS } from "./data/config-store.js";
import { MENU_ITEMS } from "./data/menu.js";
import {
  MENU_DOCS, carriesDishes, branchCategories, categoriesFor,
  orphanCategories, menuDocConfigFor,
} from "./data/menu-docs.js";

// The wording around a printed menu, and which sections it carries.
//
// The dishes themselves were always configurable — Configure → Menu edits
// every name, description, category and price. What was not was the
// booklet around them: the cover, the notes under it, the closing line,
// and which categories each menu prints. All four sat in a const, which
// meant the seafood notice ("at least 4 hours in advance") was a kitchen
// policy that took a code change and a deploy to alter.
//
// Layout, artwork and palette stay fixed. They are the hotel's own Canva
// design rather than a setting, and HARDCODED-AUDIT §8 argues it that way.

const el = id => document.getElementById(id);

function docsForBranch() {
  return Object.entries(MENU_DOCS).filter(([, d]) => d.branch === appState.selectedBranch);
}

// A cover with no title prints a blank sheet, and a menu with no sections
// prints a cover and nothing after it. Both look like the app broke rather
// than like a choice, so they are caught here while the manager can still
// see what they did.
function problems() {
  const out = [];
  docsForBranch().forEach(([, doc]) => {
    if (!String(doc.cover.title || "").trim()) out.push(`"${doc.title}" has no cover title.`);
    if (carriesDishes(doc) && !categoriesFor(doc, MENU_ITEMS).length) {
      out.push(`"${doc.title}" has no sections ticked, so it would print an empty booklet.`);
    }
  });
  return out;
}

function showError(message) {
  const box = el("md-error");
  box.textContent = message || "";
  box.classList.toggle("show", Boolean(message));
}

function persist() {
  const found = problems();
  showError(found.join(" "));
  if (found.length) return false;
  saveConfig(appState.selectedBranch, CONFIG_KINDS.MENU_DOCS,
    menuDocConfigFor(appState.selectedBranch, MENU_ITEMS));
  return true;
}

// Said plainly rather than left to be discovered on a printed menu. An
// explicit tick-list is the price of being able to edit it at all, and the
// cost is that a category added next month prints nowhere until somebody
// ticks it — so the screen says which ones those are.
function renderOrphans() {
  const orphans = orphanCategories(MENU_ITEMS, appState.selectedBranch);
  const box = el("md-orphans");
  if (!orphans.length) {
    box.textContent = "";
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.textContent = orphans.length === 1
    ? `“${orphans[0]}” is on no menu — its dishes print nowhere.`
    : `${orphans.length} sections are on no menu, so their dishes print nowhere: ${orphans.join(", ")}.`;
}

function render() {
  el("md-scope").textContent =
    `${appState.selectedBranchLabel || appState.selectedBranch} — the wording on each printed menu, and what goes on it.`;
  renderOrphans();

  const all = branchCategories(MENU_ITEMS, appState.selectedBranch);

  el("md-docs").innerHTML = docsForBranch().map(([key, doc]) => {
    const notes = doc.notes || [];
    const carried = carriesDishes(doc) ? categoriesFor(doc, MENU_ITEMS) : [];
    return `
    <div class="md-doc" data-doc="${escapeHtml(key)}">
      <h3 class="md-doc-title">${escapeHtml(doc.title)}</h3>

      <label class="md-label" for="md-cover-title-${escapeHtml(key)}">Cover title</label>
      <input type="text" id="md-cover-title-${escapeHtml(key)}" class="md-field md-cover-title" data-doc="${escapeHtml(key)}"
             value="${escapeHtml(doc.cover.title || "")}" placeholder="e.g. MENU" />

      <label class="md-label" for="md-cover-sub-${escapeHtml(key)}">Cover subtitle</label>
      <input type="text" id="md-cover-sub-${escapeHtml(key)}" class="md-field md-cover-sub" data-doc="${escapeHtml(key)}"
             value="${escapeHtml(doc.cover.sub || "")}" placeholder="e.g. Wilpattu Forest Retreat" />

      <p class="md-label">Notes under the cover</p>
      <div class="md-notes">
        ${notes.length ? notes.map((note, ni) => `
          <div class="md-note-row">
            <input type="text" class="md-note" data-doc="${escapeHtml(key)}" data-note="${ni}"
                   value="${escapeHtml(note)}" aria-label="Note ${ni + 1} on ${escapeHtml(doc.title)}" />
            <button type="button" class="md-note-del" data-doc="${escapeHtml(key)}" data-note="${ni}"
                    aria-label="Remove note: ${escapeHtml(note)}" title="Remove this note">&#10005;</button>
          </div>`).join("") : `<p class="md-empty">No notes.</p>`}
      </div>
      <div class="md-note-add">
        <input type="text" class="md-new-note" data-doc="${escapeHtml(key)}"
               placeholder="Add a note" aria-label="Add a note to ${escapeHtml(doc.title)}" />
        <button type="button" class="secondary-btn md-add-note" data-doc="${escapeHtml(key)}">Add</button>
      </div>

      <label class="md-label" for="md-foot-${escapeHtml(key)}">Closing line</label>
      <input type="text" id="md-foot-${escapeHtml(key)}" class="md-field md-foot" data-doc="${escapeHtml(key)}"
             value="${escapeHtml(doc.foot || "")}" placeholder="e.g. Thank you — we hope you enjoy your stay." />

      ${carriesDishes(doc) ? `
        <p class="md-label">Sections on this menu</p>
        <div class="md-cats">
          ${all.map(cat => `
            <label class="md-cat">
              <input type="checkbox" class="md-cat-box" data-doc="${escapeHtml(key)}" value="${escapeHtml(cat)}"
                     ${carried.includes(cat) ? "checked" : ""} />
              <span>${escapeHtml(cat)}</span>
            </label>`).join("")}
        </div>` : `
        <p class="md-empty">Its courses and inclusions are edited on the board menu screen.</p>`}
    </div>`;
  }).join("") || `<p class="room-detail-empty">This property has no printed menus.</p>`;

  wire();
}

function docFor(node) {
  return MENU_DOCS[node.dataset.doc];
}

// On blur rather than per keystroke, matching the board menu editor — a
// manager typing a closing line would otherwise be one write per letter.
function bindText(selector, apply) {
  document.querySelectorAll(selector).forEach(input => {
    input.addEventListener("blur", () => {
      const doc = docFor(input);
      if (!doc) return;
      apply(doc, input.value, input.dataset.note === undefined ? null : Number(input.dataset.note));
      persist();
    });
  });
}

function addNote(key) {
  const field = document.querySelector(`.md-new-note[data-doc="${CSS.escape(key)}"]`);
  if (!field) return;
  const text = field.value.trim();
  if (!text) { field.focus(); return; }
  MENU_DOCS[key].notes = (MENU_DOCS[key].notes || []).concat(text);
  persist();
  render();
  const again = document.querySelector(`.md-new-note[data-doc="${CSS.escape(key)}"]`);
  if (again) again.focus();
}

function wire() {
  bindText(".md-cover-title", (doc, v) => { doc.cover = { ...doc.cover, title: v.trim() }; });
  bindText(".md-cover-sub", (doc, v) => { doc.cover = { ...doc.cover, sub: v.trim() }; });
  bindText(".md-foot", (doc, v) => { doc.foot = v.trim(); });

  // Emptying a note removes it, which shifts every index after it — so the
  // screen is rebuilt rather than left pointing a row at the wrong note.
  // Same reasoning as the board menu's dishes.
  document.querySelectorAll(".md-note").forEach(input => {
    input.addEventListener("blur", () => {
      const doc = docFor(input);
      const ni = Number(input.dataset.note);
      if (!doc || !Array.isArray(doc.notes) || ni >= doc.notes.length) return;
      const emptied = !input.value.trim();
      const next = doc.notes.slice();
      next[ni] = input.value.trim();
      doc.notes = next.filter(Boolean);
      persist();
      if (emptied) render();
    });
  });

  document.querySelectorAll(".md-note-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const doc = docFor(btn);
      const ni = Number(btn.dataset.note);
      if (!doc || !Array.isArray(doc.notes) || ni >= doc.notes.length) return;
      const next = doc.notes.slice();
      next.splice(ni, 1);
      doc.notes = next;
      persist();
      render();
    });
  });

  document.querySelectorAll(".md-add-note").forEach(btn => {
    btn.addEventListener("click", () => addNote(btn.dataset.doc));
  });

  document.querySelectorAll(".md-new-note").forEach(field => {
    field.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      addNote(field.dataset.doc);
    });
    // No commit-on-blur: it would re-render this document mid-blur and a
    // tap aimed at a checkbox below would land on a node that no longer
    // existed. The typed text stays visible beside its own Add button.
  });

  // Ticking writes an explicit list, which is what replaces the shipped
  // only/exclude pair for this document from here on.
  document.querySelectorAll(".md-cat-box").forEach(box => {
    box.addEventListener("change", () => {
      const doc = docFor(box);
      if (!doc) return;
      const ticked = [...document.querySelectorAll(`.md-cat-box[data-doc="${CSS.escape(box.dataset.doc)}"]`)]
        .filter(b => b.checked)
        .map(b => b.value);
      doc.categories = ticked;
      // Untick everything and the menu is empty — persist() refuses, and
      // the box has to stay as the manager left it so they can see what
      // they did and put one back.
      persist();
      renderOrphans();
    });
  });
}

el("open-menu-docs-btn").addEventListener("click", () => {
  showError("");
  render();
  showScreen("screen-menu-docs");
});

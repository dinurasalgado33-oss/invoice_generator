import { appState } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";
import { MENU_ITEMS } from "./data/menu.js";
import { MENU_DOCS, openMenuPdf, downloadMenuPdf } from "./menu-pdf.js";

// The Menu PDFs panel on the Menu Config screen. Two menus per property,
// matching the printed booklets, each with a link that opens the PDF and a
// button that saves it. Both are built at the moment they are pressed, so
// they always carry the menu as it stands rather than a stale export.

function docsForBranch(branch) {
  return Object.entries(MENU_DOCS).filter(([, d]) => d.branch === branch);
}

function countFor(doc) {
  return MENU_ITEMS.filter(d =>
    d.branch === doc.branch &&
    (doc.only ? doc.only.includes(d.category) : true) &&
    (doc.exclude ? !doc.exclude.includes(d.category) : true)
  ).length;
}

async function withBusy(btn, label, fn) {
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } catch (err) {
    console.error("Menu PDF failed:", err);
    showToast(err.message || "Couldn't build the menu PDF");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export function refreshDigitalMenuPanel() {
  const branch = appState.selectedBranch;
  const list = document.getElementById("menu-pdf-list");
  if (!branch || !list) return;

  const docs = docsForBranch(branch);
  list.innerHTML = docs.map(([key, doc]) => {
    // The board menu is fixed text, not dish rows — saying "68 dishes"
    // against it would be a lie.
    const count = doc.board ? "Set inclusions" : `${countFor(doc)} dishes`;
    return `
      <div class="menu-pdf-row">
        <div class="menu-pdf-meta">
          <span class="menu-pdf-name">${escapeHtml(doc.title)}</span>
          <span class="menu-pdf-count">${escapeHtml(count)}</span>
        </div>
        <div class="menu-pdf-actions">
          <button type="button" class="menu-pdf-open" data-menu="${key}">Open PDF</button>
          <button type="button" class="menu-pdf-save" data-menu="${key}" aria-label="Save ${escapeHtml(doc.title)} as PDF">Save</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".menu-pdf-open").forEach(btn => {
    btn.addEventListener("click", () => withBusy(btn, "Building…", async () => {
      await openMenuPdf(btn.dataset.menu);
    }));
  });
  list.querySelectorAll(".menu-pdf-save").forEach(btn => {
    btn.addEventListener("click", () => withBusy(btn, "…", async () => {
      await downloadMenuPdf(btn.dataset.menu);
      showToast("Menu saved");
    }));
  });

  const mine = MENU_ITEMS.filter(d => d.branch === branch);
  const unpriced = mine.filter(d => !(d.price > 0)).length;
  const status = document.getElementById("digital-menu-status");
  if (status) {
    status.textContent = `${docs.length} menus · ${mine.length} dishes${unpriced ? ` · ${unpriced} without a price` : ""}`;
  }
  const hint = document.getElementById("digital-menu-hint");
  if (hint) {
    hint.textContent = unpriced
      ? "Built from this screen every time, so an edit shows immediately. A dish with no price prints as a dash."
      : "Built from this screen every time, so an edit shows in the PDF immediately.";
  }
}

import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, showToast } from "./utils.js";
import { confirmAction } from "./confirm.js";
import { saveConfig, saveShared, CONFIG_KINDS } from "./data/config-store.js";
import { ROOM_TYPES, MEAL_PLANS } from "./data/grc.js";
import { MENU_CATEGORIES } from "./data/menu.js";
import { INVENTORY_CATEGORIES, INVENTORY_UNITS, USAGE_REASONS } from "./data/inventory.js";

// The short lists that feed dropdowns all over the app — room types, meal
// plans, menu and inventory categories, units, usage reasons.
//
// One screen rather than seven. They are all the same shape (a list of
// short strings a manager occasionally appends to) and all rarely
// touched, so seven separate screens would be six more places to find and
// six more near-identical implementations to keep in step.
//
// Most are per property, because one hotel's meal plans need not be the
// other's. Units are shared: a kilogram is a kilogram at both, and a
// manager adding one at Wilpattu would be baffled to find Arugam Bay
// still without it.

const el = id => document.getElementById(id);

const LISTS = {
  roomTypes: {
    label: "Room types",
    array: ROOM_TYPES,
    kind: CONFIG_KINDS.ROOM_TYPES,
    shared: false,
    note: "Offered on the registration card.",
  },
  mealPlans: {
    label: "Meal plans",
    array: MEAL_PLANS,
    kind: CONFIG_KINDS.MEAL_PLANS,
    shared: false,
    note: "R/O, B/B and so on. Printed on the registration card.",
  },
  menuCategories: {
    label: "Menu categories",
    array: MENU_CATEGORIES,
    kind: CONFIG_KINDS.MENU_CATEGORIES,
    shared: false,
    note: "How dishes are grouped on the menu and the printed PDF.",
  },
  inventoryCategories: {
    label: "Inventory categories",
    array: INVENTORY_CATEGORIES,
    kind: CONFIG_KINDS.INVENTORY_CATEGORIES,
    shared: false,
    note: "A category not listed under a department still appears, grouped as Other.",
  },
  inventoryUnits: {
    label: "Inventory units",
    array: INVENTORY_UNITS,
    kind: CONFIG_KINDS.INVENTORY_UNITS,
    shared: true,
    note: "A kilogram is a kilogram.",
  },
  usageReasons: {
    label: "Stock usage reasons",
    array: USAGE_REASONS,
    kind: CONFIG_KINDS.USAGE_REASONS,
    shared: false,
    note: "Why stock left the shelf. This is the vocabulary of the stock audit trail.",
  },
};

let current = "roomTypes";

function showError(message) {
  const box = el("ml-error");
  box.textContent = message || "";
  box.classList.toggle("show", Boolean(message));
}

function persist() {
  const cfg = LISTS[current];
  if (cfg.shared) saveShared(cfg.kind, cfg.array);
  else saveConfig(appState.selectedBranch, cfg.kind, cfg.array);
}

function render() {
  const cfg = LISTS[current];
  el("ml-scope").textContent =
    (cfg.shared ? "Shared by both properties. " : `${appState.selectedBranchLabel || appState.selectedBranch} only. `) + cfg.note;

  const list = el("ml-entries");
  if (!cfg.array.length) {
    list.innerHTML = `<p class="room-detail-empty">Nothing in this list yet.</p>`;
    return;
  }
  list.innerHTML = cfg.array.map((entry, i) => `
    <div class="ml-row">
      <span class="ml-row-text">${escapeHtml(entry)}</span>
      <button type="button" class="secondary-btn ml-remove-btn" data-index="${i}"
              aria-label="Remove ${escapeHtml(entry)}">Remove</button>
    </div>`).join("");

  list.querySelectorAll(".ml-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => removeEntry(Number(btn.dataset.index)));
  });
}

async function removeEntry(index) {
  const cfg = LISTS[current];
  const entry = cfg.array[index];
  if (entry === undefined) return;

  // Removing one of these does not touch records that already use it — a
  // registration card keeps the room type it was written with. It only
  // stops the option being offered from here on.
  const ok = await confirmAction({
    title: `Remove "${entry}"?`,
    message: "It stops being offered on new records. Anything already using it keeps it.",
    confirmLabel: "Remove",
    tone: "danger",
  });
  if (!ok) return;

  cfg.array.splice(index, 1);
  persist();
  render();
  showToast(`${entry} removed`);
}

el("ml-add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const cfg = LISTS[current];
  const value = el("ml-new").value.trim();
  if (!value) return;

  // Case-insensitive, because "Twin" and "twin" in the same dropdown is
  // the same duplication problem the suggestion list exists to prevent.
  if (cfg.array.some(v => v.toLowerCase() === value.toLowerCase())) {
    showError("That is already in the list.");
    return;
  }
  showError("");
  cfg.array.push(value);
  persist();
  el("ml-new").value = "";
  render();
  showToast(`${value} added`);
});

el("ml-picker").addEventListener("change", () => {
  current = el("ml-picker").value;
  showError("");
  render();
});

el("open-manage-lists-btn").addEventListener("click", () => {
  el("ml-picker").innerHTML = Object.entries(LISTS)
    .map(([key, cfg]) => `<option value="${key}">${escapeHtml(cfg.label)}</option>`)
    .join("");
  el("ml-picker").value = current;
  showError("");
  render();
  showScreen("screen-manage-lists");
});

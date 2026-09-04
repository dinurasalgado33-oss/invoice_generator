import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, showToast } from "./utils.js";
import { confirmAction } from "./confirm.js";
import { saveConfig, saveShared, CONFIG_KINDS } from "./data/config-store.js";
import { ROOM_TYPES, MEAL_PLANS } from "./data/grc.js";
import { MENU_CATEGORIES } from "./data/menu.js";
import { bookingSourcesFor, CURRENCIES } from "./data/charges.js";
import {
  INVENTORY_CATEGORIES, INVENTORY_UNITS, USAGE_REASONS,
  INVENTORY_DEPARTMENTS, CATEGORY_DEPARTMENT,
} from "./data/inventory.js";

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

// Every list here is stored once, shared by both properties, because
// every list here IS one array — ROOM_TYPES and the rest are single
// module-level arrays that both properties read. Storing them per
// property gave the same fact two homes: a manager editing room types
// at Wilpattu wrote Wilpattu__roomTypes, hydration then applied
// Wilpattu's copy and immediately overwrote it with Arugam Bay's, and
// the edit vanished on the next reload with nothing to show it ever
// happened. Last property in the list won.
//
// If one of these ever genuinely needs to differ per property, the
// array has to become per-property first, in the module that owns it.
// Changing only the storage recreates the bug.
const LISTS = {
  roomTypes: {
    label: "Room types",
    array: ROOM_TYPES,
    kind: CONFIG_KINDS.ROOM_TYPES,
    shared: true,
    note: "Offered on the registration card.",
  },
  mealPlans: {
    label: "Meal plans",
    array: MEAL_PLANS,
    kind: CONFIG_KINDS.MEAL_PLANS,
    shared: true,
    note: "R/O, B/B and so on. Printed on the registration card.",
  },
  menuCategories: {
    label: "Menu categories",
    array: MENU_CATEGORIES,
    kind: CONFIG_KINDS.MENU_CATEGORIES,
    shared: true,
    note: "How dishes are grouped on the menu and the printed PDF.",
  },
  inventoryCategories: {
    label: "Inventory categories",
    array: INVENTORY_CATEGORIES,
    kind: CONFIG_KINDS.INVENTORY_CATEGORIES,
    shared: true,
    note: "Each one sits under a department on the stock screen. Leave it unassigned and it still appears, grouped as Other.",
    // The one list whose entries carry something besides their name.
    // Declared here rather than special-cased in render(), so the editor
    // stays one editor.
    picker: {
      options: () => INVENTORY_DEPARTMENTS,
      value: category => CATEGORY_DEPARTMENT[category] || "",
      set: (category, department) => {
        if (department) CATEGORY_DEPARTMENT[category] = department;
        else delete CATEGORY_DEPARTMENT[category];
        saveShared(CONFIG_KINDS.CATEGORY_DEPARTMENTS, { ...CATEGORY_DEPARTMENT });
      },
      blank: "Other",
    },
  },
  inventoryDepartments: {
    label: "Inventory departments",
    array: INVENTORY_DEPARTMENTS,
    kind: CONFIG_KINDS.INVENTORY_DEPARTMENTS,
    shared: true,
    note: "How the stock screen groups categories. Removing one drops its categories into Other rather than hiding them.",
  },
  inventoryUnits: {
    label: "Inventory units",
    array: INVENTORY_UNITS,
    kind: CONFIG_KINDS.INVENTORY_UNITS,
    shared: true,
    note: "A kilogram is a kilogram.",
  },
  bookingSources: {
    label: "Booking sources",
    arrayFor: () => bookingSourcesFor(appState.selectedBranch),
    kind: CONFIG_KINDS.BOOKING_SOURCES,
    shared: false,
    note: "Where the booking came from — walk-in, an OTA, an agent.",
  },
  currencies: {
    label: "Currencies",
    array: CURRENCIES,
    kind: CONFIG_KINDS.CURRENCIES,
    shared: true,
    note: "Offered on the guest invoice and the travel agent invoice.",
  },
  usageReasons: {
    label: "Stock usage reasons",
    array: USAGE_REASONS,
    kind: CONFIG_KINDS.USAGE_REASONS,
    shared: true,
    note: "Why stock left the shelf. This is the vocabulary of the stock audit trail.",
  },
};

// Most lists are one shared array. Booking sources are per property, so
// the array itself changes when the branch does — resolved on each use
// rather than captured once when this module loaded.
function arrayOf(cfg) {
  return cfg.arrayFor ? cfg.arrayFor() : cfg.array;
}

let current = "roomTypes";

function showError(message) {
  const box = el("ml-error");
  box.textContent = message || "";
  box.classList.toggle("show", Boolean(message));
}

function persist() {
  const cfg = LISTS[current];
  if (cfg.shared) saveShared(cfg.kind, arrayOf(cfg));
  else saveConfig(appState.selectedBranch, cfg.kind, arrayOf(cfg));
}

function render() {
  const cfg = LISTS[current];
  el("ml-scope").textContent =
    (cfg.shared ? "Shared by both properties. " : `${appState.selectedBranchLabel || appState.selectedBranch} only. `) + cfg.note;

  const list = el("ml-entries");
  if (!arrayOf(cfg).length) {
    list.innerHTML = `<p class="room-detail-empty">Nothing in this list yet.</p>`;
    return;
  }
  const picker = cfg.picker;
  list.innerHTML = arrayOf(cfg).map((entry, i) => {
    const select = picker ? `
      <select class="ml-row-picker" data-entry="${escapeHtml(entry)}"
              aria-label="Department for ${escapeHtml(entry)}">
        <option value="">${escapeHtml(picker.blank)}</option>
        ${picker.options().map(o => `
          <option value="${escapeHtml(o)}"${picker.value(entry) === o ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}
      </select>` : "";
    return `
    <div class="ml-row">
      <span class="ml-row-text">${escapeHtml(entry)}</span>
      ${select}
      <button type="button" class="secondary-btn ml-remove-btn" data-index="${i}"
              aria-label="Remove ${escapeHtml(entry)}">Remove</button>
    </div>`;
  }).join("");

  list.querySelectorAll(".ml-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => removeEntry(Number(btn.dataset.index)));
  });

  list.querySelectorAll(".ml-row-picker").forEach(sel => {
    sel.addEventListener("change", () => {
      picker.set(sel.dataset.entry, sel.value);
      showToast(sel.value
        ? `${sel.dataset.entry} moved to ${sel.value}`
        : `${sel.dataset.entry} moved to ${picker.blank}`);
    });
  });
}

async function removeEntry(index) {
  const cfg = LISTS[current];
  const entry = arrayOf(cfg)[index];
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

  arrayOf(cfg).splice(index, 1);
  // A removed category should not leave its department behind. Nothing
  // reads a stale entry, but a map that only ever grows is a map nobody
  // can read either.
  if (cfg.picker) cfg.picker.set(entry, "");
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
  if (arrayOf(cfg).some(v => v.toLowerCase() === value.toLowerCase())) {
    showError("That is already in the list.");
    return;
  }
  showError("");
  arrayOf(cfg).push(value);
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

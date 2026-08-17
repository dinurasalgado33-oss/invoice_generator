import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, setLogoSrc, showToast, fmtLKR, todayISO } from "./utils.js";
import {
  INVENTORY_BY_BRANCH, INVENTORY_CATEGORIES, INVENTORY_DEPARTMENTS, INVENTORY_UNITS,
  allocateInventoryItemId, RESTOCK_LOG, allocateRestockId,
} from "./data/inventory.js";
import { confirmAction } from "./confirm.js";

// Inventory is fully editable by every role — staff need to be able to
// log stock changes day to day without waiting on a manager.
let editingItemId = null;

// Department > category > item. Everything starts collapsed so the table
// opens short — staff drill down into only what they need.
const collapsedDepartments = new Set(INVENTORY_DEPARTMENTS.map(d => d.name));
const collapsedCategories = new Set(INVENTORY_CATEGORIES);

// Search / low-stock filter — bypasses the department/category hierarchy
// entirely and shows a flat, immediately-scannable list of matches.
let searchQuery = "";
let lowOnly = false;

// Bulk restock — swaps the stock/adjust/edit columns for qty+cost inputs
// on every visible row. Entries persist here (not just in the DOM) so
// they survive a search filter or collapse toggle re-render.
let bulkMode = false;
const bulkEntries = {}; // itemId -> { qty, unitCost } (raw input strings)

export function updateInventoryBadge() {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
  const lowCount = inventory.filter(i => i.stock < i.minStock).length;
  const badge = document.getElementById("inventory-low-badge");
  const subtext = document.getElementById("inventory-card-subtext");

  badge.style.display = lowCount > 0 ? "" : "none";
  badge.textContent = lowCount;
  subtext.textContent = lowCount > 0
    ? `${lowCount} item${lowCount === 1 ? "" : "s"} running low`
    : "Track stock and supplies";
}

function logRestock(branch, item, qty, unitCost, date) {
  RESTOCK_LOG.push({
    id: allocateRestockId(),
    itemId: item.id,
    branch,
    itemName: item.name,
    category: item.category,
    unit: item.unit,
    qty,
    unitCost,
    totalCost: Math.round(qty * unitCost * 100) / 100,
    date,
  });
  item.stock = Math.round((item.stock + qty) * 100) / 100;
  item.costPerUnit = unitCost;
}

function renderInventoryRow(item, hidden, showCategoryTag) {
  const isLow = item.stock < item.minStock;

  if (bulkMode) {
    const entry = bulkEntries[item.id] || {};
    return `
      <tr class="list-item-row" data-item-id="${item.id}" data-category="${escapeHtml(item.category)}" ${hidden ? 'style="display:none"' : ""}>
        <td class="list-td-name">${escapeHtml(item.name)}${showCategoryTag ? `<span class="list-item-tag">${escapeHtml(item.category)}</span>` : ""}</td>
        <td colspan="3">
          <div class="bulk-restock-inputs">
            <input type="number" class="bulk-qty-input" data-item-id="${item.id}" placeholder="Qty (${escapeHtml(item.unit)})" min="0" step="0.01" inputmode="decimal" value="${entry.qty ?? ""}">
            <input type="number" class="bulk-cost-input" data-item-id="${item.id}" placeholder="Unit cost" min="0" step="0.01" inputmode="decimal" value="${entry.unitCost ?? item.costPerUnit ?? ""}">
          </div>
        </td>
      </tr>
    `;
  }

  return `
    <tr class="list-item-row ${isLow ? "low-stock" : ""}" data-item-id="${item.id}" data-category="${escapeHtml(item.category)}" ${hidden ? 'style="display:none"' : ""}>
      <td class="list-td-name">${escapeHtml(item.name)}${showCategoryTag ? `<span class="list-item-tag">${escapeHtml(item.category)}</span>` : ""}</td>
      <td class="inv-td-stock">
        <span class="stock-badge ${isLow ? "low" : ""}">${isLow ? "Low" : "OK"}</span>
        <strong>${item.stock}${escapeHtml(item.unit)}</strong>
        <span class="inv-td-min">/ ${item.minStock}${escapeHtml(item.unit)} min</span>
      </td>
      <td class="inv-td-adjust">
        <button type="button" class="stock-adjust-btn" data-item-id="${item.id}" data-delta="-1" aria-label="Decrease ${escapeHtml(item.name)}">&minus;</button>
        <button type="button" class="stock-adjust-btn" data-item-id="${item.id}" data-delta="1" aria-label="Increase ${escapeHtml(item.name)}">+</button>
      </td>
      <td class="inv-td-actions">
        <button type="button" class="list-restock-btn" data-item-id="${item.id}" aria-label="Restock ${escapeHtml(item.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        </button>
        <button type="button" class="list-edit-btn" data-item-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      </td>
    </tr>
  `;
}

function renderCategoryRow(category, items, hidden) {
  const isCollapsed = collapsedCategories.has(category);
  const lowCount = items.filter(i => i.stock < i.minStock).length;
  return `
    <tr class="list-group-row ${isCollapsed ? "collapsed" : ""}" data-category="${escapeHtml(category)}" ${hidden ? 'style="display:none"' : ""}>
      <td colspan="4">
        <span class="list-group-toggle">
          <svg class="list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          ${escapeHtml(category)}
          <span class="list-group-count">${items.length} item${items.length === 1 ? "" : "s"}${lowCount ? ` &middot; ${lowCount} low` : ""}</span>
          ${bulkMode ? "" : `
          <button type="button" class="list-group-add-btn" data-category="${escapeHtml(category)}" aria-label="Add item to ${escapeHtml(category)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
          </button>`}
        </span>
      </td>
    </tr>
  `;
}

function renderDepartmentRow(department, categories, groups) {
  const isCollapsed = collapsedDepartments.has(department);
  const allItems = categories.flatMap(c => groups[c]);
  const lowCount = allItems.filter(i => i.stock < i.minStock).length;
  return `
    <tr class="inv-dept-row ${isCollapsed ? "collapsed" : ""}" data-department="${escapeHtml(department)}">
      <td colspan="4">
        <span class="inv-dept-toggle">
          <svg class="list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          ${escapeHtml(department)}
          <span class="inv-dept-count">${allItems.length} item${allItems.length === 1 ? "" : "s"}${lowCount ? ` &middot; ${lowCount} low` : ""}</span>
        </span>
      </td>
    </tr>
  `;
}

function renderInventoryScreen() {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
  const list = document.getElementById("inventory-list");
  const table = document.getElementById("inventory-table");
  const statusEl = document.getElementById("inventory-search-status");
  const legendEl = document.getElementById("inventory-legend");

  const query = searchQuery.trim().toLowerCase();
  const isFiltering = !!query || lowOnly;
  table.classList.toggle("filtered", isFiltering);
  legendEl.style.display = isFiltering || bulkMode ? "none" : "";

  if (isFiltering) {
    const matches = inventory
      .filter(item => {
        const matchesQuery = !query || item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
        const matchesLow = !lowOnly || item.stock < item.minStock;
        return matchesQuery && matchesLow;
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    list.innerHTML = matches.map(item => renderInventoryRow(item, false, true)).join("") ||
      `<tr><td colspan="4" class="room-detail-empty">No items match.</td></tr>`;

    statusEl.style.display = "";
    statusEl.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"}`;
  } else {
    const groups = {};
    inventory.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    Object.values(groups).forEach(items => items.sort((a, b) => a.name.localeCompare(b.name)));

    list.innerHTML = INVENTORY_DEPARTMENTS.map(dept => {
      const categories = dept.categories.filter(c => groups[c] && groups[c].length);
      if (!categories.length) return "";
      const isDeptCollapsed = collapsedDepartments.has(dept.name);
      const categoryRows = categories.map(category => {
        const items = groups[category];
        const isCatCollapsed = collapsedCategories.has(category);
        return renderCategoryRow(category, items, isDeptCollapsed) +
          items.map(item => renderInventoryRow(item, isDeptCollapsed || isCatCollapsed, false)).join("");
      }).join("");
      return renderDepartmentRow(dept.name, categories, groups) + categoryRows;
    }).join("") || `<tr><td colspan="4" class="room-detail-empty">No inventory items yet.</td></tr>`;

    statusEl.style.display = "none";
  }

  list.querySelectorAll(".inv-dept-row").forEach(row => {
    row.addEventListener("click", () => {
      const dept = row.dataset.department;
      if (collapsedDepartments.has(dept)) collapsedDepartments.delete(dept);
      else collapsedDepartments.add(dept);
      renderInventoryScreen();
    });
  });
  list.querySelectorAll(".list-group-row").forEach(row => {
    row.addEventListener("click", () => {
      const category = row.dataset.category;
      if (collapsedCategories.has(category)) collapsedCategories.delete(category);
      else collapsedCategories.add(category);
      renderInventoryScreen();
    });
  });

  if (bulkMode) {
    list.querySelectorAll(".bulk-qty-input").forEach(input => {
      input.addEventListener("input", () => {
        const entry = bulkEntries[input.dataset.itemId] || (bulkEntries[input.dataset.itemId] = {});
        entry.qty = input.value;
        updateBulkRestockBar();
      });
    });
    list.querySelectorAll(".bulk-cost-input").forEach(input => {
      input.addEventListener("input", () => {
        const entry = bulkEntries[input.dataset.itemId] || (bulkEntries[input.dataset.itemId] = {});
        entry.unitCost = input.value;
        updateBulkRestockBar();
      });
    });
    updateBulkRestockBar();
    return;
  }

  list.querySelectorAll(".list-group-add-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openItemSheet(null, btn.dataset.category);
    });
  });
  list.querySelectorAll(".stock-adjust-btn").forEach(btn => {
    btn.addEventListener("click", () => adjustInventoryStock(Number(btn.dataset.itemId), Number(btn.dataset.delta)));
  });
  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openItemSheet(Number(btn.dataset.itemId)));
  });
  list.querySelectorAll(".list-restock-btn").forEach(btn => {
    btn.addEventListener("click", () => openRestockSheet(Number(btn.dataset.itemId)));
  });
}

function adjustInventoryStock(itemId, delta) {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch];
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  item.stock = Math.max(0, Math.round((item.stock + delta) * 100) / 100);
  renderInventoryScreen();
  updateInventoryBadge();
}

// ---- Add / edit / delete inventory item ----
function populateSelect(id, options, selected) {
  document.getElementById(id).innerHTML = options.map(o =>
    `<option value="${o}" ${o === selected ? "selected" : ""}>${o}</option>`
  ).join("");
}

function openItemSheet(itemId = null, presetCategory = null) {
  editingItemId = itemId;
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
  const item = itemId ? inventory.find(i => i.id === itemId) : null;

  document.getElementById("item-sheet-title").textContent = item ? "Edit Inventory Item" : "Add Inventory Item";
  populateSelect("item-category", INVENTORY_CATEGORIES, item ? item.category : (presetCategory || INVENTORY_CATEGORIES[0]));
  populateSelect("item-unit", INVENTORY_UNITS, item ? item.unit : INVENTORY_UNITS[0]);
  document.getElementById("item-name").value = item ? item.name : "";
  document.getElementById("item-stock").value = item ? item.stock : "0";
  document.getElementById("item-min-stock").value = item ? item.minStock : "0";
  document.getElementById("item-cost").value = item ? item.costPerUnit : "0";
  document.getElementById("item-delete-btn").style.display = item ? "" : "none";
  document.getElementById("item-name-error").classList.remove("show");
  document.getElementById("item-name").classList.remove("invalid");

  document.getElementById("item-sheet-overlay").classList.add("open");
}

function closeItemSheet() {
  document.getElementById("item-sheet-overlay").classList.remove("open");
}

document.getElementById("add-inventory-item-btn").addEventListener("click", () => openItemSheet(null));
document.getElementById("item-sheet-close").addEventListener("click", closeItemSheet);
document.getElementById("item-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "item-sheet-overlay") closeItemSheet();
});

document.getElementById("item-name").addEventListener("input", () => {
  document.getElementById("item-name-error").classList.remove("show");
  document.getElementById("item-name").classList.remove("invalid");
});

document.getElementById("item-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("item-name").value.trim();
  if (!name) return;

  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch];

  const duplicate = inventory.some(i => i.id !== editingItemId && i.name.trim().toLowerCase() === name.toLowerCase());
  if (duplicate) {
    document.getElementById("item-name-error").classList.add("show");
    document.getElementById("item-name").classList.add("invalid");
    document.getElementById("item-name").focus();
    return;
  }

  const category = document.getElementById("item-category").value;
  const unit = document.getElementById("item-unit").value;
  const stock = parseFloat(document.getElementById("item-stock").value) || 0;
  const minStock = parseFloat(document.getElementById("item-min-stock").value) || 0;
  const costPerUnit = parseFloat(document.getElementById("item-cost").value) || 0;

  if (editingItemId) {
    const item = inventory.find(i => i.id === editingItemId);
    Object.assign(item, { name, category, unit, stock, minStock, costPerUnit });
    showToast(`${name} updated`);
  } else {
    inventory.push({ id: allocateInventoryItemId(), name, category, unit, stock, minStock, costPerUnit });
    showToast(`${name} added`);
  }

  closeItemSheet();
  renderInventoryScreen();
  updateInventoryBadge();
});

document.getElementById("item-delete-btn").addEventListener("click", async () => {
  if (!editingItemId) return;
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch];
  const item = inventory.find(i => i.id === editingItemId);
  if (!item) return;
  const ok = await confirmAction({
    title: "Remove this item?",
    message: `Remove "${item.name}" from inventory?`,
    confirmLabel: "Remove Item",
    tone: "danger",
  });
  if (!ok) return;

  const idx = inventory.findIndex(i => i.id === editingItemId);
  inventory.splice(idx, 1);
  closeItemSheet();
  renderInventoryScreen();
  updateInventoryBadge();
  showToast(`${item.name} removed`);
});

// ---- Restock (single item) — logs qty + cost, distinct from the quick
// +/- stepper which is for corrections/usage and carries no cost. ----
let restockingItemId = null;

function openRestockSheet(itemId) {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  restockingItemId = itemId;

  document.getElementById("restock-sheet-title").textContent = `Restock ${item.name}`;
  document.getElementById("restock-current-stock").textContent = `Current stock: ${item.stock}${item.unit}`;
  document.getElementById("restock-qty").value = "";
  document.getElementById("restock-unit-cost").value = item.costPerUnit || "";
  document.getElementById("restock-total-cost").textContent = fmtLKR(0);
  document.getElementById("restock-sheet-overlay").classList.add("open");
}

function closeRestockSheet() {
  document.getElementById("restock-sheet-overlay").classList.remove("open");
  restockingItemId = null;
}

function updateRestockTotal() {
  const qty = parseFloat(document.getElementById("restock-qty").value) || 0;
  const cost = parseFloat(document.getElementById("restock-unit-cost").value) || 0;
  document.getElementById("restock-total-cost").textContent = fmtLKR(qty * cost);
}

document.getElementById("restock-qty").addEventListener("input", updateRestockTotal);
document.getElementById("restock-unit-cost").addEventListener("input", updateRestockTotal);
document.getElementById("restock-sheet-close").addEventListener("click", closeRestockSheet);
document.getElementById("restock-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "restock-sheet-overlay") closeRestockSheet();
});

document.getElementById("restock-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!restockingItemId) return;
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch];
  const item = inventory.find(i => i.id === restockingItemId);
  if (!item) return;

  const qty = parseFloat(document.getElementById("restock-qty").value) || 0;
  const unitCost = parseFloat(document.getElementById("restock-unit-cost").value) || 0;
  if (qty <= 0) return;

  logRestock(appState.selectedBranch, item, qty, unitCost, todayISO());
  closeRestockSheet();
  renderInventoryScreen();
  updateInventoryBadge();
  showToast(`${item.name} restocked — ${fmtLKR(qty * unitCost)}`);
});

// ---- Bulk restock ----
function updateBulkRestockBar() {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
  let count = 0;
  let total = 0;
  Object.keys(bulkEntries).forEach(itemId => {
    const qty = parseFloat(bulkEntries[itemId].qty) || 0;
    if (qty <= 0) return;
    const item = inventory.find(i => i.id === Number(itemId));
    if (!item) return;
    const parsedCost = parseFloat(bulkEntries[itemId].unitCost);
    const unitCost = isNaN(parsedCost) || parsedCost < 0 ? item.costPerUnit : parsedCost;
    count += 1;
    total += qty * unitCost;
  });
  document.getElementById("bulk-restock-count").textContent = `${count} item${count === 1 ? "" : "s"}`;
  document.getElementById("bulk-restock-total").textContent = fmtLKR(total);
  document.getElementById("bulk-restock-save").disabled = count === 0;
}

function setBulkMode(on) {
  bulkMode = on;
  document.getElementById("bulk-restock-btn").setAttribute("aria-pressed", String(on));
  document.getElementById("bulk-restock-bar").style.display = on ? "flex" : "none";
  if (!on) Object.keys(bulkEntries).forEach(k => delete bulkEntries[k]);
  renderInventoryScreen();
}

document.getElementById("bulk-restock-btn").addEventListener("click", () => setBulkMode(!bulkMode));
document.getElementById("bulk-restock-cancel").addEventListener("click", () => setBulkMode(false));

document.getElementById("bulk-restock-save").addEventListener("click", () => {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch];
  const date = todayISO();
  let itemCount = 0;
  let totalSpend = 0;

  Object.keys(bulkEntries).forEach(itemId => {
    const qty = parseFloat(bulkEntries[itemId].qty) || 0;
    if (qty <= 0) return;
    const item = inventory.find(i => i.id === Number(itemId));
    if (!item) return;
    const parsedCost = parseFloat(bulkEntries[itemId].unitCost);
    const unitCost = isNaN(parsedCost) || parsedCost < 0 ? item.costPerUnit : parsedCost;

    logRestock(appState.selectedBranch, item, qty, unitCost, date);
    itemCount += 1;
    totalSpend += qty * unitCost;
  });

  setBulkMode(false);
  updateInventoryBadge();
  showToast(itemCount ? `Restocked ${itemCount} item${itemCount === 1 ? "" : "s"} — ${fmtLKR(totalSpend)}` : "Nothing to restock");
});

// ---- Search / low-stock filter ----
const searchInput = document.getElementById("inventory-search");
const searchClearBtn = document.getElementById("inventory-search-clear");
const lowFilterBtn = document.getElementById("inventory-low-filter");

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  searchClearBtn.style.display = searchQuery ? "flex" : "none";
  renderInventoryScreen();
});

searchClearBtn.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  searchClearBtn.style.display = "none";
  searchInput.focus();
  renderInventoryScreen();
});

lowFilterBtn.addEventListener("click", () => {
  lowOnly = !lowOnly;
  lowFilterBtn.setAttribute("aria-pressed", String(lowOnly));
  renderInventoryScreen();
});

document.getElementById("open-inventory-btn").addEventListener("click", () => {
  document.getElementById("inventory-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("inventory-logo", appState.selectedBranchLogo);

  // Fresh screen, fresh filters — avoid reopening into a stale search.
  searchQuery = "";
  searchInput.value = "";
  searchClearBtn.style.display = "none";
  lowOnly = false;
  lowFilterBtn.setAttribute("aria-pressed", "false");
  bulkMode = false;
  Object.keys(bulkEntries).forEach(k => delete bulkEntries[k]);
  document.getElementById("bulk-restock-btn").setAttribute("aria-pressed", "false");
  document.getElementById("bulk-restock-bar").style.display = "none";

  renderInventoryScreen();
  showScreen("screen-inventory");
});

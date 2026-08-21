import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, showToast, setBranchLabel } from "./utils.js";
import { MENU_ITEMS, MENU_CATEGORIES, allocateDishId, allocateDishNumber } from "./data/menu.js";
import { INVENTORY_BY_BRANCH } from "./data/inventory.js";
import { confirmAction } from "./confirm.js";

let editingDishId = null;

function menuForBranch() {
  return MENU_ITEMS.filter(d => d.branch === appState.selectedBranch);
}

// Categories start collapsed, same as Inventory — the menu opens short and
// staff drill into the section they need instead of scrolling everything.
const collapsedCategories = new Set(MENU_CATEGORIES);

// Search — bypasses the category grouping and shows a flat list of matches,
// by dish name or by its #number (same pattern as the Food Order search).
let searchQuery = "";

function renderDishRow(dish, hidden, showCategoryTag) {
  return `
    <tr class="list-item-row" data-dish-id="${dish.id}" data-category="${escapeHtml(dish.category)}" ${hidden ? 'style="display:none"' : ""}>
      <td class="list-td-name">
        <span class="list-item-number">#${dish.number}</span>${escapeHtml(dish.name)}${showCategoryTag ? `<span class="list-item-tag">${escapeHtml(dish.category)}</span>` : ""}
      </td>
      <td class="list-td-price">${fmtLKR(dish.price)}</td>
      <td>
        <button type="button" class="list-edit-btn" data-dish-id="${dish.id}" aria-label="Edit ${escapeHtml(dish.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      </td>
    </tr>
  `;
}

function renderCategoryRow(category, dishes, hidden) {
  const isCollapsed = collapsedCategories.has(category);
  return `
    <tr class="list-group-row ${isCollapsed ? "collapsed" : ""}" data-category="${escapeHtml(category)}" ${hidden ? 'style="display:none"' : ""}>
      <td colspan="3">
        <span class="list-group-toggle">
          <svg class="list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          ${escapeHtml(category)}
          <span class="list-group-count">${dishes.length} dish${dishes.length === 1 ? "" : "es"}</span>
          <button type="button" class="list-group-add-btn" data-category="${escapeHtml(category)}" aria-label="Add dish to ${escapeHtml(category)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
          </button>
        </span>
      </td>
    </tr>
  `;
}

function renderMenuScreen() {
  // Republish on every render, so the guest page and the printed export
  // always reflect the edit that was just saved.
  import("./menu-publish.js").then(m => m.refreshDigitalMenuPanel()).catch(() => {});

  const list = document.getElementById("dish-list");
  const table = document.getElementById("menu-table");
  const statusEl = document.getElementById("menu-search-status");

  const query = searchQuery.trim().toLowerCase();
  const isFiltering = !!query;
  table.classList.toggle("filtered", isFiltering);

  if (isFiltering) {
    const matches = menuForBranch()
      .filter(dish => {
        const matchesNumber = String(dish.number) === query || String(dish.number).startsWith(query);
        const matchesName = dish.name.toLowerCase().includes(query);
        return matchesNumber || matchesName;
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    list.innerHTML = matches.map(dish => renderDishRow(dish, false, true)).join("") || `
      <tr><td colspan="3">
        <div class="list-empty">
          <p class="list-empty-title">No dishes match “${escapeHtml(searchQuery)}”.</p>
          <p class="list-empty-hint">Search by dish name or its number.</p>
          <button type="button" class="secondary-btn" id="menu-empty-clear">Clear search</button>
        </div>
      </td></tr>`;

    statusEl.style.display = "";
    statusEl.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"}`;
  } else {
    const groups = {};
    menuForBranch().forEach(dish => {
      if (!groups[dish.category]) groups[dish.category] = [];
      groups[dish.category].push(dish);
    });
    Object.values(groups).forEach(dishes => dishes.sort((a, b) => a.name.localeCompare(b.name)));

    list.innerHTML = MENU_CATEGORIES.filter(c => groups[c] && groups[c].length).map(category => {
      const dishes = groups[category];
      const isCollapsed = collapsedCategories.has(category);
      return renderCategoryRow(category, dishes, false) +
        dishes.map(dish => renderDishRow(dish, isCollapsed, false)).join("");
    }).join("") || `
      <tr><td colspan="3">
        <div class="list-empty">
          <p class="list-empty-title">No dishes on this menu yet.</p>
          <p class="list-empty-hint">Each branch keeps its own menu and numbers its dishes from #1.</p>
          <button type="button" class="secondary-btn" id="menu-empty-add">Add first dish</button>
        </div>
      </td></tr>`;

    statusEl.style.display = "none";
  }

  const emptyClear = document.getElementById("menu-empty-clear");
  if (emptyClear) emptyClear.addEventListener("click", () => menuSearchClearBtn.click());
  const emptyAdd = document.getElementById("menu-empty-add");
  if (emptyAdd) emptyAdd.addEventListener("click", () => openDishSheet(null));

  list.querySelectorAll(".list-group-row").forEach(row => {
    row.addEventListener("click", () => {
      const category = row.dataset.category;
      if (collapsedCategories.has(category)) collapsedCategories.delete(category);
      else collapsedCategories.add(category);
      renderMenuScreen();
    });
  });
  list.querySelectorAll(".list-group-add-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDishSheet(null, btn.dataset.category);
    });
  });
  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openDishSheet(Number(btn.dataset.dishId)));
  });
}

function branchInventory() {
  return INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
}

function guessUnit(itemId) {
  const item = branchInventory().find(i => i.id === Number(itemId));
  return item ? item.unit : "";
}

function populateCategorySelect(selected) {
  document.getElementById("dish-category").innerHTML = MENU_CATEGORIES.map(c =>
    `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`
  ).join("");
}

function openDishSheet(id, presetCategory = null) {
  editingDishId = id;
  const dish = id ? MENU_ITEMS.find(d => d.id === id) : null;

  document.getElementById("dish-sheet-title").textContent = dish ? `Edit Dish #${dish.number}` : "Add Dish";
  document.getElementById("dish-name").value = dish ? dish.name : "";
  document.getElementById("dish-description").value = dish ? (dish.description || "") : "";
  document.getElementById("dish-price").value = dish ? dish.price : "";
  populateCategorySelect(dish ? dish.category : (presetCategory || MENU_CATEGORIES[0]));
  document.getElementById("dish-delete-btn").style.display = dish ? "" : "none";
  document.getElementById("dish-name-error").classList.remove("show");
  document.getElementById("dish-name").classList.remove("invalid");

  document.getElementById("ingredient-list").innerHTML = "";
  if (dish && dish.ingredients.length) {
    dish.ingredients.forEach(ing => addIngredientRow(ing.itemId, ing.qty));
  } else {
    addIngredientRow();
  }

  document.getElementById("dish-sheet-overlay").classList.add("open");
}

function closeDishSheet() {
  document.getElementById("dish-sheet-overlay").classList.remove("open");
}

// Options come from this branch's real inventory, keyed by item id — so a
// recipe survives the item being renamed, and can only point at stock that
// actually exists at this branch.
function addIngredientRow(selectedItemId = null, qty = "") {
  const row = document.createElement("div");
  row.className = "ingredient-row";
  const inventory = branchInventory();
  const initial = selectedItemId ?? (inventory[0] && inventory[0].id);
  const options = inventory.map(item =>
    `<option value="${item.id}" ${item.id === initial ? "selected" : ""}>${escapeHtml(item.name)}</option>`
  ).join("");
  row.innerHTML = `
    <select class="ingredient-item">${options}</select>
    <div class="ingredient-qty-wrap">
      <input type="number" class="ingredient-qty" placeholder="Qty" min="0" step="0.01" inputmode="decimal" value="${qty}">
      <span class="ingredient-unit-label">${escapeHtml(guessUnit(initial))}</span>
    </div>
    <button type="button" class="remove-ingredient-btn" aria-label="Remove ingredient">&times;</button>
  `;
  const select = row.querySelector(".ingredient-item");
  const unitLabel = row.querySelector(".ingredient-unit-label");
  select.addEventListener("change", () => { unitLabel.textContent = guessUnit(select.value); });
  row.querySelector(".remove-ingredient-btn").addEventListener("click", () => row.remove());
  document.getElementById("ingredient-list").appendChild(row);
}

document.getElementById("add-dish-btn").addEventListener("click", () => openDishSheet(null));
document.getElementById("add-ingredient-btn").addEventListener("click", () => addIngredientRow());
document.getElementById("dish-sheet-close").addEventListener("click", closeDishSheet);
document.getElementById("dish-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "dish-sheet-overlay") closeDishSheet();
});

document.getElementById("dish-name").addEventListener("input", () => {
  document.getElementById("dish-name-error").classList.remove("show");
  document.getElementById("dish-name").classList.remove("invalid");
});

document.getElementById("dish-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("dish-name").value.trim();
  const category = document.getElementById("dish-category").value;
  const price = parseFloat(document.getElementById("dish-price").value) || 0;
  const description = document.getElementById("dish-description").value.trim();
  if (!name) return;

  const duplicate = MENU_ITEMS.some(d => d.id !== editingDishId && d.branch === appState.selectedBranch && d.name.trim().toLowerCase() === name.toLowerCase());
  if (duplicate) {
    document.getElementById("dish-name-error").classList.add("show");
    document.getElementById("dish-name").classList.add("invalid");
    document.getElementById("dish-name").focus();
    return;
  }

  const ingredients = [...document.querySelectorAll("#ingredient-list .ingredient-row")]
    .map(row => ({
      itemId: Number(row.querySelector(".ingredient-item").value),
      qty: parseFloat(row.querySelector(".ingredient-qty").value) || 0,
    }))
    .filter(ing => ing.qty > 0 && ing.itemId);

  if (editingDishId) {
    const dish = MENU_ITEMS.find(d => d.id === editingDishId);
    Object.assign(dish, { name, category, price, description, ingredients });
    showToast(`${name} updated`);
  } else {
    MENU_ITEMS.push({ id: allocateDishId(), number: allocateDishNumber(appState.selectedBranch), name, category, price, description, ingredients, branch: appState.selectedBranch });
    showToast(`${name} added`);
  }

  closeDishSheet();
  renderMenuScreen();
});

document.getElementById("dish-delete-btn").addEventListener("click", async () => {
  if (!editingDishId) return;
  const dish = MENU_ITEMS.find(d => d.id === editingDishId);
  if (!dish) return;
  const ok = await confirmAction({
    title: "Delete this dish?",
    message: `Delete "${dish.name}" from the menu?`,
    confirmLabel: "Delete Dish",
    tone: "danger",
  });
  if (!ok) return;

  const idx = MENU_ITEMS.findIndex(d => d.id === editingDishId);
  MENU_ITEMS.splice(idx, 1);
  closeDishSheet();
  renderMenuScreen();
  showToast(`${dish.name} removed`);
});

// ---- Search ----
const menuSearchInput = document.getElementById("menu-search");
const menuSearchClearBtn = document.getElementById("menu-search-clear");

menuSearchInput.addEventListener("input", () => {
  searchQuery = menuSearchInput.value;
  menuSearchClearBtn.style.display = searchQuery ? "flex" : "none";
  renderMenuScreen();
});

menuSearchClearBtn.addEventListener("click", () => {
  searchQuery = "";
  menuSearchInput.value = "";
  menuSearchClearBtn.style.display = "none";
  menuSearchInput.focus();
  renderMenuScreen();
});

document.getElementById("open-menu-btn").addEventListener("click", () => {
  setBranchLabel("menu-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("menu-logo", appState.selectedBranchLogo);

  // Fresh screen, fresh search.
  searchQuery = "";
  menuSearchInput.value = "";
  menuSearchClearBtn.style.display = "none";

  renderMenuScreen();
  showScreen("screen-menu");
});

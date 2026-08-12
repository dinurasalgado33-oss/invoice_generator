import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc } from "./utils.js";
import { MENU_ITEMS, INGREDIENT_NAMES, allocateDishId } from "./data/menu.js";
import { INVENTORY_BY_BRANCH } from "./data/inventory.js";

let editingDishId = null;

function renderMenuScreen() {
  const list = document.getElementById("dish-list");
  list.innerHTML = MENU_ITEMS.map(dish => {
    const ingredientsText = dish.ingredients.map(ing => `${ing.qty}${guessUnit(ing.item)} ${ing.item}`).join(", ");
    return `
      <div class="dish-row" data-dish-id="${dish.id}">
        <div class="dish-row-top">
          <div>
            <div class="dish-row-name">${escapeHtml(dish.name)}</div>
            <div class="dish-row-price">${fmtLKR(dish.price)}</div>
          </div>
          <div class="dish-row-actions">
            <button type="button" class="edit-dish-btn" data-dish-id="${dish.id}" aria-label="Edit ${escapeHtml(dish.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button type="button" class="delete-dish-btn" data-dish-id="${dish.id}" aria-label="Delete ${escapeHtml(dish.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>
            </button>
          </div>
        </div>
        <p class="dish-row-ingredients">${escapeHtml(ingredientsText)}</p>
      </div>
    `;
  }).join("") || `<p class="room-detail-empty">No dishes yet — tap "Add Dish" to start the menu.</p>`;

  list.querySelectorAll(".edit-dish-btn").forEach(btn => {
    btn.addEventListener("click", () => openDishSheet(Number(btn.dataset.dishId)));
  });
  list.querySelectorAll(".delete-dish-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteDish(Number(btn.dataset.dishId)));
  });
}

function guessUnit(ingredientName) {
  const item = INVENTORY_BY_BRANCH[appState.selectedBranch] && INVENTORY_BY_BRANCH[appState.selectedBranch].find(i => i.name === ingredientName);
  return item ? item.unit : "";
}

function deleteDish(id) {
  const dish = MENU_ITEMS.find(d => d.id === id);
  if (!dish) return;
  if (!confirm(`Delete "${dish.name}" from the menu?`)) return;
  const idx = MENU_ITEMS.findIndex(d => d.id === id);
  MENU_ITEMS.splice(idx, 1);
  renderMenuScreen();
}

function openDishSheet(id) {
  editingDishId = id;
  const dish = id ? MENU_ITEMS.find(d => d.id === id) : null;

  document.getElementById("dish-sheet-title").textContent = dish ? "Edit Dish" : "Add Dish";
  document.getElementById("dish-name").value = dish ? dish.name : "";
  document.getElementById("dish-price").value = dish ? dish.price : "";

  document.getElementById("ingredient-list").innerHTML = "";
  if (dish && dish.ingredients.length) {
    dish.ingredients.forEach(ing => addIngredientRow(ing.item, ing.qty));
  } else {
    addIngredientRow();
  }

  document.getElementById("dish-sheet-overlay").classList.add("open");
}

function closeDishSheet() {
  document.getElementById("dish-sheet-overlay").classList.remove("open");
}

function addIngredientRow(selectedItem = "", qty = "") {
  const row = document.createElement("div");
  row.className = "ingredient-row";
  const options = INGREDIENT_NAMES.map(name =>
    `<option value="${name}" ${name === selectedItem ? "selected" : ""}>${name}</option>`
  ).join("");
  row.innerHTML = `
    <select class="ingredient-item">${options}</select>
    <input type="number" class="ingredient-qty" placeholder="Qty (kg)" min="0" step="0.01" inputmode="decimal" value="${qty}">
    <button type="button" class="remove-ingredient-btn" aria-label="Remove ingredient">&times;</button>
  `;
  row.querySelector(".remove-ingredient-btn").addEventListener("click", () => row.remove());
  document.getElementById("ingredient-list").appendChild(row);
}

document.getElementById("add-dish-btn").addEventListener("click", () => openDishSheet(null));
document.getElementById("add-ingredient-btn").addEventListener("click", () => addIngredientRow());
document.getElementById("dish-sheet-close").addEventListener("click", closeDishSheet);
document.getElementById("dish-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "dish-sheet-overlay") closeDishSheet();
});

document.getElementById("dish-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("dish-name").value.trim();
  const price = parseFloat(document.getElementById("dish-price").value) || 0;
  if (!name) return;

  const ingredients = [...document.querySelectorAll("#ingredient-list .ingredient-row")]
    .map(row => ({
      item: row.querySelector(".ingredient-item").value,
      qty: parseFloat(row.querySelector(".ingredient-qty").value) || 0,
    }))
    .filter(ing => ing.qty > 0);

  if (editingDishId) {
    const dish = MENU_ITEMS.find(d => d.id === editingDishId);
    dish.name = name;
    dish.price = price;
    dish.ingredients = ingredients;
  } else {
    MENU_ITEMS.push({ id: allocateDishId(), name, price, ingredients });
  }

  closeDishSheet();
  renderMenuScreen();
});

document.getElementById("open-menu-btn").addEventListener("click", () => {
  document.getElementById("menu-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("menu-logo", appState.selectedBranchLogo);
  renderMenuScreen();
  showScreen("screen-menu");
});

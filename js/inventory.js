import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, setLogoSrc } from "./utils.js";
import { INVENTORY_BY_BRANCH } from "./data/inventory.js";

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

function renderInventoryScreen() {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch] || [];
  const isManager = appState.currentRole === "manager";
  const list = document.getElementById("inventory-list");

  list.innerHTML = inventory.map(item => {
    const isLow = item.stock < item.minStock;
    const adjustControls = isManager ? `
      <div class="stock-adjust">
        <button type="button" class="stock-adjust-btn" data-item-id="${item.id}" data-delta="-1" aria-label="Decrease ${escapeHtml(item.name)}">&minus;</button>
        <button type="button" class="stock-adjust-btn" data-item-id="${item.id}" data-delta="1" aria-label="Increase ${escapeHtml(item.name)}">+</button>
      </div>
    ` : "";

    return `
      <div class="inventory-row ${isLow ? "low-stock" : ""}">
        <div class="inventory-row-top">
          <div>
            <div class="inventory-row-name">${escapeHtml(item.name)}</div>
            <div class="inventory-row-category">${escapeHtml(item.category)}</div>
          </div>
          <span class="stock-badge ${isLow ? "low" : ""}">${isLow ? "Low" : "OK"}</span>
        </div>
        <div class="inventory-row-stock">
          <span>Stock: <strong>${item.stock}${escapeHtml(item.unit)}</strong> (min ${item.minStock}${escapeHtml(item.unit)})</span>
          ${adjustControls}
        </div>
      </div>
    `;
  }).join("");

  if (isManager) {
    list.querySelectorAll(".stock-adjust-btn").forEach(btn => {
      btn.addEventListener("click", () => adjustInventoryStock(Number(btn.dataset.itemId), Number(btn.dataset.delta)));
    });
  }
}

function adjustInventoryStock(itemId, delta) {
  const inventory = INVENTORY_BY_BRANCH[appState.selectedBranch];
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  item.stock = Math.max(0, Math.round((item.stock + delta) * 100) / 100);
  renderInventoryScreen();
  updateInventoryBadge();
}

document.getElementById("open-inventory-btn").addEventListener("click", () => {
  document.getElementById("inventory-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("inventory-logo", appState.selectedBranchLogo);
  renderInventoryScreen();
  showScreen("screen-inventory");
});

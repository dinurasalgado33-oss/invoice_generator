import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, showToast, todayISO } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { MENU_ITEMS } from "./data/menu.js";
import { INVENTORY_BY_BRANCH } from "./data/inventory.js";
import { FOOD_ORDER_RECORDS, allocateFoodOrderRecordId } from "./data/reports.js";
import { FOOD_ORDERS, allocateOrderId } from "./data/orders.js";
import { chargeRoom } from "./rooms.js";
import { updateInventoryBadge } from "./inventory.js";
import { confirmAction } from "./confirm.js";
import { resetForm, addItemRow, clearItems, setCheckoutContext } from "./invoice.js";

let currentOrderSelection = {}; // dishId -> qty, for the Create/Edit view
let orderSearchQuery = "";
let editingOrderId = null;

// ---- Inventory reservation — deducted when an order is placed/edited,
// returned if it's edited down or deleted before being completed. ----
// Returns the names of any ingredients that didn't have enough stock to
// cover this order — stock still gets clamped to 0 rather than blocking
// the order, but the shortfall is surfaced to staff instead of vanishing.
function deductIngredients(branch, dish, qty) {
  const inventory = INVENTORY_BY_BRANCH[branch] || [];
  const shortages = [];
  dish.ingredients.forEach(ing => {
    const invItem = inventory.find(i => i.id === ing.itemId);
    if (!invItem) return;
    const needed = ing.qty * qty;
    if (invItem.stock < needed) shortages.push(invItem.name);
    invItem.stock = Math.max(0, Math.round((invItem.stock - needed) * 100) / 100);
  });
  return shortages;
}

function restoreIngredients(branch, dish, qty) {
  const inventory = INVENTORY_BY_BRANCH[branch] || [];
  dish.ingredients.forEach(ing => {
    const invItem = inventory.find(i => i.id === ing.itemId);
    if (invItem) invItem.stock = Math.round((invItem.stock + ing.qty * qty) * 100) / 100;
  });
}

function restoreOrderIngredients(order) {
  order.items.forEach(item => {
    const dish = MENU_ITEMS.find(d => d.id === item.dishId);
    if (dish) restoreIngredients(order.branch, dish, item.qty);
  });
}

// ---- Room picker (Create/Edit view) ----
function getOccupiedRooms() {
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  return rooms.filter(room => room.status === "occupied");
}

// A walk-in has no villa to bill, so it can't ride to a checkout invoice
// the way a resident's order does — it's billed on the spot instead. The
// staff's own books show these as "Lunch" rows with villa "N/A", so the
// restaurant genuinely serves non-residents and those sales were
// previously impossible to record here.
const WALKIN_ROOM_VALUE = "walkin";

function populateRoomSelect() {
  const select = document.getElementById("order-room-select");
  const occupied = getOccupiedRooms();
  const walkinOption = `<option value="${WALKIN_ROOM_VALUE}">Walk-in — no villa (bill now)</option>`;
  select.innerHTML = occupied.length
    ? occupied.map(room => `<option value="${room.id}">${escapeHtml(room.name)} — ${escapeHtml(room.guest)}</option>`).join("") + walkinOption
    : walkinOption;
  select.disabled = false;
}

// ---- Dish list (Create/Edit view) ----
function renderDishList() {
  const q = orderSearchQuery.trim().toLowerCase();
  const matches = MENU_ITEMS.filter(dish => dish.branch === appState.selectedBranch).filter(dish => {
    if (!q) return true;
    const matchesNumber = String(dish.number) === q || String(dish.number).startsWith(q);
    const matchesName = dish.name.toLowerCase().includes(q);
    return matchesNumber || matchesName;
  });

  const list = document.getElementById("order-dish-list");
  list.innerHTML = matches.map(dish => {
    const qty = currentOrderSelection[dish.id] || 0;
    return `
      <div class="food-order-row">
        <div class="food-order-info">
          <span class="food-order-name"><span class="food-order-number">#${dish.number}</span>${escapeHtml(dish.name)}</span>
          <span class="food-order-price">${fmtLKR(dish.price)}</span>
        </div>
        <div class="food-order-qty-stepper">
          <button type="button" class="stepper-input-btn order-qty-minus" data-dish-id="${dish.id}" aria-label="Remove one ${escapeHtml(dish.name)}">&minus;</button>
          <span class="food-order-qty-value" id="order-qty-${dish.id}">${qty}</span>
          <button type="button" class="stepper-input-btn order-qty-plus" data-dish-id="${dish.id}" aria-label="Add one ${escapeHtml(dish.name)}">+</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="room-detail-empty">No dishes match “${escapeHtml(orderSearchQuery)}”.</p>`;

  list.querySelectorAll(".order-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => adjustOrderQty(btn.dataset.dishId, 1));
  });
  list.querySelectorAll(".order-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => adjustOrderQty(btn.dataset.dishId, -1));
  });
}

function renderOrderSelected() {
  const selected = document.getElementById("order-selected");
  const entries = Object.keys(currentOrderSelection)
    .map(id => ({ dish: MENU_ITEMS.find(d => d.id === Number(id)), qty: currentOrderSelection[id] }))
    .filter(e => e.dish && e.qty > 0);

  if (!entries.length) {
    selected.style.display = "none";
    selected.innerHTML = "";
    return;
  }

  selected.style.display = "flex";
  selected.innerHTML = entries.map(e => `
    <span class="food-order-chip">
      ${escapeHtml(e.dish.name)} &times;${e.qty}
      <button type="button" class="food-order-chip-remove" data-dish-id="${e.dish.id}" aria-label="Remove ${escapeHtml(e.dish.name)}">&times;</button>
    </span>
  `).join("");

  selected.querySelectorAll(".food-order-chip-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      currentOrderSelection[btn.dataset.dishId] = 0;
      const qtyEl = document.getElementById("order-qty-" + btn.dataset.dishId);
      if (qtyEl) qtyEl.textContent = "0";
      updateOrderTotal();
    });
  });
}

function updateOrderTotal() {
  let total = 0;
  let anyQty = false;
  Object.keys(currentOrderSelection).forEach(id => {
    const qty = currentOrderSelection[id];
    if (qty > 0) {
      anyQty = true;
      const dish = MENU_ITEMS.find(d => d.id === Number(id));
      if (dish) total += dish.price * qty;
    }
  });
  document.getElementById("order-total").textContent = fmtLKR(total);
  const roomSelected = Boolean(document.getElementById("order-room-select").value);
  const blocked = !anyQty || !roomSelected;
  document.getElementById("order-submit-btn").disabled = blocked;
  // Name the missing piece rather than leaving a dead grey button.
  const hint = document.getElementById("order-submit-hint");
  hint.hidden = !blocked;
  hint.textContent = !roomSelected
    ? "Choose a villa or walk-in first."
    : "Add at least one dish to place the order.";
  renderOrderSelected();
}

function adjustOrderQty(dishId, delta) {
  const current = currentOrderSelection[dishId] || 0;
  const next = Math.max(0, current + delta);
  currentOrderSelection[dishId] = next;
  document.getElementById("order-qty-" + dishId).textContent = next;
  updateOrderTotal();
}

function resetCreateView() {
  currentOrderSelection = {};
  orderSearchQuery = "";
  editingOrderId = null;
  document.getElementById("order-search").value = "";
  document.getElementById("order-edit-banner").style.display = "none";
  document.getElementById("order-room-select").disabled = false;
  document.getElementById("order-submit-label").textContent = "Place Order";
  populateRoomSelect();
  renderDishList();
  updateOrderTotal();
}

document.getElementById("order-search").addEventListener("input", (e) => {
  orderSearchQuery = e.target.value;
  renderDishList();
});
document.getElementById("order-room-select").addEventListener("change", updateOrderTotal);
document.getElementById("order-edit-cancel-btn").addEventListener("click", () => {
  resetCreateView();
  showToast("Edit cancelled");
});

document.getElementById("order-submit-btn").addEventListener("click", () => {
  const rawRoom = document.getElementById("order-room-select").value;
  const isWalkin = rawRoom === WALKIN_ROOM_VALUE;
  const roomId = isWalkin ? null : Number(rawRoom);
  const room = isWalkin ? null : (ROOMS_BY_BRANCH[appState.selectedBranch] || []).find(r => r.id === roomId);
  if (!isWalkin && !room) return;

  const items = Object.keys(currentOrderSelection)
    .map(id => ({ dishId: Number(id), qty: currentOrderSelection[id] }))
    .filter(e => e.qty > 0)
    .map(e => {
      const dish = MENU_ITEMS.find(d => d.id === e.dishId);
      return { dishId: e.dishId, name: dish.name, qty: e.qty, price: dish.price };
    });
  if (!items.length) return;

  const total = items.reduce((s, it) => s + it.qty * it.price, 0);

  const shortages = new Set();

  if (editingOrderId) {
    const order = FOOD_ORDERS.find(o => o.id === editingOrderId);
    if (order) {
      restoreOrderIngredients(order);
      items.forEach(item => {
        const dish = MENU_ITEMS.find(d => d.id === item.dishId);
        deductIngredients(order.branch, dish, item.qty).forEach(name => shortages.add(name));
      });
      order.items = items;
      order.total = total;
      showToast(shortages.size
        ? `Order updated for ${order.roomName} — ran out of ${[...shortages].join(", ")}`
        : `Order updated for ${order.roomName}`);
    }
  } else {
    items.forEach(item => {
      const dish = MENU_ITEMS.find(d => d.id === item.dishId);
      deductIngredients(appState.selectedBranch, dish, item.qty).forEach(name => shortages.add(name));
    });
    FOOD_ORDERS.push({
      id: allocateOrderId(),
      branch: appState.selectedBranch,
      roomId,
      walkin: isWalkin,
      roomName: isWalkin ? "Walk-in" : room.name,
      guestName: isWalkin ? "Walk-in customer" : room.guest,
      items,
      total,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    const label = isWalkin ? "walk-in" : room.name;
    showToast(shortages.size
      ? `Order placed for ${label} — ${fmtLKR(total)} (ran out of ${[...shortages].join(", ")})`
      : `Order placed for ${label} — ${fmtLKR(total)}`);
  }

  updateInventoryBadge();
  resetCreateView();
  switchOrdersView("orders");
});

// ---- Pending orders list ----
function renderPendingOrdersList() {
  const pending = FOOD_ORDERS.filter(o => o.branch === appState.selectedBranch && o.status === "pending");
  const list = document.getElementById("orders-pending-list");

  list.innerHTML = pending.map(order => `
    <div class="pending-order-card">
      <div class="pending-order-top">
        <div>
          <span class="pending-order-guest">${escapeHtml(order.guestName)}</span>
          <span class="pending-order-room">${escapeHtml(order.roomName)}</span>
        </div>
        <span class="pending-order-total">${fmtLKR(order.total)}</span>
      </div>
      <p class="pending-order-items">${order.items.map(it => `${it.qty}× ${escapeHtml(it.name)}`).join(", ")}</p>
      <div class="pending-order-actions">
        <button type="button" class="pending-order-edit-btn" data-order-id="${order.id}">Edit</button>
        <button type="button" class="pending-order-delete-btn" data-order-id="${order.id}">Delete</button>
        <button type="button" class="pending-order-complete-btn" data-order-id="${order.id}">Complete</button>
      </div>
    </div>
  `).join("") || `<p class="room-detail-empty">No pending orders right now.</p>`;

  list.querySelectorAll(".pending-order-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => editOrder(Number(btn.dataset.orderId)));
  });
  list.querySelectorAll(".pending-order-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteOrder(Number(btn.dataset.orderId)));
  });
  list.querySelectorAll(".pending-order-complete-btn").forEach(btn => {
    btn.addEventListener("click", () => completeOrder(Number(btn.dataset.orderId)));
  });
}

function editOrder(orderId) {
  const order = FOOD_ORDERS.find(o => o.id === orderId);
  if (!order) return;

  editingOrderId = orderId;
  currentOrderSelection = {};
  order.items.forEach(item => { currentOrderSelection[item.dishId] = item.qty; });
  orderSearchQuery = "";
  document.getElementById("order-search").value = "";

  populateRoomSelect();
  const roomSelect = document.getElementById("order-room-select");
  roomSelect.value = String(order.roomId);
  roomSelect.disabled = true;

  document.getElementById("order-edit-banner").style.display = "flex";
  document.getElementById("order-submit-label").textContent = "Save Changes";

  renderDishList();
  updateOrderTotal();
  switchOrdersView("create");
}

async function deleteOrder(orderId) {
  const order = FOOD_ORDERS.find(o => o.id === orderId);
  if (!order) return;
  const ok = await confirmAction({
    title: "Delete this order?",
    message: `Delete this order for ${order.roomName}? Reserved ingredients will be returned to inventory.`,
    confirmLabel: "Delete Order",
    tone: "danger",
  });
  if (!ok) return;

  restoreOrderIngredients(order);
  const idx = FOOD_ORDERS.findIndex(o => o.id === orderId);
  FOOD_ORDERS.splice(idx, 1);

  updateInventoryBadge();
  showToast(`Order deleted for ${order.roomName}`);
  renderPendingOrdersList();
}

async function completeOrder(orderId) {
  const order = FOOD_ORDERS.find(o => o.id === orderId);
  if (!order) return;
  const ok = await confirmAction({
    title: "Complete this order?",
    message: order.walkin
      ? `Bill ${fmtLKR(order.total)} as a walk-in sale? This opens an invoice for the customer.`
      : `Bill ${fmtLKR(order.total)} to ${order.roomName} and complete this order?`,
    confirmLabel: "Complete Order",
    tone: "safe",
  });
  if (!ok) return;

  // A resident's order rides to their checkout invoice, so the villa must
  // still be occupied by the same guest. A walk-in has no villa at all and
  // is billed immediately instead.
  const room = order.walkin ? null : (ROOMS_BY_BRANCH[order.branch] || []).find(r => r.id === order.roomId);
  if (!order.walkin && (!room || room.status !== "occupied" || room.guest !== order.guestName)) {
    showToast(`Can't complete — ${order.guestName} already checked out of ${order.roomName}`);
    return;
  }
  const today = todayISO();

  order.items.forEach(item => {
    if (room) chargeRoom(room, item.name, item.qty, item.price, "food");
    FOOD_ORDER_RECORDS.push({
      id: allocateFoodOrderRecordId(),
      dishId: item.dishId,
      dish: item.name,
      qty: item.qty,
      branch: order.branch,
      date: today,
      category: "food",
      walkin: Boolean(order.walkin),
      revenue: item.qty * item.price,
    });
  });

  const idx = FOOD_ORDERS.findIndex(o => o.id === orderId);
  FOOD_ORDERS.splice(idx, 1);

  if (order.walkin) {
    startWalkinInvoice(order);
    return;
  }

  showToast(`Order completed — ${fmtLKR(order.total)} billed to ${order.roomName}`);
  renderPendingOrdersList();
}

// Walk-ins are billed on the spot, so completing one drops straight into
// the invoice form pre-loaded with the dishes — there's no stay to attach
// them to and no checkout that would otherwise pick them up.
function startWalkinInvoice(order) {
  resetForm();
  setCheckoutContext({ roomId: null, bookingId: null, source: "Walk-in", walkin: true });
  clearItems();
  order.items.forEach(item => {
    addItemRow(item.name, String(item.qty), String(item.price), String(item.qty * item.price), "food");
  });
  showToast(`Walk-in order ready to bill — ${fmtLKR(order.total)}`);
  showScreen("screen-form");
}

// ---- Nav (Create Order / Orders) ----
function switchOrdersView(view) {
  document.querySelectorAll("#orders-nav .report-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.ordersView === view);
  });
  document.getElementById("orders-create-view").style.display = view === "create" ? "" : "none";
  document.getElementById("orders-list-view").style.display = view === "orders" ? "" : "none";
  if (view === "orders") renderPendingOrdersList();
}

document.querySelectorAll("#orders-nav .report-tab").forEach(tab => {
  tab.addEventListener("click", () => switchOrdersView(tab.dataset.ordersView));
});

document.getElementById("qa-food-order-btn").addEventListener("click", () => {
  document.getElementById("orders-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("orders-logo", appState.selectedBranchLogo);
  resetCreateView();
  switchOrdersView("create");
  showScreen("screen-orders");
});

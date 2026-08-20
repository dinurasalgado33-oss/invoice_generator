import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, nightsBetween, showToast, todayISO, orDash, toDateISO } from "./utils.js";
import { ROOMS_BY_BRANCH, ROOM_STATUS_LABELS, logRoomActivity } from "./data/rooms.js";
import { ACTIVITIES_BY_BRANCH, clampHotelIncome } from "./data/activities.js";
import { resetForm, addItemRow, clearItems, onAfterGenerate, setCheckoutContext } from "./invoice.js";
import { confirmAction } from "./confirm.js";
import { ACTIVITY_RECORDS, allocateActivityRecordId, BOOKINGS, allocateBookingId } from "./data/reports.js";
import {
  CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, DEFAULT_CHARGE_CATEGORY,
  isChargeCategory, BOOKING_SOURCES, DEFAULT_BOOKING_SOURCE,
} from "./data/charges.js";
import { openGrcForm, reprintGrc } from "./grc.js";
import { attachSuggestions, SUGGESTION_KEYS } from "./suggestions.js";

let activeRoomRef = null; // { branch, index } — the villa the detail sheet is currently showing
let checkoutRoomRef = null; // villa currently mid-checkout, reset to available once the invoice is generated

export function updateRoomsCardAvailability() {
  const hasData = Boolean(ROOMS_BY_BRANCH[appState.selectedBranch]);
  document.getElementById("qa-checkin-btn").disabled = !hasData;
  document.getElementById("qa-checkout-btn").disabled = !hasData;
}

// What the current view is filtered to, so the banner and the "show all"
// escape can describe it — and so re-rendering after a check-in keeps the
// same filter instead of silently reverting to everything.
let activeFilter = { statusFilter: null, mode: null };

// Re-render in place after a state change (check-in, cancel, checkout).
// Calling renderRooms() bare would drop whatever filter the staff member
// arrived with, so the villa they just acted on stays gone but five
// unrelated ones appear — which reads as the screen losing its place.
function rerenderRooms() {
  renderRooms(activeFilter.statusFilter, activeFilter.mode);
}

function renderFilterBanner(statusFilter, mode, shownCount, totalCount) {
  const banner = document.getElementById("rooms-filter-banner");
  if (!statusFilter && !mode) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const what = mode === "activity"
    ? "occupied villas — pick one to add an activity charge"
    : `${ROOM_STATUS_LABELS[statusFilter].toLowerCase()} villas`;
  document.getElementById("rooms-filter-text").textContent =
    `Showing ${shownCount} of ${totalCount} · ${what}`;
}

export function renderRooms(statusFilter = null, mode = null) {
  activeFilter = { statusFilter, mode };
  const grid = document.getElementById("rooms-grid");
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  grid.innerHTML = "";

  const shown = statusFilter ? rooms.filter(r => r.status === statusFilter) : rooms;
  renderFilterBanner(statusFilter, mode, shown.length, rooms.length);

  if (!rooms.length) {
    grid.innerHTML = `<p class="room-detail-empty">No villas set up for this branch yet. A manager can add them in Configure.</p>`;
    return;
  }

  if (statusFilter && !shown.length) {
    // Was a dead end: staff had to guess that the list was filtered and
    // use the browser back button to escape it.
    grid.innerHTML = `
      <div class="rooms-empty-state">
        <p class="room-detail-empty">No ${ROOM_STATUS_LABELS[statusFilter].toLowerCase()} villas right now.</p>
        <button type="button" class="secondary-btn" id="rooms-empty-show-all">Show all villas</button>
      </div>
    `;
    document.getElementById("rooms-empty-show-all").addEventListener("click", () => renderRooms(null, null));
    return;
  }

  rooms.forEach((room) => {
    if (statusFilter && room.status !== statusFilter) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "room-card " + room.status;

    const hasStay = room.status === "occupied";
    const ribbon = hasStay
      ? `<span class="room-card-ribbon">${formatDate(room.checkin)} &rarr; ${formatDate(room.checkout)}</span>`
      : "";
    const guestLine = hasStay ? `<span class="room-card-guest">${escapeHtml(orDash(room.guest))}</span>` : "";
    // When a status filter is active every card shares the same status —
    // showing the badge on each one is just noise, so skip it then.
    const statusBadge = statusFilter
      ? ""
      : `<span class="room-card-status"><span class="room-card-status-dot"></span>${ROOM_STATUS_LABELS[room.status]}</span>`;

    card.innerHTML = `
      ${ribbon}
      <svg class="room-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
      <span class="room-card-name">${escapeHtml(room.name || "Unnamed villa")}</span>
      ${guestLine}
      ${statusBadge}
    `;

    card.addEventListener("click", () => openRoomDetail(appState.selectedBranch, room.id, mode));
    grid.appendChild(card);
  });
}

export function openRoomDetail(branch, roomId, mode = null) {
  // A villa that no longer exists (renamed branch, stale row on screen,
  // a caller passing the wrong key) must not open an empty sheet or throw
  // halfway through rendering it — say so and stay put instead.
  const room = (ROOMS_BY_BRANCH[branch] || []).find(r => r.id === roomId);
  if (!room) {
    showToast("That villa is no longer available");
    return;
  }
  activeRoomRef = { branch, roomId, mode };
  renderRoomDetailBody();
  document.getElementById("room-detail-overlay").classList.add("open");
}

function closeRoomDetail() {
  document.getElementById("room-detail-overlay").classList.remove("open");
}

function getActiveRoom() {
  return (ROOMS_BY_BRANCH[activeRoomRef.branch] || []).find(r => r.id === activeRoomRef.roomId);
}

function renderRoomDetailBody() {
  const room = getActiveRoom();
  // The villa can disappear between opening the sheet and a later re-render
  // (charging an activity while another device checks the guest out).
  if (!room) {
    closeRoomDetail();
    showToast("That villa is no longer available");
    return;
  }

  document.getElementById("room-detail-name").textContent = room.name || "Unnamed villa";
  const statusEl = document.getElementById("room-detail-status");
  statusEl.textContent = ROOM_STATUS_LABELS[room.status];
  statusEl.className = "room-detail-status " + room.status;

  const body = document.getElementById("room-detail-body");

  if (room.status === "available") {
    body.innerHTML = `
      <div class="room-detail-row"><span>Rate</span><span>LKR ${room.rate.toLocaleString("en-US")} / night</span></div>
      <p class="room-detail-empty">This villa is free right now.</p>
      <button type="button" class="primary-btn big" id="new-booking-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
        Check In Guest
      </button>
    `;
    document.getElementById("new-booking-btn").addEventListener("click", showNewBookingForm);
  } else {
    // Two distinct purposes now use this same "occupied villa" sheet: the
    // Activities shortcut (charges to this room's eventual invoice,
    // nothing else on screen), and every other entry point — Check Out
    // quick action, a checkout row — which is just about the stay itself
    // (info + Check Out). Food ordering moved to its own Orders screen.
    const mode = activeRoomRef.mode;

    if (mode === "activity") {
      body.innerHTML = renderActivitiesPanel();
      wireActivitiesPanel();
    } else {
      body.innerHTML = `
        <div class="room-detail-row"><span>Guest</span><span>${escapeHtml(room.guest)}</span></div>
        <div class="room-detail-row"><span>Contact</span><span>${escapeHtml(room.phone || "-")}</span></div>
        <div class="room-detail-row"><span>Booked via</span><span>${escapeHtml(room.source || "-")}</span></div>
        <div class="room-detail-row"><span>Check-in</span><span>${formatDate(room.checkin)}</span></div>
        <div class="room-detail-row"><span>Check-out</span><span>${formatDate(room.checkout)}</span></div>
        ${renderRunningTab(room)}
        <button type="button" class="secondary-btn" id="view-grc-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          Registration Card
        </button>
        <button type="button" class="primary-btn big" id="check-out-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          Check Out
        </button>
        <button type="button" class="sheet-text-danger-btn" id="cancel-checkin-btn">Cancel this check-in</button>
      `;
      document.getElementById("check-out-btn").addEventListener("click", startCheckout);
      document.getElementById("cancel-checkin-btn").addEventListener("click", cancelCheckIn);
      // Reopens the signed card for this stay. Deliberately here rather
      // than on the villa card in the grid — that card is itself a
      // <button>, and a button inside a button is invalid markup with
      // unreliable click handling.
      document.getElementById("view-grc-btn").addEventListener("click", () => {
        closeRoomDetail();
        reprintGrc(room.bookingId ?? null);
      });
      const interimBtn = document.getElementById("interim-invoice-btn");
      if (interimBtn) interimBtn.addEventListener("click", startInterimInvoice);
    }
  }
}

// The stay's running tab — food orders and activity charges run up so far.
// Shown on the occupied villa sheet so staff can see what's accumulated
// without waiting for checkout, and bill part of it early if the guest
// wants to settle (their paper records routinely split one stay across
// several invoice numbers, usually food onto its own bill).
function renderRunningTab(room) {
  const charges = room.pendingCharges || [];
  if (!charges.length) return "";
  const total = charges.reduce((sum, c) => sum + c.value, 0);
  return `
    <div class="running-tab">
      <div class="running-tab-head">
        <span>Running tab</span>
        <span class="running-tab-total">${fmtLKR(total)}</span>
      </div>
      <ul class="running-tab-list">
        ${charges.map(c => `
          <li>
            <span class="running-tab-desc">${escapeHtml(c.qty)}× ${escapeHtml(c.desc)}</span>
            <span class="running-tab-value">${fmtLKR(c.value)}</span>
          </li>
        `).join("")}
      </ul>
      <button type="button" class="secondary-btn" id="interim-invoice-btn">Bill this now (keep stay open)</button>
    </div>
  `;
}

// Bills whatever is on the tab right now without ending the stay — the
// villa stays occupied and the tab resets, so later charges land on a
// second invoice. This is the "one guest, invoices 60/61/62" pattern from
// the staff's own books, which a single checkout invoice can't express.
async function startInterimInvoice() {
  const room = getActiveRoom();
  const charges = room.pendingCharges || [];
  if (!charges.length) return;
  const total = charges.reduce((sum, c) => sum + c.value, 0);

  const ok = await confirmAction({
    title: "Bill the running tab?",
    // No escapeHtml here — confirmAction sets this via textContent, so
    // escaping would render a guest like "Mr. & Mrs. Silva" as "&amp;".
    message: `Invoice ${fmtLKR(total)} to ${room.guest} now? ${room.name} stays occupied and the tab starts fresh — the room charge is still billed at checkout.`,
    confirmLabel: "Create Invoice",
    tone: "safe",
  });
  if (!ok) return;

  checkoutRoomRef = null; // an interim bill must NOT free the villa
  closeRoomDetail();
  resetForm();
  setCheckoutContext({ roomId: room.id, bookingId: room.bookingId ?? null, source: room.source ?? null, interim: true });
  document.getElementById("guest-name").value = room.guest || "";
  document.getElementById("guest-phone").value = room.phone || "";
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";

  clearItems();
  charges.forEach(c => addItemRow(c.desc, c.qty, String(c.rate), String(c.value), c.category));
  // Cleared up front: these charges are now on an invoice, so leaving them
  // on the tab would bill them a second time at checkout.
  delete room.pendingCharges;

  showScreen("screen-form");
}

// Undo a mistaken check-in — clears the room back to available without
// generating an invoice. Any food/activity charges already run up during
// that stay are discarded along with it (they were never billed, since
// billing only happens at Check Out).
async function cancelCheckIn() {
  const room = getActiveRoom();
  const ok = await confirmAction({
    title: "Cancel check-in?",
    message: `Cancel ${room.guest}'s check-in for ${room.name}? This can't be undone.`,
    confirmLabel: "Cancel Check-In",
    tone: "danger",
  });
  if (!ok) return;

  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  if (booking) booking.status = "Cancelled";

  logRoomActivity(activeRoomRef.branch, room, room.guest, "Check-In Cancelled");
  room.status = "available";
  delete room.guest;
  delete room.phone;
  delete room.checkin;
  delete room.checkout;
  delete room.source;
  delete room.pendingCharges;
  delete room.bookingId;

  showToast(`Check-in cancelled for ${room.name}`);
  closeRoomDetail();
  rerenderRooms();
}

// Appends a line item to a room's running bill — picked up by
// prefillInvoiceForCheckout() whenever that villa is checked out, so
// whatever was ordered/charged during the stay lands on the invoice.
// Exported for orders.js — a completed food order bills the room the
// same way an activity charge does.
//
// `category` decides which money column the charge lands in and whether
// service charge applies to it (food only), so it travels with the line
// from the moment it's created rather than being guessed at billing time.
export function chargeRoom(room, desc, qty, rate, category = DEFAULT_CHARGE_CATEGORY) {
  if (!room.pendingCharges) room.pendingCharges = [];
  room.pendingCharges.push({
    desc,
    qty: String(qty),
    rate,
    value: qty * rate,
    category: isChargeCategory(category) ? category : DEFAULT_CHARGE_CATEGORY,
  });
}

// ---- Activity charges (inside an occupied villa's detail sheet) ----
let currentActivitySelection = {}; // activityId -> qty, reset each time the panel is (re)built
let customActivityCharges = []; // [{ name, price }] one-off entries from the custom row

function renderActivitiesPanel() {
  currentActivitySelection = {};
  customActivityCharges = [];

  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const rows = activities.map(a => `
    <div class="food-order-row">
      <div class="food-order-info">
        <span class="food-order-name">${escapeHtml(a.name)}</span>
        <span class="food-order-price">${fmtLKR(a.price)}</span>
      </div>
      <div class="food-order-qty-stepper">
        <button type="button" class="stepper-input-btn activity-qty-minus" data-activity-id="${a.id}" aria-label="Remove one ${escapeHtml(a.name)}">&minus;</button>
        <span class="food-order-qty-value" id="activity-qty-${a.id}">0</span>
        <button type="button" class="stepper-input-btn activity-qty-plus" data-activity-id="${a.id}" aria-label="Add one ${escapeHtml(a.name)}">+</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="food-orders-panel">
      <h4>Add Activity Charge</h4>
      <div class="food-order-selected" id="activity-selected" style="display:none"></div>
      <div class="food-order-list">${rows}</div>
      <div class="activity-custom-row">
        <input type="text" id="activity-custom-name" placeholder="Other charge" autocapitalize="words" />
        <input type="number" id="activity-custom-price" placeholder="Price" min="0" step="1" inputmode="decimal" />
        <button type="button" class="stepper-input-btn" id="activity-custom-add" aria-label="Add custom charge">+</button>
      </div>
      <div class="activity-custom-row secondary">
        <select id="activity-custom-category" aria-label="Charge type">
          ${CHARGE_CATEGORIES.map(c => `<option value="${c}" ${c === DEFAULT_CHARGE_CATEGORY ? "selected" : ""}>${CHARGE_CATEGORY_LABELS[c]}</option>`).join("")}
        </select>
        <input type="number" id="activity-custom-income" placeholder="Hotel keeps" min="0" step="1" inputmode="decimal" />
      </div>
      <div class="field activity-guide-field">
        <label for="activity-guide">Guide / Driver <span class="label-optional">(optional)</span></label>
        <input type="text" id="activity-guide" placeholder="Who is running it" autocapitalize="words" />
      </div>
      <div class="food-order-total-row"><span>Total</span><span id="activity-total">${fmtLKR(0)}</span></div>
      <div class="food-order-total-row subtle" id="activity-payout-row" style="display:none">
        <span>Payable to provider</span><span id="activity-payout">${fmtLKR(0)}</span>
      </div>
      <button type="button" class="primary-btn big" id="charge-activity-btn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
        Charge to Room Bill
      </button>
    </div>
  `;
}

function renderActivitySelected() {
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const selected = document.getElementById("activity-selected");

  const presetEntries = Object.keys(currentActivitySelection)
    .map(id => ({ activity: activities.find(a => a.id === Number(id)), qty: currentActivitySelection[id] }))
    .filter(e => e.activity && e.qty > 0)
    .map(e => ({ label: `${e.activity.name} ×${e.qty}`, remove: () => { currentActivitySelection[e.activity.id] = 0; const el = document.getElementById("activity-qty-" + e.activity.id); if (el) el.textContent = "0"; } }));

  const customEntries = customActivityCharges.map((c, i) => ({
    label: c.name,
    remove: () => { customActivityCharges.splice(i, 1); },
  }));

  const entries = [...presetEntries, ...customEntries];
  if (!entries.length) {
    selected.style.display = "none";
    selected.innerHTML = "";
    return;
  }

  selected.style.display = "flex";
  selected.innerHTML = entries.map((e, i) => `
    <span class="food-order-chip">
      ${escapeHtml(e.label)}
      <button type="button" class="food-order-chip-remove" data-entry-index="${i}" aria-label="Remove ${escapeHtml(e.label)}">&times;</button>
    </span>
  `).join("");

  selected.querySelectorAll(".food-order-chip-remove").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      entries[i].remove();
      updateActivityTotal();
    });
  });
}

function updateActivityTotal() {
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  let total = 0;
  let payout = 0;
  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty > 0) {
      const activity = activities.find(a => a.id === Number(id));
      if (activity) {
        total += activity.price * qty;
        const income = clampHotelIncome(activity.price, activity.hotelIncome ?? activity.price);
        payout += (activity.price - income) * qty;
      }
    }
  });
  customActivityCharges.forEach(c => {
    total += c.price;
    payout += c.price - clampHotelIncome(c.price, c.hotelIncome ?? c.price);
  });

  document.getElementById("activity-total").textContent = fmtLKR(total);
  // Only worth showing when money actually leaves the hotel — for in-house
  // activities a permanent "LKR 0.00" line is just noise.
  const payoutRow = document.getElementById("activity-payout-row");
  payoutRow.style.display = payout > 0 ? "" : "none";
  document.getElementById("activity-payout").textContent = fmtLKR(payout);
  document.getElementById("charge-activity-btn").disabled = total <= 0;
  renderActivitySelected();
}

function adjustActivityQty(activityId, delta) {
  const current = currentActivitySelection[activityId] || 0;
  const next = Math.max(0, current + delta);
  currentActivitySelection[activityId] = next;
  document.getElementById("activity-qty-" + activityId).textContent = next;
  updateActivityTotal();
}

function wireActivitiesPanel() {
  document.querySelectorAll(".activity-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => adjustActivityQty(btn.dataset.activityId, 1));
  });
  document.querySelectorAll(".activity-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => adjustActivityQty(btn.dataset.activityId, -1));
  });
  document.getElementById("activity-custom-add").addEventListener("click", () => {
    const nameInput = document.getElementById("activity-custom-name");
    const priceInput = document.getElementById("activity-custom-price");
    const incomeInput = document.getElementById("activity-custom-income");
    const categorySelect = document.getElementById("activity-custom-category");
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value) || 0;
    if (!name || price <= 0) return;
    // Blank income means the hotel keeps all of it — the common case for a
    // one-off. A hired car or outside guide is where it gets filled in.
    const hotelIncome = incomeInput.value === ""
      ? price
      : clampHotelIncome(price, parseFloat(incomeInput.value) || 0);
    customActivityCharges.push({ name, price, hotelIncome, category: categorySelect.value });
    nameInput.value = "";
    priceInput.value = "";
    incomeInput.value = "";
    categorySelect.value = DEFAULT_CHARGE_CATEGORY;
    updateActivityTotal();
  });
  // Same list the registration card uses — a guide named here is the same
  // person as the guide named there.
  attachSuggestions(document.getElementById("activity-guide"), SUGGESTION_KEYS.GUIDE, ["Ashen", "Pradeep", "Shalika", "Sanjula", "Ashik"]);
  document.getElementById("charge-activity-btn").addEventListener("click", chargeActivities);
}

function chargeActivities() {
  const room = getActiveRoom();
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const branch = activeRoomRef.branch;
  const today = todayISO();
  const guide = (document.getElementById("activity-guide").value || "").trim();
  let total = 0;

  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty <= 0) return;
    const activity = activities.find(a => a.id === Number(id));
    if (!activity) return;
    const category = isChargeCategory(activity.category) ? activity.category : DEFAULT_CHARGE_CATEGORY;
    const income = clampHotelIncome(activity.price, activity.hotelIncome ?? activity.price);
    chargeRoom(room, activity.name, qty, activity.price, category);
    // `revenue` stays the gross billed to the guest (it has to reconcile
    // with the invoice line), while `income`/`payout` carry the split so
    // the dashboard can report what the hotel actually kept.
    ACTIVITY_RECORDS.push({
      id: allocateActivityRecordId(),
      activityId: activity.id,
      roomId: room.id,
      bookingId: room.bookingId ?? null,
      at: new Date().toISOString(),
      name: activity.name,
      qty,
      branch,
      date: today,
      category,
      revenue: activity.price * qty,
      income: income * qty,
      payout: (activity.price - income) * qty,
      guide: guide || null,
    });
    total += activity.price * qty;
  });

  customActivityCharges.forEach(c => {
    const category = isChargeCategory(c.category) ? c.category : DEFAULT_CHARGE_CATEGORY;
    const income = clampHotelIncome(c.price, c.hotelIncome ?? c.price);
    chargeRoom(room, c.name, 1, c.price, category);
    // One-off charges have no catalogue entry, so activityId is null — but
    // they can still carry a payout (a hired car, an outside guide).
    ACTIVITY_RECORDS.push({
      id: allocateActivityRecordId(),
      activityId: null,
      roomId: room.id,
      bookingId: room.bookingId ?? null,
      at: new Date().toISOString(),
      name: c.name,
      qty: 1,
      branch,
      date: today,
      category,
      revenue: c.price,
      income,
      payout: c.price - income,
      guide: guide || null,
    });
    total += c.price;
  });

  showToast(`Charged ${room.name} — ${fmtLKR(total)} added to bill`);
  renderRoomDetailBody();
}

// Check-in now runs through the Guest Registration Card. Filling in the
// card is a legal requirement for every guest, so it isn't a step that
// follows check-in — it *is* the check-in, and there is deliberately no
// path that books a villa without one. The old four-field form that lived
// here would have been that path.
//
// The booking is created inside this callback, which the GRC form calls
// only once the card is complete and valid. Returning the booking id lets
// the card record store what stay it belongs to.
function showNewBookingForm() {
  const room = getActiveRoom();
  if (!room) return;
  const branch = activeRoomRef.branch;
  closeRoomDetail();

  openGrcForm({
    branch,
    room,
    onComplete: (card) => {
      room.guest = card.guestName;
      room.phone = card.phone;
      room.checkin = card.arrivalDate;
      room.checkout = card.departureDate;
      // The card's "Reservation Made by" is free text (an OTA, a walk-in,
      // a name), so it can't drive the booking-source field on its own —
      // it's kept on the card and the booking keeps the default unless
      // reception recorded something recognisable.
      room.source = BOOKING_SOURCES.includes(card.reservationMadeBy)
        ? card.reservationMadeBy
        : DEFAULT_BOOKING_SOURCE;
      room.status = "occupied";

      // Keep the booking's id on the room so check-out / cancel can close
      // the exact row this check-in opened, rather than re-finding it by
      // matching guest + villa + dates.
      const booking = {
        id: allocateBookingId(),
        roomId: room.id,
        guest: room.guest,
        villa: room.name,
        branch,
        checkin: room.checkin,
        checkout: room.checkout,
        source: room.source,
        status: "Checked In",
      };
      BOOKINGS.push(booking);
      room.bookingId = booking.id;
      logRoomActivity(branch, room, room.guest, "Check In");
      rerenderRooms();
      return booking.id;
    },
  });
}

function startCheckout() {
  const room = getActiveRoom();
  checkoutRoomRef = { branch: activeRoomRef.branch, roomId: room.id };
  closeRoomDetail();
  prefillInvoiceForCheckout(room);
  showScreen("screen-form");
}

function prefillInvoiceForCheckout(room) {
  resetForm();
  setCheckoutContext({ roomId: room.id, bookingId: room.bookingId ?? null, source: room.source ?? null });
  document.getElementById("guest-name").value = room.guest || "";
  document.getElementById("guest-phone").value = room.phone || "";
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";

  const nights = nightsBetween(room.checkin, room.checkout);
  const rate = room.rate || 0;
  clearItems();
  addItemRow(room.name + " — Room Charge", String(nights), String(rate), String(nights * rate), "villa");

  // Food orders and activity charges placed during the stay ride along
  // onto the same invoice, each keeping the category it was charged under.
  (room.pendingCharges || []).forEach(c => {
    addItemRow(c.desc, c.qty, String(c.rate), String(c.value), c.category);
  });
}

// If an invoice was generated from a Room Map checkout, the villa is free again.
onAfterGenerate(() => {
  if (checkoutRoomRef) {
    const room = (ROOMS_BY_BRANCH[checkoutRoomRef.branch] || []).find(r => r.id === checkoutRoomRef.roomId);
    if (!room) { checkoutRoomRef = null; return; }

    const booking = BOOKINGS.find(b => b.id === room.bookingId);
    if (booking) booking.status = "Checked Out";

    logRoomActivity(checkoutRoomRef.branch, room, room.guest, "Check Out");
    room.status = "available";
    delete room.guest;
    delete room.phone;
    delete room.checkin;
    delete room.checkout;
    delete room.source;
    delete room.pendingCharges;
    delete room.bookingId;
    checkoutRoomRef = null;
  }
});

document.getElementById("rooms-filter-clear").addEventListener("click", () => renderRooms(null, null));

document.getElementById("room-detail-close").addEventListener("click", closeRoomDetail);
document.getElementById("room-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "room-detail-overlay") closeRoomDetail();
});

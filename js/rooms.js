import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, nightsBetween, showToast, todayISO, orDash, toDateISO, clampMoney } from "./utils.js";
import { ROOMS_BY_BRANCH, ROOM_STATUS_LABELS, logRoomActivity } from "./data/rooms.js";
import { ACTIVITIES_BY_BRANCH, clampHotelIncome } from "./data/activities.js";
import { resetForm, addItemRow, clearItems, onAfterGenerate, setCheckoutContext } from "./invoice.js";
import { confirmAction } from "./confirm.js";
import { ACTIVITY_RECORDS, allocateActivityRecordId, BOOKINGS, allocateBookingId, writeOffStayRecords } from "./data/reports.js";
import {
  CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, DEFAULT_CHARGE_CATEGORY,
  isChargeCategory, BOOKING_SOURCES, DEFAULT_BOOKING_SOURCE,
} from "./data/charges.js";
import { openGrcForm, reprintGrc } from "./grc.js";
import {
  addGuestCharge, openChargesFor, tabTotal, markCharged, writeOffCharges,
} from "./data/guest-charges.js";
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
        ${roomsOnStay(activeRoomRef.branch, room).length > 1 ? `
        <button type="button" class="secondary-btn" id="release-villa-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M15 20v-6H9v6" /></svg>
          Release just this villa
        </button>` : ""}
        <button type="button" class="sheet-text-danger-btn" id="cancel-checkin-btn">Cancel this check-in</button>
      `;
      document.getElementById("check-out-btn").addEventListener("click", startCheckout);
      document.getElementById("cancel-checkin-btn").addEventListener("click", cancelCheckIn);
      const releaseBtn = document.getElementById("release-villa-btn");
      if (releaseBtn) releaseBtn.addEventListener("click", releaseVilla);
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
  // Keyed on the stay, not the villa: a party in two villas has one tab,
  // and a charge follows the guest rather than the room it was sent to.
  const charges = openChargesFor(room.bookingId);
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
  const charges = openChargesFor(room.bookingId);
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
  // The tab is NOT cleared here. It used to be, on the reasoning that these
  // charges were "now on an invoice" — but at this point they are only on a
  // *form*. Pressing Back, which the form itself invites, wiped the tab and
  // raised no invoice: the guest's food simply vanished from their bill.
  // The charges are remembered instead, and removed once an invoice for
  // this villa actually exists.
  interimRef = { branch: activeRoomRef.branch, roomId: room.id, charges: charges.slice() };

  showScreen("screen-form");
}

// Which villa's tab is sitting on the invoice form, waiting to find out
// whether it becomes an invoice or gets abandoned.
let interimRef = null;

// A party booked two villas and halfway through only needs one. Frees the
// villa for someone else while the rest of the stay carries on untouched.
//
// The nights already used go onto the party's running tab rather than
// producing an invoice now, so they still leave with a single bill — one
// guest, one document, which is what checkout already promises.
async function releaseVilla() {
  const room = getActiveRoom();
  const stay = roomsOnStay(activeRoomRef.branch, room);
  if (stay.length < 2) return;

  // Charged to the villas the party keeps, so releasing this one can't
  // take its own charges with it.
  const remaining = stay.filter(r => r.id !== room.id);
  const nightsUsed = Math.max(1, nightsBetween(room.checkin, todayISO()));
  const charge = clampMoney(nightsUsed * (room.rate || 0));

  const ok = await confirmAction({
    title: `Release ${room.name}?`,
    message: `${room.name} becomes available for other guests. ${nightsUsed} night${nightsUsed === 1 ? "" : "s"} already used (${fmtLKR(charge)}) goes onto ${room.guest}'s bill, and ${remaining.map(r => r.name).join(", ")} carr${remaining.length === 1 ? "ies" : "y"} on as normal.`,
    confirmLabel: "Release Villa",
    tone: "safe",
  });
  if (!ok) return;

  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  const keeper = remaining[0];
  if (charge > 0) {
    chargeRoom(keeper, `${room.name} — ${nightsUsed} night${nightsUsed === 1 ? "" : "s"} (released ${formatDate(todayISO())})`,
      nightsUsed, room.rate || 0, "villa");
  }

  // The booking has to stop claiming this villa, or checkout would sweep
  // it back in and free a villa somebody else has since been given.
  if (booking && Array.isArray(booking.roomIds)) {
    booking.roomIds = booking.roomIds.filter(id => id !== room.id);
    booking.villa = remaining.map(r => r.name).join(" + ");
  }

  // Nothing to carry across any more: charges belong to the stay, not to
  // the villa, so releasing one of a party's villas leaves their tab
  // untouched. This used to need charges moved by hand, and getting that
  // wrong silently wiped what the guest had run up.
  logRoomActivity(activeRoomRef.branch, room, room.guest, "Villa Released");
  room.status = "available";
  delete room.guest;
  delete room.phone;
  delete room.checkin;
  delete room.checkout;
  delete room.source;
  delete room.bookingId;

  showToast(`${room.name} released — ${fmtLKR(charge)} added to the bill`);
  closeRoomDetail();
  rerenderRooms();
}

// Undo a mistaken check-in — clears the room back to available without
// generating an invoice, discarding whatever was on the tab.
async function cancelCheckIn() {
  const room = getActiveRoom();
  const rooms = roomsOnStay(activeRoomRef.branch, room);
  // Says how many villas are being released, since the stay may cover more
  // than the one on screen and undoing all of them is not obvious.
  const scope = rooms.length > 1
    ? `${room.guest}'s check-in across ${rooms.length} villas (${rooms.map(r => r.name).join(", ")})`
    : `${room.guest}'s check-in for ${room.name}`;

  // The sheet shows the running tab directly above this button, and the
  // warning used to say only "this can't be undone" — never that the money
  // on screen was about to be written off. Staff were being asked to
  // approve a write-off without being told there was one.
  const unbilled = tabTotal(room.bookingId);
  const moneyWarning = unbilled > 0
    ? ` ${fmtLKR(unbilled)} on the running tab will be written off and billed to nobody.`
    : "";

  const ok = await confirmAction({
    title: "Cancel check-in?",
    message: `Cancel ${scope}?${moneyWarning} This can't be undone.`,
    confirmLabel: unbilled > 0 ? "Cancel & Write Off" : "Cancel Check-In",
    tone: "danger",
  });
  if (!ok) return;

  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  if (booking) booking.status = "Cancelled";
  // The charges are gone from the tab, so no invoice will ever carry them.
  // Left untouched they'd go on counting as revenue in the Food Orders and
  // Activities reports — money the hotel never billed and never took.
  writeOffStayRecords(room.bookingId, `Check-in cancelled for ${room.guest}`);
  writeOffCharges(room.bookingId, `Check-in cancelled for ${room.guest}`);

  rooms.forEach(r => {
    logRoomActivity(activeRoomRef.branch, r, r.guest, "Check-In Cancelled");
    r.status = "available";
    delete r.guest;
    delete r.phone;
    delete r.checkin;
    delete r.checkout;
    delete r.source;
    delete r.bookingId;
  });

  showToast(rooms.length > 1
    ? `Check-in cancelled — ${rooms.length} villas freed`
    : `Check-in cancelled for ${room.name}`);
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
  return addGuestCharge({
    bookingId: room.bookingId ?? null,
    roomId: room.id,
    branch: appState.selectedBranch,
    desc, qty, rate, category,
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
    onComplete: (card, reservation) => {
      const all = ROOMS_BY_BRANCH[branch] || [];

      // A party that reserved several villas is one stay, not several.
      // Checking them in villa by villa produced a separate booking, card
      // and invoice for each — so one group appeared as two guests in the
      // history and got two bills. Every villa on their reservation is
      // taken together, from whichever one staff started on.
      let rooms = [room];
      if (reservation) {
        const reserved = (reservation.villas || [])
          .map(v => all.find(r => r.id === v.roomId))
          .filter(Boolean);
        // Only villas actually free right now. One already occupied
        // belongs to somebody else and can't be handed over silently.
        const free = reserved.filter(r => r.id === room.id || r.status === "available");
        const taken = reserved.filter(r => r.id !== room.id && r.status !== "available");
        rooms = [room, ...free.filter(r => r.id !== room.id)];
        if (taken.length) {
          showToast(`${taken.map(r => r.name).join(", ")} already occupied — checked in to the rest`);
        }
      }

      const source = BOOKING_SOURCES.includes(card.reservationMadeBy)
        ? card.reservationMadeBy
        : DEFAULT_BOOKING_SOURCE;

      // One booking covering every villa on the stay. `roomId` stays as the
      // villa staff started from, so anything joining on it still resolves;
      // `roomIds` is what checkout and cancellation actually work through.
      const booking = {
        id: allocateBookingId(),
        roomId: room.id,
        roomIds: rooms.map(r => r.id),
        guest: card.guestName,
        villa: rooms.map(r => r.name).join(" + "),
        branch,
        checkin: card.arrivalDate,
        checkout: card.departureDate,
        source,
        reservationId: reservation ? reservation.id : null,
        status: "Checked In",
      };
      BOOKINGS.push(booking);

      rooms.forEach(r => {
        r.guest = card.guestName;
        r.phone = card.phone;
        r.checkin = card.arrivalDate;
        r.checkout = card.departureDate;
        r.source = source;
        r.status = "occupied";
        r.bookingId = booking.id;
        logRoomActivity(branch, r, r.guest, "Check In");
      });

      if (rooms.length > 1) {
        showToast(`${card.guestName} checked into ${rooms.length} villas`);
      }
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

// Every villa on the stay, not just the one staff tapped. A party in two
// villas gets one bill covering both — billing the villa you happened to
// open would leave the other one unbilled and still occupied.
function roomsOnStay(branch, room) {
  const all = ROOMS_BY_BRANCH[branch] || [];
  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  if (!booking || !Array.isArray(booking.roomIds) || booking.roomIds.length < 2) return [room];
  const rooms = booking.roomIds.map(id => all.find(r => r.id === id)).filter(Boolean);
  return rooms.length ? rooms : [room];
}

function prefillInvoiceForCheckout(room) {
  const branch = activeRoomRef ? activeRoomRef.branch : appState.selectedBranch;
  const rooms = roomsOnStay(branch, room);

  resetForm();
  setCheckoutContext({ roomId: room.id, bookingId: room.bookingId ?? null, source: room.source ?? null });
  document.getElementById("guest-name").value = room.guest || "";
  document.getElementById("guest-phone").value = room.phone || "";
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";

  const nights = nightsBetween(room.checkin, room.checkout);
  clearItems();

  // One room-charge line per villa, each at its own nightly rate — the
  // villas on a stay are often different sizes and prices.
  rooms.forEach(r => {
    const rate = r.rate || 0;
    addItemRow(r.name + " — Room Charge", String(nights), String(rate), String(nights * rate), "villa");
  });

  // Food orders and activity charges placed during the stay ride along
  // onto the same invoice, each keeping the category it was charged under.
  // One read for the whole stay — they are the party's charges, not any
  // one villa's, so no sweeping across villas and no risk of missing one.
  openChargesFor(room.bookingId).forEach(c => {
    addItemRow(c.desc, c.qty, String(c.rate), String(c.value), c.category);
  });
}

// If an invoice was generated from a Room Map checkout, the villa is free again.
onAfterGenerate((record) => {
  // An interim bill only clears the tab once the invoice is real, and only
  // the exact charges it billed — anything ordered while the form was open
  // stays on the tab rather than being swept away with them.
  if (interimRef) {
    const billedThisVilla = record && record.interim && record.roomId === interimRef.roomId;
    if (billedThisVilla) {
      // Only the charges this invoice actually carried. Anything ordered
      // while the form was open stays on the tab rather than being marked
      // billed along with them.
      markCharged(interimRef.charges, record.id);
    }
    interimRef = null;
  }

  if (checkoutRoomRef) {
    const room = (ROOMS_BY_BRANCH[checkoutRoomRef.branch] || []).find(r => r.id === checkoutRoomRef.roomId);
    if (!room) { checkoutRoomRef = null; return; }

    const booking = BOOKINGS.find(b => b.id === room.bookingId);
    if (booking) booking.status = "Checked Out";

    // Frees every villa on the stay. The invoice just billed all of them,
    // so leaving the others occupied would strand them with no bill left
    // to raise.
    // The invoice just carried the whole tab, so those charges are settled.
    markCharged(openChargesFor(room.bookingId), record && record.id);

    roomsOnStay(checkoutRoomRef.branch, room).forEach(r => {
      logRoomActivity(checkoutRoomRef.branch, r, r.guest, "Check Out");
      r.status = "available";
      delete r.guest;
      delete r.phone;
      delete r.checkin;
      delete r.checkout;
      delete r.source;
      delete r.bookingId;
    });
    checkoutRoomRef = null;
  }
});

document.getElementById("rooms-filter-clear").addEventListener("click", () => renderRooms(null, null));

document.getElementById("room-detail-close").addEventListener("click", closeRoomDetail);
document.getElementById("room-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "room-detail-overlay") closeRoomDetail();
});

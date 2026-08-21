import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, formatDate, formatDateTime, setLogoSrc, showToast } from "./utils.js";
import { INVOICES, FOOD_ORDER_RECORDS, ACTIVITY_RECORDS, BOOKINGS, countsAsRevenue, invoiceLKR } from "./data/reports.js";
import { ROOMS_BY_BRANCH, ROOM_ACTIVITY_LOG } from "./data/rooms.js";
import { RESTOCK_LOG, USAGE_LOG, getInventoryUsage } from "./data/inventory.js";
import { LOGIN_LOG } from "./data/accounts.js";
import { confirmAction } from "./confirm.js";

const state = {
  preset: "month", // today | week | month | lastmonth | custom
  branch: "all",
  tab: "invoices",
  search: "",
  restockView: "list", // list | grouped — only used by the Restock Log tab
};

const BRANCHES = ["Wilpattu", "Arugam Bay"];

// One entry per report, driving the picker options, the printed heading,
// the search placeholder and whether the period filter applies. Previously
// these lived in four different places, which is how the search box ended
// up telling staff to type an invoice number while showing dish sales.
//
// `group` exists because eight flat tabs gave no clue which report answers
// which question — grouping them by what the manager is actually looking
// into does.
const REPORTS = {
  invoices:  { label: "Invoices",             group: "Money",      searchHint: "Guest name or invoice #" },
  food:      { label: "Food Orders",          group: "Money",      searchHint: "Dish name" },
  inventory: { label: "Inventory Usage",      group: "Stock",      searchHint: "Item name", ignoresPeriod: true },
  spend:     { label: "Inventory Spend",      group: "Stock",      searchHint: "Item name" },
  restock:   { label: "Restock Log",          group: "Stock",      searchHint: "Item name" },
  writeoffs: { label: "Stock Written Off",     group: "Stock",      searchHint: "Item name" },
  bookings:  { label: "Bookings & Occupancy", group: "Operations", searchHint: "Guest or villa" },
  activity:  { label: "Check-in / Check-out", group: "Operations", searchHint: "Guest or villa" },
  logins:    { label: "Staff Logins",         group: "Operations", searchHint: "Username" },
};

const REPORT_GROUPS = ["Money", "Stock", "Operations"];

// Full names for the popover and the printed header; short ones for the
// scope chip, where "Wilpattu Forest Retreat" wraps the row onto a second
// line and costs more height than it adds meaning.
const BRANCH_LABELS = {
  all: "All Branches",
  "Wilpattu": "Wilpattu Forest Retreat",
  "Arugam Bay": "Arugam Bay Beachfront Hotel",
};

const BRANCH_SHORT_LABELS = {
  all: "All Branches",
  "Wilpattu": "Wilpattu",
  "Arugam Bay": "Arugam Bay",
};

const PRESET_LABELS = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  lastmonth: "Last Month",
  custom: "Custom range",
};

// ---------- Date range helpers ----------
function getActiveRange() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (state.preset === "today") return [today, today];

  if (state.preset === "week") {
    const day = today.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const start = new Date(today);
    start.setDate(today.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return [start, end];
  }

  if (state.preset === "month") {
    return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)];
  }

  if (state.preset === "lastmonth") {
    return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)];
  }

  // custom
  const fromVal = document.getElementById("custom-from").value;
  const toVal = document.getElementById("custom-to").value;
  const from = fromVal ? new Date(fromVal + "T00:00:00") : new Date(2000, 0, 1);
  const to = toVal ? new Date(toVal + "T00:00:00") : new Date(2100, 0, 1);
  return [from, to];
}

// A record with a missing or unparseable date can't be placed on a
// timeline, so it falls outside every range rather than throwing.
function inRange(dateStr, range) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return false;
  return d >= range[0] && d <= range[1];
}

function formatRangeLabel(range) {
  const opts = { day: "2-digit", month: "short", year: "numeric" };
  const [start, end] = range;
  if (start.getTime() === end.getTime()) return start.toLocaleDateString("en-GB", opts);
  return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", opts)}`;
}

function matchesBranch(recordBranch) {
  return state.branch === "all" || recordBranch === state.branch;
}

function matchesSearch(text) {
  if (!state.search) return true;
  return text.toLowerCase().includes(state.search.toLowerCase());
}

// ---------- Filtered datasets ----------
// A bill raised in USD must not print as "LKR 500". Shows what the guest
// was actually charged, with the LKR the reports counted it as alongside.
function invoiceAmountLabel(inv) {
  if (!inv.currency || inv.currency === "LKR") return fmtLKR(inv.total);
  const amount = `${inv.currency} ${Number(inv.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lkr = invoiceLKR(inv);
  return lkr > 0 ? `${amount} (${fmtLKR(lkr)})` : amount;
}

function getFilteredInvoices(range) {
  return INVOICES
    .filter(inv => inRange(inv.date, range) && matchesBranch(inv.branch) && matchesSearch(inv.guest + " " + inv.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function getFilteredFoodOrders(range) {
  // Written-off orders are excluded here, not hidden: renderFoodTab says
  // how many and what they were worth. They were cooked and served, so
  // they belong in the kitchen record — but no invoice ever carried them,
  // so counting them as revenue overstates the month.
  return FOOD_ORDER_RECORDS.filter(r => inRange(r.date, range) && matchesBranch(r.branch) && matchesSearch(r.dish) && countsAsRevenue(r));
}

function getWrittenOffFood(range) {
  return FOOD_ORDER_RECORDS.filter(r => inRange(r.date, range) && matchesBranch(r.branch) && matchesSearch(r.dish) && !countsAsRevenue(r));
}

function getFilteredInventoryUsage() {
  return getInventoryUsage().filter(r => matchesBranch(r.branch) && matchesSearch(r.item));
}

// Inventory Usage derives "used" from opening + restocked - closing, so it
// can show how much left the store but never why. This is the log the
// staff actually fill in — spoilage, staff meals, kitchen use — and until
// now nothing rendered it at all.
function getFilteredUsageLog(range) {
  return USAGE_LOG
    .filter(r => inRange(r.date, range) && matchesBranch(r.branch) && matchesSearch(r.itemName))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function getFilteredRestockLog(range) {
  return RESTOCK_LOG
    .filter(r => inRange(r.date, range) && matchesBranch(r.branch) && matchesSearch(r.itemName))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function getFilteredLoginLog(range) {
  // Manager logins aren't tied to one branch (they can work either) — show
  // them regardless of which branch filter is active, alongside whichever
  // staff logins match.
  return LOGIN_LOG
    .filter(l => inRange(l.datetime?.slice(0, 10), range) && (state.branch === "all" || l.branch === state.branch || l.branch === null) && matchesSearch(l.username))
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
}

function getFilteredRoomActivity(range) {
  return ROOM_ACTIVITY_LOG
    .filter(a => inRange(a.datetime?.slice(0, 10), range) && matchesBranch(a.branch) && matchesSearch(a.guest + " " + a.villa))
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
}

function getFilteredBookings(range) {
  return BOOKINGS
    .filter(b => inRange(b.checkin, range) && matchesBranch(b.branch) && matchesSearch(b.guest + " " + b.villa))
    .sort((a, b) => (a.checkin < b.checkin ? 1 : -1));
}

// ---------- Summary KPIs (date + branch only, independent of tab/search) ----------
function computeInventorySpend(range) {
  return RESTOCK_LOG
    .filter(r => inRange(r.date, range) && matchesBranch(r.branch))
    .reduce((sum, r) => sum + r.totalCost, 0);
}

function computeProviderPayouts(range) {
  return ACTIVITY_RECORDS
    .filter(r => inRange(r.date, range) && matchesBranch(r.branch) && countsAsRevenue(r))
    .reduce((sum, r) => sum + (r.payout || 0), 0);
}

function computeSummary(range) {
  const invoices = INVOICES.filter(inv => inRange(inv.date, range) && matchesBranch(inv.branch) && inv.status === "Active");
  const revenue = invoices.reduce((sum, inv) => sum + invoiceLKR(inv), 0);
  const count = invoices.length;
  const avg = count ? revenue / count : 0;
  const occupancy = computeOccupancy(range);
  const inventorySpend = computeInventorySpend(range);
  // Safaris, transport and tickets are sold on the guest’s behalf: the
  // full price is on their invoice, but most of it is handed to the jeep
  // operator or driver. The dashboard already shows this as "Payable to
  // Providers" — leaving it out of profit meant the two manager screens
  // contradicted each other, and on the staff’s own numbers (378k of
  // safaris grossed, 57k kept) profit was overstated by the largest
  // single amount in the business.
  const providerPayouts = computeProviderPayouts(range);
  const profit = revenue - inventorySpend - providerPayouts;
  return { revenue, count, avg, occupancy, inventorySpend, providerPayouts, profit };
}

function computeOccupancy(range) {
  const branches = state.branch === "all" ? BRANCHES : [state.branch];
  const totalRooms = branches.reduce((sum, b) => sum + ((ROOMS_BY_BRANCH[b] && ROOMS_BY_BRANCH[b].length) || 0), 0);
  const days = Math.round((range[1] - range[0]) / 86400000) + 1;
  const totalRoomNights = totalRooms * days;
  if (totalRoomNights <= 0) return 0;

  let bookedNights = 0;
  BOOKINGS.filter(b => matchesBranch(b.branch) && b.status !== "Cancelled").forEach(b => {
    const ci = new Date(b.checkin + "T00:00:00");
    const co = new Date(b.checkout + "T00:00:00");
    const start = ci < range[0] ? range[0] : ci;
    const end = co > range[1] ? range[1] : co;
    // Math.max(0, NaN) is NaN, not 0 — an unparseable checkin/checkout date
    // would otherwise poison the running total and render "NaN%".
    const nights = Math.round((end - start) / 86400000);
    // A stay can now span several villas, and each one is a room taken out
    // of availability for those nights. Counting the booking once would
    // under-report occupancy for every multi-villa party.
    const villaCount = Array.isArray(b.roomIds) && b.roomIds.length ? b.roomIds.length : 1;
    bookedNights += Number.isFinite(nights) ? Math.max(0, nights) * villaCount : 0;
  });

  return Math.min(100, Math.round((bookedNights / totalRoomNights) * 100));
}

function computeBranchTotals(range) {
  return BRANCHES.map(branch => {
    const invoices = INVOICES.filter(inv => inRange(inv.date, range) && inv.branch === branch && inv.status === "Active");
    return { branch, revenue: invoices.reduce((s, inv) => s + invoiceLKR(inv), 0), count: invoices.length };
  });
}

// ---------- Rendering ----------
function renderSummary(range) {
  const { revenue, count, avg, occupancy, inventorySpend, profit } = computeSummary(range);
  document.getElementById("reports-kpi-grid").innerHTML = `
    <div class="kpi-strip-row">
      <div class="kpi-pill">
        <span class="kpi-pill-label">Revenue</span>
        <span class="kpi-pill-value">${fmtLKR(revenue)}</span>
      </div>
      <div class="kpi-pill">
        <span class="kpi-pill-label">Invoices</span>
        <span class="kpi-pill-value">${count.toLocaleString("en-US")}</span>
      </div>
      <div class="kpi-pill">
        <span class="kpi-pill-label">Avg. Invoice</span>
        <span class="kpi-pill-value">${fmtLKR(avg)}</span>
      </div>
      <div class="kpi-pill">
        <span class="kpi-pill-label">Occupancy</span>
        <span class="kpi-pill-value">${occupancy}%</span>
      </div>
      <div class="kpi-pill" title="Revenue minus Inventory Spend and money payable to safari/transport providers, for this period">
        <span class="kpi-pill-label">Est. Profit</span>
        <span class="kpi-pill-value ${profit < 0 ? "kpi-value-negative" : ""}">${fmtLKR(profit)}</span>
      </div>
      <div class="kpi-pill" title="From the Inventory Spend tab's restock log">
        <span class="kpi-pill-label">Inv. Spend</span>
        <span class="kpi-pill-value">${fmtLKR(inventorySpend)}</span>
      </div>
    </div>
  `;

  const compareEl = document.getElementById("branch-compare");
  if (state.branch === "all") {
    const totals = computeBranchTotals(range);
    compareEl.style.display = "";
    compareEl.innerHTML = totals.map(t => `
      <div class="branch-compare-card">
        <span class="branch-compare-name">${escapeHtml(t.branch)}</span>
        <span class="branch-compare-revenue">${fmtLKR(t.revenue)}</span>
        <span class="branch-compare-count">${t.count} invoice${t.count === 1 ? "" : "s"}</span>
      </div>
    `).join("");
  } else {
    compareEl.style.display = "none";
    compareEl.innerHTML = "";
  }
}

// "No data for this period." was a dead end — it never said *why* the list
// was empty, and offered nothing to do about it. The three reasons need
// different answers: a search that matched nothing, a period too narrow to
// contain anything, or a report that genuinely has no records yet.
function emptyState() {
  if (state.search) {
    return `
      <div class="report-empty">
        <p class="report-empty-title">Nothing matches “${escapeHtml(state.search)}”.</p>
        <p class="report-empty-hint">Searching ${REPORTS[state.tab].searchHint.toLowerCase()} in ${REPORTS[state.tab].label}.</p>
        <button type="button" class="secondary-btn" data-empty-action="clear-search">Clear search</button>
      </div>
    `;
  }
  if (state.preset !== "month") {
    return `
      <div class="report-empty">
        <p class="report-empty-title">Nothing recorded in this period.</p>
        <p class="report-empty-hint">Showing ${PRESET_LABELS[state.preset].toLowerCase()}.</p>
        <button type="button" class="secondary-btn" data-empty-action="widen-period">Try this month</button>
      </div>
    `;
  }
  return `
    <div class="report-empty">
      <p class="report-empty-title">Nothing recorded this month.</p>
      <p class="report-empty-hint">${escapeHtml(REPORTS[state.tab].label)} entries will appear here as they happen.</p>
    </div>
  `;
}

function renderInvoicesTab(range) {
  const rows = getFilteredInvoices(range);
  if (!rows.length) return emptyState();

  const grandTotal = rows.filter(r => r.status === "Active").reduce((s, r) => s + invoiceLKR(r), 0);

  const list = rows.map(inv => {
    const isVoid = inv.status === "Void";
    // Voided invoices keep their reason on the row — the point of voiding
    // rather than deleting is that someone can see what happened later.
    const voidNote = isVoid && (inv.voidReason || inv.voidedBy)
      ? `<div class="report-row-usage">${inv.voidReason ? `<span>Reason <strong>${escapeHtml(inv.voidReason)}</strong></span>` : ""}${inv.voidedBy ? `<span>Voided by <strong>${escapeHtml(inv.voidedBy)}</strong></span>` : ""}</div>`
      : "";
    const voidBtn = isVoid
      ? ""
      : `<button type="button" class="report-void-btn" data-invoice-id="${escapeHtml(inv.id)}" aria-label="Void invoice #${escapeHtml(inv.id)}">Void</button>`;
    return `
    <div class="report-row ${isVoid ? "report-row-void" : ""}">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">#${escapeHtml(inv.id)} — ${escapeHtml(inv.guest)}</span>
          <span class="report-row-sub">${escapeHtml(inv.branch)} &middot; ${formatDate(inv.date)}</span>
        </div>
        <div class="report-row-end">
          <span class="report-row-amount">${invoiceAmountLabel(inv)}</span>
          <span class="stock-badge ${isVoid ? "low" : ""}">${inv.status}</span>
          ${voidBtn}
        </div>
      </div>
      ${voidNote}
    </div>`;
  }).join("");

  return `
    ${list}
    <div class="report-grand-total"><span>Grand Total</span><span>${fmtLKR(grandTotal)}</span></div>
  `;
}

// Food that was made and served but that no invoice ever carried — a
// cancelled check-in leaves exactly this behind. It is a real cost with no
// income against it, so it gets stated plainly rather than quietly dropped.
function renderWriteOffNote(off) {
  const value = off.reduce((s, r) => s + (r.revenue || 0), 0);
  const reasons = [...new Set(off.map(r => r.writeOffReason).filter(Boolean))];
  return `
    <div class="report-writeoff-note">
      <span class="report-writeoff-head">${off.length} order${off.length === 1 ? "" : "s"} written off &middot; ${fmtLKR(value)}</span>
      <span class="report-writeoff-sub">Served but never billed, so not counted as revenue.${reasons.length ? " " + escapeHtml(reasons.join("; ")) : ""}</span>
    </div>`;
}

function renderFoodTab(range) {
  const rows = getFilteredFoodOrders(range);
  const off = getWrittenOffFood(range);
  // Shown even when there are no countable rows left — a report that just
  // says "nothing here" would hide the fact that food was served and
  // written off, which is exactly what a manager needs to see.
  const offNote = off.length ? renderWriteOffNote(off) : "";
  if (!rows.length) return offNote + emptyState();

  // Grouped by branch + dish, not just dish name — the two branches run
  // entirely separate menus, so an identically-named dish from each (e.g.
  // both happen to have a "Chicken Fried Rice") is not the same item and
  // shouldn't have its sales pooled together.
  const byDish = {};
  rows.forEach(r => {
    const key = `${r.branch}::${r.dish}`;
    if (!byDish[key]) byDish[key] = { dish: r.dish, branch: r.branch, qty: 0, revenue: 0 };
    byDish[key].qty += r.qty;
    byDish[key].revenue += r.revenue;
  });
  const ranked = Object.values(byDish).sort((a, b) => b.qty - a.qty);

  return offNote + ranked.map((d, i) => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">#${i + 1} ${escapeHtml(d.dish)}</span>
          <span class="report-row-sub">${escapeHtml(d.branch)} &middot; ${d.qty} sold</span>
        </div>
        <div class="report-row-end">
          <span class="report-row-amount">${fmtLKR(d.revenue)}</span>
        </div>
      </div>
    </div>
  `).join("");
}

function renderInventoryTab() {
  const rows = getFilteredInventoryUsage();
  if (!rows.length) return emptyState();

  return rows.map(r => {
    const isLow = r.closing < r.minStock;
    return `
      <div class="report-row ${isLow ? "report-row-low" : ""}">
        <div class="report-row-top">
          <div>
            <span class="report-row-title">${escapeHtml(r.item)}</span>
            <span class="report-row-sub">${escapeHtml(r.category)} &middot; ${escapeHtml(r.branch)}</span>
          </div>
          <span class="stock-badge ${isLow ? "low" : ""}">${isLow ? "Low" : "OK"}</span>
        </div>
        <div class="report-row-usage">
          <span>Opening <strong>${r.opening}</strong></span>
          <span>Restocked <strong>+${r.restocked}</strong></span>
          <span>Used <strong>-${r.used}</strong></span>
          <span>Closing <strong>${r.closing}</strong></span>
        </div>
      </div>
    `;
  }).join("");
}

// Grouped by reason first, because the question a manager brings to this
// report is "how much are we throwing away", not "what happened on the 3rd".
function renderWriteoffsTab(range) {
  const rows = getFilteredUsageLog(range);
  if (!rows.length) return emptyState();

  const byReason = {};
  rows.forEach(r => {
    if (!byReason[r.reason]) byReason[r.reason] = [];
    byReason[r.reason].push(r);
  });

  // Reuses .report-group-heading, the same grouping treatment the Restock
  // Log already uses, so the two Stock reports read alike.
  return Object.keys(byReason).sort().map(reason => {
    const entries = byReason[reason];
    return `
      <h4 class="report-group-heading">${escapeHtml(reason)} &middot; ${entries.length} entr${entries.length === 1 ? "y" : "ies"}</h4>
      ${entries.map(r => `
        <div class="report-row">
          <div class="report-row-top">
            <div>
              <span class="report-row-title">${escapeHtml(r.itemName)}</span>
              <span class="report-row-sub">${escapeHtml(r.category)} &middot; ${escapeHtml(r.branch)} &middot; ${formatDate(r.date)}</span>
            </div>
            <span class="report-row-amount">-${r.qty} ${escapeHtml(r.unit || "")}</span>
          </div>
        </div>`).join("")}`;
  }).join("");
}

function renderSpendTab(range) {
  const rows = getFilteredRestockLog(range);
  if (!rows.length) return emptyState();

  const totalSpend = rows.reduce((s, r) => s + r.totalCost, 0);

  const byItem = {};
  rows.forEach(r => {
    if (!byItem[r.itemName]) byItem[r.itemName] = { item: r.itemName, category: r.category, qty: 0, spend: 0, entries: [] };
    byItem[r.itemName].qty += r.qty;
    byItem[r.itemName].spend += r.totalCost;
    byItem[r.itemName].entries.push(r);
  });
  const ranked = Object.values(byItem).sort((a, b) => b.spend - a.spend);

  const list = ranked.map((d, i) => {
    const first = d.entries[0].unitCost;
    const last = d.entries[d.entries.length - 1].unitCost;
    let trend = `<span class="spend-trend flat">No trend yet</span>`;
    if (d.entries.length > 1 && first > 0 && last !== first) {
      const pct = Math.round(((last - first) / first) * 100);
      trend = `<span class="spend-trend ${pct > 0 ? "up" : "down"}">${pct > 0 ? "&uarr;" : "&darr;"} ${Math.abs(pct)}% since first buy</span>`;
    }
    return `
      <div class="report-row">
        <div class="report-row-top">
          <div>
            <span class="report-row-title">#${i + 1} ${escapeHtml(d.item)}</span>
            <span class="report-row-sub">${escapeHtml(d.category)} &middot; ${d.entries.length} purchase${d.entries.length === 1 ? "" : "s"} &middot; avg ${fmtLKR(d.spend / d.qty)}/unit</span>
          </div>
          <div class="report-row-end">
            <span class="report-row-amount">${fmtLKR(d.spend)}</span>
            ${trend}
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    ${list}
    <div class="report-grand-total"><span>Total Spend</span><span>${fmtLKR(totalSpend)}</span></div>
  `;
}

function renderRestockLogRow(r) {
  return `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">${escapeHtml(r.itemName)}</span>
          <span class="report-row-sub">${escapeHtml(r.category)} &middot; ${escapeHtml(r.branch)} &middot; ${formatDate(r.date)}</span>
        </div>
        <div class="report-row-end">
          <span class="report-row-amount">${fmtLKR(r.totalCost)}</span>
          <span class="report-row-sub">${r.qty}${escapeHtml(r.unit)} &middot; ${fmtLKR(r.unitCost)}/unit</span>
        </div>
      </div>
    </div>
  `;
}

function renderRestockLogTab(range) {
  // Newest first — "add to inventory" purchases, latest on top.
  const rows = [...getFilteredRestockLog(range)].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) return emptyState();

  if (state.restockView === "grouped") {
    const groups = {};
    rows.forEach(r => {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });
    return Object.keys(groups).sort().map(category => `
      <h4 class="report-group-heading">${escapeHtml(category)}</h4>
      ${groups[category].map(renderRestockLogRow).join("")}
    `).join("");
  }

  return rows.map(renderRestockLogRow).join("");
}

function renderLoginsTab(range) {
  const rows = getFilteredLoginLog(range);
  if (!rows.length) return emptyState();

  return rows.map(l => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">${escapeHtml(l.username)}</span>
          <span class="report-row-sub">${l.role === "manager" ? "Manager" : "Staff"} &middot; ${l.branch ? escapeHtml(l.branch) : "All Branches"}</span>
        </div>
        <span class="report-row-amount">${formatDateTime(l.datetime)}</span>
      </div>
    </div>
  `).join("");
}

function renderActivityTab(range) {
  const rows = getFilteredRoomActivity(range);
  if (!rows.length) return emptyState();

  return rows.map(a => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">${escapeHtml(a.guest)}</span>
          <span class="report-row-sub">${escapeHtml(a.villa)} &middot; ${escapeHtml(a.branch)} &middot; ${formatDateTime(a.datetime)}</span>
        </div>
        <span class="stock-badge ${a.action === "Check In" ? "" : "low"}">${escapeHtml(a.action)}</span>
      </div>
    </div>
  `).join("");
}

function renderBookingsTab(range) {
  const rows = getFilteredBookings(range);
  if (!rows.length) return emptyState();

  const totalNights = rows.reduce((s, b) => {
    const ci = new Date(b.checkin + "T00:00:00");
    const co = new Date(b.checkout + "T00:00:00");
    return s + Math.max(0, Math.round((co - ci) / 86400000));
  }, 0);
  const occupancy = computeOccupancy(range);

  const list = rows.map(b => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">${escapeHtml(b.guest)}</span>
          <span class="report-row-sub">${escapeHtml(b.villa)} &middot; ${escapeHtml(b.branch)} &middot; ${formatDate(b.checkin)} &rarr; ${formatDate(b.checkout)}</span>
        </div>
        <span class="stock-badge ${b.status === "Cancelled" ? "low" : ""}">${escapeHtml(b.status)}</span>
      </div>
    </div>
  `).join("");

  return `
    ${list}
    <div class="report-grand-total">
      <span>${rows.length} bookings &middot; ${totalNights} nights</span>
      <span>${occupancy}% occupancy</span>
    </div>
  `;
}

function renderReportBody(range) {
  const body = document.getElementById("report-body");
  const labels = {
    invoices: "Invoices", food: "Food Orders", inventory: "Inventory Usage", spend: "Inventory Spend",
    restock: "Restock Log", writeoffs: "Stock Written Off", logins: "Staff Logins", activity: "Check-in / Check-out", bookings: "Bookings & Occupancy",
  };
  document.getElementById("report-tab-label").textContent = labels[state.tab];
  document.getElementById("report-view-toggle").style.display = state.tab === "restock" ? "flex" : "none";

  // A report that ignores the period shouldn't offer a period control that
  // silently does nothing — dim the chip and say why.
  const ignoresPeriod = Boolean(REPORTS[state.tab].ignoresPeriod);
  document.getElementById("period-chip").classList.toggle("inert", ignoresPeriod);
  document.getElementById("period-filter-note").hidden = !ignoresPeriod;

  if (state.tab === "invoices") {
    body.innerHTML = renderInvoicesTab(range);
    body.querySelectorAll(".report-void-btn").forEach(btn => {
      btn.addEventListener("click", () => openVoidSheet(btn.dataset.invoiceId));
    });
  }
  else if (state.tab === "food") body.innerHTML = renderFoodTab(range);
  else if (state.tab === "inventory") body.innerHTML = renderInventoryTab();
  else if (state.tab === "spend") body.innerHTML = renderSpendTab(range);
  else if (state.tab === "restock") body.innerHTML = renderRestockLogTab(range);
  else if (state.tab === "writeoffs") body.innerHTML = renderWriteoffsTab(range);
  else if (state.tab === "logins") body.innerHTML = renderLoginsTab(range);
  else if (state.tab === "activity") body.innerHTML = renderActivityTab(range);
  else body.innerHTML = renderBookingsTab(range);

  // Wired here rather than in emptyState() because every tab writes over
  // body.innerHTML, which would discard listeners attached any earlier.
  const clearBtn = body.querySelector('[data-empty-action="clear-search"]');
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      state.search = "";
      closeSearch();
      renderAll();
    });
  }
  const widenBtn = body.querySelector('[data-empty-action="widen-period"]');
  if (widenBtn) {
    widenBtn.addEventListener("click", () => {
      state.preset = "month";
      document.querySelectorAll("#date-preset-row .scope-option")
        .forEach(o => o.classList.toggle("active", o.dataset.preset === "month"));
      document.getElementById("custom-range-row").style.display = "none";
      renderAll();
    });
  }
}

// Keeps the two scope chips reading as the current state, and offers a
// Reset only when there is actually something to reset.
function renderScope(range) {
  const periodLabel = state.preset === "custom" ? formatRangeLabel(range) : PRESET_LABELS[state.preset];
  document.getElementById("period-chip-label").textContent = periodLabel;
  document.getElementById("branch-chip-label").textContent = BRANCH_SHORT_LABELS[state.branch];

  const isDefault = state.preset === "month" && state.branch === "all" && !state.search;
  document.getElementById("scope-reset").hidden = isDefault;

  // The screen shows scope in the chips; the printout has no chips, so it
  // gets a text line instead. The report's own name is left out — the
  // print-only <h3> above the table already carries it.
  const scopeParts = [formatRangeLabel(range), BRANCH_LABELS[state.branch]];
  if (state.search) scopeParts.push(`filtered by “${state.search}”`);
  document.getElementById("reports-print-scope").textContent = scopeParts.join(" · ");
}

function renderAll() {
  const range = getActiveRange();
  renderScope(range);
  renderSummary(range);
  renderReportBody(range);
}

// ---------- Toolbar wiring ----------
function buildReportPicker() {
  const select = document.getElementById("report-select");
  select.innerHTML = REPORT_GROUPS.map(group => {
    const opts = Object.entries(REPORTS)
      .filter(([, cfg]) => cfg.group === group)
      .map(([key, cfg]) => `<option value="${key}" ${key === state.tab ? "selected" : ""}>${cfg.label}</option>`)
      .join("");
    return `<optgroup label="${group}">${opts}</optgroup>`;
  }).join("");
}
buildReportPicker();

document.getElementById("report-select").addEventListener("change", (e) => {
  state.tab = e.target.value;
  // Search terms are report-specific — carrying "perera" from Invoices over
  // to Inventory Usage would show an empty table for no visible reason.
  state.search = "";
  document.getElementById("reports-search").value = "";
  document.getElementById("reports-search").placeholder = REPORTS[state.tab].searchHint;
  closeSearch();
  renderAll();
});

// ---- Scope popovers ----
const popovers = [
  { chip: "period-chip", panel: "period-popover" },
  { chip: "branch-chip", panel: "branch-popover" },
];

function closePopovers(except = null) {
  popovers.forEach(p => {
    if (p.panel === except) return;
    document.getElementById(p.panel).hidden = true;
    document.getElementById(p.chip).setAttribute("aria-expanded", "false");
  });
}

popovers.forEach(p => {
  document.getElementById(p.chip).addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById(p.panel);
    const willOpen = panel.hidden;
    closePopovers(willOpen ? p.panel : null);
    panel.hidden = !willOpen;
    document.getElementById(p.chip).setAttribute("aria-expanded", String(willOpen));
  });
});

// Clicking inside a popover shouldn't dismiss it — only clicking away should.
document.querySelectorAll(".scope-popover").forEach(panel => {
  panel.addEventListener("click", (e) => e.stopPropagation());
});
document.addEventListener("click", () => closePopovers());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePopovers();
});

document.querySelectorAll("#date-preset-row .scope-option").forEach(opt => {
  opt.addEventListener("click", () => {
    document.querySelectorAll("#date-preset-row .scope-option").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    state.preset = opt.dataset.preset;
    const custom = state.preset === "custom";
    document.getElementById("custom-range-row").style.display = custom ? "flex" : "none";
    // Custom needs its date inputs, so the popover stays open for it.
    if (!custom) closePopovers();
    renderAll();
  });
});

document.querySelectorAll("#branch-option-row .scope-option").forEach(opt => {
  opt.addEventListener("click", () => {
    document.querySelectorAll("#branch-option-row .scope-option").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    state.branch = opt.dataset.branch;
    closePopovers();
    renderAll();
  });
});

["custom-from", "custom-to"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    if (state.preset === "custom") renderAll();
  });
});

document.getElementById("scope-reset").addEventListener("click", () => {
  state.preset = "month";
  state.branch = "all";
  state.search = "";
  document.getElementById("reports-search").value = "";
  document.querySelectorAll("#date-preset-row .scope-option").forEach(o => o.classList.toggle("active", o.dataset.preset === "month"));
  document.querySelectorAll("#branch-option-row .scope-option").forEach(o => o.classList.toggle("active", o.dataset.branch === "all"));
  document.getElementById("custom-range-row").style.display = "none";
  closeSearch();
  renderAll();
});

// ---- Search (collapsed until asked for) ----
const searchRow = document.getElementById("report-search-row");
const searchInput = document.getElementById("reports-search");

function openSearch() {
  searchRow.hidden = false;
  document.getElementById("report-search-toggle").setAttribute("aria-expanded", "true");
  document.getElementById("report-search-toggle").classList.add("active");
  searchInput.focus();
}

function closeSearch() {
  searchRow.hidden = true;
  document.getElementById("report-search-toggle").setAttribute("aria-expanded", "false");
  document.getElementById("report-search-toggle").classList.remove("active");
}

document.getElementById("report-search-toggle").addEventListener("click", () => {
  if (searchRow.hidden) openSearch();
  else {
    // Closing has to clear the term too, or the report stays filtered by
    // something the manager can no longer see.
    searchInput.value = "";
    state.search = "";
    closeSearch();
    renderAll();
  }
});

document.getElementById("report-search-close").addEventListener("click", () => {
  searchInput.value = "";
  state.search = "";
  closeSearch();
  renderAll();
});

searchInput.addEventListener("input", (e) => {
  state.search = e.target.value.trim();
  renderScope(getActiveRange());
  renderReportBody(getActiveRange());
});

document.querySelectorAll("#report-view-toggle .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#report-view-toggle .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.restockView = chip.dataset.view;
    renderReportBody(getActiveRange());
  });
});

// ---------- Export & share ----------
function csvEscape(value) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function getExportRows() {
  const range = getActiveRange();
  if (state.tab === "invoices") {
    return {
      // Category columns mirror the money columns the manager already
      // keeps by hand, so an exported month can be reconciled against
      // their spreadsheet line for line.
      headers: [
        "Invoice #", "Guest", "Branch", "Date", "Source", "Currency", "Total (billed)", "Rate", "Total (LKR)",
        "Villa", "Food", "Safari", "Transport", "Ticket", "Other",
        "Service Charge", "Status", "Void Reason", "Voided By",
      ],
      rows: getFilteredInvoices(range).map(r => {
        const c = r.categoryTotals || {};
        return [
          r.id, r.guest, r.branch, r.date, r.source || "", r.currency || "LKR", r.total,
          r.exchangeRate || 1, invoiceLKR(r),
          c.villa || 0, c.food || 0, c.safari || 0, c.transport || 0, c.ticket || 0, c.other || 0,
          r.serviceCharge || 0, r.status, r.voidReason || "", r.voidedBy || "",
        ];
      }),
    };
  }
  if (state.tab === "food") {
    const rows = getFilteredFoodOrders(range);
    const byDish = {};
    rows.forEach(r => {
      const key = `${r.branch}::${r.dish}`;
      if (!byDish[key]) byDish[key] = { dish: r.dish, branch: r.branch, qty: 0, revenue: 0 };
      byDish[key].qty += r.qty;
      byDish[key].revenue += r.revenue;
    });
    return {
      headers: ["Dish", "Branch", "Qty Sold", "Revenue (LKR)"],
      rows: Object.values(byDish).sort((a, b) => b.qty - a.qty).map(d => [d.dish, d.branch, d.qty, d.revenue]),
    };
  }
  if (state.tab === "inventory") {
    return {
      headers: ["Item", "Category", "Branch", "Opening", "Restocked", "Used", "Closing", "Min Stock"],
      rows: getFilteredInventoryUsage().map(r => [r.item, r.category, r.branch, r.opening, r.restocked, r.used, r.closing, r.minStock]),
    };
  }
  if (state.tab === "writeoffs") {
    return {
      headers: ["Date", "Item", "Category", "Branch", "Qty", "Unit", "Reason"],
      rows: getFilteredUsageLog(range).map(r => [r.date, r.itemName, r.category, r.branch, r.qty, r.unit, r.reason]),
    };
  }
  if (state.tab === "spend" || state.tab === "restock") {
    return {
      headers: ["Date", "Item", "Category", "Branch", "Qty", "Unit Cost (LKR)", "Total Cost (LKR)"],
      rows: getFilteredRestockLog(range).map(r => [r.date, r.itemName, r.category, r.branch, r.qty, r.unitCost, r.totalCost]),
    };
  }
  if (state.tab === "logins") {
    return {
      headers: ["Username", "Role", "Branch", "Date & Time"],
      rows: getFilteredLoginLog(range).map(l => [l.username, l.role, l.branch || "All Branches", l.datetime]),
    };
  }
  if (state.tab === "activity") {
    return {
      headers: ["Guest", "Villa", "Branch", "Action", "Date & Time"],
      rows: getFilteredRoomActivity(range).map(a => [a.guest, a.villa, a.branch, a.action, a.datetime]),
    };
  }
  return {
    headers: ["Guest", "Villa", "Branch", "Check-in", "Check-out", "Status"],
    rows: getFilteredBookings(range).map(b => [b.guest, b.villa, b.branch, b.checkin, b.checkout, b.status]),
  };
}

document.getElementById("export-csv-btn").addEventListener("click", () => {
  const { headers, rows } = getExportRows();
  if (!rows.length) {
    showToast("No data to export for this period");
    return;
  }
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `leopardinn-${state.tab}-report.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("print-report-btn").addEventListener("click", () => window.print());

document.getElementById("copy-summary-btn").addEventListener("click", async () => {
  const range = getActiveRange();
  const { revenue, count, avg, occupancy, inventorySpend, profit } = computeSummary(range);
  const branchLabel = state.branch === "all" ? "All Branches" : state.branch;
  const text = [
    "*Leopard Inn — Reports Summary*",
    `Period: ${formatRangeLabel(range)}`,
    `Branch: ${branchLabel}`,
    "",
    `💰 Total Revenue: ${fmtLKR(revenue)}`,
    `🧾 Invoices: ${count}`,
    `📊 Avg Invoice: ${fmtLKR(avg)}`,
    `🏨 Occupancy: ${occupancy}%`,
    `📦 Inventory Spend: ${fmtLKR(inventorySpend)}`,
    `📈 Est. Profit: ${fmtLKR(profit)}`,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast("Summary copied!");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    showToast(copied ? "Summary copied!" : "Couldn't copy summary");
  }
});

document.getElementById("open-reports-btn").addEventListener("click", () => {
  setLogoSrc("reports-logo", appState.selectedBranchLogo);
  // Opens scoped to the branch the manager is already working in.
  state.branch = appState.selectedBranch;
  document.querySelectorAll("#branch-option-row .scope-option").forEach(o => {
    o.classList.toggle("active", o.dataset.branch === state.branch);
  });
  searchInput.placeholder = REPORTS[state.tab].searchHint;
  showScreen("screen-reports");
  renderAll();
});

// ---- Void an invoice (manager-only; Reports is already manager-gated) ----
// A wrong bill can't be deleted — the record has to stay so the numbering
// has no unexplained gaps and someone can see later what happened. Voiding
// keeps the row, marks it VOID, and drops it out of every revenue figure
// (computeSummary/computeBranchTotals/dashboard all filter status==="Active").
// Deliberately money-only: it does NOT reopen the villa or the booking,
// since the villa may already be re-let. Re-issue a corrected invoice.
let voidingInvoiceId = null;

function openVoidSheet(invoiceId) {
  const inv = INVOICES.find(i => String(i.id) === String(invoiceId));
  if (!inv || inv.status === "Void") return;
  voidingInvoiceId = inv.id;

  document.getElementById("void-sheet-summary").textContent =
    `#${inv.id} — ${inv.guest} · ${inv.branch} · ${formatDate(inv.date)} · ${invoiceAmountLabel(inv)}`;
  document.getElementById("void-reason").value = "";
  document.getElementById("void-sheet-overlay").classList.add("open");
}

function closeVoidSheet() {
  document.getElementById("void-sheet-overlay").classList.remove("open");
  voidingInvoiceId = null;
}

document.getElementById("void-sheet-close").addEventListener("click", closeVoidSheet);
document.getElementById("void-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "void-sheet-overlay") closeVoidSheet();
});

document.getElementById("void-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (voidingInvoiceId === null) return;

  const inv = INVOICES.find(i => String(i.id) === String(voidingInvoiceId));
  if (!inv || inv.status === "Void") { closeVoidSheet(); return; }

  const reason = document.getElementById("void-reason").value.trim();
  const ok = await confirmAction({
    title: "Void this invoice?",
    message: `#${inv.id} for ${inv.guest} (${invoiceAmountLabel(inv)}) will stop counting toward revenue. This can't be undone.`,
    confirmLabel: "Void Invoice",
    tone: "danger",
  });
  if (!ok) return;

  inv.status = "Void";
  inv.voidReason = reason;
  inv.voidedAt = new Date().toISOString();
  // An invoice records who prepared it; cancelling one is the bigger
  // financial act and recorded nobody. Two managers share these accounts,
  // and "who wrote this off" is the first question an audit asks.
  inv.voidedBy = appState.currentUser || "";

  closeVoidSheet();
  renderAll();
  showToast(`Invoice #${inv.id} voided`);
});

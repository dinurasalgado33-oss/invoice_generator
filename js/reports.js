import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, formatDate, formatDateTime, setLogoSrc, showToast } from "./utils.js";
import { INVOICES, FOOD_ORDER_RECORDS, INVENTORY_USAGE, BOOKINGS } from "./data/reports.js";
import { ROOMS_BY_BRANCH, ROOM_ACTIVITY_LOG } from "./data/rooms.js";
import { RESTOCK_LOG } from "./data/inventory.js";
import { LOGIN_LOG } from "./data/accounts.js";

const state = {
  preset: "month", // today | week | month | lastmonth | custom
  branch: "all",
  tab: "invoices",
  search: "",
  restockView: "list", // list | grouped — only used by the Restock Log tab
};

const BRANCHES = ["Wilpattu", "Arugam Bay"];

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

function inRange(dateStr, range) {
  const d = new Date(dateStr + "T00:00:00");
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
function getFilteredInvoices(range) {
  return INVOICES
    .filter(inv => inRange(inv.date, range) && matchesBranch(inv.branch) && matchesSearch(inv.guest + " " + inv.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function getFilteredFoodOrders(range) {
  return FOOD_ORDER_RECORDS.filter(r => inRange(r.date, range) && matchesBranch(r.branch) && matchesSearch(r.dish));
}

function getFilteredInventoryUsage() {
  return INVENTORY_USAGE.filter(r => matchesBranch(r.branch) && matchesSearch(r.item));
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
    .filter(l => inRange(l.datetime.slice(0, 10), range) && (state.branch === "all" || l.branch === state.branch || l.branch === null) && matchesSearch(l.username))
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
}

function getFilteredRoomActivity(range) {
  return ROOM_ACTIVITY_LOG
    .filter(a => inRange(a.datetime.slice(0, 10), range) && matchesBranch(a.branch) && matchesSearch(a.guest + " " + a.villa))
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

function computeSummary(range) {
  const invoices = INVOICES.filter(inv => inRange(inv.date, range) && matchesBranch(inv.branch) && inv.status === "Active");
  const revenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const count = invoices.length;
  const avg = count ? revenue / count : 0;
  const occupancy = computeOccupancy(range);
  const inventorySpend = computeInventorySpend(range);
  const profit = revenue - inventorySpend;
  return { revenue, count, avg, occupancy, inventorySpend, profit };
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
    bookedNights += Math.max(0, Math.round((end - start) / 86400000));
  });

  return Math.min(100, Math.round((bookedNights / totalRoomNights) * 100));
}

function computeBranchTotals(range) {
  return BRANCHES.map(branch => {
    const invoices = INVOICES.filter(inv => inRange(inv.date, range) && inv.branch === branch && inv.status === "Active");
    return { branch, revenue: invoices.reduce((s, inv) => s + inv.total, 0), count: invoices.length };
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
      <div class="kpi-pill" title="Revenue minus Inventory Spend for this period">
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

function emptyState() {
  return `<p class="room-detail-empty">No data for this period.</p>`;
}

function renderInvoicesTab(range) {
  const rows = getFilteredInvoices(range);
  if (!rows.length) return emptyState();

  const grandTotal = rows.filter(r => r.status === "Active").reduce((s, r) => s + r.total, 0);

  const list = rows.map(inv => `
    <div class="report-row ${inv.status === "Void" ? "report-row-void" : ""}">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">#${escapeHtml(inv.id)} — ${escapeHtml(inv.guest)}</span>
          <span class="report-row-sub">${escapeHtml(inv.branch)} &middot; ${formatDate(inv.date)}</span>
        </div>
        <div class="report-row-end">
          <span class="report-row-amount">${fmtLKR(inv.total)}</span>
          <span class="stock-badge ${inv.status === "Void" ? "low" : ""}">${inv.status}</span>
        </div>
      </div>
    </div>
  `).join("");

  return `
    ${list}
    <div class="report-grand-total"><span>Grand Total</span><span>${fmtLKR(grandTotal)}</span></div>
  `;
}

function renderFoodTab(range) {
  const rows = getFilteredFoodOrders(range);
  if (!rows.length) return emptyState();

  const byDish = {};
  rows.forEach(r => {
    if (!byDish[r.dish]) byDish[r.dish] = { dish: r.dish, qty: 0, revenue: 0, branches: new Set() };
    byDish[r.dish].qty += r.qty;
    byDish[r.dish].revenue += r.revenue;
    byDish[r.dish].branches.add(r.branch);
  });
  const ranked = Object.values(byDish).sort((a, b) => b.qty - a.qty);

  return ranked.map((d, i) => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">#${i + 1} ${escapeHtml(d.dish)}</span>
          <span class="report-row-sub">${[...d.branches].join(", ")} &middot; ${d.qty} sold</span>
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

  const statusClass = { "Checked In": "occupied", "Upcoming": "booked", "Checked Out": "ok", "Cancelled": "low" };

  const list = rows.map(b => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-title">${escapeHtml(b.guest)}</span>
          <span class="report-row-sub">${escapeHtml(b.villa)} &middot; ${escapeHtml(b.branch)} &middot; ${formatDate(b.checkin)} &rarr; ${formatDate(b.checkout)}</span>
        </div>
        <span class="stock-badge ${statusClass[b.status] === "low" ? "low" : ""}">${escapeHtml(b.status)}</span>
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
    restock: "Restock Log", logins: "Staff Logins", activity: "Check-in / Check-out", bookings: "Bookings & Occupancy",
  };
  document.getElementById("report-tab-label").textContent = labels[state.tab];
  document.getElementById("report-view-toggle").style.display = state.tab === "restock" ? "flex" : "none";

  const isInventoryTab = state.tab === "inventory";
  document.getElementById("period-filter-group").classList.toggle("disabled", isInventoryTab);
  document.getElementById("period-filter-note").style.display = isInventoryTab ? "" : "none";

  if (state.tab === "invoices") body.innerHTML = renderInvoicesTab(range);
  else if (state.tab === "food") body.innerHTML = renderFoodTab(range);
  else if (state.tab === "inventory") body.innerHTML = renderInventoryTab();
  else if (state.tab === "spend") body.innerHTML = renderSpendTab(range);
  else if (state.tab === "restock") body.innerHTML = renderRestockLogTab(range);
  else if (state.tab === "logins") body.innerHTML = renderLoginsTab(range);
  else if (state.tab === "activity") body.innerHTML = renderActivityTab(range);
  else body.innerHTML = renderBookingsTab(range);
}

function renderAll() {
  const range = getActiveRange();
  document.getElementById("reports-period-label").textContent = "Period: " + formatRangeLabel(range);
  renderSummary(range);
  renderReportBody(range);
}

// ---------- Filter wiring ----------
document.querySelectorAll("#date-preset-row .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#date-preset-row .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.preset = chip.dataset.preset;
    document.getElementById("custom-range-row").style.display = state.preset === "custom" ? "flex" : "none";
    renderAll();
  });
});

["custom-from", "custom-to"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    if (state.preset === "custom") renderAll();
  });
});

document.getElementById("reports-branch-select").addEventListener("change", (e) => {
  state.branch = e.target.value;
  renderAll();
});

document.getElementById("reports-search").addEventListener("input", (e) => {
  state.search = e.target.value.trim();
  renderReportBody(getActiveRange());
});

document.querySelectorAll(".report-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".report-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.tab = tab.dataset.report;
    renderReportBody(getActiveRange());
  });
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
      headers: ["Invoice #", "Guest", "Branch", "Date", "Total (LKR)", "Status"],
      rows: getFilteredInvoices(range).map(r => [r.id, r.guest, r.branch, r.date, r.total, r.status]),
    };
  }
  if (state.tab === "food") {
    const rows = getFilteredFoodOrders(range);
    const byDish = {};
    rows.forEach(r => {
      if (!byDish[r.dish]) byDish[r.dish] = { dish: r.dish, qty: 0, revenue: 0 };
      byDish[r.dish].qty += r.qty;
      byDish[r.dish].revenue += r.revenue;
    });
    return {
      headers: ["Dish", "Qty Sold", "Revenue (LKR)"],
      rows: Object.values(byDish).sort((a, b) => b.qty - a.qty).map(d => [d.dish, d.qty, d.revenue]),
    };
  }
  if (state.tab === "inventory") {
    return {
      headers: ["Item", "Category", "Branch", "Opening", "Restocked", "Used", "Closing", "Min Stock"],
      rows: getFilteredInventoryUsage().map(r => [r.item, r.category, r.branch, r.opening, r.restocked, r.used, r.closing, r.minStock]),
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
  state.branch = appState.selectedBranch;
  document.getElementById("reports-branch-select").value = appState.selectedBranch;
  showScreen("screen-reports");
  renderAll();
});

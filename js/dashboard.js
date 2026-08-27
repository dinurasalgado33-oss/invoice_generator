import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, toDateISO, showToast } from "./utils.js";
import { CHART_COLORS } from "./data/dashboard.js";
import { INVOICES, FOOD_ORDER_RECORDS, ACTIVITY_RECORDS, BOOKINGS, countsAsRevenue, invoiceLKR } from "./data/reports.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { CHARGE_CATEGORY_LABELS } from "./data/charges.js";

let pieChart = null;
let lineChart = null;

// Returns "" for a missing/short date rather than throwing — a single
// null-dated invoice used to crash renderDashboard() from inside its
// setTimeout, which surfaced nowhere and left every KPI showing stale
// numbers from the previous render.
function monthKey(dateStr) {
  return typeof dateStr === "string" ? dateStr.slice(0, 7) : ""; // "YYYY-MM"
}

// Same occupancy math as Reports (bookings/day-in-range vs total room-nights),
// scoped to one calendar month so the two screens can't disagree.
function computeMonthlyOccupancy(branch, year, month) {
  const totalRooms = (ROOMS_BY_BRANCH[branch] || []).length;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const totalRoomNights = totalRooms * end.getDate();
  if (totalRoomNights <= 0) return 0;

  let bookedNights = 0;
  BOOKINGS.filter(b => b.branch === branch && b.status !== "Cancelled").forEach(b => {
    const ci = new Date(b.checkin + "T00:00:00");
    const co = new Date(b.checkout + "T00:00:00");
    const s = ci < start ? start : ci;
    const e = co > end ? end : co;
    // Math.max(0, NaN) is NaN, not 0 — guard so one bad date can't turn the
    // whole occupancy KPI into "NaN%".
    const nights = Math.round((e - s) / 86400000);
    // A stay can span several villas, and each is a room taken out of
    // availability for those nights. Counting the booking once would
    // under-report occupancy for every multi-villa party.
    const villaCount = Array.isArray(b.roomIds) && b.roomIds.length ? b.roomIds.length : 1;
    bookedNights += Number.isFinite(nights) ? Math.max(0, nights) * villaCount : 0;
  });
  return Math.min(100, Math.round((bookedNights / totalRoomNights) * 100));
}

// One category's share of an invoice, in LKR, on the same basis as the
// invoice's own revenue figure.
//
// Two things were wrong with reading categoryTotals straight off the record.
//
// It was never converted, so a bill raised in USD contributed its face
// value: a USD 500 villa at 300 LKR/USD added 500 to the villa slice
// instead of 150,000, while the Revenue KPI on the same screen counted it
// correctly. Everything here is scaled by the rate stamped on the bill.
//
// And categoryTotals are line items — struck before service charge and
// before discount — so the slices summed to the bill total while the KPI
// showed net. On one stay that was 33,000 against 30,150 on the same
// screen, with the discount and service charge belonging to no category.
//
// So the invoice's own order is reproduced per category:
//
//   service charge -> food ONLY, because that is the base it is levied on
//                     (see SERVICE_CHARGE_RATE). Spreading it pro rata
//                     would make the pie add up and still be wrong, by
//                     showing villa and safari carrying a charge neither
//                     one attracts.
//   discount       -> pro rata, because a percentage off the bill really
//                     does come off every line.
//
// The scale is taken from the invoice's own stored gross and net rather
// than recomputed from the discount percentage, so the slices land on the
// invoice's actual total whatever the record happens to hold.
function categoryLKR(inv, key) {
  const rate = (!inv.currency || inv.currency === "LKR") ? 1 : (Number(inv.exchangeRate) || 0);
  const base = (inv.categoryTotals && inv.categoryTotals[key]) || 0;
  const withService = base + (key === "food" ? (Number(inv.serviceCharge) || 0) : 0);

  const grossAll = Object.keys(inv.categoryTotals).reduce((sum, k) => sum + (inv.categoryTotals[k] || 0), 0)
    + (Number(inv.serviceCharge) || 0);
  const net = Number(inv.total) || 0;
  // A zero gross means nothing to apportion — and guards the division.
  const scale = grossAll > 0 ? net / grossAll : 0;

  return withService * scale * rate;
}

function renderDashboard(branch) {
  const now = new Date();
  const thisMonthKey = monthKey(toDateISO(now));

  const monthInvoices = INVOICES.filter(inv => inv.branch === branch && inv.status === "Active" && monthKey(inv.date) === thisMonthKey);
  const revenue = monthInvoices.reduce((s, inv) => s + invoiceLKR(inv), 0);
  const invoiceCount = monthInvoices.length;
  const avgInvoice = invoiceCount ? revenue / invoiceCount : 0;
  const occupancy = computeMonthlyOccupancy(branch, now.getFullYear(), now.getMonth());

  document.getElementById("kpi-revenue").textContent = fmtLKR(revenue);
  document.getElementById("kpi-invoices").textContent = invoiceCount.toLocaleString("en-US");
  document.getElementById("kpi-avg").textContent = fmtLKR(avgInvoice);
  document.getElementById("kpi-occupancy").textContent = occupancy + "%";
  document.getElementById("dashboard-report-date").textContent = "Generated " + now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Revenue split now reads the category totals stamped on each invoice
  // when it was generated, rather than inferring "room revenue" by
  // subtracting food and activity records from the invoice total. The old
  // subtraction quietly mis-attributed anything that belonged to neither
  // set, and went negative if a record outlived its invoice.
  const branchInvoices = INVOICES.filter(inv => inv.branch === branch && inv.status === "Active");
  const splitKeys = ["villa", "food", "safari", "transport", "ticket", "other"];
  const split = {};
  splitKeys.forEach(k => { split[k] = 0; });
  // Seeded rows predate category totals; without a breakdown the only
  // honest place for them is the villa bucket, which is what they were.
  let uncategorised = 0;
  branchInvoices.forEach(inv => {
    if (inv.categoryTotals) {
      splitKeys.forEach(k => { split[k] += categoryLKR(inv, k); });
    } else {
      uncategorised += invoiceLKR(inv);
    }
  });
  split.villa += uncategorised;

  const categoryLabels = splitKeys.map(k => CHARGE_CATEGORY_LABELS[k]);
  const categoryValues = splitKeys.map(k => split[k]);
  const palette = [CHART_COLORS.maroon, CHART_COLORS.gold, CHART_COLORS.teal, "#6b8e9e", "#a4785c", "#9aa0a6"];

  // What the hotel actually keeps. Safaris, transport and tickets are sold
  // on behalf of third parties, so a large slice of what the guest paid is
  // handed straight back out — reporting the gross as revenue overstates
  // the month badly (the staff's own books show safaris grossing 378k with
  // 57k kept).
  // Written-off records are excluded: a safari charged to a stay whose
  // check-in was then cancelled is not money owed to the provider, and
  // showing it as payable sends the manager to pay a bill twice.
  const branchActivities = ACTIVITY_RECORDS.filter(r => r.branch === branch && countsAsRevenue(r));
  const activityGross = branchActivities.reduce((s, r) => s + r.revenue, 0);
  const activityPayout = branchActivities.reduce((s, r) => s + (r.payout || 0), 0);
  const payoutEl = document.getElementById("kpi-payout");
  if (payoutEl) {
    payoutEl.textContent = fmtLKR(activityPayout);
    document.getElementById("kpi-payout-note").textContent = activityGross
      ? `of ${fmtLKR(activityGross)} sold`
      : "nothing sold yet";
  }

  // Six fixed categories, but most branches only ever use three or four —
  // empty slices add nothing to a doughnut and clutter the legend, so only
  // categories with money in them are charted.
  const usedSlices = categoryLabels
    .map((label, i) => ({ label, value: categoryValues[i], color: palette[i] }))
    .filter(s => s.value > 0);

  // Rendered before the charts so it survives a missing Chart.js — the
  // legend doubles as a readable breakdown when the doughnut can't draw.
  const legendEl = document.getElementById("pie-legend");
  legendEl.innerHTML = usedSlices.map(s => `
    <li><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.label)} — ${fmtLKR(s.value)}</li>
  `).join("") || `<li class="legend-empty">No revenue in this period.</li>`;

  // KPIs and the legend are on screen by this point, so bailing here still
  // leaves a useful dashboard rather than a broken one.
  if (!chartsAvailable()) {
    showChartFallback();
    return;
  }

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("revenue-pie-chart"), {
    type: "doughnut",
    data: {
      labels: usedSlices.map(s => s.label),
      datasets: [{ data: usedSlices.map(s => s.value), backgroundColor: usedSlices.map(s => s.color), borderColor: "#fff", borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 2,
      plugins: { legend: { display: false } },
    },
  });

  // Trailing 6 calendar months of real invoice revenue.
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(toDateISO(d)), label: d.toLocaleDateString("en-US", { month: "short" }) });
  }
  const monthlyValues = months.map(m =>
    INVOICES.filter(inv => inv.branch === branch && inv.status === "Active" && monthKey(inv.date) === m.key)
      .reduce((s, inv) => s + invoiceLKR(inv), 0)
  );

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById("revenue-line-chart"), {
    type: "line",
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        label: "Revenue",
        data: monthlyValues,
        borderColor: CHART_COLORS.maroon,
        backgroundColor: "rgba(74, 14, 28, 0.1)",
        borderWidth: 2.5,
        pointBackgroundColor: CHART_COLORS.gold,
        pointRadius: 4,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 2,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_COLORS.text } },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            callback: (v) => (v >= 1000000 ? (v / 1000000) + "M" : (v / 1000) + "K"),
          },
        },
      },
    },
  });
}

// Chart.js is a CDN script and these properties have patchy connectivity,
// so it does sometimes fail to load. Without this the KPIs render, then
// `new Chart` throws inside the setTimeout below — an uncaught error that
// surfaces nowhere and abandons the rest of the render, leaving stale
// numbers on screen with no clue why.
function chartsAvailable() {
  return typeof Chart === "function";
}

function showChartFallback() {
  document.querySelectorAll("#screen-dashboard .chart-canvas-wrap").forEach(wrap => {
    wrap.innerHTML = `<p class="chart-unavailable">Charts need a connection. The figures above are up to date.</p>`;
  });
}

document.getElementById("open-dashboard-btn").addEventListener("click", () => {
  setLogoSrc("dashboard-logo", appState.selectedBranchLogo);
  showScreen("screen-dashboard");
  // Chart.js measures its container's size at construction time, so the
  // screen must already be visible (not display:none) before charts are
  // built, or they get stuck at 0x0. setTimeout (not requestAnimationFrame)
  // on purpose — rAF never fires in some embedded/non-compositing webviews,
  // silently skipping this entirely; a macrotask tick is enough to let the
  // display:none → block swap land first.
  setTimeout(() => {
    // Wrapped because this runs detached from the click — anything thrown
    // here has no caller to report it, so a failure would be invisible.
    try {
      renderDashboard(appState.selectedBranch);
    } catch (err) {
      console.error("Dashboard render failed:", err);
      showToast("Couldn't load the dashboard");
    }
  }, 0);
});

document.getElementById("dashboard-export-btn").addEventListener("click", () => window.print());

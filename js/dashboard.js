import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc } from "./utils.js";
import { CHART_COLORS } from "./data/dashboard.js";
import { INVOICES, FOOD_ORDER_RECORDS, BOOKINGS } from "./data/reports.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";

let pieChart = null;
let lineChart = null;

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
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
    bookedNights += Math.max(0, Math.round((e - s) / 86400000));
  });
  return Math.min(100, Math.round((bookedNights / totalRoomNights) * 100));
}

function renderDashboard(branch) {
  const now = new Date();
  const thisMonthKey = monthKey(now.toISOString());

  const monthInvoices = INVOICES.filter(inv => inv.branch === branch && inv.status === "Active" && monthKey(inv.date) === thisMonthKey);
  const revenue = monthInvoices.reduce((s, inv) => s + inv.total, 0);
  const invoiceCount = monthInvoices.length;
  const avgInvoice = invoiceCount ? revenue / invoiceCount : 0;
  const occupancy = computeMonthlyOccupancy(branch, now.getFullYear(), now.getMonth());

  document.getElementById("kpi-revenue").textContent = fmtLKR(revenue);
  document.getElementById("kpi-invoices").textContent = invoiceCount.toLocaleString("en-US");
  document.getElementById("kpi-avg").textContent = fmtLKR(avgInvoice);
  document.getElementById("kpi-occupancy").textContent = occupancy + "%";
  document.getElementById("dashboard-report-date").textContent = "Generated " + now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Revenue split — only categories we actually track separately. Invoice
  // totals already fold in any food/activity charges billed at checkout,
  // so this isn't a pure "rooms only" figure, but it's the real number,
  // not an invented one.
  const allTimeRoomRevenue = INVOICES.filter(inv => inv.branch === branch && inv.status === "Active").reduce((s, inv) => s + inv.total, 0);
  const allTimeFoodRevenue = FOOD_ORDER_RECORDS.filter(r => r.branch === branch).reduce((s, r) => s + r.revenue, 0);
  const categoryLabels = ["Room & Checkout Billing", "Food & Beverage"];
  const categoryValues = [allTimeRoomRevenue, allTimeFoodRevenue];
  const palette = [CHART_COLORS.maroon, CHART_COLORS.gold];

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("revenue-pie-chart"), {
    type: "doughnut",
    data: {
      labels: categoryLabels,
      datasets: [{ data: categoryValues, backgroundColor: palette, borderColor: "#fff", borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 2,
      plugins: { legend: { display: false } },
    },
  });

  const legendEl = document.getElementById("pie-legend");
  legendEl.innerHTML = categoryLabels.map((label, i) => `
    <li><span class="legend-swatch" style="background:${palette[i]}"></span>${escapeHtml(label)}</li>
  `).join("");

  // Trailing 6 calendar months of real invoice revenue.
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d.toISOString()), label: d.toLocaleDateString("en-US", { month: "short" }) });
  }
  const monthlyValues = months.map(m =>
    INVOICES.filter(inv => inv.branch === branch && inv.status === "Active" && monthKey(inv.date) === m.key)
      .reduce((s, inv) => s + inv.total, 0)
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

document.getElementById("open-dashboard-btn").addEventListener("click", () => {
  setLogoSrc("dashboard-logo", appState.selectedBranchLogo);
  showScreen("screen-dashboard");
  // Chart.js measures its container's size at construction time, so the
  // screen must already be visible (not display:none) before charts are
  // built, or they get stuck at 0x0. setTimeout (not requestAnimationFrame)
  // on purpose — rAF never fires in some embedded/non-compositing webviews,
  // silently skipping this entirely; a macrotask tick is enough to let the
  // display:none → block swap land first.
  setTimeout(() => renderDashboard(appState.selectedBranch), 0);
});

document.getElementById("dashboard-export-btn").addEventListener("click", () => window.print());

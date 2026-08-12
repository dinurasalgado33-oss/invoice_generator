import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc } from "./utils.js";
import { CHART_COLORS, DASHBOARD_DATA } from "./data/dashboard.js";

let pieChart = null;
let lineChart = null;

function renderDashboard(branch) {
  const data = DASHBOARD_DATA[branch];
  if (!data) return;

  document.getElementById("kpi-revenue").textContent = fmtLKR(data.kpis.revenue);
  document.getElementById("kpi-invoices").textContent = data.kpis.invoices.toLocaleString("en-US");
  document.getElementById("kpi-avg").textContent = fmtLKR(data.kpis.avgInvoice);
  document.getElementById("kpi-occupancy").textContent = data.kpis.occupancy + "%";
  document.getElementById("dashboard-report-date").textContent = "Generated " + new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const categoryLabels = Object.keys(data.revenueByCategory);
  const categoryValues = Object.values(data.revenueByCategory);
  const palette = [CHART_COLORS.maroon, CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.tan];

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

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById("revenue-line-chart"), {
    type: "line",
    data: {
      labels: data.monthlyRevenue.labels,
      datasets: [{
        label: "Revenue",
        data: data.monthlyRevenue.values,
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
  // built, or they get stuck at 0x0.
  requestAnimationFrame(() => renderDashboard(appState.selectedBranch));
});

document.getElementById("dashboard-export-btn").addEventListener("click", () => window.print());

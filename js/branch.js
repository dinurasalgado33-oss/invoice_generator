import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { setLogoSrc } from "./utils.js";
import { updateRoomsCardAvailability } from "./rooms.js";
import { updateInventoryBadge } from "./inventory.js";
import { renderHomeDashboard } from "./home.js";

export function selectBranch(branchKey) {
  const btn = document.querySelector('.branch-btn[data-branch="' + branchKey + '"]');
  if (!btn) return;

  appState.selectedBranch = btn.dataset.branch;
  appState.selectedBranchLabel = btn.dataset.label;
  appState.selectedBranchLogo = btn.dataset.logo;

  document.getElementById("form-branch-label").textContent = appState.selectedBranchLabel;
  document.getElementById("rooms-branch-label").textContent = appState.selectedBranchLabel;
  document.getElementById("dashboard-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("home-logo", appState.selectedBranchLogo);
  setLogoSrc("form-logo", appState.selectedBranchLogo);
  setLogoSrc("rooms-logo", appState.selectedBranchLogo);
  setLogoSrc("dashboard-logo", appState.selectedBranchLogo);

  updateRoomsCardAvailability();
  updateInventoryBadge();
  renderHomeDashboard({ announce: true });
}

document.querySelectorAll(".branch-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectBranch(btn.dataset.branch);
    showScreen("screen-home");
  });
});

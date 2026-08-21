import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { setLogoSrc, setBranchLabel } from "./utils.js";
import { updateRoomsCardAvailability } from "./rooms.js";
import { updateInventoryBadge } from "./inventory.js";
import { renderHomeDashboard } from "./home.js";

export function selectBranch(branchKey) {
  const btn = document.querySelector('.branch-btn[data-branch="' + branchKey + '"]');
  if (!btn) return;

  appState.selectedBranch = btn.dataset.branch;
  appState.selectedBranchLabel = btn.dataset.label;
  appState.selectedBranchLogo = btn.dataset.logo;

  setBranchLabel("form-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setBranchLabel("rooms-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setBranchLabel("dashboard-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
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

import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { ACCOUNTS, logLogin } from "./data/accounts.js";
import { selectBranch } from "./branch.js";

// Staff login — client-side gate only (no backend), just keeps casual
// visitors out. Credentials live in this file, in plain view, so treat
// it as a light deterrent, not real security.
const LOGIN_KEY = "leopardinn-logged-in";
const ROLE_KEY = "leopardinn-role";
const LOCKED_BRANCH_KEY = "leopardinn-locked-branch";

function applyRoleGates() {
  const isStaff = appState.currentRole === "staff";

  document.querySelectorAll('[data-role="manager"]').forEach(el => {
    el.style.display = isStaff ? "none" : "";
  });

  // Staff are locked to one branch — the "Change branch" entry point
  // is the only way back to screen-branch, so hide it for them.
  const changeBranchBtn = document.querySelector("#screen-home .back-btn");
  if (changeBranchBtn) changeBranchBtn.style.display = isStaff ? "none" : "";

  document.getElementById("role-indicator").textContent = "Role: " + (isStaff ? "Staff" : "Manager");
}

function routeAfterLogin() {
  applyRoleGates();
  const lockedBranch = localStorage.getItem(LOCKED_BRANCH_KEY);
  if (lockedBranch) {
    selectBranch(lockedBranch);
    showScreen("screen-home");
  } else {
    showScreen("screen-branch");
  }
}

document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const formEl = document.getElementById("login-form");

  const account = ACCOUNTS.find(a => a.username === username && a.password === password);

  if (account) {
    localStorage.setItem(LOGIN_KEY, "true");
    localStorage.setItem(ROLE_KEY, account.role);
    localStorage.setItem(LOCKED_BRANCH_KEY, account.branch || "");
    appState.currentRole = account.role;
    errorEl.classList.remove("show");
    logLogin(account.username, account.role, account.branch);
    routeAfterLogin();
  } else {
    errorEl.classList.add("show");
    formEl.classList.remove("shake");
    void formEl.offsetWidth; // restart animation
    formEl.classList.add("shake");
    document.getElementById("login-password").value = "";
    document.getElementById("login-password").focus();
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  if (!confirm("Log out?")) return;

  localStorage.removeItem(LOGIN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(LOCKED_BRANCH_KEY);
  appState.currentRole = null;

  document.getElementById("login-form").reset();
  document.getElementById("login-error").classList.remove("show");
  showScreen("screen-login");
});

// Restore a logged-in session (skip login, and skip the branch picker too
// if the account is locked to one branch). Exported and called explicitly
// last from main.js, after every other module has finished wiring up its
// own screen — this app already hit a real bug once from routing before
// everything it depends on was ready.
export function restoreSession() {
  if (localStorage.getItem(LOGIN_KEY) !== "true") return;

  applyRoleGates();
  const lockedBranch = localStorage.getItem(LOCKED_BRANCH_KEY);
  document.getElementById("screen-login").classList.remove("active");
  if (lockedBranch) {
    selectBranch(lockedBranch);
    document.getElementById("screen-home").classList.add("active");
  } else {
    document.getElementById("screen-branch").classList.add("active");
  }
}

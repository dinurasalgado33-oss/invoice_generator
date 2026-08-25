import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { safeStorage, showToast } from "./utils.js";
import { logLogin } from "./data/accounts.js";
import { selectBranch } from "./branch.js";
import { confirmAction } from "./confirm.js";
import { signIn, signOutNow, watchSession, describeAuthError, currentProfile } from "./data/session.js";
import { startSync, stopSync } from "./data/sync.js";

// Sign-in is Firebase Auth now, not a list of usernames in a file. What
// somebody may do comes from their users/{uid} document, which the app
// cannot write — so a role is something granted, never claimed.
//
// The security rules enforce all of this independently. Everything below
// is about showing the right screens; none of it is what keeps a
// receptionist out of the other property's guest records.

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

function applyProfile(profile) {
  appState.currentRole = profile.role;
  appState.currentUser = profile.name || profile.email || "";
  safeStorage.set("leopardinn-user", appState.currentUser);
  safeStorage.set(LOCKED_BRANCH_KEY, profile.role === "staff" ? (profile.branch || "") : "");
}

function routeAfterLogin(profile) {
  applyRoleGates();
  if (profile.role === "staff" && profile.branch) {
    selectBranch(profile.branch);
    showScreen("screen-home");
  } else {
    showScreen("screen-branch");
  }
}

function setBusy(busy) {
  const btn = document.querySelector("#login-form button[type=submit]");
  if (btn) btn.disabled = busy;
  document.getElementById("login-username").disabled = busy;
  document.getElementById("login-password").disabled = busy;
}

function showLoginError(message) {
  const errorEl = document.getElementById("login-error");
  const formEl = document.getElementById("login-form");
  errorEl.textContent = message;
  errorEl.classList.add("show");
  formEl.classList.remove("shake");
  void formEl.offsetWidth; // restart animation
  formEl.classList.add("shake");
  document.getElementById("login-password").value = "";
  document.getElementById("login-password").focus();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  document.getElementById("login-error").classList.remove("show");
  setBusy(true);

  try {
    const profile = await signIn(email, password);
    applyProfile(profile);

    // Everything the screens read comes from here. Done before routing, so
    // the first screen shown is already populated rather than filling in
    // underneath the staff member a second later.
    const { failed } = await startSync();
    if (failed.length) {
      showToast(`Signed in, but ${failed.length} record type${failed.length === 1 ? "" : "s"} didn't load`);
    }

    logLogin(email, profile.role, profile.branch || null);
    routeAfterLogin(profile);
  } catch (err) {
    // The screen stays deliberately vague — it must not reveal whether an
    // address exists. The console is not the screen, and during setup the
    // real code is the whole diagnosis.
    console.error("[Leopard Inn] sign-in failed:", err && err.code, err && err.message);
    showLoginError(describeAuthError(err));
  } finally {
    setBusy(false);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "Log out?",
    message: "You'll need to sign in again to continue.",
    confirmLabel: "Log Out",
    tone: "danger",
  });
  if (!ok) return;

  stopSync();
  await signOutNow();
  appState.currentRole = null;
  appState.currentUser = "";
  safeStorage.remove("leopardinn-user");
  safeStorage.remove(LOCKED_BRANCH_KEY);

  document.getElementById("login-form").reset();
  document.getElementById("login-error").classList.remove("show");
  showScreen("screen-login");
});

// Firebase restores the previous session itself on load, so there is no
// "logged in" flag of our own to keep in step with it — the old one could
// disagree with reality after a password change or a disabled account, and
// the app would show a signed-in shell over a database refusing every read.
//
// Called explicitly last from main.js, after every other module has wired
// up its own screen: this app has already had one real bug from routing
// before the things it depends on were ready.
export function restoreSession() {
  watchSession(async (profile) => {
    if (!profile) {
      // Either nobody was signed in, or the account lost its access while
      // away. Either way the login screen is the honest answer.
      if (appState.currentRole) {
        stopSync();
        appState.currentRole = null;
        appState.currentUser = "";
        showToast("Signed out");
      }
      showScreen("screen-login");
      return;
    }
    applyProfile(profile);
    await startSync();
    routeAfterLogin(profile);
  });
}

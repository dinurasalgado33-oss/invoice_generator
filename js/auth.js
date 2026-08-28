import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { safeStorage, showToast } from "./utils.js";
import { logLogin } from "./data/accounts.js";
import { selectBranch } from "./branch.js";
import { confirmAction } from "./confirm.js";
import { signIn, signOutNow, watchSession, describeAuthError, currentProfile } from "./data/session.js";
import { startSync, stopSync } from "./data/sync.js";
import { isDemoMode, showDemoBanner } from "./demo.js";
import { seedDemoBlocks } from "./data/numbering.js";

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

function setBusy(busy, label) {
  const btn = document.getElementById("login-submit-btn");
  const text = document.getElementById("login-submit-label");
  if (btn) {
    btn.disabled = busy;
    btn.classList.toggle("is-busy", busy);
  }
  if (text) text.textContent = busy ? (label || "Signing in…") : "Log In";
  document.getElementById("login-username").disabled = busy;
  document.getElementById("login-password").disabled = busy;
}

// Hydration waits on a first snapshot per collection. If one never arrives
// — a listener that neither succeeds nor errors — Promise.allSettled waits
// with it, and the app sits on the login screen having actually signed in.
// That was the bug: it looked like nothing happened until a refresh.
//
// Firestore has a local cache, so carrying on without every collection is
// safe: the listeners stay attached and fill in as they arrive.
function withTimeout(promise, ms, onTimeout) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(onTimeout);
    }, ms);
    promise.then(value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }, () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(onTimeout);
    });
  });
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
    // Signs in and stops. Loading and routing belong to the session
    // listener below, which fires for this sign-in as well as for a
    // session Firebase restored on its own. Doing it in both places meant
    // two hydrations racing, and the screen waiting on whichever lost.
    await signIn(email, password);
    // Deliberately still busy — the listener takes over from here and
    // clears it once the screens have something to show.
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

  // In demo there is no session to end and no Firebase to tell. Calling
  // signOutNow() would open a connection to the real project purely to
  // sign out of nothing.
  if (isDemoMode()) {
    location.reload();
    return;
  }

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
  // Demo mode never touches Firebase — not even to ask whether somebody
  // is signed in. watchSession() would call connect(), and a demo that
  // opens a connection to the real project is exactly what this avoids.
  // Without an adapter installed, store.js keeps using its in-memory
  // fallback, which is how the whole app worked before there was a
  // backend.
  if (isDemoMode()) {
    appState.currentRole = "manager";   // sees everything; it is a demo
    appState.currentUser = "Demo";
    applyRoleGates();
    seedDemoBlocks("Wilpattu");
    seedDemoBlocks("Arugam Bay");
    showDemoBanner();
    showScreen("screen-branch");
    return;
  }

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
      setBusy(false);
      showScreen("screen-login");
      return;
    }

    applyProfile(profile);
    setBusy(true, "Loading…");

    // Ten seconds is long enough for a slow connection and short enough
    // that a stuck listener never strands somebody on the login screen
    // holding a working session.
    const result = await withTimeout(startSync(), 10000, { timedOut: true, failed: [] });
    if (result.timedOut) {
      showToast("Still loading records — carrying on");
    } else if (result.failed.length) {
      showToast(`${result.failed.length} record type${result.failed.length === 1 ? "" : "s"} didn't load`);
    }

    logLogin(profile.email || appState.currentUser, profile.role, profile.branch || null);
    routeAfterLogin(profile);
    setBusy(false);
  });
}

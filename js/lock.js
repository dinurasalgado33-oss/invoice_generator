import { safeStorage, showToast } from "./utils.js";
import { appState } from "./state.js";
import { currentAccount, currentProfile } from "./data/session.js";

// Locking a shared tablet.
//
// The realistic threat here is not a remote attacker — it is the reception
// tablet left on the desk while somebody walks a guest to their villa.
// Anyone passing can read passport numbers, void an invoice, or check
// somebody out. A password prompt every few minutes would be abandoned
// within a day, so the lock is a short PIN and the session underneath is
// left intact.
//
// This is deliberately NOT a security boundary. The Firestore rules are,
// and they answer to the signed-in account, which is unchanged while
// locked. What this stops is the opportunistic case: a screen left open in
// a room where guests and staff both stand. Someone determined, holding
// the tablet, with devtools, is not who this is for — and pretending
// otherwise would be the dangerous kind of false confidence.
//
// The PIN is stored hashed rather than in the clear. That is not because
// the hash is a real defence (it is client-side, and a short numeric PIN
// is brute-forceable in moments), but because a PIN sitting in plain text
// in localStorage is very likely a PIN reused elsewhere, and shoulder-read
// off a screen. Hashing costs nothing and removes the casual read.

const PIN_KEY = "leopardinn-lock-pin";
const IDLE_KEY = "leopardinn-lock-idle-minutes";
const DEFAULT_IDLE_MINUTES = 10;

let idleTimer = null;
let locked = false;

// SHA-256 via the platform. Salted with the account's uid so the same PIN
// on two devices does not produce the same stored value.
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function uid() {
  const account = currentAccount();
  return account ? account.uid : "";
}

export function hasPin() {
  return Boolean(safeStorage.get(`${PIN_KEY}-${uid()}`));
}

export async function setPin(pin) {
  const clean = String(pin || "").trim();
  // Four digits is the floor: shorter is not a PIN, it is a formality.
  if (!/^\d{4,8}$/.test(clean)) return false;
  safeStorage.set(`${PIN_KEY}-${uid()}`, await hashPin(clean, uid()));
  return true;
}

export function clearPin() {
  safeStorage.remove(`${PIN_KEY}-${uid()}`);
}

export function idleMinutes() {
  const stored = Number(safeStorage.get(IDLE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_IDLE_MINUTES;
}

export function setIdleMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return false;
  safeStorage.set(IDLE_KEY, String(n));
  restartIdleTimer();
  return true;
}

export function isLocked() {
  return locked;
}

export function lock() {
  // Nothing to unlock with, and no session to protect — locking would
  // strand somebody behind a PIN they never set.
  if (!hasPin() || !currentAccount() || locked) return false;

  const profile = currentProfile();
  document.getElementById("lock-title").textContent = "Locked";
  document.getElementById("lock-pin").placeholder = "PIN";
  document.getElementById("lock-who").textContent =
    profile ? (profile.name || profile.email || appState.currentUser || "") : "";
  document.getElementById("lock-error").classList.remove("show");
  document.getElementById("lock-pin").value = "";
  document.getElementById("lock-overlay").hidden = false;
  locked = true;
  stopIdleTimer();
  // Focus after the overlay is actually displayed, or the caret lands
  // nowhere and the first typed digit is lost.
  requestAnimationFrame(() => document.getElementById("lock-pin").focus());
  return true;
}

function unlock() {
  document.getElementById("lock-overlay").hidden = true;
  document.getElementById("lock-pin").value = "";
  locked = false;
  restartIdleTimer();
}

function stopIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

export function restartIdleTimer() {
  stopIdleTimer();
  if (!hasPin() || !currentAccount() || locked) return;
  idleTimer = setTimeout(lock, idleMinutes() * 60 * 1000);
}

// Any of these means somebody is still there. Passive listeners so this
// never delays a scroll on a cheap tablet.
const ACTIVITY = ["pointerdown", "keydown", "touchstart", "wheel"];


// Setting a PIN reuses the same overlay rather than adding a second
// dialog: the thing being set and the thing being typed into later should
// look identical, or the first unlock is a surprise.
let setupMode = false;
let firstEntry = "";

function showPanel({ title, who, placeholder, error = "" }) {
  document.getElementById("lock-title").textContent = title;
  document.getElementById("lock-who").textContent = who;
  const input = document.getElementById("lock-pin");
  input.value = "";
  input.placeholder = placeholder;
  const err = document.getElementById("lock-error");
  err.textContent = error;
  err.classList.toggle("show", Boolean(error));
  document.getElementById("lock-overlay").hidden = false;
  requestAnimationFrame(() => input.focus());
}

// Asks twice, because a PIN mistyped once becomes a tablet nobody can
// unlock — and there is deliberately no recovery path except signing out.
export function startPinSetup() {
  if (!currentAccount()) return false;
  setupMode = true;
  firstEntry = "";
  locked = true;              // block the idle timer while setting one
  stopIdleTimer();
  document.getElementById("lock-signout-btn").textContent = "Cancel";
  showPanel({
    title: "Set a PIN",
    who: "Used to unlock this device without signing out",
    placeholder: "New PIN",
  });
  return true;
}

function finishSetup() {
  setupMode = false;
  firstEntry = "";
  document.getElementById("lock-signout-btn").textContent = "Sign out instead";
  document.getElementById("lock-overlay").hidden = true;
  locked = false;
  restartIdleTimer();
}

async function handleSetupSubmit(entered) {
  if (!firstEntry) {
    if (!/^\d{4,8}$/.test(entered)) {
      showPanel({ title: "Set a PIN", who: "Used to unlock this device without signing out",
                  placeholder: "New PIN", error: "4 to 8 digits" });
      return;
    }
    firstEntry = entered;
    showPanel({ title: "Confirm PIN", who: "Enter it once more", placeholder: "Repeat PIN" });
    return;
  }
  if (entered !== firstEntry) {
    firstEntry = "";
    showPanel({ title: "Set a PIN", who: "Used to unlock this device without signing out",
                placeholder: "New PIN", error: "They didn't match — start again" });
    return;
  }
  await setPin(entered);
  finishSetup();
  showToast("PIN set — this device locks after " + idleMinutes() + " minutes idle");
}

export function initLock() {
  ACTIVITY.forEach(evt =>
    document.addEventListener(evt, () => { if (!locked) restartIdleTimer(); }, { passive: true })
  );

  // Locking when the tab is hidden covers the case the idle timer cannot:
  // the tablet's own screen going off. Coming back to an unlocked app
  // after the screen slept is exactly the gap this closes.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") lock();
  });

  document.getElementById("lock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = String(document.getElementById("lock-pin").value).trim();

    if (setupMode) {
      await handleSetupSubmit(entered);
      return;
    }

    const stored = safeStorage.get(`${PIN_KEY}-${uid()}`);
    const attempt = await hashPin(entered, uid());
    if (stored && attempt === stored) {
      unlock();
      return;
    }
    const err = document.getElementById("lock-error");
    err.textContent = "Wrong PIN";
    err.classList.add("show");
    document.getElementById("lock-pin").value = "";
    document.getElementById("lock-pin").focus();
  });

  // The way out for somebody who has genuinely forgotten it. Signing out
  // fully is safe — the records are in Firestore, not in this tab.
  document.getElementById("lock-signout-btn").addEventListener("click", () => {
    // Doubles as Cancel while setting a PIN — signing out there would be
    // a surprising answer to "actually, not now".
    if (setupMode) {
      finishSetup();
      return;
    }
    unlock();
    document.getElementById("logout-btn").click();
  });

  restartIdleTimer();
}

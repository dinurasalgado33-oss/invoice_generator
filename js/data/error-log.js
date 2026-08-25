// What went wrong, and where.
//
// Today a crash on a receptionist's phone at 11pm is invisible: the screen
// half-renders, the staff member shrugs and carries on, and nobody finds
// out until someone happens to mention it. Half the bugs found by hand on
// 21 August would have shown up here on their own.
//
// Deliberately small and deliberately safe: logging must never itself
// throw, or a broken screen becomes a broken app.

import { add, COLLECTIONS } from "./store.js";
import { appState } from "../state.js";

export const ERROR_LOG = [];

let nextErrorId = 1;

// One row per distinct problem, not per occurrence. A render error inside
// a loop can fire hundreds of times a second, and a log that floods is a
// log nobody reads — and, once this writes to Firestore, a bill.
const seen = new Map();
const REPEAT_WINDOW_MS = 60000;

export function logError(message, detail = {}) {
  try {
    const text = String(message || "Unknown error").slice(0, 300);
    const key = `${text}|${detail.source || ""}|${detail.line || ""}`;
    const now = Date.now();

    const previous = seen.get(key);
    if (previous && now - previous.at < REPEAT_WINDOW_MS) {
      previous.at = now;
      previous.row.count++;
      return previous.row;
    }

    const row = {
      id: nextErrorId++,
      message: text,
      screen: document.querySelector(".screen.active")?.id || "",
      source: detail.source || "",
      line: detail.line ?? null,
      stack: (detail.stack || "").slice(0, 1000),
      branch: appState.selectedBranch || "",
      user: appState.currentUser || "",
      // The app's own build, so a report can be tied to a version rather
      // than "it happened sometime last month".
      href: location.pathname + location.search,
      at: new Date().toISOString(),
      count: 1,
    };
    seen.set(key, { at: now, row });
    return add(COLLECTIONS.ERRORS, ERROR_LOG, row);
  } catch {
    // If logging an error throws, there is nothing useful left to do —
    // and taking the app down over it would be worse than the original
    // problem.
    return null;
  }
}

// Anything that escapes a handler anywhere in the app.
window.addEventListener("error", (e) => {
  logError(e.message, {
    source: e.filename ? e.filename.split("/").pop() : "",
    line: e.lineno,
    stack: e.error && e.error.stack,
  });
});

// A rejected promise with no .catch() — the failure mode that is silent
// even in the console on some browsers, and the one that bit hardest here:
// a CDN script that failed to load threw inside a setTimeout where nothing
// was listening.
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  logError(
    reason && reason.message ? reason.message : String(reason),
    { source: "promise", stack: reason && reason.stack }
  );
});

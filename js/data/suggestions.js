import { safeStorage } from "../utils.js";
import { connect, getDb, fsApi } from "./firebase.js";
import { COLLECTIONS } from "./store.js";
import { logError } from "./error-log.js";

// What has actually been typed into the free-text fields, remembered and
// offered back.
//
// Several fields take the same handful of answers over and over: the same
// three or four safari guides, the same drivers, the same travel agents,
// the same two countries most guests arrive from. They were all free text,
// so every entry was retyped — and "Pradeep", "pradeep" and "Pradeeep"
// became three different people in the records.
//
// These lists cannot be configured up front the way villas and activities
// can, because nobody knows the full set in advance. So they are learned
// rather than configured, and offered through a native <datalist>, which
// suggests without restricting: the fifth guide can still be typed, and
// becomes a suggestion afterwards.
//
// Shared across devices, not per device. Reception's phone and the office
// tablet were each learning their own separate list of guides, so the
// spelling that stops "Pradeep" becoming three people only helped whoever
// happened to be holding the device that learned it first. That is the
// same shape as every other bug in this app: one fact, two homes, free to
// disagree.
//
// Stored in its own collection rather than in `config`, which is where it
// first went. Config means "what a manager decided" and its rule enforces
// that — manager-only writes. But guide names and travel agents are typed
// by reception on the registration card, and reception is staff. Every
// name they typed was refused by the rules and logged as an error: the
// exact devices the feature exists for were the ones that could not use
// it. Different writer, different collection.

const STORE_KEY = "leopardinn-suggestions";

// One document. The map is a few hundred bytes and is always read and
// written whole, so a document per key would be more round trips for no
// benefit.
const DOC_ID = "shared";

async function readRemote() {
  await connect();
  const fs = fsApi();
  const snap = await fs.getDoc(fs.doc(getDb(), COLLECTIONS.SUGGESTIONS, DOC_ID));
  return snap.exists() ? snap.data().values : undefined;
}

async function writeRemote(values) {
  try {
    await connect();
    const fs = fsApi();
    await fs.setDoc(fs.doc(getDb(), COLLECTIONS.SUGGESTIONS, DOC_ID), {
      values,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Offline is normal and Firestore queues the write anyway. Anything
    // else is worth knowing about, but never worth interrupting a form.
    if (err && err.code !== "unavailable") {
      logError(`Could not save suggestions: ${err.code || err.message}`, { source: "suggestions" });
    }
  }
}

// How long to wait after the last edit before writing. A name is typed,
// the field is left, and often the next field is another suggestion field
// — batching those into one write keeps a registration card from becoming
// six round trips.
const WRITE_DELAY_MS = 4000;

const CAP = 25;

function loadLocal() {
  try {
    const raw = safeStorage.get(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Corrupt or hand-edited storage shouldn't take a form down — these
    // are conveniences, not data.
    return {};
  }
}

let store = loadLocal();
let timer = null;

function persistLocal() {
  try {
    safeStorage.set(STORE_KEY, JSON.stringify(store));
  } catch {
    // Suggestions are the first thing worth losing if storage is full.
  }
}

// Local order first, then anything the other device knows that this one
// does not. Order matters and is deliberately per device: the top of the
// list is what THIS device used most recently, which is what the person
// holding it is most likely to want next.
function mergeInto(target, incoming) {
  if (!incoming || typeof incoming !== "object") return target;
  Object.keys(incoming).forEach(key => {
    const extra = Array.isArray(incoming[key]) ? incoming[key] : [];
    const merged = Array.isArray(target[key]) ? target[key].slice() : [];
    extra.forEach(value => {
      const clean = String(value || "").trim();
      if (!clean) return;
      if (!merged.some(v => v.toLowerCase() === clean.toLowerCase())) merged.push(clean);
    });
    target[key] = merged.slice(0, CAP);
  });
  return target;
}

// Read, merge, write — rather than write. Two devices each hold their own
// list and each write sends the whole map, so writing blind would drop
// whatever the other one learned since this one started. A suggestion lost
// is not a disaster, but it is avoidable for the cost of one read on a
// write that already happens seconds after the typing stopped.
async function flush() {
  timer = null;
  try {
    mergeInto(store, await readRemote());
    persistLocal();
  } catch {
    // Offline, or no document yet. Writing what this device knows is
    // still right — Firestore queues it and it lands on reconnect.
  }
  writeRemote(store);
}

function scheduleWrite() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, WRITE_DELAY_MS);
}

// Called once after sign-in, alongside the rest of the configuration.
export async function hydrateSuggestions() {
  const remote = await readRemote();
  if (!remote || typeof remote !== "object") return false;
  mergeInto(store, remote);
  persistLocal();
  return true;
}

// Case-insensitive match, so "pradeep" doesn't get remembered alongside
// "Pradeep" — the first spelling used wins and is offered from then on,
// which is what stops the same person becoming three records.
export function rememberValue(key, value) {
  const clean = (value || "").trim();
  if (clean.length < 2) return;
  if (!store[key]) store[key] = [];
  const existing = store[key].find(v => v.toLowerCase() === clean.toLowerCase());
  if (existing) {
    // Move to front so the most recently used sits at the top of the list.
    store[key] = [existing, ...store[key].filter(v => v !== existing)];
    // Reordering is this device's own preference and not worth a write of
    // its own — the value is already known to everyone.
    persistLocal();
    return;
  }
  store[key] = [clean, ...store[key]].slice(0, CAP);
  persistLocal();
  scheduleWrite();
}

export function getSuggestions(key, seed = []) {
  const remembered = store[key] || [];
  const merged = [...remembered];
  seed.forEach(s => {
    const clean = (s || "").trim();
    if (clean && !merged.some(v => v.toLowerCase() === clean.toLowerCase())) merged.push(clean);
  });
  return merged;
}

// Keys are shared where the field means the same thing in two places — a
// guide named on an activity charge is the same person as the guide named
// on a registration card, so they draw from one list.
export const SUGGESTION_KEYS = {
  GUIDE: "guide",
  TRAVEL_AGENT: "travel-agent",
  COUNTRY: "country",
  NATIONALITY: "nationality",
  VEHICLE: "vehicle",
  RESERVED_BY: "reserved-by",
};

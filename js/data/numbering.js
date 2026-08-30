// Document numbers — invoices, registration cards, reservations and agent
// invoices.
//
// Three things have to be true at once, and they pull against each other:
//
//   * A number must be unique. Two phones handing out invoice 1 on the
//     same day is the failure that matters.
//   * A number must be issuable offline, because Wilpattu's signal is
//     unreliable and a guest cannot be told to wait for a bar.
//   * A printed number must never change afterwards. Renumbering a bill a
//     guest is holding is not an option.
//
// Firestore transactions do not work offline, so a counter read at the
// moment of billing cannot be the answer. Instead a device *reserves a
// block* while it has signal — say 100 to 149 — and spends from it with
// no coordination at all. Two devices hold different blocks, so their
// numbers cannot collide even if neither has seen the other for a week.
//
// The cost is gaps: Wilpattu might run 100, 101, 150, 102. That is normal
// and expected, and the manager has to be told, or it looks like invoices
// have gone missing. See [[backend-decisions]].

import { connect, getDb, fsApi } from "./firebase.js";
import { projectId } from "./firebase-config.js";
import { isDemoMode } from "../demo.js";
import { safeStorage, toDateISO } from "../utils.js";
import { logError } from "./error-log.js";

// Big enough that a device would have to bill fifty times without ever
// reconnecting to run dry; small enough that gaps stay modest.
const BLOCK_SIZE = 50;
// Topped up well before it runs out, so a device that goes offline mid-day
// still has room.
const REFILL_AT = 15;

export const DOC_TYPES = {
  INVOICE: { key: "invoice", prefix: "INV" },
  GRC: { key: "grc", prefix: "GRC" },
  RESERVATION: { key: "reservation", prefix: "RES" },
  PROFORMA: { key: "proforma", prefix: "TRA" },
};

// The financial year a date falls in. Sri Lanka's runs April to March, and
// the numbering follows it so an accountant's series matches the period
// they file. Computed from the hotel's own day, not UTC.
export function financialYear(date = new Date()) {
  const day = toDateISO(date);              // already Asia/Colombo
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));    // 1-12
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function formatNumber(prefix, fy, seq) {
  return `${prefix}-${fy}-${String(seq).padStart(3, "0")}`;
}

// A financial year reads "2026/27" on a printed document, and that slash
// is a path separator to Firestore — `counters/Wilpattu__invoice__2026/27`
// parses as three segments and is rejected as an invalid document
// reference. So the printed form above keeps its slash and every *key*
// derived from a year goes through here instead.
function slug(part) {
  return String(part).replace(/[/\s]+/g, "-");
}

// Keyed by project as well as branch, type and year. Without the project,
// a device that used the test database and then switched to the live one
// would still be holding a *test* block, and would spend its numbers on
// real invoices — numbers the live counter has never heard of and will
// hand out again later. The switchover is exactly when nobody is looking
// for that, so the key carries the project rather than relying on
// somebody remembering to clear site data.
function localKey(branch, type, fy) {
  // Demo blocks are kept in their own namespace, never sharing a key with
  // real ones. Demo mode and the live config are both chosen by hostname,
  // so ?demo=1 on the production domain would otherwise write its
  // 9000-range block under the live project's key — and the next real
  // invoice raised in that browser would be numbered from 9000. Different
  // origins already separate the GitHub Pages demo from a hosted app, but
  // ?demo=1 on the real domain is the same origin, and that is exactly the
  // case somebody would try while showing the system to someone.
  const scope = isDemoMode() ? "demo" : slug(projectId());
  return `leopardinn-block-${scope}-${slug(branch)}-${slug(type)}-${slug(fy)}`;
}

function readBlock(branch, type, fy) {
  try {
    const raw = safeStorage.get(localKey(branch, type, fy));
    if (!raw) return null;
    const block = JSON.parse(raw);
    return typeof block.next === "number" && typeof block.to === "number" ? block : null;
  } catch {
    return null;
  }
}

function writeBlock(branch, type, fy, block) {
  safeStorage.set(localKey(branch, type, fy), JSON.stringify(block));
}

function remaining(block) {
  return block ? (block.to - block.next + 1) : 0;
}

// Claims the next block for this branch, type and financial year. The
// transaction is the only coordination in the whole scheme, and it happens
// nowhere near a guest waiting at a desk.
async function reserveBlock(branch, type, fy) {
  await connect();
  const fs = fsApi();
  const ref = fs.doc(getDb(), "counters", `${slug(branch)}__${slug(type)}__${slug(fy)}`);

  return fs.runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(ref);
    // A new financial year starts at 1, which is the whole point of
    // keying the counter by year.
    const nextFree = snap.exists() ? (snap.data().nextFree || 1) : 1;
    tx.set(ref, {
      branch, type, financialYear: fy,
      nextFree: nextFree + BLOCK_SIZE,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { from: nextFree, to: nextFree + BLOCK_SIZE - 1, next: nextFree };
  });
}

// Tops up in the background when a block is running low, so the refill
// happens while there is signal rather than at the moment one is needed.
async function topUp(branch, type, fy) {
  try {
    const block = await reserveBlock(branch, type, fy);
    const held = readBlock(branch, type, fy);
    // Keep whichever still has numbers in it. A device that reserved
    // 150-199 while still holding 3 unspent from 100-149 should not
    // throw those three away — they are already accounted for.
    if (held && remaining(held) > 0) {
      writeBlock(branch, type, fy, { ...held, spare: block });
    } else {
      writeBlock(branch, type, fy, block);
    }
    return true;
  } catch (err) {
    // Offline is silent on purpose — it is the normal case this whole
    // scheme exists for, and logging it every time a phone has no signal
    // would be noise. A permission refusal is not normal: it means the
    // rules do not match what this code expects, and staying quiet about
    // it is how "no numbers available" turns into an unexplained mystery.
    if (err && err.code !== "unavailable" && err.code !== "failed-precondition") {
      logError(`Could not reserve a ${type} number block for ${branch}: ${err.code || err.message}`, {
        source: "numbering",
      });
    }
    return false;
  }
}

// The number for a document about to be created.
//
// Deliberately synchronous. Every caller is a submit handler with someone
// standing at a desk, and a number that needs the network to be issued is
// exactly what the reserved block exists to avoid. The block is filled at
// sign-in and topped up in the background, so by the time anybody bills,
// the number is already in hand.
//
// Returns null when there is genuinely nothing left. A wrong number on a
// financial document is worse than being told to wait for signal, so the
// caller refuses rather than guessing.
export function takeNumber(branch, docType) {
  if (!branch) return null;
  const type = docType.key;
  const fy = financialYear();
  let block = readBlock(branch, type, fy);

  // Promote a spare reserved earlier, if this one is spent.
  if ((!block || remaining(block) <= 0) && block && block.spare && remaining(block.spare) > 0) {
    block = block.spare;
    writeBlock(branch, type, fy, block);
  }

  if (!block || remaining(block) <= 0) {
    // Nothing in hand. Ask for more — it may arrive in time for the next
    // attempt — but this one cannot be served.
    topUp(branch, type, fy);
    logError(`No ${docType.prefix} numbers left for ${branch}`, { source: "numbering" });
    return null;
  }

  const seq = block.next;
  block.next = seq + 1;
  writeBlock(branch, type, fy, block);

  // Topped up in the background once it runs low, so the reservation
  // happens while there is signal rather than when one is needed. Not
  // awaited: the number is already in hand.
  if (remaining(block) <= REFILL_AT && !block.spare) {
    topUp(branch, type, fy);
  }

  return { seq, fy, formatted: formatNumber(docType.prefix, fy, seq) };
}

// Whether numbers can be issued right now, and how many are left. Used to
// warn a manager before a device runs dry rather than after.
export function blockStatus(branch, docType) {
  const fy = financialYear();
  const block = readBlock(branch, docType.key, fy);
  const left = remaining(block) + (block && block.spare ? remaining(block.spare) : 0);
  return { financialYear: fy, remaining: left, hasBlock: Boolean(block) };
}

// Demo mode has no Firestore to reserve from, and a demo where every
// invoice refuses to generate demonstrates nothing. Hands out a large
// local block per document type so the whole flow works, numbered from a
// range no real series will ever reach — so a demo invoice can never be
// mistaken for a real one if a screenshot escapes.
export function seedDemoBlocks(branch) {
  const fy = financialYear();
  Object.values(DOC_TYPES).forEach(docType => {
    writeBlock(branch, docType.key, fy, { from: 9000, to: 9999, next: 9000 });
  });
}

// Called once after sign-in, so every device has numbers in hand before
// anybody needs one — including if it goes offline immediately afterwards.
export async function primeNumbering(branch) {
  const fy = financialYear();
  const results = await Promise.allSettled(
    Object.values(DOC_TYPES).map(async (docType) => {
      const block = readBlock(branch, docType.key, fy);
      if (block && remaining(block) > REFILL_AT) return true;
      return topUp(branch, docType.key, fy);
    })
  );
  return results.filter(r => r.status === "fulfilled" && r.value).length;
}

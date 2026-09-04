// The one place every persisted record is written through.
//
// Until now each module pushed straight into its own exported array, which
// worked because nothing outlived a refresh. Those arrays stay — they are
// the app's working set and every screen still reads them synchronously —
// but writes now go through here as well, so a single adapter swap makes
// them durable.
//
// Writes are deliberately fire-and-forget rather than awaited. That is not
// laziness: Firestore applies a write to its local cache immediately and
// syncs when it can, so the array and the cache agree at once and the
// screen can render without waiting for a network round trip. It is also
// what offline-first requires — a receptionist with no signal must not be
// blocked mid-check-in. See [[backend-decisions]].
//
// Collection names are the Firestore collection names, fixed here so a
// typo at a call site can't quietly write records nobody ever reads back.

export const COLLECTIONS = {
  INVOICES: "invoices",
  BOOKINGS: "bookings",
  FOOD_ORDERS: "foodOrders",
  // The kitchen queue, separate from FOOD_ORDERS above, which is the sale.
  PENDING_ORDERS: "foodOrdersPending",
  ACTIVITY_CHARGES: "activityCharges",
  GUEST_CHARGES: "guestCharges",
  RESERVATIONS: "reservations",
  PROFORMAS: "proformaInvoices",
  GRC: "registrationCards",
  RESTOCKS: "restocks",
  STOCK_USAGE: "stockUsage",
  GUEST_EMAILS: "guestEmails",
  // The guest's bill, with the invoice PDF carried on the row — see
  // data/invoice-email.js for why the bytes travel rather than being
  // re-rendered on the server.
  INVOICE_EMAILS: "invoiceEmails",
  ROOM_ACTIVITY: "roomActivity",
  LOGINS: "logins",
  MENU: "menuItems",
  // No ROOMS. A villa's name and rate are config — `config/<branch>__villas`
  // — and whether it is occupied is derived from the bookings, never
  // stored. A `rooms` collection was declared here and given a rule, and
  // nothing ever read or wrote it. Naming a collection the app does not
  // use invites somebody to start using it, and then "is this villa
  // occupied" has two homes again.
  ERRORS: "errors",
  CONFIG: "config",
  // Deliberately NOT inside `config`. Config is what a manager decided,
  // and its rule says so — manager-only writes. Suggestions are what
  // reception typed, and reception is staff: guide names and travel agents
  // are entered on the registration card. Filed under config, every name a
  // staff member typed was refused by the rules and logged as an error,
  // which is the opposite of the feature. Different writer, different
  // collection.
  SUGGESTIONS: "suggestions",
};

const VALID = new Set(Object.values(COLLECTIONS));

// Nothing to persist to yet. Every method is a no-op that reports success,
// so the app behaves exactly as it does today until a real adapter is
// installed. Replaced wholesale by the Firestore adapter — no call site
// changes when that happens.
const memoryAdapter = {
  name: "memory",
  add() {},
  update() {},
  remove() {},
  ready: false,
};

let adapter = memoryAdapter;

export function useAdapter(next) {
  adapter = next || memoryAdapter;
  return adapter;
}

export function adapterName() {
  return adapter.name;
}

// True once records survive a refresh. Screens can use this to stop
// promising durability they can't deliver — a "saved" toast is a lie while
// everything still lives in memory.
export function isPersistent() {
  return Boolean(adapter.ready);
}

function guard(collection) {
  if (!VALID.has(collection)) {
    // Thrown rather than warned: a bad collection name means records are
    // being written somewhere nothing reads, and that is exactly the kind
    // of silent loss this app has already been bitten by.
    throw new Error(`Unknown collection "${collection}" — add it to COLLECTIONS`);
  }
}

// A write that fails must never take a check-in down with it. The record is
// already in the local array and, under Firestore, already in its cache;
// what failed is the report of that fact.
function safely(what, fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") {
      result.catch(err => console.error(`store: ${what} failed`, err));
    }
  } catch (err) {
    console.error(`store: ${what} failed`, err);
  }
}

// Append a record to its working array and persist it.
export function add(collection, array, record) {
  guard(collection);
  array.push(record);
  safely(`add to ${collection}`, () => adapter.add(collection, record));
  return record;
}

// Change a record in place and persist the change. Used for the handful of
// records that legitimately mutate — a reservation being corrected, an
// invoice being voided, a queued e-mail being marked sent.
export function update(collection, record, changes) {
  guard(collection);
  if (changes) Object.assign(record, changes);
  safely(`update in ${collection}`, () => adapter.update(collection, record));
  return record;
}

// Nothing financial is ever removed — invoices, cards, reservations and
// agent invoices are voided or cancelled instead. This exists only for the
// things that genuinely are deletable: a menu dish, a stock item, a
// pending food order that was keyed in wrongly.
export function remove(collection, array, record) {
  guard(collection);
  const at = array.indexOf(record);
  if (at !== -1) array.splice(at, 1);
  safely(`remove from ${collection}`, () => adapter.remove(collection, record));
  return record;
}

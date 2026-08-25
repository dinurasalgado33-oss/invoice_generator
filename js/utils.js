export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Both hotels are in Sri Lanka, so a "day" means a day at the hotel — not
// UTC, and not whatever timezone the device happens to be set to. Stated
// explicitly rather than relying on the device: toISOString() is UTC, so
// anything recorded after 6:30pm local would be filed under the previous
// day, and a manager checking reports from abroad would see a different
// set of days again.
//
// Timestamps themselves stay UTC, which is correct for storage. This is
// only for deciding which day a moment belongs to.
export const HOTEL_TIMEZONE = "Asia/Colombo";

const hotelDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: HOTEL_TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
});

export function toDateISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return "";
  // en-CA renders as YYYY-MM-DD, which is the shape every record stores.
  return hotelDayFormatter.format(d);
}

export function todayISO() {
  return toDateISO();
}

// Anything that can't be read as a real number becomes 0 rather than
// reaching the UI as "NaN" — or, in fmt()'s case, throwing outright on
// null/undefined and taking the whole render down with it.
export function toFiniteNumber(n) {
  const num = typeof n === "number" ? n : parseFloat(n);
  return Number.isFinite(num) ? num : 0;
}

// Upper bound for every money field in the app. Nothing at these two
// properties bills nine figures for one line, so a number past this is a
// typo (a held-down key, a pasted account number) rather than a real
// amount — and without a ceiling those typos reach the printed bill and
// the revenue totals. One billion LKR is far above any real charge while
// still leaving obvious room for a legitimately large group booking.
export const MAX_MONEY = 1_000_000_000;

// Largest count for a quantity/guest field. Same reasoning, different
// scale — nothing here is ordered ten thousand at a time.
export const MAX_COUNT = 9999;

// Clamps a money input to [0, MAX_MONEY], returning 0 for anything
// unparseable. Use at the point a typed value becomes a stored number.
export function clampMoney(n, max = MAX_MONEY) {
  const num = toFiniteNumber(n);
  if (num < 0) return 0;
  return num > max ? max : num;
}

// Caps a numeric input as it's typed, visibly, so the value on screen is
// always the value that will be stored. Deliberately not the native `max`
// attribute: that fires the browser's own validation bubble, which is the
// undesigned popup this app replaced everywhere else. Silent capping is
// also better than silent truncation — the number visibly stops climbing,
// so the staff member sees the limit rather than discovering it later on
// a printed bill.
export function capNumericInput(el, max) {
  if (!el) return;
  el.addEventListener("input", () => {
    const n = parseFloat(el.value);
    if (Number.isFinite(n) && n > max) el.value = String(max);
    if (Number.isFinite(n) && n < 0) el.value = "0";
  });
}

// localStorage throws — not just returns null — when storage is
// unavailable: iOS Safari private mode raises QuotaExceededError on every
// setItem, and some embedded webviews block access outright. An uncaught
// throw here used to be able to take down login, logout and the invoice
// counter, so every access goes through these instead.
export const safeStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

// A date we can't parse renders as the em-dash placeholder, not as the raw
// junk string — an invoice reading "not-a-date" is worse than one reading "—".
export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmt(n, currency) {
  return `${currency || "LKR"} ${toFiniteNumber(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtLKR(n) {
  return "LKR " + Math.round(toFiniteNumber(n)).toLocaleString("en-US");
}

// Display fallback for any free-text field that may arrive empty/null.
export function orDash(value) {
  const text = value == null ? "" : String(value).trim();
  return text === "" ? "—" : text;
}

export function nightsBetween(checkin, checkout) {
  const a = new Date(checkin + "T00:00:00");
  const b = new Date(checkout + "T00:00:00");
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 1;
}

// A falsy src used to be assigned straight onto the element, so `null`
// became src="null" and fired a junk 404, and src="" re-requested the page
// itself. Neither reliably triggers the inline onerror, leaving a broken
// image box visible. Hide it up front instead.
export function setLogoSrc(id, src) {
  const img = document.getElementById(id);
  if (!img) return;
  if (!src) {
    img.removeAttribute("src");
    img.style.display = "none";
    return;
  }
  img.style.display = "";
  img.src = src;
}

let toastTimeout = null;
export function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2500);
}

// Writes a screen heading's property name twice — full and short — and lets
// CSS choose. "Room Map — Wilpattu Forest Retreat" does not wrap, so on a
// phone it pushed the whole page sideways: five screens scrolled
// horizontally, including Room Map and the checkout form, which are the two
// reception uses most. Both spellings live in the DOM so the choice costs
// nothing at resize and needs no re-render.
export function setBranchLabel(id, fullName, shortName) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  const full = document.createElement("span");
  full.className = "bl-full";
  full.textContent = fullName || "";
  const short = document.createElement("span");
  short.className = "bl-short";
  short.textContent = shortName || fullName || "";
  el.append(full, short);
}

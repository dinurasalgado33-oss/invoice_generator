export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Anything that can't be read as a real number becomes 0 rather than
// reaching the UI as "NaN" — or, in fmt()'s case, throwing outright on
// null/undefined and taking the whole render down with it.
export function toFiniteNumber(n) {
  const num = typeof n === "number" ? n : parseFloat(n);
  return Number.isFinite(num) ? num : 0;
}

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

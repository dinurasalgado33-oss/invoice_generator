// A phone number is a country code and then the digits.
//
// It used to be one wide free-text box, which meant every number was typed
// with whatever prefix the person felt like — 077…, +9477…, 0094 77…, or
// nothing — and the same guest could be stored three ways. Sri Lanka is the
// default because these are Sri Lankan properties and almost every number
// is local; the list is there for the guests who are not.
//
// Stored as one string, "+94 771234567", because that is what the rest of
// the app already reads and what a printed confirmation should show. The
// split is a detail of the form, not of the record.

// Longest first, so "+94" is not matched by "+9" and "+971" is not read as
// "+97" followed by a stray 1.
function codesFrom(select) {
  return [...select.options].map(o => o.value).sort((a, b) => b.length - a.length);
}

export function readPhone(codeId, numberId) {
  const code = document.getElementById(codeId);
  const number = document.getElementById(numberId);
  const digits = (number.value || "").trim();
  if (!digits) return "";
  // Somebody who types the whole international number into the digits box
  // should not end up with it twice.
  if (digits.startsWith("+")) return digits;
  return `${code.value} ${digits.replace(/^0+/, "")}`.trim();
}

export function setPhone(codeId, numberId, stored) {
  const code = document.getElementById(codeId);
  const number = document.getElementById(numberId);
  const value = (stored || "").trim();

  if (!value) { number.value = ""; return; }

  const match = codesFrom(code).find(c => value.startsWith(c));
  if (match) {
    code.value = match;
    number.value = value.slice(match.length).trim();
  } else {
    // A number stored before this field existed, in whatever shape it was
    // typed. Show it as it is rather than guessing at a country.
    number.value = value;
  }
}

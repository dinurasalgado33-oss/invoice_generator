// Record identifiers.
//
// These used to be counters starting at 1 in every browser, which worked
// for exactly as long as there was one device. With two phones offline,
// both would create a booking with id 1, both would sync, and every
// lookup joining on that id would then match two different guests' stays:
// one guest's bill quietly containing another's dinner.
//
// That failure is worse than a duplicate invoice number, because a
// duplicate number is visible on the paper. This one shows nothing at all.
//
// A UUID needs no coordination — two devices that have never met cannot
// generate the same one — so records can be created offline, for as long
// as necessary, and still join correctly when they meet.
//
// IDs are strings from here on. Compare them with ===, never subtract
// them, and never pass them through Number().

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Older Android WebViews have crypto but not randomUUID. Random enough
  // for the same job: two devices generating the same value would need to
  // collide on 80 bits within the same millisecond.
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

// Sorting by id used to mean "oldest first", because the counter went up.
// It no longer does, so anything that wants creation order has to sort by
// a timestamp — this exists to make that explicit where it is needed.
export function byCreatedAt(a, b) {
  const x = a && a.createdAt ? a.createdAt : "";
  const y = b && b.createdAt ? b.createdAt : "";
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

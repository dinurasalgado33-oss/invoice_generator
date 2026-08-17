// Dirty-data harness for manual QA. Not referenced by index.html — nothing
// here ships to staff. Paste into the browser console (or import it) after
// logging in, then walk the screens looking for layout breaks, NaN renders,
// "Invalid Date", broken images, or blank fields with no fallback.
//
//   const qa = await import('/dev/injectDirtyData.js');
//   await qa.injectAll();          // poison every collection
//   qa.report();                   // scan the active screen for breakage
//   location.reload();             // undo (data is in-memory only)
//
// Everything is in-memory, so a reload restores the real seed data.

const DIRTY_URL = "/dirtyMockData.json";

export async function loadDirty() {
  const res = await fetch(DIRTY_URL);
  if (!res.ok) throw new Error("Could not load " + DIRTY_URL + " (" + res.status + ")");
  return res.json();
}

// Replace a live array's contents in place — the app holds references to
// these exact arrays, so reassigning wouldn't be visible to it.
function replaceAll(target, rows) {
  target.length = 0;
  rows.forEach(r => target.push({ ...r }));
}

export async function injectAll(branch = "Wilpattu") {
  const dirty = await loadDirty();
  const rooms = await import("../js/data/rooms.js");
  const reports = await import("../js/data/reports.js");
  const inventory = await import("../js/data/inventory.js");
  const menu = await import("../js/data/menu.js");

  replaceAll(rooms.ROOMS_BY_BRANCH[branch], dirty.rooms);
  replaceAll(inventory.INVENTORY_BY_BRANCH[branch], dirty.inventoryItems);
  replaceAll(reports.INVOICES, dirty.invoices);
  replaceAll(reports.BOOKINGS, dirty.bookings);
  replaceAll(reports.FOOD_ORDER_RECORDS, dirty.foodOrderRecords);
  replaceAll(reports.ACTIVITY_RECORDS, dirty.activityRecords);
  replaceAll(inventory.RESTOCK_LOG, dirty.restockLog);

  // Menu is one flat branch-scoped list, so swap only this branch's dishes.
  const others = menu.MENU_ITEMS.filter(d => d.branch !== branch);
  menu.MENU_ITEMS.length = 0;
  others.forEach(d => menu.MENU_ITEMS.push(d));
  dirty.menuItems.forEach(d => menu.MENU_ITEMS.push({ ...d, branch }));

  return `injected dirty data into "${branch}" — navigate the app, then call report()`;
}

// Scans whatever screen is currently visible for the failure modes this
// fixture is designed to provoke.
export function report() {
  const screen = document.querySelector(".screen.active");
  if (!screen) return "no active screen";
  const vw = window.innerWidth;
  const text = screen.textContent;

  const overflowing = [...screen.querySelectorAll("*")]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1;
    })
    .map(el => el.tagName + "." + String(el.className).split(" ")[0]);

  // Anything rendering taller than this is almost certainly an unclamped
  // free-text field rather than a genuinely tall component.
  const tall = [...screen.querySelectorAll(".room-card, .report-row, .list-item-row, .pending-order-card")]
    .map(el => ({ el: el.className.split(" ")[0], h: Math.round(el.getBoundingClientRect().height) }))
    .filter(x => x.h > 200);

  const brokenImages = [...screen.querySelectorAll("img")]
    .filter(img => img.offsetParent !== null && img.complete && img.naturalWidth === 0)
    .map(img => img.id || img.getAttribute("src"));

  return {
    screen: screen.id,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    overflowingElements: [...new Set(overflowing)].slice(0, 5),
    suspiciouslyTallRows: tall,
    rendersNaN: text.includes("NaN"),
    rendersInvalidDate: text.includes("Invalid Date"),
    rendersNullOrUndefined: /\b(null|undefined)\b/.test(text),
    brokenImages,
  };
}

import { newId } from "./ids.js";
import { add, COLLECTIONS } from "./store.js";
import { appState } from "../state.js";
import { todayISO } from "../utils.js";
export const INVENTORY_CATEGORIES = [
  "Meat", "Seafood", "Produce", "Dairy & Eggs", "Grains", "Pantry", "Beverages",
  "Toiletries & Amenities", "Housekeeping", "Linen", "Cleaning Supplies", "Maintenance & Office", "Other",
];
export const INVENTORY_UNITS = ["kg", "g", "L", "ml", "pcs"];

// Groups the flat categories above into departments, so the inventory
// table can show department > category > item instead of one long list
// of 12 category sections.
export const INVENTORY_DEPARTMENTS = [
  { name: "Food & Beverage", categories: ["Meat", "Seafood", "Produce", "Dairy & Eggs", "Grains", "Pantry", "Beverages"] },
  { name: "Guest Amenities", categories: ["Toiletries & Amenities", "Linen"] },
  { name: "Housekeeping & Cleaning", categories: ["Housekeeping", "Cleaning Supplies"] },
  { name: "Maintenance & Office", categories: ["Maintenance & Office", "Other"] },
];

// A literal, not a computed max: INVENTORY_BY_BRANCH is declared further
// down this file, so reading it here hits the temporal dead zone and the
// whole app fails to boot. initInventoryDerived() recomputes this from the
// real data at startup, which is what actually keeps ids clear.
let nextInventoryId = 100;
export function allocateInventoryItemId() {
  return nextInventoryId++;
}

// Starting unit cost (LKR) per item name, used to seed each item's
// costPerUnit below — same base price at both branches for simplicity.
// This map itself is never mutated; each item's own `costPerUnit` field
// is what actually updates when a restock is logged with a different cost.
export const COST_PER_UNIT = {
  "Chicken": 1200, "Rice": 220, "Coconut": 120, "Fish": 1500, "Prawns": 2800,
  "Vegetables": 180, "Eggs": 35, "Rice Flour": 250, "Cooking Oil": 750,
  "Spices Mix": 2000, "Onions": 280, "Salt": 120, "Sugar": 280, "Tea Bags": 15,
  "Coffee Powder": 2500, "Milk Powder": 1800, "Bottled Water": 60, "Soft Drinks": 150,
  "Soap Bars": 80, "Shampoo Bottles": 350, "Toothbrush Kits": 120, "Shower Caps": 15,
  "Slippers (Guest Pairs)": 180, "Toilet Paper Rolls": 90, "Tissue Boxes": 150,
  "Laundry Detergent": 450, "Garbage Bags": 10, "Air Freshener": 350, "Bedsheet Sets": 3500,
  "Pillow Covers": 600, "Bath Towels": 1200, "Hand Towels": 450, "Bath Mats": 800,
  "Floor Cleaner": 380, "Glass Cleaner": 420, "Disinfectant": 550, "Mop Heads": 450,
  "Rubber Gloves": 120, "Light Bulbs": 250, "Batteries (AA)": 90, "Printer Paper": 1200,
  "Receipt Rolls": 180,
};

// A hotel's real consumable inventory spans a lot more than the kitchen —
// kept the original 12 F&B items' stock numbers as-is (Reports' Inventory
// Usage tab references them for consistency) and filled out the rest:
// beverages, guest toiletries/amenities, housekeeping supplies, linen,
// cleaning supplies, and general maintenance/office stock.
export const INVENTORY_BY_BRANCH = {
  "Wilpattu": [
    { id: 1, name: "Chicken", category: "Meat", stock: 10, minStock: 5, unit: "kg" },
    { id: 2, name: "Rice", category: "Grains", stock: 35, minStock: 15, unit: "kg" },
    { id: 3, name: "Coconut", category: "Produce", stock: 2, minStock: 8, unit: "kg" },
    { id: 4, name: "Fish", category: "Seafood", stock: 7, minStock: 5, unit: "kg" },
    { id: 5, name: "Prawns", category: "Seafood", stock: 5, minStock: 4, unit: "kg" },
    { id: 6, name: "Vegetables", category: "Produce", stock: 20, minStock: 10, unit: "kg" },
    { id: 7, name: "Eggs", category: "Dairy & Eggs", stock: 28, minStock: 24, unit: "pcs" },
    { id: 8, name: "Rice Flour", category: "Grains", stock: 3, minStock: 5, unit: "kg" },
    { id: 9, name: "Cooking Oil", category: "Pantry", stock: 9, minStock: 6, unit: "L" },
    { id: 10, name: "Spices Mix", category: "Pantry", stock: 4, minStock: 3, unit: "kg" },
    { id: 11, name: "Onions", category: "Produce", stock: 1, minStock: 8, unit: "kg" },
    { id: 12, name: "Salt", category: "Pantry", stock: 7, minStock: 2, unit: "kg" },
    { id: 13, name: "Sugar", category: "Pantry", stock: 12, minStock: 5, unit: "kg" },
    { id: 14, name: "Tea Bags", category: "Beverages", stock: 300, minStock: 100, unit: "pcs" },
    { id: 15, name: "Coffee Powder", category: "Beverages", stock: 3, minStock: 2, unit: "kg" },
    { id: 16, name: "Milk Powder", category: "Beverages", stock: 4, minStock: 2, unit: "kg" },
    { id: 17, name: "Bottled Water", category: "Beverages", stock: 120, minStock: 60, unit: "pcs" },
    { id: 18, name: "Soft Drinks", category: "Beverages", stock: 48, minStock: 24, unit: "pcs" },
    { id: 19, name: "Soap Bars", category: "Toiletries & Amenities", stock: 150, minStock: 60, unit: "pcs" },
    { id: 20, name: "Shampoo Bottles", category: "Toiletries & Amenities", stock: 90, minStock: 40, unit: "pcs" },
    { id: 21, name: "Toothbrush Kits", category: "Toiletries & Amenities", stock: 60, minStock: 30, unit: "pcs" },
    { id: 22, name: "Shower Caps", category: "Toiletries & Amenities", stock: 80, minStock: 30, unit: "pcs" },
    { id: 23, name: "Slippers (Guest Pairs)", category: "Toiletries & Amenities", stock: 40, minStock: 20, unit: "pcs" },
    { id: 24, name: "Toilet Paper Rolls", category: "Housekeeping", stock: 200, minStock: 80, unit: "pcs" },
    { id: 25, name: "Tissue Boxes", category: "Housekeeping", stock: 70, minStock: 30, unit: "pcs" },
    { id: 26, name: "Laundry Detergent", category: "Housekeeping", stock: 15, minStock: 8, unit: "kg" },
    { id: 27, name: "Garbage Bags", category: "Housekeeping", stock: 250, minStock: 100, unit: "pcs" },
    { id: 28, name: "Air Freshener", category: "Housekeeping", stock: 8, minStock: 10, unit: "pcs" },
    { id: 29, name: "Bedsheet Sets", category: "Linen", stock: 45, minStock: 20, unit: "pcs" },
    { id: 30, name: "Pillow Covers", category: "Linen", stock: 90, minStock: 40, unit: "pcs" },
    { id: 31, name: "Bath Towels", category: "Linen", stock: 110, minStock: 50, unit: "pcs" },
    { id: 32, name: "Hand Towels", category: "Linen", stock: 130, minStock: 50, unit: "pcs" },
    { id: 33, name: "Bath Mats", category: "Linen", stock: 35, minStock: 15, unit: "pcs" },
    { id: 34, name: "Floor Cleaner", category: "Cleaning Supplies", stock: 10, minStock: 5, unit: "L" },
    { id: 35, name: "Glass Cleaner", category: "Cleaning Supplies", stock: 6, minStock: 3, unit: "L" },
    { id: 36, name: "Disinfectant", category: "Cleaning Supplies", stock: 8, minStock: 4, unit: "L" },
    { id: 37, name: "Mop Heads", category: "Cleaning Supplies", stock: 4, minStock: 5, unit: "pcs" },
    { id: 38, name: "Rubber Gloves", category: "Cleaning Supplies", stock: 40, minStock: 20, unit: "pcs" },
    { id: 39, name: "Light Bulbs", category: "Maintenance & Office", stock: 30, minStock: 15, unit: "pcs" },
    { id: 40, name: "Batteries (AA)", category: "Maintenance & Office", stock: 50, minStock: 20, unit: "pcs" },
    { id: 41, name: "Printer Paper", category: "Maintenance & Office", stock: 5, minStock: 3, unit: "pcs" },
    { id: 42, name: "Receipt Rolls", category: "Maintenance & Office", stock: 8, minStock: 4, unit: "pcs" },
  ],
  "Arugam Bay": [
    { id: 101, name: "Chicken", category: "Meat", stock: 12, minStock: 5, unit: "kg" },
    { id: 102, name: "Rice", category: "Grains", stock: 40, minStock: 15, unit: "kg" },
    { id: 103, name: "Coconut", category: "Produce", stock: 3, minStock: 8, unit: "kg" },
    { id: 104, name: "Fish", category: "Seafood", stock: 6, minStock: 5, unit: "kg" },
    { id: 105, name: "Prawns", category: "Seafood", stock: 1.5, minStock: 4, unit: "kg" },
    { id: 106, name: "Vegetables", category: "Produce", stock: 18, minStock: 10, unit: "kg" },
    { id: 107, name: "Eggs", category: "Dairy & Eggs", stock: 30, minStock: 24, unit: "pcs" },
    { id: 108, name: "Rice Flour", category: "Grains", stock: 4, minStock: 5, unit: "kg" },
    { id: 109, name: "Cooking Oil", category: "Pantry", stock: 10, minStock: 6, unit: "L" },
    { id: 110, name: "Spices Mix", category: "Pantry", stock: 5, minStock: 3, unit: "kg" },
    { id: 111, name: "Onions", category: "Produce", stock: 14, minStock: 8, unit: "kg" },
    { id: 112, name: "Salt", category: "Pantry", stock: 8, minStock: 2, unit: "kg" },
    { id: 113, name: "Sugar", category: "Pantry", stock: 15, minStock: 5, unit: "kg" },
    { id: 114, name: "Tea Bags", category: "Beverages", stock: 400, minStock: 100, unit: "pcs" },
    { id: 115, name: "Coffee Powder", category: "Beverages", stock: 5, minStock: 2, unit: "kg" },
    { id: 116, name: "Milk Powder", category: "Beverages", stock: 6, minStock: 2, unit: "kg" },
    { id: 117, name: "Bottled Water", category: "Beverages", stock: 200, minStock: 80, unit: "pcs" },
    { id: 118, name: "Soft Drinks", category: "Beverages", stock: 90, minStock: 30, unit: "pcs" },
    { id: 119, name: "Soap Bars", category: "Toiletries & Amenities", stock: 220, minStock: 80, unit: "pcs" },
    { id: 120, name: "Shampoo Bottles", category: "Toiletries & Amenities", stock: 130, minStock: 50, unit: "pcs" },
    { id: 121, name: "Toothbrush Kits", category: "Toiletries & Amenities", stock: 85, minStock: 35, unit: "pcs" },
    { id: 122, name: "Shower Caps", category: "Toiletries & Amenities", stock: 100, minStock: 40, unit: "pcs" },
    { id: 123, name: "Slippers (Guest Pairs)", category: "Toiletries & Amenities", stock: 55, minStock: 25, unit: "pcs" },
    { id: 124, name: "Toilet Paper Rolls", category: "Housekeeping", stock: 260, minStock: 100, unit: "pcs" },
    { id: 125, name: "Tissue Boxes", category: "Housekeeping", stock: 95, minStock: 40, unit: "pcs" },
    { id: 126, name: "Laundry Detergent", category: "Housekeeping", stock: 20, minStock: 10, unit: "kg" },
    { id: 127, name: "Garbage Bags", category: "Housekeeping", stock: 300, minStock: 120, unit: "pcs" },
    { id: 128, name: "Air Freshener", category: "Housekeeping", stock: 18, minStock: 10, unit: "pcs" },
    { id: 129, name: "Bedsheet Sets", category: "Linen", stock: 60, minStock: 25, unit: "pcs" },
    { id: 130, name: "Pillow Covers", category: "Linen", stock: 120, minStock: 50, unit: "pcs" },
    { id: 131, name: "Bath Towels", category: "Linen", stock: 150, minStock: 60, unit: "pcs" },
    { id: 132, name: "Hand Towels", category: "Linen", stock: 170, minStock: 60, unit: "pcs" },
    { id: 133, name: "Bath Mats", category: "Linen", stock: 45, minStock: 20, unit: "pcs" },
    { id: 134, name: "Floor Cleaner", category: "Cleaning Supplies", stock: 14, minStock: 6, unit: "L" },
    { id: 135, name: "Glass Cleaner", category: "Cleaning Supplies", stock: 3, minStock: 4, unit: "L" },
    { id: 136, name: "Disinfectant", category: "Cleaning Supplies", stock: 10, minStock: 5, unit: "L" },
    { id: 137, name: "Mop Heads", category: "Cleaning Supplies", stock: 3, minStock: 5, unit: "pcs" },
    { id: 138, name: "Rubber Gloves", category: "Cleaning Supplies", stock: 55, minStock: 25, unit: "pcs" },
    { id: 139, name: "Light Bulbs", category: "Maintenance & Office", stock: 40, minStock: 20, unit: "pcs" },
    { id: 140, name: "Batteries (AA)", category: "Maintenance & Office", stock: 65, minStock: 25, unit: "pcs" },
    { id: 141, name: "Printer Paper", category: "Maintenance & Office", stock: 7, minStock: 3, unit: "pcs" },
    { id: 142, name: "Receipt Rolls", category: "Maintenance & Office", stock: 10, minStock: 4, unit: "pcs" },
  ],
};

// Find an inventory item by its stable id, across every branch.
export function findInventoryItemById(itemId) {
  for (const [branch, items] of Object.entries(INVENTORY_BY_BRANCH)) {
    const item = items.find(i => i.id === itemId);
    if (item) return { item, branch };
  }
  return null;
}

// "Opening" stock per item, captured once the dataset is actually ready.
// Deliberately NOT computed at module-evaluation time: with a backend the
// arrays are still empty when this module first evaluates, so a top-level
// snapshot would record nothing. initInventoryDerived() is the explicit
// hook — called from main.js today, called after the first backend
// snapshot later.
let openingStockByItemId = {};

export function initInventoryDerived() {
  Object.values(INVENTORY_BY_BRANCH).forEach(items => {
    items.forEach(item => { item.costPerUnit = COST_PER_UNIT[item.name] || 0; });
  });

  openingStockByItemId = {};
  Object.values(INVENTORY_BY_BRANCH).forEach(items => {
    items.forEach(item => { openingStockByItemId[item.id] = item.stock; });
  });

  // Keep generated item ids clear of whatever the dataset already used.
  // Restocks no longer need this: their id is a UUID (see [[ids.js]]),
  // which needs no coordination and has no "max" to recover.
  const maxItemId = Math.max(0, ...Object.values(INVENTORY_BY_BRANCH).flat().map(i => i.id));
  nextInventoryId = maxItemId + 1;
}

// Reports' Inventory Usage tab used to read a frozen, hand-written
// snapshot that never matched live stock once restocks/adjustments/order
// deductions happened. This derives it live instead: stock only ever
// moves via restock (+), the +/- adjuster, or an order deduction (-), so
// opening + restocked - closing recovers "used" exactly, regardless of
// which of those caused it.
export function getInventoryUsage() {
  const rows = [];
  Object.entries(INVENTORY_BY_BRANCH).forEach(([branch, items]) => {
    items.forEach(item => {
      const opening = openingStockByItemId[item.id] ?? item.stock;
      const restocked = RESTOCK_LOG
        .filter(r => r.itemId === item.id)
        .reduce((s, r) => s + r.qty, 0);
      const closing = item.stock;
      const used = Math.max(0, Math.round((opening + restocked - closing) * 100) / 100);
      rows.push({ item: item.name, category: item.category, branch, opening, restocked, used, closing, minStock: item.minStock });
    });
  });
  return rows;
}

// Stock issued/consumed and entered by hand, rather than derived from a
// dish's recipe. This is the primary way stock goes out today: recipe-based
// deduction only fires for dishes that have an ingredient list, and almost
// none do yet. It also covers everything a recipe can never explain —
// waste, spoilage, staff meals, a bottle taken for the office.
//
// getInventoryUsage() picks these up for free, since it derives usage from
// opening + restocked − closing rather than from any one cause. The log
// exists so the manager can see *why* stock moved, not just that it did.
// A UUID, not a counter. Two devices offline would both have handed out
// the same number, and every lookup joining on it would then match two
// different records — one guest's bill quietly containing another's
// charges. See [[backend-decisions]].
export function allocateUsageId() {
  return newId();
}

export const USAGE_REASONS = ["Kitchen use", "Waste / spoilage", "Staff meal", "Other"];

export const USAGE_LOG = [];

// Restock purchase history — every logged restock (single or bulk) appends
// here with its cost, so Reports can total spend, rank costliest items,
// and show price trends. Empty until the first delivery is logged.
export function allocateRestockId() {
  return newId();
}

// itemId is the join key; itemName/category/unit are a snapshot of how the
// item looked at purchase time, so an old purchase still reads correctly
// after the item is renamed or recategorised.
export const RESTOCK_LOG = [];


// Every movement of stock, in one place.
//
// Stock has four things that move it — a restock, a recorded use, a
// manual correction, and an order reserving or returning ingredients —
// and until now only the first two wrote anything down. The other two
// changed the number silently, which meant stock could not be rebuilt
// from its own history and nobody could say who had moved it or why.
//
// There is no third log. A movement is either up or down, so it goes to
// whichever existing log runs that way: down to usage, up to restocks.
// That keeps stock derivable as opening + restocks - usage.
//
// `cost` is only ever set by an actual purchase. A correction or a
// kitchen reservation moves quantity without money changing hands, and
// counting either as spend would overstate what the kitchen cost.
export function logStockMovement({ branch, item, delta, reason, unitCost = 0, kind = "" }) {
  const moved = Math.round(delta * 100) / 100;
  if (!item || !moved) return null;

  const entry = {
    itemId: item.id,
    branch,
    itemName: item.name,
    category: item.category,
    unit: item.unit,
    qty: Math.abs(moved),
    date: todayISO(),
    by: appState.currentUser || "",
    kind,
  };

  if (moved < 0) {
    return add(COLLECTIONS.STOCK_USAGE, USAGE_LOG, {
      id: allocateUsageId(), ...entry, reason: reason || "Used",
    });
  }
  return add(COLLECTIONS.RESTOCKS, RESTOCK_LOG, {
    id: allocateRestockId(), ...entry,
    unitCost,
    totalCost: Math.round(Math.abs(moved) * unitCost * 100) / 100,
  });
}

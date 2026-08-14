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

let nextInventoryId = 100;
export function allocateInventoryItemId() {
  return nextInventoryId++;
}

// Last-known unit cost (LKR) per item name — same base price at both
// branches for simplicity. Updated automatically whenever a restock is
// logged with a different cost, so it always reflects the latest buy.
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
    { id: 1, name: "Chicken", category: "Meat", stock: 12, minStock: 5, unit: "kg" },
    { id: 2, name: "Rice", category: "Grains", stock: 40, minStock: 15, unit: "kg" },
    { id: 3, name: "Coconut", category: "Produce", stock: 3, minStock: 8, unit: "kg" },
    { id: 4, name: "Fish", category: "Seafood", stock: 6, minStock: 5, unit: "kg" },
    { id: 5, name: "Prawns", category: "Seafood", stock: 1.5, minStock: 4, unit: "kg" },
    { id: 6, name: "Vegetables", category: "Produce", stock: 18, minStock: 10, unit: "kg" },
    { id: 7, name: "Eggs", category: "Dairy & Eggs", stock: 30, minStock: 24, unit: "pcs" },
    { id: 8, name: "Rice Flour", category: "Grains", stock: 4, minStock: 5, unit: "kg" },
    { id: 9, name: "Cooking Oil", category: "Pantry", stock: 10, minStock: 6, unit: "L" },
    { id: 10, name: "Spices Mix", category: "Pantry", stock: 5, minStock: 3, unit: "kg" },
    { id: 11, name: "Onions", category: "Produce", stock: 14, minStock: 8, unit: "kg" },
    { id: 12, name: "Salt", category: "Pantry", stock: 8, minStock: 2, unit: "kg" },
    { id: 13, name: "Sugar", category: "Pantry", stock: 15, minStock: 5, unit: "kg" },
    { id: 14, name: "Tea Bags", category: "Beverages", stock: 400, minStock: 100, unit: "pcs" },
    { id: 15, name: "Coffee Powder", category: "Beverages", stock: 5, minStock: 2, unit: "kg" },
    { id: 16, name: "Milk Powder", category: "Beverages", stock: 6, minStock: 2, unit: "kg" },
    { id: 17, name: "Bottled Water", category: "Beverages", stock: 200, minStock: 80, unit: "pcs" },
    { id: 18, name: "Soft Drinks", category: "Beverages", stock: 90, minStock: 30, unit: "pcs" },
    { id: 19, name: "Soap Bars", category: "Toiletries & Amenities", stock: 220, minStock: 80, unit: "pcs" },
    { id: 20, name: "Shampoo Bottles", category: "Toiletries & Amenities", stock: 130, minStock: 50, unit: "pcs" },
    { id: 21, name: "Toothbrush Kits", category: "Toiletries & Amenities", stock: 85, minStock: 35, unit: "pcs" },
    { id: 22, name: "Shower Caps", category: "Toiletries & Amenities", stock: 100, minStock: 40, unit: "pcs" },
    { id: 23, name: "Slippers (Guest Pairs)", category: "Toiletries & Amenities", stock: 55, minStock: 25, unit: "pcs" },
    { id: 24, name: "Toilet Paper Rolls", category: "Housekeeping", stock: 260, minStock: 100, unit: "pcs" },
    { id: 25, name: "Tissue Boxes", category: "Housekeeping", stock: 95, minStock: 40, unit: "pcs" },
    { id: 26, name: "Laundry Detergent", category: "Housekeeping", stock: 20, minStock: 10, unit: "kg" },
    { id: 27, name: "Garbage Bags", category: "Housekeeping", stock: 300, minStock: 120, unit: "pcs" },
    { id: 28, name: "Air Freshener", category: "Housekeeping", stock: 18, minStock: 10, unit: "pcs" },
    { id: 29, name: "Bedsheet Sets", category: "Linen", stock: 60, minStock: 25, unit: "pcs" },
    { id: 30, name: "Pillow Covers", category: "Linen", stock: 120, minStock: 50, unit: "pcs" },
    { id: 31, name: "Bath Towels", category: "Linen", stock: 150, minStock: 60, unit: "pcs" },
    { id: 32, name: "Hand Towels", category: "Linen", stock: 170, minStock: 60, unit: "pcs" },
    { id: 33, name: "Bath Mats", category: "Linen", stock: 45, minStock: 20, unit: "pcs" },
    { id: 34, name: "Floor Cleaner", category: "Cleaning Supplies", stock: 14, minStock: 6, unit: "L" },
    { id: 35, name: "Glass Cleaner", category: "Cleaning Supplies", stock: 3, minStock: 4, unit: "L" },
    { id: 36, name: "Disinfectant", category: "Cleaning Supplies", stock: 10, minStock: 5, unit: "L" },
    { id: 37, name: "Mop Heads", category: "Cleaning Supplies", stock: 3, minStock: 5, unit: "pcs" },
    { id: 38, name: "Rubber Gloves", category: "Cleaning Supplies", stock: 55, minStock: 25, unit: "pcs" },
    { id: 39, name: "Light Bulbs", category: "Maintenance & Office", stock: 40, minStock: 20, unit: "pcs" },
    { id: 40, name: "Batteries (AA)", category: "Maintenance & Office", stock: 65, minStock: 25, unit: "pcs" },
    { id: 41, name: "Printer Paper", category: "Maintenance & Office", stock: 7, minStock: 3, unit: "pcs" },
    { id: 42, name: "Receipt Rolls", category: "Maintenance & Office", stock: 10, minStock: 4, unit: "pcs" },
  ],
};

Object.values(INVENTORY_BY_BRANCH).forEach(items => {
  items.forEach(item => { item.costPerUnit = COST_PER_UNIT[item.name] || 0; });
});

// Restock purchase history — every logged restock (single or bulk) appends
// here with its cost, so Reports can total spend, rank costliest items,
// and show price trends. Seeded with a spread of past purchases: frequent
// small buys for daily perishables (meat/seafood/produce/eggs), occasional
// large buys for monthly bulk stock (grains, linen, cleaning supplies).
let nextRestockId = 1000;
export function allocateRestockId() {
  return nextRestockId++;
}

function restock(id, branch, itemName, category, unit, qty, unitCost, date) {
  return { id, branch, itemName, category, unit, qty, unitCost, totalCost: Math.round(qty * unitCost * 100) / 100, date };
}

export const RESTOCK_LOG = [
  restock(1, "Wilpattu", "Chicken", "Meat", "kg", 15, 1150, "2026-07-15"),
  restock(2, "Wilpattu", "Chicken", "Meat", "kg", 12, 1200, "2026-07-29"),
  restock(3, "Wilpattu", "Chicken", "Meat", "kg", 15, 1260, "2026-08-10"),
  restock(4, "Wilpattu", "Fish", "Seafood", "kg", 8, 1400, "2026-07-18"),
  restock(5, "Wilpattu", "Fish", "Seafood", "kg", 8, 1550, "2026-08-05"),
  restock(6, "Wilpattu", "Prawns", "Seafood", "kg", 6, 2700, "2026-07-20"),
  restock(7, "Wilpattu", "Prawns", "Seafood", "kg", 5, 2900, "2026-08-08"),
  restock(8, "Wilpattu", "Vegetables", "Produce", "kg", 15, 170, "2026-07-22"),
  restock(9, "Wilpattu", "Vegetables", "Produce", "kg", 18, 190, "2026-08-06"),
  restock(10, "Wilpattu", "Coconut", "Produce", "kg", 5, 110, "2026-07-25"),
  restock(11, "Wilpattu", "Eggs", "Dairy & Eggs", "pcs", 60, 33, "2026-07-19"),
  restock(12, "Wilpattu", "Eggs", "Dairy & Eggs", "pcs", 60, 36, "2026-08-07"),
  restock(13, "Wilpattu", "Rice", "Grains", "kg", 30, 215, "2026-07-05"),
  restock(14, "Wilpattu", "Cooking Oil", "Pantry", "L", 12, 740, "2026-07-10"),
  restock(15, "Wilpattu", "Toilet Paper Rolls", "Housekeeping", "pcs", 120, 88, "2026-07-08"),
  restock(16, "Wilpattu", "Bath Towels", "Linen", "pcs", 40, 1180, "2026-07-01"),
  restock(17, "Wilpattu", "Disinfectant", "Cleaning Supplies", "L", 10, 550, "2026-07-12"),

  restock(18, "Arugam Bay", "Chicken", "Meat", "kg", 18, 1180, "2026-07-16"),
  restock(19, "Arugam Bay", "Chicken", "Meat", "kg", 14, 1220, "2026-07-30"),
  restock(20, "Arugam Bay", "Chicken", "Meat", "kg", 16, 1270, "2026-08-11"),
  restock(21, "Arugam Bay", "Fish", "Seafood", "kg", 10, 1420, "2026-07-19"),
  restock(22, "Arugam Bay", "Fish", "Seafood", "kg", 9, 1600, "2026-08-06"),
  restock(23, "Arugam Bay", "Prawns", "Seafood", "kg", 4, 2750, "2026-07-21"),
  restock(24, "Arugam Bay", "Prawns", "Seafood", "kg", 4, 2950, "2026-08-09"),
  restock(25, "Arugam Bay", "Vegetables", "Produce", "kg", 12, 175, "2026-07-23"),
  restock(26, "Arugam Bay", "Vegetables", "Produce", "kg", 14, 195, "2026-08-07"),
  restock(27, "Arugam Bay", "Coconut", "Produce", "kg", 6, 115, "2026-07-26"),
  restock(28, "Arugam Bay", "Eggs", "Dairy & Eggs", "pcs", 60, 34, "2026-07-20"),
  restock(29, "Arugam Bay", "Rice", "Grains", "kg", 35, 218, "2026-07-06"),
  restock(30, "Arugam Bay", "Bottled Water", "Beverages", "pcs", 150, 55, "2026-07-14"),
  restock(31, "Arugam Bay", "Soap Bars", "Toiletries & Amenities", "pcs", 100, 78, "2026-07-09"),
  restock(32, "Arugam Bay", "Bedsheet Sets", "Linen", "pcs", 25, 3400, "2026-07-02"),
];
nextRestockId = Math.max(...RESTOCK_LOG.map(r => r.id)) + 1;

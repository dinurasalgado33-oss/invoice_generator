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

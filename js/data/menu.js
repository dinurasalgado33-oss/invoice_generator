// Ingredient names must match INVENTORY_BY_BRANCH item names exactly —
// that's how a placed order finds the right stock to deduct. The menu
// itself is shared across both branches; the inventory it draws from
// isn't.
export const INGREDIENT_NAMES = ["Chicken", "Rice", "Coconut", "Fish", "Prawns", "Vegetables", "Eggs", "Rice Flour", "Cooking Oil", "Spices Mix", "Onions", "Salt"];

export const MENU_ITEMS = [
  { id: 1, name: "Chicken Curry", price: 950, ingredients: [{ item: "Chicken", qty: 0.5 }, { item: "Rice", qty: 0.2 }] },
  { id: 2, name: "Vegetable Fried Rice", price: 650, ingredients: [{ item: "Rice", qty: 0.3 }, { item: "Vegetables", qty: 0.2 }] },
  { id: 3, name: "Fish Curry", price: 1050, ingredients: [{ item: "Fish", qty: 0.4 }, { item: "Coconut", qty: 0.15 }, { item: "Rice", qty: 0.2 }] },
  { id: 4, name: "Prawn Curry", price: 1400, ingredients: [{ item: "Prawns", qty: 0.3 }, { item: "Coconut", qty: 0.15 }] },
  { id: 5, name: "Vegetable Curry", price: 550, ingredients: [{ item: "Vegetables", qty: 0.3 }, { item: "Coconut", qty: 0.1 }] },
  { id: 6, name: "Egg Hoppers (2pc)", price: 400, ingredients: [{ item: "Eggs", qty: 2 }, { item: "Rice Flour", qty: 0.15 }] },
];

let nextDishId = 7;
export function allocateDishId() {
  return nextDishId++;
}

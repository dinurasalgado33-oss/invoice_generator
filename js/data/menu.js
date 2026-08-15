// Ingredient names must match INVENTORY_BY_BRANCH item names exactly —
// that's how a placed order finds the right stock to deduct.
export const INGREDIENT_NAMES = ["Chicken", "Rice", "Coconut", "Fish", "Prawns", "Vegetables", "Eggs", "Rice Flour", "Cooking Oil", "Spices Mix", "Onions", "Salt"];

// Each branch runs its own menu — Arugam Bay is an à la carte beach-hotel
// menu, Wilpattu is its own full-board price list — so dishes are scoped
// by `branch` rather than shared across both. Category names are kept
// as each source menu phrased them (e.g. "Soup" vs "Soups", "Dessert" vs
// "Desserts") rather than force-merged, since the two branches' menus
// are otherwise unrelated.
export const MENU_CATEGORIES = [
  // Arugam Bay
  "Breakfast - Sri Lankan",
  "Breakfast - Indian",
  "Breakfast - English",
  "Soup",
  "Side Dishes",
  "Main Courses - Rice",
  "Main Courses - Kottu",
  "Main Courses - Noodles",
  "Main Courses - Pasta",
  "Main Courses - Spaghetti",
  "Main Courses - Lunch & Dinner (Rice & Curry)",
  "Seafood & Mixed Grill",
  "Vegetarian",
  "Sandwiches & Burgers - Sandwich",
  "Sandwiches & Burgers - Burger",
  "Dessert",
  "Beverages - Hot Beverages",
  "Beverages - Soft Drinks",
  "Milkshake & Juices - Milkshake",
  "Milkshake & Juices - Smoothies",
  "Milkshake & Juices - Fresh Juice",
  // Wilpattu
  "Fresh Juice",
  "Soft Drinks",
  "Hot Beverages",
  "Packages & Snack Packs",
  "Breakfast",
  "Lunch & Dinner - Main Courses",
  "Lunch & Dinner - Rice & Curry",
  "Soups",
  "Desserts",
];

// The dish "id" doubles as its order number — same number shown in Menu
// Config and in the Food Order search (search by name or by #id).
// Ingredients are intentionally left empty across the board — being filled
// in gradually as real recipe/stock data comes in.
//
// Price 0 below is a placeholder, not a real price — a handful of Arugam
// Bay items (Cheese & Creamy Pasta, all five Spaghetti variants) had no
// price listed in the source extract at all. Fix those before relying on
// Food Order to bill them.
export const MENU_ITEMS = [
  // ---- Arugam Bay Beachfront Hotel ----
  { id: 1, name: "Sri Lankan I (Milk Rice, Chicken Curry, Katta Sambol, Tea or Coffee)", category: "Breakfast - Sri Lankan", price: 1850, ingredients: [], branch: "Arugam Bay" },
  { id: 2, name: "Sri Lankan II (Roti, Katta Sambol, Chicken Curry, Dhal Curry, Tea or Coffee)", category: "Breakfast - Sri Lankan", price: 1850, ingredients: [], branch: "Arugam Bay" },
  { id: 3, name: "Indian Breakfast (Thosa x4, Red & Green Chutney, Tea or Coffee)", category: "Breakfast - Indian", price: 1850, ingredients: [], branch: "Arugam Bay" },
  { id: 4, name: "English Breakfast (Toast x2, Grilled Sausage x3, Egg, Fruit Plate, Fruit Juice)", category: "Breakfast - English", price: 1850, ingredients: [], branch: "Arugam Bay" },

  { id: 5, name: "Chicken Soup", category: "Soup", price: 990, ingredients: [], branch: "Arugam Bay" },
  { id: 6, name: "Vegetable Soup", category: "Soup", price: 990, ingredients: [], branch: "Arugam Bay" },
  { id: 7, name: "Mushroom Soup", category: "Soup", price: 990, ingredients: [], branch: "Arugam Bay" },

  { id: 8, name: "Fried Egg Omelette", category: "Side Dishes", price: 600, ingredients: [], branch: "Arugam Bay" },
  { id: 9, name: "French Fries", category: "Side Dishes", price: 1100, ingredients: [], branch: "Arugam Bay" },
  { id: 10, name: "Grilled Sausage", category: "Side Dishes", price: 1350, ingredients: [], branch: "Arugam Bay" },
  { id: 11, name: "Fried Chicken", category: "Side Dishes", price: 1400, ingredients: [], branch: "Arugam Bay" },
  { id: 12, name: "Chicken Devilled", category: "Side Dishes", price: 1450, ingredients: [], branch: "Arugam Bay" },
  { id: 13, name: "Fried Pork", category: "Side Dishes", price: 1750, ingredients: [], branch: "Arugam Bay" },
  { id: 14, name: "Pork Devilled", category: "Side Dishes", price: 1850, ingredients: [], branch: "Arugam Bay" },
  { id: 15, name: "Beef Fried", category: "Side Dishes", price: 1800, ingredients: [], branch: "Arugam Bay" },
  { id: 16, name: "Beef Devilled", category: "Side Dishes", price: 1900, ingredients: [], branch: "Arugam Bay" },

  { id: 17, name: "Vegetable Fried Rice", category: "Main Courses - Rice", price: 950, ingredients: [], branch: "Arugam Bay" },
  { id: 18, name: "Egg Fried Rice", category: "Main Courses - Rice", price: 1000, ingredients: [], branch: "Arugam Bay" },
  { id: 19, name: "Chicken Fried Rice", category: "Main Courses - Rice", price: 1150, ingredients: [], branch: "Arugam Bay" },
  { id: 20, name: "Pork Fried Rice", category: "Main Courses - Rice", price: 1400, ingredients: [], branch: "Arugam Bay" },
  { id: 21, name: "Beef Fried Rice", category: "Main Courses - Rice", price: 1400, ingredients: [], branch: "Arugam Bay" },

  { id: 22, name: "Vegetable Kottu", category: "Main Courses - Kottu", price: 950, ingredients: [], branch: "Arugam Bay" },
  { id: 23, name: "Egg Kottu", category: "Main Courses - Kottu", price: 1000, ingredients: [], branch: "Arugam Bay" },
  { id: 24, name: "Chicken Kottu", category: "Main Courses - Kottu", price: 1200, ingredients: [], branch: "Arugam Bay" },
  { id: 25, name: "Beef Kottu", category: "Main Courses - Kottu", price: 1500, ingredients: [], branch: "Arugam Bay" },
  { id: 26, name: "Pork Kottu", category: "Main Courses - Kottu", price: 1500, ingredients: [], branch: "Arugam Bay" },

  { id: 27, name: "Vegetable Noodles", category: "Main Courses - Noodles", price: 800, ingredients: [], branch: "Arugam Bay" },
  { id: 28, name: "Egg Noodles", category: "Main Courses - Noodles", price: 850, ingredients: [], branch: "Arugam Bay" },
  { id: 29, name: "Chicken Noodles", category: "Main Courses - Noodles", price: 1000, ingredients: [], branch: "Arugam Bay" },
  { id: 30, name: "Pork Noodles", category: "Main Courses - Noodles", price: 1200, ingredients: [], branch: "Arugam Bay" },
  { id: 31, name: "Beef Noodles", category: "Main Courses - Noodles", price: 1200, ingredients: [], branch: "Arugam Bay" },

  { id: 32, name: "Vegetable Pasta", category: "Main Courses - Pasta", price: 1000, ingredients: [], branch: "Arugam Bay" },
  { id: 33, name: "Egg Pasta", category: "Main Courses - Pasta", price: 1100, ingredients: [], branch: "Arugam Bay" },
  { id: 34, name: "Chicken Pasta", category: "Main Courses - Pasta", price: 1200, ingredients: [], branch: "Arugam Bay" },
  { id: 35, name: "Pork Pasta", category: "Main Courses - Pasta", price: 1400, ingredients: [], branch: "Arugam Bay" },
  { id: 36, name: "Beef Pasta", category: "Main Courses - Pasta", price: 1400, ingredients: [], branch: "Arugam Bay" },
  { id: 37, name: "Cheese & Creamy Pasta (Extra Cheese: +LKR 300)", category: "Main Courses - Pasta", price: 0, ingredients: [], branch: "Arugam Bay" },

  { id: 38, name: "Vegetable Spaghetti", category: "Main Courses - Spaghetti", price: 0, ingredients: [], branch: "Arugam Bay" },
  { id: 39, name: "Egg Spaghetti", category: "Main Courses - Spaghetti", price: 0, ingredients: [], branch: "Arugam Bay" },
  { id: 40, name: "Chicken Spaghetti", category: "Main Courses - Spaghetti", price: 0, ingredients: [], branch: "Arugam Bay" },
  { id: 41, name: "Pork Spaghetti", category: "Main Courses - Spaghetti", price: 0, ingredients: [], branch: "Arugam Bay" },
  { id: 42, name: "Beef Spaghetti", category: "Main Courses - Spaghetti", price: 0, ingredients: [], branch: "Arugam Bay" },

  { id: 43, name: "Rice & Curry (Kiri Samba, Dhal Curry, Crab/Prawn Curry, Papadum, 1 Vegetable Pot)", category: "Main Courses - Lunch & Dinner (Rice & Curry)", price: 1950, ingredients: [], branch: "Arugam Bay" },
  { id: 44, name: "Rice & Curry (3 Curries)", category: "Main Courses - Lunch & Dinner (Rice & Curry)", price: 2150, ingredients: [], branch: "Arugam Bay" },
  { id: 45, name: "Rice & Curry (4 Curries)", category: "Main Courses - Lunch & Dinner (Rice & Curry)", price: 2500, ingredients: [], branch: "Arugam Bay" },
  { id: 46, name: "Rice & Curry (5 Curries)", category: "Main Courses - Lunch & Dinner (Rice & Curry)", price: 2700, ingredients: [], branch: "Arugam Bay" },

  { id: 47, name: "Seafood Combo (Hot Butter Cuttlefish, Prawn Devilled, Crumb Fried Fish x3, Prawn Cutlets, Egg Rice, Sauces)", category: "Seafood & Mixed Grill", price: 8000, ingredients: [], branch: "Arugam Bay" },
  { id: 48, name: "Mixed Grill Seafood Combo (Lobster, Seafood Kebab x4, Jumbo Prawn x4, Crumb Fried Prawn x8, Grilled Cuttlefish x4, Sauces)", category: "Seafood & Mixed Grill", price: 8000, ingredients: [], branch: "Arugam Bay" },

  { id: 49, name: "Vegetable Chop Suey", category: "Vegetarian", price: 1300, ingredients: [], branch: "Arugam Bay" },
  { id: 50, name: "Boiled Vegetable & Mashed Potato", category: "Vegetarian", price: 1800, ingredients: [], branch: "Arugam Bay" },

  { id: 51, name: "Egg Sandwich with Fries & Ketchup", category: "Sandwiches & Burgers - Sandwich", price: 1100, ingredients: [], branch: "Arugam Bay" },
  { id: 52, name: "Chicken Sandwich", category: "Sandwiches & Burgers - Sandwich", price: 1300, ingredients: [], branch: "Arugam Bay" },
  { id: 53, name: "Tuna Sandwich", category: "Sandwiches & Burgers - Sandwich", price: 1500, ingredients: [], branch: "Arugam Bay" },

  { id: 54, name: "Chicken Burger with Fries & Ketchup", category: "Sandwiches & Burgers - Burger", price: 1800, ingredients: [], branch: "Arugam Bay" },
  { id: 55, name: "Beef Burger with Fries & Ketchup", category: "Sandwiches & Burgers - Burger", price: 1900, ingredients: [], branch: "Arugam Bay" },
  { id: 56, name: "Submarine", category: "Sandwiches & Burgers - Burger", price: 1900, ingredients: [], branch: "Arugam Bay" },

  { id: 57, name: "Chocolate Ice Cream", category: "Dessert", price: 450, ingredients: [], branch: "Arugam Bay" },
  { id: 58, name: "Vanilla Ice Cream", category: "Dessert", price: 450, ingredients: [], branch: "Arugam Bay" },
  { id: 59, name: "Fresh Yogurt (Vanilla, Honey Ice Cream & Cashew)", category: "Dessert", price: 1800, ingredients: [], branch: "Arugam Bay" },

  { id: 60, name: "Black Tea", category: "Beverages - Hot Beverages", price: 250, ingredients: [], branch: "Arugam Bay" },
  { id: 61, name: "Ginger Tea", category: "Beverages - Hot Beverages", price: 300, ingredients: [], branch: "Arugam Bay" },
  { id: 62, name: "Milk Tea", category: "Beverages - Hot Beverages", price: 350, ingredients: [], branch: "Arugam Bay" },
  { id: 63, name: "Black Coffee", category: "Beverages - Hot Beverages", price: 400, ingredients: [], branch: "Arugam Bay" },
  { id: 64, name: "Milk Coffee", category: "Beverages - Hot Beverages", price: 450, ingredients: [], branch: "Arugam Bay" },
  { id: 65, name: "Hot Chocolate", category: "Beverages - Hot Beverages", price: 550, ingredients: [], branch: "Arugam Bay" },

  { id: 66, name: "Coca-Cola", category: "Beverages - Soft Drinks", price: 250, ingredients: [], branch: "Arugam Bay" },
  { id: 67, name: "Sprite", category: "Beverages - Soft Drinks", price: 250, ingredients: [], branch: "Arugam Bay" },
  { id: 68, name: "Ginger Beer", category: "Beverages - Soft Drinks", price: 250, ingredients: [], branch: "Arugam Bay" },
  { id: 69, name: "Soda", category: "Beverages - Soft Drinks", price: 250, ingredients: [], branch: "Arugam Bay" },
  { id: 70, name: "Snack Mix Fruit", category: "Beverages - Soft Drinks", price: 250, ingredients: [], branch: "Arugam Bay" },
  { id: 71, name: "Water Bottle", category: "Beverages - Soft Drinks", price: 200, ingredients: [], branch: "Arugam Bay" },

  { id: 72, name: "Vanilla Milkshake", category: "Milkshake & Juices - Milkshake", price: 1400, ingredients: [], branch: "Arugam Bay" },
  { id: 73, name: "Strawberry Milkshake", category: "Milkshake & Juices - Milkshake", price: 1400, ingredients: [], branch: "Arugam Bay" },
  { id: 74, name: "Chocolate Milkshake", category: "Milkshake & Juices - Milkshake", price: 1400, ingredients: [], branch: "Arugam Bay" },

  { id: 75, name: "Banana Smoothie", category: "Milkshake & Juices - Smoothies", price: 1100, ingredients: [], branch: "Arugam Bay" },
  { id: 76, name: "Pineapple Smoothie", category: "Milkshake & Juices - Smoothies", price: 1100, ingredients: [], branch: "Arugam Bay" },
  { id: 77, name: "Mango Smoothie", category: "Milkshake & Juices - Smoothies", price: 1100, ingredients: [], branch: "Arugam Bay" },

  { id: 78, name: "Papaya Juice", category: "Milkshake & Juices - Fresh Juice", price: 880, ingredients: [], branch: "Arugam Bay" },
  { id: 79, name: "Banana Juice", category: "Milkshake & Juices - Fresh Juice", price: 880, ingredients: [], branch: "Arugam Bay" },
  { id: 80, name: "Pineapple Juice", category: "Milkshake & Juices - Fresh Juice", price: 880, ingredients: [], branch: "Arugam Bay" },
  { id: 81, name: "Watermelon Juice", category: "Milkshake & Juices - Fresh Juice", price: 880, ingredients: [], branch: "Arugam Bay" },
  { id: 82, name: "Lemon Juice", category: "Milkshake & Juices - Fresh Juice", price: 880, ingredients: [], branch: "Arugam Bay" },
  { id: 83, name: "Mango Juice", category: "Milkshake & Juices - Fresh Juice", price: 880, ingredients: [], branch: "Arugam Bay" },

  // ---- Leopard Inn Wilpattu (updated 2026-07-01 price list) ----
  { id: 84, name: "Papaya Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 85, name: "Orange Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 86, name: "Banana Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 87, name: "Pineapple Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 88, name: "King Coconut", category: "Fresh Juice", price: 980, ingredients: [], branch: "Wilpattu" },
  { id: 89, name: "Watermelon Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 90, name: "Apple Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 91, name: "Lemon Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },
  { id: 92, name: "Mango Juice", category: "Fresh Juice", price: 880, ingredients: [], branch: "Wilpattu" },

  { id: 93, name: "Coca-Cola", category: "Soft Drinks", price: 250, ingredients: [], branch: "Wilpattu" },
  { id: 94, name: "Sprite", category: "Soft Drinks", price: 250, ingredients: [], branch: "Wilpattu" },
  { id: 95, name: "Ginger Beer", category: "Soft Drinks", price: 250, ingredients: [], branch: "Wilpattu" },
  { id: 96, name: "Bottled Smack Mixed Fruit", category: "Soft Drinks", price: 250, ingredients: [], branch: "Wilpattu" },
  { id: 97, name: "Soda", category: "Soft Drinks", price: 250, ingredients: [], branch: "Wilpattu" },
  { id: 98, name: "Water Bottle", category: "Soft Drinks", price: 200, ingredients: [], branch: "Wilpattu" },

  { id: 99, name: "Black Coffee", category: "Hot Beverages", price: 400, ingredients: [], branch: "Wilpattu" },
  { id: 100, name: "Milk Coffee", category: "Hot Beverages", price: 450, ingredients: [], branch: "Wilpattu" },
  { id: 101, name: "Black Tea", category: "Hot Beverages", price: 250, ingredients: [], branch: "Wilpattu" },
  { id: 102, name: "Milk Tea", category: "Hot Beverages", price: 350, ingredients: [], branch: "Wilpattu" },
  { id: 103, name: "Ginger Tea", category: "Hot Beverages", price: 300, ingredients: [], branch: "Wilpattu" },
  { id: 104, name: "Hot Chocolate", category: "Hot Beverages", price: 500, ingredients: [], branch: "Wilpattu" },

  { id: 105, name: "Leopard Inn Tea/Coffee Package (Tea/Coffee, Sponge Cake, Chinese Roll)", category: "Packages & Snack Packs", price: 650, ingredients: [], branch: "Wilpattu" },
  { id: 106, name: "Safari Tea Pack (Tea/Coffee x2, Sponge Cake x2, Chinese Roll x2, Water Bottle 500ml)", category: "Packages & Snack Packs", price: 1300, ingredients: [], branch: "Wilpattu" },
  { id: 107, name: "Safari/Boat Ride Snack Pack (Sponge Cake x2, Nick Nack Chocolate x2, Gold Mari/Hawaiian Cookies x2, Mix Fruit Juice 200ml x2, Water Bottle 500ml, Malibun Chickbits 80g)", category: "Packages & Snack Packs", price: 1500, ingredients: [], branch: "Wilpattu" },

  { id: 108, name: "English Breakfast (Toast Bread, 3 Grilled Sausages, Egg, Juice, Fruit Plate)", category: "Breakfast", price: 1850, ingredients: [], branch: "Wilpattu" },
  { id: 109, name: "Sri Lankan Breakfast Option 1 (10 String Hoppers, Chicken Curry, Dhal Curry, Pol Sambol, Tea/Coffee)", category: "Breakfast", price: 1750, ingredients: [], branch: "Wilpattu" },
  { id: 110, name: "Sri Lankan Breakfast Option 2 (4 Rotti, Katta/Pol Sambol, Chicken Curry, Dhal Curry, Tea/Coffee)", category: "Breakfast", price: 1750, ingredients: [], branch: "Wilpattu" },
  { id: 111, name: "Sri Lankan Breakfast Option 3 (Mung Bean, Scraped Coconut, Katta Sambol, Sugar, Tea/Coffee)", category: "Breakfast", price: 1750, ingredients: [], branch: "Wilpattu" },
  { id: 112, name: "Indian Breakfast (Chapathi x4, Chicken Curry, Potato, Masala Tea/Coffee)", category: "Breakfast", price: 1750, ingredients: [], branch: "Wilpattu" },

  { id: 113, name: "Egg Fried Rice", category: "Lunch & Dinner - Main Courses", price: 950, ingredients: [], branch: "Wilpattu" },
  { id: 114, name: "Chicken Fried Rice", category: "Lunch & Dinner - Main Courses", price: 1050, ingredients: [], branch: "Wilpattu" },
  { id: 115, name: "Vegetable Fried Rice", category: "Lunch & Dinner - Main Courses", price: 900, ingredients: [], branch: "Wilpattu" },
  { id: 116, name: "Pork Fried Rice", category: "Lunch & Dinner - Main Courses", price: 1300, ingredients: [], branch: "Wilpattu" },
  { id: 117, name: "Beef Fried Rice", category: "Lunch & Dinner - Main Courses", price: 1400, ingredients: [], branch: "Wilpattu" },
  { id: 118, name: "Chopsuey Rice", category: "Lunch & Dinner - Main Courses", price: 1400, ingredients: [], branch: "Wilpattu" },
  { id: 119, name: "Boiled Vegetables", category: "Lunch & Dinner - Main Courses", price: 1100, ingredients: [], branch: "Wilpattu" },
  { id: 120, name: "Vegetable Chopsuey", category: "Lunch & Dinner - Main Courses", price: 1000, ingredients: [], branch: "Wilpattu" },
  { id: 121, name: "Vegetable Pasta", category: "Lunch & Dinner - Main Courses", price: 1000, ingredients: [], branch: "Wilpattu" },
  { id: 122, name: "Egg Pasta", category: "Lunch & Dinner - Main Courses", price: 1100, ingredients: [], branch: "Wilpattu" },
  { id: 123, name: "Chicken Pasta", category: "Lunch & Dinner - Main Courses", price: 1200, ingredients: [], branch: "Wilpattu" },
  { id: 124, name: "Spaghetti", category: "Lunch & Dinner - Main Courses", price: 1050, ingredients: [], branch: "Wilpattu" },
  { id: 125, name: "Vegetable Kottu", category: "Lunch & Dinner - Main Courses", price: 900, ingredients: [], branch: "Wilpattu" },
  { id: 126, name: "Egg Kottu", category: "Lunch & Dinner - Main Courses", price: 1000, ingredients: [], branch: "Wilpattu" },
  { id: 127, name: "Chicken Kottu", category: "Lunch & Dinner - Main Courses", price: 1200, ingredients: [], branch: "Wilpattu" },
  { id: 128, name: "Vegetable Noodles", category: "Lunch & Dinner - Main Courses", price: 750, ingredients: [], branch: "Wilpattu" },
  { id: 129, name: "Egg Noodles", category: "Lunch & Dinner - Main Courses", price: 850, ingredients: [], branch: "Wilpattu" },
  { id: 130, name: "Chicken Noodles", category: "Lunch & Dinner - Main Courses", price: 990, ingredients: [], branch: "Wilpattu" },

  { id: 131, name: "Rice & Curry Option 1 (Kiri Samba, Dhal Curry, 1 Vegetable Pot, Papadam, Meat)", category: "Lunch & Dinner - Rice & Curry", price: 1950, ingredients: [], branch: "Wilpattu" },
  { id: 132, name: "Rice & Curry Option 2 (Kiri Samba, Curry Dhal, Pol Sambol, 2 Vegetable Pots, Papadam, Meat)", category: "Lunch & Dinner - Rice & Curry", price: 2150, ingredients: [], branch: "Wilpattu" },
  { id: 133, name: "Rice & Curry Option 3 (Kiri Samba, Cashew Curry, Dhal Curry, Pol Sambol, 2 Vegetable Pots, Papadam, Meat)", category: "Lunch & Dinner - Rice & Curry", price: 2500, ingredients: [], branch: "Wilpattu" },

  { id: 134, name: "Chicken Devel", category: "Side Dishes", price: 1450, ingredients: [], branch: "Wilpattu" },
  { id: 135, name: "Fried Chicken", category: "Side Dishes", price: 1400, ingredients: [], branch: "Wilpattu" },
  { id: 136, name: "Pork Devel", category: "Side Dishes", price: 1850, ingredients: [], branch: "Wilpattu" },
  { id: 137, name: "Fried Pork", category: "Side Dishes", price: 1750, ingredients: [], branch: "Wilpattu" },
  { id: 138, name: "Beef Devel", category: "Side Dishes", price: 1900, ingredients: [], branch: "Wilpattu" },
  { id: 139, name: "Fried Beef", category: "Side Dishes", price: 1800, ingredients: [], branch: "Wilpattu" },
  { id: 140, name: "Grilled Sausages", category: "Side Dishes", price: 1350, ingredients: [], branch: "Wilpattu" },
  { id: 141, name: "Egg Omelette (3 Eggs)", category: "Side Dishes", price: 600, ingredients: [], branch: "Wilpattu" },
  { id: 142, name: "French Fries", category: "Side Dishes", price: 1100, ingredients: [], branch: "Wilpattu" },
  { id: 143, name: "Egg Sandwich", category: "Side Dishes", price: 600, ingredients: [], branch: "Wilpattu" },

  { id: 144, name: "Chicken Soup", category: "Soups", price: 990, ingredients: [], branch: "Wilpattu" },
  { id: 145, name: "Vegetable Soup", category: "Soups", price: 990, ingredients: [], branch: "Wilpattu" },
  { id: 146, name: "Mushroom Soup", category: "Soups", price: 990, ingredients: [], branch: "Wilpattu" },

  { id: 147, name: "Chocolate Ice-Cream (3 Scoops)", category: "Desserts", price: 450, ingredients: [], branch: "Wilpattu" },
  { id: 148, name: "Vanilla Ice-Cream (3 Scoops)", category: "Desserts", price: 450, ingredients: [], branch: "Wilpattu" },
  { id: 149, name: "Watalappam", category: "Desserts", price: 450, ingredients: [], branch: "Wilpattu" },
  { id: 150, name: "Fresh Sri Lankan Curd", category: "Desserts", price: 450, ingredients: [], branch: "Wilpattu" },
  { id: 151, name: "Fresh Yogurt", category: "Desserts", price: 250, ingredients: [], branch: "Wilpattu" },
];

let nextDishId = 152;
export function allocateDishId() {
  return nextDishId++;
}

// A dish's `ingredients` are `{ itemId, qty }` — itemId points at an
// INVENTORY_BY_BRANCH item's stable id, so a recipe keeps working after
// the stock item is renamed, and can only reference stock that exists at
// that dish's own branch. (This used to match on item *name*, which broke
// silently the moment anything was renamed.)

// Each branch runs its own menu — Arugam Bay is an à la carte beach-hotel
// menu, Wilpattu is its own price list — so dishes are scoped by `branch`
// rather than shared across both. Category names are kept as each source
// menu phrases them (e.g. "Soup" vs "Soups") rather than force-merged,
// since the two branches' menus are otherwise unrelated.

// `description` is the line the printed menus set in small italics under a
// dish name — "· Milk Rice · Chicken Curry · Katta Sambol". It is held
// apart from `name` because the printed menu sets the two differently, and
// because a bill wants the name alone: "Sri Lankan I", not the whole
// contents list. Empty for most dishes, which print as a single line.

// Transcribed from the hotel's own menus (Arugam Bay main + cocktail,
// Wilpattu "2026-07-01 updated menu"). Where a printed menu contradicted
// itself the corrected reading is used and noted; those are the only
// departures from the paper.

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
  "Cocktails",
  "Mocktails",
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

const AB = "Arugam Bay";
const WP = "Wilpattu";

// id is the internal key; number is what the printed menu and the staff
// screens show, counted per branch.
function dish(id, number, name, category, price, branch, description = "") {
  return { id, number, name, category, price, description, ingredients: [], branch };
}

export const MENU_ITEMS = [
  // ================= Arugam Bay Beachfront Hotel =================
  // "All prices are in Sri Lankan Rupees (LKR)"
  // "Our seafood is sourced fresh on the day — kindly place seafood
  //  orders at least 4 hours in advance."

  // ---- Breakfast ----
  dish(1, 1, "Sri Lankan I", "Breakfast - Sri Lankan", 1850, AB,
    "Milk Rice · Chicken Curry · Katta Sambol · Tea or Coffee"),
  dish(2, 2, "Sri Lankan II", "Breakfast - Sri Lankan", 1850, AB,
    "Roti · Katta Sambol · Chicken Curry · Dhal Curry · Tea or Coffee"),
  dish(3, 3, "Indian Breakfast", "Breakfast - Indian", 1850, AB,
    "Thosa (04) · Red & Green Chutney · Tea or Coffee"),
  dish(4, 4, "English Breakfast", "Breakfast - English", 1850, AB,
    "Toast Bread (02) · Grilled Sausage (03) · Egg (01) – Omelette, Scrambled, Boiled or Poached · Fruit Plate · Fruit Juice"),

  // ---- Soup ----
  dish(5, 5, "Chicken Soup", "Soup", 990, AB),
  dish(6, 6, "Vegetable Soup", "Soup", 990, AB),
  dish(7, 7, "Mushroom Soup", "Soup", 990, AB),

  // ---- Side Dishes ----
  dish(8, 8, "Fried Egg Omelette", "Side Dishes", 600, AB),
  dish(9, 9, "French Fries", "Side Dishes", 1100, AB),
  dish(10, 10, "Grilled Sausage", "Side Dishes", 1350, AB),
  dish(11, 11, "Fried Chicken", "Side Dishes", 1400, AB),
  dish(12, 12, "Chicken Devilled", "Side Dishes", 1450, AB),
  dish(13, 13, "Fried Pork", "Side Dishes", 1750, AB),
  dish(14, 14, "Pork Devilled", "Side Dishes", 1850, AB),
  dish(15, 15, "Beef Fried", "Side Dishes", 1800, AB),
  dish(16, 16, "Beef Devilled", "Side Dishes", 1900, AB),

  // ---- Main Courses (per person) ----
  dish(17, 17, "Vegetable Fried Rice", "Main Courses - Rice", 950, AB),
  dish(18, 18, "Egg Fried Rice", "Main Courses - Rice", 1000, AB),
  dish(19, 19, "Chicken Fried Rice", "Main Courses - Rice", 1150, AB),
  dish(20, 20, "Pork Fried Rice", "Main Courses - Rice", 1400, AB),
  dish(21, 21, "Beef Fried Rice", "Main Courses - Rice", 1400, AB),

  dish(22, 22, "Vegetable Kottu", "Main Courses - Kottu", 950, AB),
  dish(23, 23, "Egg Kottu", "Main Courses - Kottu", 1000, AB),
  // Settles the 1,200 / 1,500 disagreement in the old spreadsheet: the
  // printed menu prices Chicken Kottu at 1,200, with Beef and Pork at 1,500.
  dish(24, 24, "Chicken Kottu", "Main Courses - Kottu", 1200, AB),
  dish(25, 25, "Beef Kottu", "Main Courses - Kottu", 1500, AB),
  dish(26, 26, "Pork Kottu", "Main Courses - Kottu", 1500, AB),

  dish(27, 27, "Vegetable Noodles", "Main Courses - Noodles", 800, AB),
  dish(28, 28, "Egg Noodles", "Main Courses - Noodles", 850, AB),
  dish(29, 29, "Chicken Noodles", "Main Courses - Noodles", 1000, AB),
  dish(30, 30, "Pork Noodles", "Main Courses - Noodles", 1200, AB),
  dish(31, 31, "Beef Noodles", "Main Courses - Noodles", 1200, AB),

  dish(32, 32, "Vegetable Pasta", "Main Courses - Pasta", 1000, AB),
  dish(33, 33, "Egg Pasta", "Main Courses - Pasta", 1100, AB),
  dish(34, 34, "Chicken Pasta", "Main Courses - Pasta", 1200, AB),
  dish(35, 35, "Pork Pasta", "Main Courses - Pasta", 1400, AB),
  dish(36, 36, "Beef Pasta", "Main Courses - Pasta", 1400, AB),
  // The printed menu prints "XXX" against this one — still genuinely
  // unpriced, so it stays at 0 and the app refuses to put it on a bill.
  dish(37, 37, "Cheese & Creamy Pasta", "Main Courses - Pasta", 0, AB,
    "extra cheese +300"),

  dish(38, 38, "Vegetable Spaghetti", "Main Courses - Spaghetti", 1100, AB),
  dish(39, 39, "Egg Spaghetti", "Main Courses - Spaghetti", 1200, AB),
  dish(40, 40, "Chicken Spaghetti", "Main Courses - Spaghetti", 1300, AB),
  dish(41, 41, "Pork Spaghetti", "Main Courses - Spaghetti", 1500, AB),
  dish(42, 42, "Beef Spaghetti", "Main Courses - Spaghetti", 1500, AB),

  // The printed menu garbles these four: it lists "3 Curries / 4 Curries /
  // 5 Curries" under each of the last three and reuses number 45 twice.
  // The prices are unambiguous, so each is given its own curry count.
  dish(43, 43, "Rice & Curry", "Main Courses - Lunch & Dinner (Rice & Curry)", 1950, AB,
    "Kiri Samba · Dhal Curry · One Vegetable Pot · Crab / Prawn Curry · Papadum — includes Prawn Curry (08) and Crab Curry (01)"),
  dish(44, 44, "Rice & Curry — 3 Curries", "Main Courses - Lunch & Dinner (Rice & Curry)", 2150, AB,
    "Kiri Samba · Dhal Curry · Crab / Prawn Curry · Papadum — includes Prawn Curry (08) and Crab Curry (01)"),
  dish(45, 45, "Rice & Curry — 4 Curries", "Main Courses - Lunch & Dinner (Rice & Curry)", 2500, AB,
    "Kiri Samba · Dhal Curry · Crab / Prawn Curry · Papadum — includes Prawn Curry (08) and Crab Curry (01)"),
  dish(46, 46, "Rice & Curry — 5 Curries", "Main Courses - Lunch & Dinner (Rice & Curry)", 2700, AB,
    "Kiri Samba · Dhal Curry · Crab / Prawn Curry · Papadum — includes Prawn Curry (08) and Crab Curry (01)"),

  // Printed as 44 and 45, colliding with the Rice & Curry numbers above.
  // Renumbered so no two dishes on one menu share a number.
  dish(47, 47, "Seafood Combo", "Seafood & Mixed Grill", 8000, AB,
    "Hot Butter Cuttlefish · Prawn Devilled · Bread Crumb Fried Fish Slice (03) · Prawn Cutlets · Egg Rice · Ketchup & Chilli Paste"),
  dish(48, 48, "Mixed Grill Seafood Combo", "Seafood & Mixed Grill", 8000, AB,
    "Lobster (01) · Seafood Kebab (04) · Jumbo Prawn (04) · Crumb Fried Prawn (08) · Grilled Cuttlefish (04) · Butter Sauce, Tomato Sauce & Lemon Slice"),

  dish(49, 49, "Vegetable Chop Suey", "Vegetarian", 1300, AB),
  dish(50, 50, "Boiled Vegetable & Mashed Potato", "Vegetarian", 1800, AB),

  // ---- Sandwiches & Burgers ----
  dish(51, 51, "Egg Sandwich with Fries & Ketchup", "Sandwiches & Burgers - Sandwich", 1100, AB),
  dish(52, 52, "Chicken Sandwich", "Sandwiches & Burgers - Sandwich", 1300, AB),
  dish(53, 53, "Tuna Sandwich", "Sandwiches & Burgers - Sandwich", 1500, AB),
  dish(54, 54, "Chicken Burger with Fries & Ketchup", "Sandwiches & Burgers - Burger", 1800, AB),
  dish(55, 55, "Beef Burger with Fries & Ketchup", "Sandwiches & Burgers - Burger", 1900, AB),
  dish(56, 56, "Submarine", "Sandwiches & Burgers - Burger", 1900, AB),

  // ---- Dessert ----
  dish(57, 57, "Chocolate Ice Cream", "Dessert", 450, AB),
  dish(58, 58, "Vanilla Ice Cream", "Dessert", 450, AB),
  dish(59, 59, "Fresh Yogurt", "Dessert", 1800, AB,
    "Special Vanilla, Honey Ice Cream & Cashew"),

  // ---- Beverages ----
  dish(60, 60, "Black Tea", "Beverages - Hot Beverages", 250, AB),
  dish(61, 61, "Ginger Tea", "Beverages - Hot Beverages", 300, AB),
  dish(62, 62, "Milk Tea", "Beverages - Hot Beverages", 350, AB),
  dish(63, 63, "Black Coffee", "Beverages - Hot Beverages", 400, AB),
  dish(64, 64, "Milk Coffee", "Beverages - Hot Beverages", 450, AB),
  dish(65, 65, "Hot Chocolate", "Beverages - Hot Beverages", 550, AB),

  dish(66, 66, "Coca-Cola", "Beverages - Soft Drinks", 250, AB),
  dish(67, 67, "Sprite", "Beverages - Soft Drinks", 250, AB),
  dish(68, 68, "Ginger Beer", "Beverages - Soft Drinks", 250, AB),
  dish(69, 69, "Soda", "Beverages - Soft Drinks", 250, AB),
  dish(70, 70, "Snack Mix Fruit", "Beverages - Soft Drinks", 250, AB),
  dish(71, 71, "Water Bottle", "Beverages - Soft Drinks", 200, AB),

  dish(72, 72, "Vanilla Milkshake", "Milkshake & Juices - Milkshake", 1100, AB),
  dish(73, 73, "Strawberry Milkshake", "Milkshake & Juices - Milkshake", 1100, AB),
  dish(74, 74, "Chocolate Milkshake", "Milkshake & Juices - Milkshake", 1100, AB),

  dish(75, 75, "Banana Smoothie", "Milkshake & Juices - Smoothies", 1400, AB),
  dish(76, 76, "Pineapple Smoothie", "Milkshake & Juices - Smoothies", 1400, AB),
  dish(77, 77, "Mango Smoothie", "Milkshake & Juices - Smoothies", 1400, AB),

  dish(78, 78, "Papaya Juice", "Milkshake & Juices - Fresh Juice", 880, AB),
  dish(79, 79, "Banana Juice", "Milkshake & Juices - Fresh Juice", 880, AB),
  dish(80, 80, "Pineapple Juice", "Milkshake & Juices - Fresh Juice", 880, AB),
  dish(81, 81, "Watermelon Juice", "Milkshake & Juices - Fresh Juice", 880, AB),
  dish(82, 82, "Lemon Juice", "Milkshake & Juices - Fresh Juice", 880, AB),
  dish(83, 83, "Mango Juice", "Milkshake & Juices - Fresh Juice", 880, AB),

  // ---- Cocktail menu (its own printed booklet, numbered 1-8 there) ----
  // These existed only on paper: staff had no way to ring up a single
  // drink from this menu.
  dish(84, 84, "Tropical Moon", "Cocktails", 850, AB,
    "Red Rum · Pineapple Juice · Passion fruit Juice"),
  dish(85, 85, "Screwdriver", "Cocktails", 950, AB,
    "Vodka · Orange Juice"),
  dish(86, 86, "Cuba Libra", "Cocktails", 1200, AB,
    "Red Rum · Fresh Lime · Top with Coke"),
  dish(87, 87, "Mojito", "Cocktails", 1200, AB,
    "Red Rum · Fresh Lime · Mint Leaves · Top with Sprite"),
  dish(88, 88, "Salt SaDi Cocktail", "Cocktails", 1400, AB,
    "Beer · Sprite · Fresh Lime · Ice Cube"),
  dish(89, 89, "Sugar SaDi Cocktail", "Cocktails", 1400, AB,
    "Beer · Sprite · Fresh Lime · Ice Cube"),
  dish(90, 90, "Chilli SaDi Cocktail", "Cocktails", 1400, AB,
    "Beer · Sprite · Fresh Lime · Ice Cube"),
  dish(91, 91, "Leopard Inn Special (Cocktail)", "Cocktails", 1500, AB,
    "Vodka · Fresh Lime · Top with Sprite"),

  // The printed menu gives the cocktail and the mocktail the same name.
  // Kept apart here, or a staff member searching "Leopard Inn Special"
  // has no way to tell which drink they are ringing up.
  dish(92, 92, "Leopard Inn Special (Mocktail)", "Mocktails", 1500, AB,
    "Fresh Lime · Sugar Syrup · Top with Sprite"),
  dish(93, 93, "Virgin Pina Colada", "Mocktails", 1500, AB,
    "Pineapple Juice · Coconut Milk"),

  // ===================== Wilpattu Forest Retreat =====================
  // From the "2026-07-01 updated menu", numbered 1-68 there.

  // ---- Cold Beverages ----
  dish(101, 1, "Papaya Juice", "Fresh Juice", 880, WP),
  dish(102, 2, "Orange Juice", "Fresh Juice", 880, WP),
  dish(103, 3, "Banana Juice", "Fresh Juice", 880, WP),
  dish(104, 4, "Pineapple Juice", "Fresh Juice", 880, WP),
  dish(105, 5, "King Coconut", "Fresh Juice", 980, WP),
  dish(106, 6, "Watermelon Juice", "Fresh Juice", 880, WP),
  dish(107, 7, "Apple Juice", "Fresh Juice", 880, WP),
  dish(108, 8, "Lemon Juice", "Fresh Juice", 880, WP),
  dish(109, 9, "Mango Juice", "Fresh Juice", 880, WP),

  dish(110, 10, "Coca-Cola", "Soft Drinks", 250, WP),
  dish(111, 11, "Sprite", "Soft Drinks", 250, WP),
  dish(112, 12, "Ginger Beer", "Soft Drinks", 250, WP),
  dish(113, 13, "Bottled Snack Mixed Fruit", "Soft Drinks", 250, WP),
  dish(114, 14, "Soda", "Soft Drinks", 250, WP),
  dish(115, 15, "Water Bottle", "Soft Drinks", 200, WP),

  // ---- Hot Beverages ----
  dish(116, 16, "Black Coffee", "Hot Beverages", 400, WP),
  dish(117, 17, "Milk Coffee", "Hot Beverages", 450, WP),
  dish(118, 18, "Black Tea", "Hot Beverages", 250, WP),
  dish(119, 19, "Milk Tea", "Hot Beverages", 350, WP),
  dish(120, 20, "Ginger Tea", "Hot Beverages", 300, WP),
  dish(121, 21, "Hot Chocolate", "Hot Beverages", 500, WP),

  // ---- Packages & Snack Packs ----
  dish(122, 22, "Leopard Inn Tea/Coffee Package", "Packages & Snack Packs", 650, WP,
    "Tea/Coffee ×1 · Sponge Cake ×1 · Chinese Roll ×1"),
  dish(123, 23, "Safari / Boat Rides Snack Pack", "Packages & Snack Packs", 1500, WP,
    "Sponge Cake ×2 · Nick Nack Chocolate ×2 · Gold Mari / Hawaiian Cookies ×2 · Mix Fruit Juice 200ml ×2 · Water Bottle 500ml ×1 · Malibun Chickbits 80g ×1"),
  dish(124, 24, "Safari Tea Pack", "Packages & Snack Packs", 1300, WP,
    "Tea/Coffee ×2 · Sponge Cake ×2 · Chinese Roll ×2 · Water Bottle 500ml ×1"),

  // ---- Breakfast (per person) ----
  dish(125, 25, "English Breakfast", "Breakfast", 1850, WP,
    "Toast Bread · 3 Grilled Sausages · Egg (Boiled, Scrambled or Omelette) · Juice · Fruit Plate"),
  dish(126, 26, "Sri Lankan Breakfast — String Hoppers", "Breakfast", 1750, WP,
    "10 String Hoppers · Chicken Curry · Dhal Curry · Pol Sambol · Tea/Coffee"),
  dish(127, 27, "Sri Lankan Breakfast — Rotti", "Breakfast", 1750, WP,
    "4 Rotti Pieces · Katta/Pol Sambol · Chicken Curry · Dhal Curry · Tea/Coffee"),
  dish(128, 28, "Sri Lankan Breakfast — Mung Bean", "Breakfast", 1750, WP,
    "Mung Bean · Scraped Coconut · Katta Sambol · Sugar · Tea/Coffee"),
  dish(129, 29, "Indian Breakfast", "Breakfast", 1750, WP,
    "Chapathi 04 · Chicken Curry · Potato · Masala Tea/Coffee"),

  // ---- Lunch & Dinner, Main Courses (per person) ----
  dish(130, 30, "Egg Fried Rice", "Lunch & Dinner - Main Courses", 950, WP),
  dish(131, 31, "Chicken Fried Rice", "Lunch & Dinner - Main Courses", 1050, WP),
  dish(132, 32, "Vegetable Fried Rice", "Lunch & Dinner - Main Courses", 900, WP),
  dish(133, 33, "Pork Fried Rice", "Lunch & Dinner - Main Courses", 1300, WP),
  dish(134, 34, "Beef Fried Rice", "Lunch & Dinner - Main Courses", 1400, WP),
  dish(135, 35, "Chopsuey Rice", "Lunch & Dinner - Main Courses", 1400, WP),
  dish(136, 36, "Boiled Vegetables", "Lunch & Dinner - Main Courses", 1100, WP),
  dish(137, 37, "Vegetable Chopsuey", "Lunch & Dinner - Main Courses", 1000, WP),
  dish(138, 38, "Vegetable Pasta", "Lunch & Dinner - Main Courses", 1000, WP),
  dish(139, 39, "Egg Pasta", "Lunch & Dinner - Main Courses", 1100, WP),
  dish(140, 40, "Chicken Pasta", "Lunch & Dinner - Main Courses", 1200, WP),
  dish(141, 41, "Spaghetti", "Lunch & Dinner - Main Courses", 1050, WP),
  dish(142, 42, "Vegetable Kottu", "Lunch & Dinner - Main Courses", 900, WP),
  dish(143, 43, "Egg Kottu", "Lunch & Dinner - Main Courses", 1000, WP),
  dish(144, 44, "Chicken Kottu", "Lunch & Dinner - Main Courses", 1200, WP),
  dish(145, 45, "Vegetable Noodles", "Lunch & Dinner - Main Courses", 750, WP),
  dish(146, 46, "Egg Noodles", "Lunch & Dinner - Main Courses", 850, WP),
  dish(147, 47, "Chicken Noodles", "Lunch & Dinner - Main Courses", 990, WP),

  // ---- Rice & Curry (per person) ----
  // Portion sizes printed alongside: beef 100g, pork 150g, chicken 150g.
  dish(148, 48, "Rice & Curry — One Vegetable Pot", "Lunch & Dinner - Rice & Curry", 1950, WP,
    "Kiri Samba · Dhal Curry · One Vegetable Pot · Papadam · Meat (Beef/Pork/Chicken)"),
  dish(149, 49, "Rice & Curry — Two Vegetable Pots", "Lunch & Dinner - Rice & Curry", 2150, WP,
    "Kiri Samba · Dhal Curry · Pol Sambol · Two Vegetable Pots · Papadam · Meat (Beef/Pork/Chicken)"),
  dish(150, 50, "Rice & Curry — Cashew", "Lunch & Dinner - Rice & Curry", 2500, WP,
    "Kiri Samba · Cashew Curry · Dhal Curry · Pol Sambol · Two Vegetable Pots · Papadam · Meat (Beef/Pork/Chicken)"),

  // ---- Side Dishes ---- (meat portion 300g)
  dish(151, 51, "Chicken Devel", "Side Dishes", 1450, WP),
  dish(152, 52, "Fried Chicken", "Side Dishes", 1400, WP),
  dish(153, 53, "Pork Devel", "Side Dishes", 1850, WP),
  dish(154, 54, "Fried Pork", "Side Dishes", 1750, WP),
  dish(155, 55, "Beef Devel", "Side Dishes", 1900, WP),
  dish(156, 56, "Fried Beef", "Side Dishes", 1800, WP),
  dish(157, 57, "Grilled Sausages", "Side Dishes", 1350, WP),
  dish(158, 58, "Egg Omelette (3 Eggs)", "Side Dishes", 600, WP),
  dish(159, 59, "French Fries", "Side Dishes", 1100, WP),
  dish(160, 60, "Egg Sandwich", "Side Dishes", 600, WP),

  // ---- Soups ----
  dish(161, 61, "Chicken Soup", "Soups", 990, WP),
  dish(162, 62, "Vegetable Soup", "Soups", 990, WP),
  dish(163, 63, "Mushroom Soup", "Soups", 990, WP),

  // ---- Desserts ----
  dish(164, 64, "Chocolate Ice Cream (3 Scoops)", "Desserts", 450, WP),
  dish(165, 65, "Vanilla Ice Cream (3 Scoops)", "Desserts", 450, WP),
  dish(166, 66, "Watalappam", "Desserts", 450, WP),
  dish(167, 67, "Fresh Sri Lankan Curd", "Desserts", 450, WP),
  dish(168, 68, "Fresh Yogurt", "Desserts", 250, WP),
];

// Derived from the data rather than hardcoded — a literal here silently
// starts handing out ids that already exist the moment a dish is appended
// above (which is exactly what adding #69-75 would have done).
let nextDishId = Math.max(0, ...MENU_ITEMS.map(d => d.id)) + 1;
export function allocateDishId() {
  return nextDishId++;
}

// `id` is a globally unique internal key (order line items, edit/delete
// lookups). `number` is what staff actually see ("#1 Chicken Curry") and
// is independent per branch — each branch's menu numbers its own dishes
// starting at 1, so Arugam Bay's #1 and Wilpattu's #1 are different
// dishes, not a collision.
export function allocateDishNumber(branch) {
  const highest = MENU_ITEMS.filter(d => d.branch === branch).reduce((max, d) => Math.max(max, d.number), 0);
  return highest + 1;
}

// The Wilpattu full/half-board sheet: what a board rate actually
// includes. No dish numbers and no prices, so it is not driven by
// MENU_ITEMS — a guest on half board is not ordering from it, they are
// checking what they have already paid for.
//
// Lives here rather than in menu-pdf.js because it is data, and because
// three things now read it: the printed sheet, the board-menu editor,
// and the welcome e-mail. Spliced in place on hydration, never
// reassigned, so those readers keep the reference they took at import.
export const BOARD_MENU = [
  {
    heading: "Breakfast",
    note: "one option included",
    options: [
      { name: "Western", detail: "Toast bread · 3 grilled sausages · egg (boiled, scrambled or omelette) · juice · fruit plate" },
      { name: "Sri Lankan", detail: "4 rotti pieces · katta sambol / pol sambol · chicken curry · dhal curry · tea or coffee" },
    ],
  },
  {
    heading: "Lunch",
    note: "one option included",
    options: [
      { name: "Rice & Curry", detail: "Kiri samba · dhal curry · pol sambol · two vegetable pots · papadam · meat (beef, pork or chicken) · dessert" },
      { name: "Fried Rice", detail: "Egg fried rice · chicken devel · chilli paste · dessert" },
    ],
    foot: "Portion sizes for every rice & curry and fried rice meal — beef 100g, pork 150g, chicken 150g.",
  },
  {
    heading: "Dinner",
    note: "one option included",
    options: [
      { name: "Fried Rice", detail: "Soup (chicken, vegetable or mushroom) · egg fried rice · chicken devel · chilli paste · pol sambol · dessert · sauce" },
      { name: "Noodles", detail: "Soup (chicken, vegetable or mushroom) · egg noodles · chicken curry or devel · chilli paste · dessert · sauce" },
    ],
    foot: "Portion size for every meal above — chicken 300g.",
  },
];

// Live queue of food orders placed for occupied villas — starts empty
// each session (unlike the historical logs elsewhere, "currently
// pending" only ever means orders placed just now). Placing an order
// reserves its ingredients from inventory immediately; Complete bills
// the room and records the sale in Reports; Delete returns the
// reserved ingredients untouched.
export const FOOD_ORDERS = [];

let nextOrderId = 1;
export function allocateOrderId() {
  return nextOrderId++;
}

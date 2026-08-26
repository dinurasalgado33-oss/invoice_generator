import { newId } from "./ids.js";
// Live queue of food orders placed for occupied villas — starts empty
// each session (unlike the historical logs elsewhere, "currently
// pending" only ever means orders placed just now). Placing an order
// reserves its ingredients from inventory immediately; Complete bills
// the room and records the sale in Reports; Delete returns the
// reserved ingredients untouched.
export const FOOD_ORDERS = [];

// A UUID, not a counter. Two devices offline would both have handed out
// the same number, and every lookup joining on it would then match two
// different records — one guest's bill quietly containing another's
// charges. See [[backend-decisions]].
export function allocateOrderId() {
  return newId();
}

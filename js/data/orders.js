import { newId } from "./ids.js";
// Live queue of food orders placed for occupied villas. Placing an order
// reserves its ingredients from inventory immediately; Complete bills the
// room and records the sale in Reports; Delete returns the reserved
// ingredients untouched.
//
// This used to start empty every session, on the reasoning that "currently
// pending" only ever means orders placed just now. That reasoning holds for
// a queue and does not hold for money a guest owes: a reload dropped orders
// the kitchen was already cooking, and nobody was billed. Worse, placing an
// order writes a permanent stock deduction, so the shelf stayed short with
// nothing left to explain why — an unexplained shortfall reads as theft.
//
// It is persisted now, in its own `foodOrdersPending` collection. That is
// deliberately not the `foodOrders` collection, which holds the completed
// *sale*: the sale is financial and undeletable, this is a work item and
// staff must be able to take a mistyped one back off the list.
export const FOOD_ORDERS = [];

// A UUID, not a counter. Two devices offline would both have handed out
// the same number, and every lookup joining on it would then match two
// different records — one guest's bill quietly containing another's
// charges. See [[backend-decisions]].
export function allocateOrderId() {
  return newId();
}

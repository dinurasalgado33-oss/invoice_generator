import { safeStorage } from "./utils.js";

// Single shared mutable object for state that spans multiple modules
// (which branch/role is active, the invoice counter). Modules mutate
// properties on this object rather than each holding their own copy —
// the standard pattern for shared state across ES modules, since a
// module can't reassign another module's exported `let` binding.
export const appState = {
  selectedBranch: "",
  selectedBranchLabel: "",
  selectedBranchLogo: "",
  currentRole: safeStorage.get("leopardinn-role") || null,
  // Who is signed in. Kept so the app can fill in fields it already knows
  // the answer to — staff were typing their own name on every invoice.
  currentUser: safeStorage.get("leopardinn-user") || "",
  // Invoice numbers start at 1. The storage key is versioned because a
  // browser that ran the demo build still holds a counter in the 190s, and
  // reading it back would carry the old numbering into a clean install.
  invoiceCounter: Number(safeStorage.get("leopardinn-invoice-counter-v2") || "1"),
};

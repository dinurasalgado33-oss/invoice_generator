// Single shared mutable object for state that spans multiple modules
// (which branch/role is active, the invoice counter). Modules mutate
// properties on this object rather than each holding their own copy —
// the standard pattern for shared state across ES modules, since a
// module can't reassign another module's exported `let` binding.
export const appState = {
  selectedBranch: "",
  selectedBranchLabel: "",
  selectedBranchLogo: "",
  currentRole: localStorage.getItem("leopardinn-role") || null,
  invoiceCounter: Number(localStorage.getItem("leopardinn-invoice-counter") || "1"),
};

// Staff login accounts — client-side gate only (no backend), just keeps
// casual visitors out. Credentials live in this file, in plain view, so
// treat it as a light deterrent, not real security.
export const ACCOUNTS = [
  { username: "ashen", password: "1234", role: "manager", branch: null },
  { username: "staff", password: "1234", role: "staff", branch: "Wilpattu" },
];

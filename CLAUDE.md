# Leopard Inn — Staff Portal

Hotel management app for two Sri Lankan properties: **Wilpattu** (4 villas)
and **Arugam Bay** (6 villas). Reception uses it on phones and a shared
tablet, often on bad signal.

## Read these first

- **`GO-LIVE.md`** — current state and what's next. The phase plan lives at
  the top. Start here.
- **`BACKEND-PLAN.md`** — the decisions and *why*. Read before proposing a
  different approach; most alternatives were already considered and ruled
  out for a reason.

## Hard constraints

- **No build step.** Vanilla ES modules loaded straight from `index.html`.
  Do not introduce npm/bundlers/frameworks for the app itself. (`functions/`
  will be different when it exists — that is a separate runtime.)
- **Offline-first.** Reception cannot be told to wait for signal. Anything
  that needs the network at the moment a guest is standing there is wrong.
- **Nothing financial is ever deleted.** Invoices are voided, charges are
  written off. `allow delete: if false` in the rules is deliberate.
- **Two branch strings, exactly:** `Wilpattu` and `Arugam Bay`. Compared
  with `===` in the app and `==` in the rules. A typo produces an account
  that silently sees nothing.
- **Financial year starts 1 April** (Sri Lanka). Dates are Asia/Colombo via
  `toDateISO()`, never UTC, never the device clock's timezone.

## Layout

- `js/data/*.js` — data layer, records, allocators, Firestore adapter
- `js/*.js` — one module per screen
- `firestore.rules` — the entire security boundary. Deploy with
  `firebase deploy --only firestore:rules`; never hand-paste into the
  console (that drift caused a real two-commit bug).

## Testing

There is no test suite. Verify in the Browser pane by importing modules
and inspecting their state — they are singletons:

```js
const reports = await import('/js/data/reports.js');
reports.INVOICES.length;
```

Trace a document's **whole lifecycle** — created, listed, reprinted,
voided, reported on. That is what catches the real bugs; checking that a
screen renders does not.

## Bugs that have already happened here

Worth knowing, because the same shapes keep recurring:

- **One fact stored twice, free to disagree.** The app menu vs the printed
  menu; a charges array vs charge records. If you find yourself writing the
  same value in two places, that is the bug.
- **A slash in an ID.** Financial years read `2026/27`, and Firestore treats
  `/` as a path separator — every counter write was rejected. Printed form
  keeps the slash; keys get slugged.
- **Config IDs vs record IDs.** Records (bookings, invoices, charges) use
  UUIDs, because two offline devices would otherwise both allocate `1` and
  one guest's bill would silently contain another's. Config (dishes, villas,
  activities) stays numeric on purpose — guests read dish numbers off a menu.

## Working with Dinura

- Do not enter passwords into login forms, including test accounts, even
  when offered. Ask them to sign in; the session then persists.
- `firebase login` / `npm install -g` must run in *their* terminal.
- Say plainly when something is unverified rather than implying it works.

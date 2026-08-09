# Leopard Inn — Invoice Generator

A simple, mobile-friendly web app for staff to generate guest invoices for each branch, matching Leopard Inn's real invoice format (Reservation No, Reg. Card No, Voucher No, itemized charges, Service Charge, Gross/Net/Advance/Grand Total, remarks, and signature lines).

## How it works
1. Staff pick a branch (Wilpattu Forest Retreat / Arugam Bay Beachfront Hotel).
2. Tap **Invoice Generator**.
3. Fill in guest details and itemized charges.
4. Tap **Generate Invoice** to see a clean preview styled like the printed invoice, with the branch logo watermarked behind the item list.
5. Export via **Print / Save PDF**, **Save as Image**, or start a **New Invoice**.

## Logo files
Three files live in `assets/`:

```
assets/logo-wilpattu.png       branch home screen + form header (Wilpattu)
assets/logo-arugambay.png      branch home screen + form header (Arugam Bay)
assets/watermark.png           transparent gold logo, faded behind the invoice item list
```

The two branch logos have a maroon background baked in, so they blend into the maroon UI panels. `watermark.png` must be a transparent PNG (gold artwork, no background) — that's what lets it fade cleanly into the white invoice paper the way it does on the printed original.

## Charges table behavior
- **Qty** is free text (e.g. `2 nights`, `12`, `1`) to match real package pricing.
- **Value** auto-fills as Qty × Rate only when Qty is a plain number — for text quantities like "2 nights", type the Value manually (matches how package rates are billed).

## Run it locally
Just open `index.html` in any browser — no install needed.

## Publish to GitHub Pages
1. Create a new GitHub repository and push this folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Save — GitHub will give you a URL like `https://<username>.github.io/<repo-name>/`.
5. Share that link with staff — it works on phones, tablets, and PCs.

## Editing branches
Branches are defined in `index.html` in the `#screen-branch` section — each is a `<button class="branch-btn" data-branch="..." data-label="..." data-logo="...">`. Add, remove, or rename buttons there (and their matching logo file) to change the branch list.

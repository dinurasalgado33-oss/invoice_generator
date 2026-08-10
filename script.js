(() => {
  let selectedBranch = "";
  let selectedBranchLabel = "";
  let selectedBranchLogo = "";
  let invoiceCounter = Number(localStorage.getItem("leopardinn-invoice-counter") || "1");

  const screens = {
    branch: document.getElementById("screen-branch"),
    home: document.getElementById("screen-home"),
    form: document.getElementById("screen-form"),
    preview: document.getElementById("screen-preview"),
  };

  function setLogoSrc(id, src) {
    const img = document.getElementById(id);
    img.style.display = "";
    img.src = src;
  }

  const screenOrder = ["screen-branch", "screen-home", "screen-form", "screen-preview"];

  function showScreen(id) {
    const currentEl = document.querySelector(".screen.active");
    const fromIdx = currentEl ? screenOrder.indexOf(currentEl.id) : -1;
    const toIdx = screenOrder.indexOf(id);
    const direction = toIdx >= fromIdx ? "enter-forward" : "enter-back";

    Object.values(screens).forEach(s => s.classList.remove("active", "enter-forward", "enter-back"));

    const target = document.getElementById(id);
    target.classList.add("active");
    void target.offsetWidth; // restart animation
    target.classList.add(direction);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Branch selection
  document.querySelectorAll(".branch-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedBranch = btn.dataset.branch;
      selectedBranchLabel = btn.dataset.label;
      selectedBranchLogo = btn.dataset.logo;

      document.getElementById("home-branch-label").textContent = selectedBranchLabel;
      document.getElementById("form-branch-label").textContent = selectedBranchLabel;
      setLogoSrc("home-logo", selectedBranchLogo);
      setLogoSrc("form-logo", selectedBranchLogo);

      showScreen("screen-home");
    });
  });

  // Back buttons
  document.querySelectorAll(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });

  document.getElementById("open-invoice-btn").addEventListener("click", () => {
    resetForm();
    showScreen("screen-form");
  });

  document.getElementById("new-invoice-btn").addEventListener("click", () => {
    resetForm();
    showScreen("screen-form");
  });

  // Multi-step form wizard
  const TOTAL_STEPS = 4;
  const STEP_TITLES = { 1: "Reservation & Guest", 2: "Charges", 3: "Totals", 4: "Final Details" };
  let currentStep = 1;

  const formSteps = [...document.querySelectorAll(".form-step")];
  const stepperItems = [...document.querySelectorAll(".stepper-item")];
  const stepPrevBtn = document.getElementById("step-prev-btn");
  const stepNextBtn = document.getElementById("step-next-btn");
  const generateBtn = document.getElementById("generate-btn");

  function validateStep(step) {
    if (step === 1) {
      const guestName = document.getElementById("guest-name");
      const error = document.getElementById("guest-name-error");
      if (!guestName.value.trim()) {
        error.classList.add("show");
        guestName.classList.add("invalid");
        guestName.focus();
        return false;
      }
      error.classList.remove("show");
      guestName.classList.remove("invalid");
    }
    return true;
  }

  function goToStep(step) {
    if (step > currentStep && !validateStep(currentStep)) return;

    currentStep = Math.min(Math.max(step, 1), TOTAL_STEPS);

    formSteps.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === currentStep));

    stepperItems.forEach(item => {
      const n = Number(item.dataset.step);
      const state = n < currentStep ? "done" : n === currentStep ? "active" : "upcoming";
      item.dataset.state = state;
      item.classList.toggle("line-filled", currentStep > n);
    });
    document.getElementById("step-announce").textContent = `Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_TITLES[currentStep]}`;

    stepPrevBtn.style.display = currentStep === 1 ? "none" : "";
    stepNextBtn.style.display = currentStep === TOTAL_STEPS ? "none" : "";
    generateBtn.style.display = currentStep === TOTAL_STEPS ? "" : "none";

    document.getElementById("screen-form").scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  stepNextBtn.addEventListener("click", () => goToStep(currentStep + 1));
  stepPrevBtn.addEventListener("click", () => goToStep(currentStep - 1));

  document.getElementById("guest-name").addEventListener("input", () => {
    document.getElementById("guest-name-error").classList.remove("show");
    document.getElementById("guest-name").classList.remove("invalid");
  });

  // Enter key on steps 1-3 advances to the next step instead of doing
  // nothing (the real submit button is hidden until the last step)
  document.getElementById("invoice-form").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
    if (currentStep < TOTAL_STEPS) {
      e.preventDefault();
      goToStep(currentStep + 1);
    }
  });

  function num(id) {
    return parseFloat(document.getElementById(id).value) || 0;
  }

  function val(id) {
    return document.getElementById(id).value.trim();
  }

  // Strip anything that isn't a digit (and, for money fields, a single
  // decimal point) as the user types — blocks letters/words on fields
  // that must stay numeric, without relying on type="number" alone
  // (mobile keyboards can still let stray letters through via paste etc.)
  function sanitizeInteger(e) {
    const input = e.target;
    const cleaned = input.value.replace(/[^0-9]/g, "");
    if (cleaned !== input.value) input.value = cleaned;
  }

  function sanitizeDecimal(e) {
    const input = e.target;
    let cleaned = input.value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    if (cleaned !== input.value) input.value = cleaned;
  }

  // Items table
  const itemsBody = document.getElementById("items-body");

  function renumberRows() {
    [...itemsBody.querySelectorAll("tr")].forEach((row, i) => {
      row.querySelector(".col-no").textContent = i + 1;
    });
  }

  function getItems() {
    return [...itemsBody.querySelectorAll("tr")].map((row, i) => {
      const desc = row.querySelector(".item-desc").value.trim();
      const qty = row.querySelector(".item-qty").value.trim();
      const rate = parseFloat(row.querySelector(".item-rate").value) || 0;
      const value = parseFloat(row.querySelector(".item-value").value) || 0;
      return { no: i + 1, desc, qty, rate, value };
    }).filter(it => it.desc || it.qty || it.rate || it.value);
  }

  function computeTotals() {
    const billTotal = getItems().reduce((sum, it) => sum + it.value, 0);
    const serviceCharge = num("service-charge");
    const advance = num("advance");
    const grossAmount = billTotal + serviceCharge;
    const grandTotal = grossAmount - advance;
    return { billTotal, serviceCharge, advance, grossAmount, grandTotal };
  }

  function updateLiveTotals() {
    const { billTotal, serviceCharge, advance, grossAmount, grandTotal } = computeTotals();
    const currency = val("currency") || "LKR";
    document.getElementById("live-bill-total").textContent = fmt(billTotal, currency);
    document.getElementById("live-service-charge").textContent = fmt(serviceCharge, currency);
    document.getElementById("live-gross").textContent = fmt(grossAmount, currency);
    document.getElementById("live-advance").textContent = fmt(advance, currency);
    document.getElementById("live-grand").textContent = fmt(grandTotal, currency);
  }

  function addItemRow(desc = "", qty = "", rate = "", value = "") {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="col-no"></td>
      <td class="col-desc" data-label="Description"><input type="text" class="item-desc" placeholder="e.g. Luxury Chalet with private pool (FB)" value="${desc}"></td>
      <td class="col-qty" data-label="Qty"><input type="text" class="item-qty" placeholder="e.g. 2 nights" value="${qty}"></td>
      <td class="col-price" data-label="Rate (LKR)"><input type="number" class="item-rate" min="0" step="0.01" inputmode="decimal" value="${rate}"></td>
      <td class="col-total" data-label="Value"><input type="number" class="item-value" min="0" step="0.01" inputmode="decimal" value="${value}"></td>
      <td class="col-del"><button type="button" class="row-del-btn" title="Remove item">✕</button></td>
    `;
    itemsBody.appendChild(row);

    const qtyInput = row.querySelector(".item-qty");
    const rateInput = row.querySelector(".item-rate");
    const valueInput = row.querySelector(".item-value");

    rateInput.addEventListener("input", sanitizeDecimal);
    valueInput.addEventListener("input", sanitizeDecimal);

    function autoFillValue() {
      const qtyNum = parseFloat(qtyInput.value);
      const rateNum = parseFloat(rateInput.value) || 0;
      if (!isNaN(qtyNum) && qtyInput.value.trim() === String(qtyNum)) {
        valueInput.value = (qtyNum * rateNum).toFixed(2);
      }
      updateLiveTotals();
    }

    qtyInput.addEventListener("input", autoFillValue);
    rateInput.addEventListener("input", autoFillValue);
    valueInput.addEventListener("input", updateLiveTotals);

    row.querySelector(".row-del-btn").addEventListener("click", () => {
      row.remove();
      renumberRows();
      updateLiveTotals();
    });

    renumberRows();
    updateLiveTotals();
  }

  document.getElementById("add-item-btn").addEventListener("click", () => addItemRow());

  document.getElementById("guest-count").addEventListener("input", sanitizeInteger);
  ["service-charge", "advance"].forEach(id => {
    document.getElementById(id).addEventListener("input", sanitizeDecimal);
  });
  ["service-charge", "advance", "currency"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateLiveTotals);
  });

  // Guest count +/- stepper
  const guestCountInput = document.getElementById("guest-count");
  document.getElementById("guest-count-minus").addEventListener("click", () => {
    guestCountInput.value = Math.max(0, (parseInt(guestCountInput.value, 10) || 0) - 1);
  });
  document.getElementById("guest-count-plus").addEventListener("click", () => {
    guestCountInput.value = (parseInt(guestCountInput.value, 10) || 0) + 1;
  });

  function resetForm() {
    document.getElementById("invoice-form").reset();
    itemsBody.innerHTML = "";
    addItemRow();
    document.getElementById("inv-number").value = String(invoiceCounter);
    document.getElementById("inv-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("currency").value = "LKR";
    document.getElementById("guest-name-error").classList.remove("show");
    document.getElementById("guest-name").classList.remove("invalid");
    updateLiveTotals();
    currentStep = 1;
    goToStep(1);
  }

  // Form submit -> build preview
  document.getElementById("invoice-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const items = getItems();
    const { billTotal, serviceCharge, advance, grossAmount, grandTotal } = computeTotals();

    // Header
    document.getElementById("prev-branch").textContent = selectedBranchLabel;
    document.getElementById("prev-number").textContent = val("inv-number");
    document.getElementById("prev-date").textContent = formatDate(document.getElementById("inv-date").value);

    // Guest details
    document.getElementById("prev-guest-name").textContent = val("guest-name") || "-";
    document.getElementById("prev-guest-count").textContent = val("guest-count") || "-";
    document.getElementById("prev-guest-phone").textContent = val("guest-phone") || "-";
    document.getElementById("prev-reg-card").textContent = val("reg-card-no") || "N/A";
    document.getElementById("prev-voucher").textContent = val("voucher-no") || "N/A";
    document.getElementById("prev-checkin").textContent = formatDate(document.getElementById("checkin-date").value);
    document.getElementById("prev-checkout").textContent = formatDate(document.getElementById("checkout-date").value);

    // Items
    const itemsBodyPrev = document.getElementById("prev-items-body");
    itemsBodyPrev.innerHTML = items.map(it => `
      <tr>
        <td>${it.no}</td>
        <td>${escapeHtml(it.desc)}</td>
        <td>${escapeHtml(it.qty)}</td>
        <td>${it.rate ? it.rate.toFixed(2) : ""}</td>
        <td>${it.value ? it.value.toFixed(2) : "-"}</td>
      </tr>
    `).join("");

    // Totals
    const currency = val("currency") || "LKR";
    document.getElementById("prev-currency").textContent = currency;
    document.getElementById("prev-bill-total").textContent = fmt(billTotal, currency);
    document.getElementById("prev-service-charge").textContent = fmt(serviceCharge, currency);
    document.getElementById("prev-gross").textContent = fmt(grossAmount, currency);
    document.getElementById("prev-advance").textContent = fmt(advance, currency);
    document.getElementById("prev-total").textContent = fmt(grandTotal, currency);

    // Remark + signature
    const notes = document.getElementById("notes").value.trim();
    document.getElementById("prev-notes").textContent = notes || "-";
    document.getElementById("prev-staff").textContent = val("staff-name") || "";

    invoiceCounter++;
    localStorage.setItem("leopardinn-invoice-counter", String(invoiceCounter));

    showScreen("screen-preview");
  });

  function fmt(n, currency) {
    return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value + "T00:00:00");
    if (isNaN(d)) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Export actions
  document.getElementById("print-btn").addEventListener("click", () => window.print());

  document.getElementById("image-btn").addEventListener("click", () => {
    const target = document.getElementById("invoice-preview");
    const hint = target.querySelector(".scroll-hint");
    if (hint) hint.style.visibility = "hidden";

    html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
      if (hint) hint.style.visibility = "";
      const link = document.createElement("a");
      const invNum = document.getElementById("prev-number").textContent || "invoice";
      link.download = `LeopardInn-${invNum}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  });

  // init
  resetForm();
})();

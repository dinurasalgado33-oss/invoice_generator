// Makes a step indicator into a control you can actually use.
//
// Both wizards — the invoice and the registration card — draw the same
// numbered circles, and in both they were decoration: `goToStep` was wired
// to Next and Previous and to nothing else. So the most repeated action in
// the building, a checkout that arrives with every field already filled
// in, still cost three taps of Next to change nothing.
//
// Shared rather than written twice because the two steppers are the same
// control with the same markup, and the accessibility details below are
// exactly the sort of thing that gets fixed in one copy and not the other.
//
// Whether a jump is *allowed* is not decided here. Each wizard's own
// goToStep validates the steps being skipped and refuses if one is not
// finished — this file only turns a click or a key into that call.

export function makeStepperNavigable(items, goToStep, getCurrentStep) {
  items.forEach(item => {
    const step = Number(item.dataset.step);
    if (!step) return;

    // A real button rather than role="button" on the <li>, so it is
    // focusable, announced as a button, and fires on Enter and Space
    // without any of that being reimplemented here. The circle and label
    // move inside it; the <li> stays as the list item it already was.
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stepper-hit";
    while (item.firstChild) button.appendChild(item.firstChild);
    item.appendChild(button);

    button.addEventListener("click", () => {
      if (step !== getCurrentStep()) goToStep(step);
    });
  });

  // Screen readers are told which step is current, and the rest are
  // announced with their number and name — "Step 2 of 4, Stay" reads
  // better than "2".
  const label = () => items.forEach(item => {
    const step = Number(item.dataset.step);
    const button = item.querySelector(".stepper-hit");
    if (!button) return;
    const name = (item.querySelector(".stepper-label") || {}).textContent || "";
    button.setAttribute("aria-label", `Step ${step} of ${items.length}: ${name.trim()}`);
    button.setAttribute("aria-current", item.dataset.state === "active" ? "step" : "false");
  });

  // Re-labelled whenever the wizard repaints the circles, so aria-current
  // follows the visible state instead of freezing at load.
  const observer = new MutationObserver(label);
  items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ["data-state"] }));
  label();
}

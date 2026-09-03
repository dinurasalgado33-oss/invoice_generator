// Contact + bank details shown on guest-facing documents (currently just
// the Reservation Confirmation). Real business info for Wilpattu as
// supplied; Arugam Bay reuses the same bank account (common for a small
// group operating on one account) but its address/phone are placeholders
// until the real branch details are provided — update before sending
// anything real to a guest.
export const BRANCH_INFO = {
  "Wilpattu": {
    hotelName: "Leopard Inn Wilpattu Villa",
    address: "Old Eluwankulama, Eluwankulama, Sri Lanka",
    phone: "+94 740 559 024",
    email: "leopardinnwilpattu@gmail.com",
    bankAccountName: "A M C Ashen",
    bankAccountNumber: "81626399",
    bankName: "Bank Of Ceylon",
    bankBranch: "Dehiattakandiya",
  },
  "Arugam Bay": {
    hotelName: "Leopard Inn Arugam Bay Villa",
    address: "Arugam Bay, Sri Lanka",
    phone: "+94 740 559 024",
    email: "leopardinnwilpattu@gmail.com",
    bankAccountName: "A M C Ashen",
    bankAccountNumber: "81626399",
    bankName: "Bank Of Ceylon",
    bankBranch: "Dehiattakandiya",
  },
};

// Conditions printed at the bottom of the Reservation Confirmation.
// Per-branch (like everything else here) so one branch can change its
// advance-payment or service-charge terms without touching the other.
// Order is the order they print in.
export const RESERVATION_CONDITIONS = {
  "Wilpattu": [
    { id: 1, text: "Required LKR 5,000 of advance payment to confirm the booking", hideFromGuest: true },
    { id: 2, text: "Up to 11 Years: Infant / Child sharing parent's room would be 100% complimentary for first 2 children and 25% of the Double room rate applicable per additional child." },
    { id: 3, text: "The reservation is valid only for 1 days after issuing." },
    { id: 4, text: "Once payment is made, kindly share the slip or confirmation for our records.", hideFromGuest: true },
    { id: 5, text: "Please note that a 10% service charge will be added to all BB (Bed & Breakfast), HB (Half Board), and FB (Full Board) bookings." },
  ],
  "Arugam Bay": [
    { id: 101, text: "Required LKR 5,000 of advance payment to confirm the booking", hideFromGuest: true },
    { id: 102, text: "Up to 11 Years: Infant / Child sharing parent's room would be 100% complimentary for first 2 children and 25% of the Double room rate applicable per additional child." },
    { id: 103, text: "The reservation is valid only for 1 days after issuing." },
    { id: 104, text: "Once payment is made, kindly share the slip or confirmation for our records.", hideFromGuest: true },
    { id: 105, text: "Please note that a 10% service charge will be added to all BB (Bed & Breakfast), HB (Half Board), and FB (Full Board) bookings." },
  ],
};

let nextConditionId = Math.max(0, ...Object.values(RESERVATION_CONDITIONS).flat().map(c => c.id)) + 1;
export function allocateConditionId() {
  return nextConditionId++;
}

// ---- Travel agent / guide Proforma Invoice ----
// Both lists print on the Proforma Invoice and are manager-editable
// (Configure > Travel Agent / Guide Invoice). Per-branch, same as
// RESERVATION_CONDITIONS, so one property can change its terms without
// touching the other.

// The cancellation ladder. Order is the order it prints in, so these read
// as a sequence counting down to arrival.
export const CANCELLATION_POLICY = {
  "Wilpattu": [
    { id: 1, text: "Cancellation 21 days prior to Arrival - No Cancellation charges" },
    { id: 2, text: "Cancellation 14 days prior to Arrival - 50% will be charged on booked basis" },
    { id: 3, text: "Cancellation 07 days prior to Arrival - 100% will be charged on booked basis" },
    { id: 4, text: "Cancellation during the stay - 100% will be charged on booked basis" },
  ],
  "Arugam Bay": [
    { id: 101, text: "Cancellation 21 days prior to Arrival - No Cancellation charges" },
    { id: 102, text: "Cancellation 14 days prior to Arrival - 50% will be charged on booked basis" },
    { id: 103, text: "Cancellation 07 days prior to Arrival - 100% will be charged on booked basis" },
    { id: 104, text: "Cancellation during the stay - 100% will be charged on booked basis" },
  ],
};

let nextCancellationId = Math.max(0, ...Object.values(CANCELLATION_POLICY).flat().map(c => c.id)) + 1;
export function allocateCancellationId() {
  return nextCancellationId++;
}

// Standing notices printed around the bank details block. `emphasis: true`
// prints in red on the document — reserved for the payment terms the agent
// has to act on, which is why it's a property of the notice rather than
// something staff decide per invoice.
//
// The bank account itself is NOT here: it comes from BRANCH_INFO above, so
// there is one place to change the account number and every document that
// prints it follows.
export const PROFORMA_NOTICES = {
  "Wilpattu": [
    { id: 1, text: "Payment must be paid according to Central Bank exchange rate", emphasis: true },
    { id: 2, text: "All Payments to be settled to the below mentioned bank account", emphasis: false },
    { id: 3, text: "All outstandings must be settled 14 days prior to the date of Departure", emphasis: true },
    { id: 4, text: "If there is an amendment or cancellations, please send an email after the call", emphasis: false },
  ],
  "Arugam Bay": [
    { id: 101, text: "Payment must be paid according to Central Bank exchange rate", emphasis: true },
    { id: 102, text: "All Payments to be settled to the below mentioned bank account", emphasis: false },
    { id: 103, text: "All outstandings must be settled 14 days prior to the date of Departure", emphasis: true },
    { id: 104, text: "If there is an amendment or cancellations, please send an email after the call", emphasis: false },
  ],
};

let nextNoticeId = Math.max(0, ...Object.values(PROFORMA_NOTICES).flat().map(n => n.id)) + 1;
export function allocateNoticeId() {
  return nextNoticeId++;
}

// Closing line, printed above the signature blocks.
export const PROFORMA_CLOSING =
  "We look forward to welcoming your guest at Leopard Inn and hope their stay with us will be remarkable.";

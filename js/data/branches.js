// Contact + bank details shown on guest-facing documents (currently just
// the Reservation Confirmation). Real business info for Wilpattu as
// supplied; Arugam Bay reuses the same bank account (common for a small
// group operating on one account) but its address/phone are placeholders
// until the real branch details are provided — update before sending
// anything real to a guest.
export const BRANCH_INFO = {
  "Wilpattu": {
    hotelName: "Leopard Inn Wilpattu Hotel",
    address: "Old Eluwankulama, Eluwankulama, Sri Lanka",
    phone: "+94 740 559 024",
    email: "leopardinnwilpattu@gmail.com",
    bankAccountName: "A M C Ashen",
    bankAccountNumber: "81626399",
    bankName: "Bank Of Ceylon",
    bankBranch: "Dehiattakandiya",
  },
  "Arugam Bay": {
    hotelName: "Leopard Inn Arugam Bay Hotel",
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
    { id: 1, text: "Required LKR 5,000 of advance payment to confirm the booking" },
    { id: 2, text: "Up to 11 Years: Infant / Child sharing parent's room would be 100% complimentary for first 2 children and 25% of the Double room rate applicable per additional child." },
    { id: 3, text: "The reservation is valid only for 1 days after issuing." },
    { id: 4, text: "Once payment is made, kindly share the slip or confirmation for our records." },
    { id: 5, text: "Please note that a 10% service charge will be added to all BB (Bed & Breakfast), HB (Half Board), and FB (Full Board) bookings." },
  ],
  "Arugam Bay": [
    { id: 101, text: "Required LKR 5,000 of advance payment to confirm the booking" },
    { id: 102, text: "Up to 11 Years: Infant / Child sharing parent's room would be 100% complimentary for first 2 children and 25% of the Double room rate applicable per additional child." },
    { id: 103, text: "The reservation is valid only for 1 days after issuing." },
    { id: 104, text: "Once payment is made, kindly share the slip or confirmation for our records." },
    { id: 105, text: "Please note that a 10% service charge will be added to all BB (Bed & Breakfast), HB (Half Board), and FB (Full Board) bookings." },
  ],
};

let nextConditionId = Math.max(0, ...Object.values(RESERVATION_CONDITIONS).flat().map(c => c.id)) + 1;
export function allocateConditionId() {
  return nextConditionId++;
}

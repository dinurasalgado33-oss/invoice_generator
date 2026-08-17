// Ids are unique across ALL branches (Wilpattu 1-5, Arugam Bay 101-105)
// so activity records can live in one flat backend collection.
// Add-on activities a guest can be charged for during their stay — staff
// pick one from here (or add a one-off custom charge) from the Activities
// quick action; the charge rides along to that room's checkout invoice.
export const ACTIVITIES_BY_BRANCH = {
  "Wilpattu": [
    { id: 1, name: "Safari Jeep Tour", price: 8500 },
    { id: 2, name: "Guided Nature Walk", price: 3000 },
    { id: 3, name: "Bird Watching Tour", price: 3500 },
    { id: 4, name: "Campfire Dinner", price: 4500 },
    { id: 5, name: "Village Cultural Tour", price: 4000 },
  ],
  "Arugam Bay": [
    { id: 101, name: "Surfing Lesson", price: 5000 },
    { id: 102, name: "Kayak Ride", price: 3000 },
    { id: 103, name: "Boat Ride", price: 4500 },
    { id: 104, name: "Snorkeling Trip", price: 5500 },
    { id: 105, name: "Sunset Beach BBQ", price: 6000 },
  ],
};

// Kept clear of every seeded id across both branches, so a newly added
// activity can't collide with an existing one. Seeded from the data
// itself rather than a hardcoded number — same pattern as restock ids.
let nextActivityId = Math.max(0, ...Object.values(ACTIVITIES_BY_BRANCH).flat().map(a => a.id)) + 1;
export function allocateActivityId() {
  return nextActivityId++;
}

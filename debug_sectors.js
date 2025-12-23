/**
 * Debug script to understand sector mapping
 */

const SectorOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Test point at (20, 0) - should be pointing right
const p = { x: 20, y: 0 };
const r = Math.hypot(p.x, p.y); // 20
const ang = Math.atan2(p.y, p.x); // atan2(0, 20) = 0 radians
let deg = (ang * 180) / Math.PI; // 0 degrees (pointing right/East)
console.log('Initial angle:', deg, '°');

deg = (deg + 360 + 90) % 360; // Rotate by 90 degrees 
console.log('After +90 rotation:', deg, '°');

// Should point to top (Sector 20)
const index = Math.floor(((deg + 9) % 360) / 18);
const sector = SectorOrder[index];
console.log('Index:', index, ', Sector:', sector);

console.log('\n--- Testing multiple points ---\n');

const testPoints = [
  { p: {x: 20, y: 0}, desc: 'Right (East)' },
  { p: {x: 0, y: 20}, desc: 'Down (South)' },
  { p: {x: -20, y: 0}, desc: 'Left (West)' },
  { p: {x: 0, y: -20}, desc: 'Up (North) - should be 20' },
];

testPoints.forEach(test => {
  const p = test.p;
  const ang = Math.atan2(p.y, p.x);
  let deg = (ang * 180) / Math.PI;
  deg = (deg + 360 + 90) % 360;
  const index = Math.floor(((deg + 9) % 360) / 18);
  const sector = SectorOrder[index];
  console.log(`${test.desc.padEnd(20)} deg=${deg.toFixed(1).padEnd(6)} idx=${index} sector=${sector}`);
});

// Now let's understand the correct mapping
// Dartboard standard: Sector 20 is at TOP (North)
// Sectors go clockwise: 20 (top), 1 (top-right), 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20 (back to top)
// Each sector spans 18 degrees (360/20)

console.log('\n--- Sector order with angles ---\n');
SectorOrder.forEach((sector, idx) => {
  const centerDeg = idx * 18 - 9; // Center of this sector, accounting for ±9° bands
  console.log(`Index ${idx.toString().padStart(2)}: Sector ${sector.toString().padStart(2)} at ${(centerDeg + 360) % 360}° ± 9°`);
});

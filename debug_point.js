/**
 * Debug specific point mapping
 */

const SectorOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const testPoint = { x: 0, y: 20 }; // North (up)
const ang = Math.atan2(testPoint.y, testPoint.x); // atan2(20, 0) = π/2 = 90°
let deg = (ang * 180) / Math.PI;
console.log('Raw angle in degrees:', deg);

deg = (deg + 360 + 90) % 360;
console.log('After +90 rotation:', deg);

// Without the +9 offset
let index = Math.floor(deg / 18);
console.log('Index without +9 offset:', index, '-> sector:', SectorOrder[index]);

// With the +9 offset (as in current code)
index = Math.floor(((deg + 9) % 360) / 18);
console.log('Index with +9 offset:', index, '-> sector:', SectorOrder[index]);

console.log('\n--- Let\'s trace the math step by step ---');
const p = { x: 0, y: 20 };
const r = Math.hypot(p.x, p.y);
console.log('r =', r);

const ang2 = Math.atan2(p.y, p.x);
console.log('atan2(y, x) =', ang2, 'radians =', (ang2 * 180 / Math.PI), '°');

let deg2 = (ang2 * 180) / Math.PI;
console.log('deg before rotation =', deg2);

deg2 = (deg2 + 360 + 90) % 360;
console.log('deg after +90 rotation =', deg2);

const withPlus9 = (deg2 + 9) % 360;
console.log('(deg + 9) % 360 =', withPlus9);

const idx = Math.floor(withPlus9 / 18);
console.log('floor(.../ 18) =', idx);

console.log('SectorOrder[' + idx + '] =', SectorOrder[idx]);

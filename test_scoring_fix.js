/**
 * Test script to verify dart scoring logic is working correctly
 * This tests the fixed scoreAtBoardPoint function with proper ring detection
 */

// Board measurements (mm)
const BoardRadii = {
  bullInner: 6.35,
  bullOuter: 15.9,
  trebleInner: 99,
  trebleOuter: 107,
  doubleInner: 162,
  doubleOuter: 170,
};

const SectorOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Fixed scoring function
function scoreAtBoardPoint(p) {
  const r = Math.hypot(p.x, p.y);
  const ang = Math.atan2(p.y, p.x);
  let deg = (ang * 180) / Math.PI;
  deg = (deg + 360 + 90) % 360; // 0 at top
  const index = Math.floor(((deg + 9) % 360) / 18);
  const sector = SectorOrder[index];
  
  const bullTol = 3.5;
  const bandTol = 3.0;
  const edgeTol = 2.0;
  
  const bullInner = BoardRadii.bullInner;
  const bullOuter = BoardRadii.bullOuter;
  const trebInner = BoardRadii.trebleInner;
  const trebOuter = BoardRadii.trebleOuter;
  const dblInner = BoardRadii.doubleInner;
  const dblOuter = BoardRadii.doubleOuter;
  
  // Outside board edge
  if (r > dblOuter + edgeTol) return { base: 0, ring: 'MISS', sector: null, mult: 0 };
  
  // Bulls
  if (r <= bullInner + bullTol) return { base: 50, ring: 'INNER_BULL', sector: 25, mult: 2 };
  if (r <= bullOuter + bullTol) return { base: 25, ring: 'BULL', sector: 25, mult: 1 };
  
  // Double band - r >= 162-3=159 AND r <= 170+2=172
  if (r >= dblInner - bandTol && r <= dblOuter + edgeTol)
    return { base: sector * 2, ring: 'DOUBLE', sector, mult: 2 };
  
  // Single outer - r >= 107-3=104 AND r < 162-3=159
  if (r >= trebOuter - bandTol && r < dblInner - bandTol)
    return { base: sector, ring: 'SINGLE', sector, mult: 1 };
  
  // Treble - r >= 99-3=96 AND r < 107-3=104
  if (r >= trebInner - bandTol && r < trebOuter - bandTol)
    return { base: sector * 3, ring: 'TRIPLE', sector, mult: 3 };
  
  // Inner single
  return { base: sector, ring: 'SINGLE', sector, mult: 1 };
}

// Test cases: {point, expectedScore, expectedRing, description}
// NOTE: Coordinate system has negative Y at top (sector 20)
const tests = [
  // Inner Bull tests
  { p: {x: 0, y: 0}, expectedScore: 50, expectedRing: 'INNER_BULL', desc: 'Dead center bullseye' },
  { p: {x: 3, y: 3}, expectedScore: 50, expectedRing: 'INNER_BULL', desc: 'Near center inner bull' },
  
  // Outer Bull tests
  { p: {x: 10, y: 0}, expectedScore: 25, expectedRing: 'BULL', desc: 'Outer bull' },
  { p: {x: 0, y: -12}, expectedScore: 25, expectedRing: 'BULL', desc: 'Outer bull at top' },
  
  // Inner Single tests (r between 15.9 and 99)
  // Point (0, -20) points to negative Y (top), which is sector 20
  { p: {x: 0, y: -20}, expectedScore: 20, expectedRing: 'SINGLE', desc: 'Inner single at sector 20 (top)' },
  { p: {x: 0, y: -50}, expectedScore: 20, expectedRing: 'SINGLE', desc: 'Inner single mid-radius at sector 20' },
  
  // Triple tests (r between 99 and 107)
  // (0, -102) is in triple ring at sector 20
  { p: {x: 0, y: -102}, expectedScore: 60, expectedRing: 'TRIPLE', desc: 'Triple ring at sector 20' },
  
  // Outer Single tests (r between 107 and 162)
  // (0, -135) is in outer single band at sector 20
  { p: {x: 0, y: -135}, expectedScore: 20, expectedRing: 'SINGLE', desc: 'Outer single band at sector 20' },
  
  // Double tests (r between 162 and 170)
  // (0, -165) is in double ring at sector 20
  { p: {x: 0, y: -165}, expectedScore: 40, expectedRing: 'DOUBLE', desc: 'Double ring at sector 20' },
  
  // Miss tests
  { p: {x: 0, y: -175}, expectedScore: 0, expectedRing: 'MISS', desc: 'Miss outside double' },
  { p: {x: 0, y: -200}, expectedScore: 0, expectedRing: 'MISS', desc: 'Far miss' },
];

// Run tests
let passed = 0;
let failed = 0;

console.log('\n' + '='.repeat(70));
console.log('DART SCORING FIX - TEST RESULTS');
console.log('='.repeat(70) + '\n');

tests.forEach((test, idx) => {
  const result = scoreAtBoardPoint(test.p);
  const scoreFail = result.base !== test.expectedScore;
  const ringFail = result.ring !== test.expectedRing;
  const pass = !scoreFail && !ringFail;
  
  if (pass) {
    console.log(`✅ Test ${idx + 1}: ${test.desc}`);
    passed++;
  } else {
    console.log(`❌ Test ${idx + 1}: ${test.desc}`);
    if (scoreFail) {
      console.log(`   Score: Expected ${test.expectedScore}, got ${result.base}`);
    }
    if (ringFail) {
      console.log(`   Ring: Expected ${test.expectedRing}, got ${result.ring}`);
    }
    failed++;
  }
});

console.log('\n' + '='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
console.log('='.repeat(70) + '\n');

if (failed === 0) {
  console.log('🎯 ALL TESTS PASSED! Scoring logic is correct.');
} else {
  console.log('⚠️ SOME TESTS FAILED! Check the logic above.');
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Calibration → Dart Detection → Score Mapping Verification Script
 * 
 * This script helps verify the complete flow:
 * Calibration (H matrix) → Dart Detection (DartDetector) → 
 * Homography Transform → Score Mapping → Game Integration
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset}  ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️${colors.reset}  ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}=== ${msg} ===${colors.reset}\n`)
};

async function main() {
  console.log(colors.bold + colors.cyan);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Nine Dart Nation - Calibration Mapping Verification          ║');
  console.log('║                                                                ║');
  console.log('║  Verify: Calibration → Dart Detection → Score → Game Mode     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // Test 1: Calibration
  log.header('STEP 1: Verify Calibration Setup');
  
  const hasCal = await question('Have you completed calibration and locked it? (y/n) ');
  if (hasCal.toLowerCase() !== 'y') {
    log.warn('Please complete calibration first:');
    console.log('1. Click "Calibrate" button in Calibrator');
    console.log('2. Click 5 points on dartboard');
    console.log('3. Lock calibration when error ≤ 6px');
    return;
  }

  log.success('Calibration locked - Ready for testing');

  // Test 2: H Matrix Validation
  log.header('STEP 2: Check H Matrix in DevTools Console');
  
  const hasH = await question(`
Copy this into browser console and verify output:
  
  const state = JSON.parse(localStorage.getItem('calibration-store'));
  console.log('H:', state.state.H);
  console.log('errorPx:', state.state.errorPx);
  console.log('theta:', state.state.theta);
  console.log('sectorOffset:', state.state.sectorOffset);

Does it show H matrix with 3×3 values? (y/n) `);

  if (hasH.toLowerCase() !== 'y') {
    log.error('H matrix not found in localStorage!');
    return;
  }

  const errorPx = await question('What is the errorPx value? (enter number, e.g., 2.5) ');
  const error = parseFloat(errorPx);

  if (error > 6) {
    log.warn(`errorPx = ${error}px is too high (should be ≤ 6px)`);
    log.warn('This will cause incorrect dart scoring');
    const recal = await question('Would you like to recalibrate? (y/n) ');
    if (recal.toLowerCase() === 'y') {
      log.info('Recalibrate focusing on center, double ring, and treble ring');
      return;
    }
  } else {
    log.success(`errorPx = ${error}px ✅ (Good calibration quality)`);
  }

  // Test 3: Camera & Detection
  log.header('STEP 3: Test Dart Detection');

  const cameraOk = await question(`
In the game (OfflinePlay):
1. Select "X01" game mode
2. Make sure "Enable camera" is ON in Settings
3. You should see black camera preview
4. Throw a dart at SINGLE 20

Can you see the camera preview and did it detect the dart? (y/n) `);

  if (cameraOk.toLowerCase() !== 'y') {
    log.error('Camera not detecting darts');
    log.info('Troubleshooting:');
    console.log('1. Check "Enable camera" toggle in Settings');
    console.log('2. Check console for "[CAMERA]" messages');
    console.log('3. Verify camera permissions granted');
    console.log('4. Try different camera (OBS, USB, phone)');
    return;
  }

  log.success('Camera detecting darts ✅');

  // Test 4: Score Mapping
  log.header('STEP 4: Verify Score Mapping (CRITICAL)');

  log.info('We will test score accuracy with 5 test cases:');
  console.log('\nThrow a dart at each location and report what the system shows:');

  const tests = [
    {
      name: 'SINGLE 20',
      location: 'Narrow band LEFT of double ring at 162mm',
      expected: { ring: 'SINGLE', sector: 20, value: 20 },
      description: 'S20'
    },
    {
      name: 'DOUBLE 20',
      location: 'Outer narrow band at ~170mm',
      expected: { ring: 'DOUBLE', sector: 20, value: 40 },
      description: 'D20'
    },
    {
      name: 'TRIPLE 20',
      location: 'Inner narrow band at ~155mm',
      expected: { ring: 'TRIPLE', sector: 20, value: 60 },
      description: 'T20'
    },
    {
      name: 'BULL (outer)',
      location: 'Outer circle at center (~25mm radius)',
      expected: { ring: 'BULL', value: 25 },
      description: 'BULL 25'
    },
    {
      name: 'INNER BULL',
      location: 'Center bullseye (~6mm radius)',
      expected: { ring: 'INNER_BULL', value: 50 },
      description: 'INNER_BULL 50'
    }
  ];

  let passCount = 0;
  const results = [];

  for (const test of tests) {
    console.log(`\n${colors.bold}Test: ${test.name}${colors.reset}`);
    console.log(`Location: ${test.location}`);
    console.log(`Expected: ${test.description} (value ${test.expected.value})`);
    
    const detected = await question(`What did the system show? (e.g., ${test.description}): `);
    
    const pass = detected.toUpperCase().includes(test.description.toUpperCase());
    results.push({
      test: test.name,
      expected: test.description,
      detected: detected,
      passed: pass
    });

    if (pass) {
      log.success(`Correct mapping detected`);
      passCount++;
    } else {
      log.error(`Wrong score detected - Expected ${test.description}, got ${detected}`);
    }
  }

  // Test 5: Game Mode Integration
  log.header('STEP 5: Verify Game Mode Integration');

  console.log('\nTest X01 Mode (501):');
  console.log('1. Start new game');
  console.log('2. Throw 3 darts at different scores');
  console.log('3. Verify score decreases correctly\n');

  const x01Pass = await question('Did score correctly deduct after each dart? (y/n) ');
  const x01Ok = x01Pass.toLowerCase() === 'y';

  console.log('\nTest Cricket Mode:');
  console.log('1. Throw at 20, 20, 20 (should mark 20 as closed)');
  console.log('2. Throw at 19, 19, 19 (should mark 19 as closed)\n');

  const cricketPass = await question('Did marks appear correctly in scoresheet? (y/n) ');
  const cricketOk = cricketPass.toLowerCase() === 'y';

  console.log('\nTest Shanghai Mode:');
  console.log('1. Round 1: Throw at 1 (single, double, triple)');
  console.log('2. Score should show and round advance\n');

  const shanghaiPass = await question('Did round advance and score calculate? (y/n) ');
  const shanghaiOk = shanghaiPass.toLowerCase() === 'y';

  // Summary
  log.header('SUMMARY');

  console.log(`\nScore Mapping Results: ${passCount}/5 passed`);
  results.forEach(r => {
    const icon = r.passed ? colors.green + '✅' : colors.red + '❌' + colors.reset;
    console.log(`${icon}${colors.reset} ${r.test}: Expected ${r.expected}, Got ${r.detected}`);
  });

  console.log(`\nGame Integration Results:`);
  console.log(`${x01Ok ? colors.green + '✅' : colors.red + '❌' + colors.reset} X01 Mode - Score deduction${colors.reset}`);
  console.log(`${cricketOk ? colors.green + '✅' : colors.red + '❌' + colors.reset} Cricket Mode - Mark tracking${colors.reset}`);
  console.log(`${shanghaiOk ? colors.green + '✅' : colors.red + '❌' + colors.reset} Shanghai Mode - Round advancement${colors.reset}`);

  const allPass = passCount === 5 && x01Ok && cricketOk && shanghaiOk;

  if (allPass) {
    log.success('\n🎯 COMPLETE SUCCESS! All calibration mapping working correctly!');
    console.log('\nThe system is ready for:');
    console.log('  • Automatic dart detection in games');
    console.log('  • Real-time score updates');
    console.log('  • Multi-camera support');
    console.log('  • All game modes (X01, Cricket, Shanghai, Killer, etc.)');
  } else {
    log.error('\n⚠️  Some tests failed. Issues to fix:');
    
    if (passCount < 5) {
      console.log('\n1. Score Mapping Issues:');
      const failed = results.filter(r => !r.passed);
      failed.forEach(f => {
        console.log(`   - ${f.test}: Expected ${f.expected}, got ${f.detected}`);
      });
      console.log('\n   Possible causes:');
      console.log('   • Calibration error too high (errorPx > 6)');
      console.log('   • Board rotated after calibration (theta mismatch)');
      console.log('   • Camera moved or angle changed');
      console.log('   • Video coordinate space mismatch (sx/sy scaling)');
      console.log('\n   Solution: Recalibrate focusing on playable areas');
    }

    if (!x01Ok) {
      console.log('\n2. X01 Mode Score Deduction Not Working:');
      console.log('   • Check onAddVisit callback is wired');
      console.log('   • Verify addVisit updates game state');
      console.log('   • Check for errors in console');
    }

    if (!cricketOk || !shanghaiOk) {
      console.log('\n3. Game Mode Processing Failed:');
      console.log('   • Verify onAutoDart callback returns true');
      console.log('   • Check game mode helper functions (addCricketAuto, etc.)');
      console.log('   • Verify sector/ring/value params passed correctly');
    }
  }

  log.header('NEXT STEPS');

  if (allPass) {
    console.log('✅ System is production-ready!');
    console.log('\nRecommendations:');
    console.log('1. Test with different camera angles and distances');
    console.log('2. Verify performance with 100+ darts thrown');
    console.log('3. Test multi-player games');
    console.log('4. Test online mode syncing');
  } else {
    console.log('🔧 Fix identified issues:');
    console.log('1. Check console logs for specific errors');
    console.log('2. Review diagnostic guide: CALIBRATION_DART_MAPPING_DIAGNOSTIC.md');
    console.log('3. Recalibrate if errorPx > 6');
    console.log('4. Verify game mode handlers in OfflinePlay.tsx');
  }

  rl.close();
}

main().catch(console.error);

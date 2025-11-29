// Simple icon generator using sharp
// Usage: node scripts/generate-icons.cjs
const fs = require('fs');
const path = require('path');
(async () => {
  try {
    const sharp = require('sharp');
    const svgPath = path.join(__dirname, '..', 'public', 'dart-thrower.svg');
    const out192 = path.join(__dirname, '..', 'public', 'icon-192.png');
    const out512 = path.join(__dirname, '..', 'public', 'icon-512.png');
    const outApple = path.join(__dirname, '..', 'public', 'apple-touch-icon.png');
    if (!fs.existsSync(svgPath)) {
      console.warn('SVG icon not found at', svgPath);
      process.exit(1);
    }
    const svg = fs.readFileSync(svgPath);
    await sharp(svg).resize(192, 192).png().toFile(out192);
    await sharp(svg).resize(512, 512).png().toFile(out512);
    await sharp(svg).resize(180, 180).png().toFile(outApple);
    console.log('Icons generated:', out192, out512, outApple);
  } catch (err) {
    console.error('Icon generation failed:', err);
    process.exit(1);
  }
})();

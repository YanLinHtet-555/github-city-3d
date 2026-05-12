#!/usr/bin/env node
// Bundles Three.js + app code into a single bundle.js that works from file://
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── Three.js ─────────────────────────────────────────────────────────────────
process.stdout.write('Processing Three.js... ');
let three = read('node_modules/three/build/three.module.js');

// Convert final  export { A, B, ... };  →  const THREE = { A, B, ... };
const expMatch = three.match(/export\s*\{([\s\S]+?)\}\s*;?\s*$/);
if (!expMatch) { console.error('\nCannot find Three.js exports'); process.exit(1); }

const names = expMatch[1]
  .split(',')
  .map(s => s.replace(/\s/g, ''))
  .filter(Boolean)
  .map(s => {
    const [local, pub] = s.split(/as/);
    return pub ? `${pub.trim()}:${local.trim()}` : local.trim();
  });

three = three.replace(/export\s*\{[\s\S]+?\}\s*;?\s*$/, '');
// Wrap Three.js in its own IIFE so its internals don't leak into the outer scope
three = `const THREE = (function () {\n${three}\nreturn {\n  ${names.join(',\n  ')}\n};\n})();\n`;
console.log('done');

// ── OrbitControls ─────────────────────────────────────────────────────────────
process.stdout.write('Processing OrbitControls... ');
let orbit = read('node_modules/three/examples/jsm/controls/OrbitControls.js');

// Remove the 'three' import — those names are already in scope from the Three.js block above
orbit = orbit.replace(/import\s*\{[^}]+\}\s*from\s*['"]three['"];?/s, '');
orbit = orbit.replace(/^export\s*\{[^}]+\}\s*;?\s*$/m, '');
// Wrap OrbitControls in its own IIFE too so its private vars don't clash with Three.js
orbit = `const OrbitControls = (function () {\n${orbit}\nreturn OrbitControls;\n})();\n`;
console.log('done');

// ── App files ─────────────────────────────────────────────────────────────────
const strip = code =>
  code
    .replace(/^import\s+.*?;[ \t]*\n?/gm, '')   // remove import lines
    .replace(/^export\s+(?=class|function|const|let|var)/gm, ''); // remove export keyword

process.stdout.write('Processing city.js... ');
const city = strip(read('js/city.js'));
console.log('done');

process.stdout.write('Processing vehicles.js... ');
const veh = strip(read('js/vehicles.js'));
console.log('done');

process.stdout.write('Processing main.js... ');
const main = strip(read('js/main.js'));
console.log('done');

// ── Write bundle ──────────────────────────────────────────────────────────────
const bundle = `/* Smart City 3D - bundled ${new Date().toISOString()} */
(function () {
'use strict';

// === THREE.JS ===
${three}

// === ORBIT CONTROLS ===
${orbit}

// === CITY BUILDER ===
${city}

// === VEHICLE SYSTEM ===
${veh}

// === MAIN ===
${main}

})();
`;

fs.writeFileSync(path.join(ROOT, 'bundle.js'), bundle);
const kb = (bundle.length / 1024).toFixed(0);
console.log(`\n✓  bundle.js  (${kb} KB)  —  open index.html in any browser`);

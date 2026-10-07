// Every build changes the worker cache when the shipped shell changes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const digest = crypto.createHash('sha256');
for (const file of ['dist/index.html', 'dist/main.js', 'dist/mobile.css']) digest.update(fs.readFileSync(file));
const version = digest.digest('hex').slice(0, 20);
const path = 'dist/sw.js';
fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/const CACHE = PREFIX \+ '[^']+';/, `const CACHE = PREFIX + '${version}';`));
console.log('Offline shell version:', version);

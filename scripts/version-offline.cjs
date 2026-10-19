// Every build changes the worker cache when the shipped shell changes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const digest = crypto.createHash('sha256');
for (const file of ['dist/app-loader.js', 'dist/main.css', 'dist/fonts/lato-300.woff', 'dist/fonts/lato-400.woff', 'dist/fonts/lato-700.woff', 'dist/index.html', 'dist/main.js', 'dist/mobile.css', 'dist/auth.css', 'dist/password-reset.css', 'dist/password-reset.js', 'dist/reset-password.html', 'dist/fonts/inter-400.woff', 'dist/fonts/inter-500.woff', 'dist/fonts/inter-600.woff', 'dist/push-worker.js']) digest.update(fs.readFileSync(file));
const version = digest.digest('hex').slice(0, 20);
const path = 'dist/sw.js';
fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/const CACHE = PREFIX \+ '[^']+';/, `const CACHE = PREFIX + '${version}';`));
console.log('Offline shell version:', version);

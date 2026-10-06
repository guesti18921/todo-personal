// Reproducible Android scaffold: native templates come from the locked CLI.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
function cap(...args) { execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' }); }
if (!fs.existsSync(path.join(root, 'android'))) cap('add', 'android');
else cap('sync', 'android');
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"')
    .replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@drawable/todo_icon"')
    .replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@drawable/todo_icon"');
fs.writeFileSync(manifestPath, manifest);
const drawable = path.join(root, 'android/app/src/main/res/drawable');
fs.mkdirSync(drawable, { recursive: true });
fs.writeFileSync(path.join(drawable, 'todo_icon.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#c38d9e" android:pathData="M0,0h108v108h-108z"/>
    <path android:fillColor="#f7f3ee" android:pathData="M28,24h52v60h-52z"/>
    <path android:fillColor="#367f75" android:pathData="M35,37h8v8h-8zM49,39h23v4h-23zM35,51h8v8h-8zM49,53h23v4h-23zM35,65h8v8h-8zM49,67h23v4h-23z"/>
</vector>`);
console.log('Android project ready: packaged web assets and app icon.');

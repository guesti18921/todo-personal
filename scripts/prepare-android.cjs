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
    .replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@drawable/todo_icon"')
    .replace(/android:(icon|roundIcon)="@drawable\/todo_icon"/g, 'android:$1="@mipmap/todo_launcher"')
    .replace('android:theme="@style/AppTheme.NoActionBarLaunch"', 'android:theme="@style/TodoLaunchTheme"');
// Android 12+ OEM device transfers can ignore allowBackup alone.
// Exclude local notebooks, auth sessions and reminder state from both transports.
manifest = manifest.replace(/\s+android:(fullBackupContent|dataExtractionRules|usesCleartextTraffic)="[^"]*"/g, '');
manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="false"\n        android:fullBackupContent="@xml/backup_rules"\n        android:dataExtractionRules="@xml/data_extraction_rules"');
const backupXml = path.join(root, 'android/app/src/main/res/xml');
fs.mkdirSync(backupXml, { recursive: true });
for (const name of ['backup_rules.xml', 'data_extraction_rules.xml', 'file_paths.xml']) {
    fs.copyFileSync(path.join(root, 'native/android', name), path.join(backupXml, name));
}
if (!manifest.includes('android:scheme="todopersonal"')) {
    manifest = manifest.replace('</activity>', `    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="todopersonal" android:host="auth-callback" />
            </intent-filter>
        </activity>`);
}
if (!manifest.includes('com.m1strell.todopersonal.ReminderClockReceiver')) {
    manifest = manifest.replace('</application>', `    <receiver android:name="com.m1strell.todopersonal.ReminderClockReceiver" android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
                <action android:name="android.intent.action.TIME_SET" />
            </intent-filter>
        </receiver>
    </application>`);
}
fs.writeFileSync(manifestPath, manifest);
const nativeSource = path.join(root, 'android/app/src/main/java/com/m1strell/todopersonal');
fs.mkdirSync(nativeSource, { recursive: true });
for (const name of ['BackupFilesPlugin.java', 'ReminderClock.java', 'ReminderClockReceiver.java', 'MainActivity.java', 'LocalDataResetPlugin.java', 'TimePickerPlugin.java', 'DatePickerPlugin.java']) {
    fs.copyFileSync(path.join(root, 'native/android', name), path.join(nativeSource, name));
}
fs.copyFileSync(path.join(root, 'native/android/time_picker_theme.xml'), path.join(root, 'android/app/src/main/res/values/time_picker_theme.xml'));
const gradlePath = path.join(root, 'android/app/build.gradle');
const gradle = fs.readFileSync(gradlePath, 'utf8')
    .replace(/versionCode \d+/, 'versionCode 50')
    .replace(/versionName "[^"]+"/, 'versionName "0.4.46"');
fs.writeFileSync(gradlePath, gradle);
const drawable = path.join(root, 'android/app/src/main/res/drawable');
fs.mkdirSync(drawable, { recursive: true });
// Fixed resources survive every Capacitor sync, including launchers and splash.
fs.cpSync(path.join(root, 'native/android/branding/res'), path.join(root, 'android/app/src/main/res'), { recursive: true });
fs.writeFileSync(path.join(drawable, 'notification_icon.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#ffffff" android:pathData="M10.5,4H13L7,20H4.5ZM17.5,4H20L14,20H11.5Z" android:fillType="evenOdd"/>
</vector>`);
console.log('Android project ready: packaged web assets and app icon.');

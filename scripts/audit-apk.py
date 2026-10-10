"""Read-only release audit of the actual APK manifest and packaged files."""
import json, pathlib, sys, zipfile
from apk_manifest import decode
apk = pathlib.Path(sys.argv[1])
version = sys.argv[2] if len(sys.argv) > 2 else '0.4.19'
code = sys.argv[3] if len(sys.argv) > 3 else '23'
with zipfile.ZipFile(apk) as z:
 assert z.testzip() is None
 manifest = decode(z.read('AndroidManifest.xml'))
 assert manifest.get('package') == 'com.m1strell.todopersonal'
 assert manifest.get('versionName') == version and manifest.get('versionCode') == code
 app = manifest.find('application')
 assert app.get('debuggable', 'false') == 'false'
 assert app.get('allowBackup') == 'false' and app.get('usesCleartextTraffic') == 'false'
 assert app.get('fullBackupContent') and app.get('dataExtractionRules')
 permissions = {x.get('name') for x in manifest.findall('uses-permission')}
 expected = {'android.permission.INTERNET', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.WAKE_LOCK', 'android.permission.POST_NOTIFICATIONS', 'android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.ACCESS_NETWORK_STATE', 'com.m1strell.todopersonal.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'}
 assert permissions == expected, 'Permission changes require explicit review'
 for component in app:
  if component.get('exported') == 'true':
   assert component.get('name') == 'com.m1strell.todopersonal.MainActivity' or component.get('permission') == 'android.permission.DUMP', 'Unprotected exported component'
 activity = app.find('activity')
 assert any(x.get('scheme') == 'todopersonal' and x.get('host') == 'auth-callback' for x in activity.iter('data'))
 xml = [decode(z.read(n)) for n in z.namelist() if n.startswith('res/') and n.endswith('.xml')]
 domains = {'root', 'file', 'database', 'sharedpref', 'external'}
 backup = next(x for x in xml if x.tag == 'full-backup-content')
 assert domains.issubset({x.get('domain') for x in backup.findall('exclude') if x.get('path') == '.'})
 extraction = next(x for x in xml if x.tag == 'data-extraction-rules')
 for scope in ['cloud-backup', 'device-transfer']:
  assert domains.issubset({x.get('domain') for x in extraction.find(scope).findall('exclude') if x.get('path') == '.'})
 config = json.loads(z.read('assets/capacitor.config.json'))['android']
 assert config['webContentsDebuggingEnabled'] is False and config['allowMixedContent'] is False and config['loggingBehavior'] == 'none'
 assert not any(n.lower().endswith(('.p12', '.jks', '.keystore', '.env')) for n in z.namelist())
 bundle = z.read('assets/public/main.js')
 assert version.encode() in bundle and b'SUPABASE_SERVICE_ROLE_KEY' not in bundle
 if version == '0.4.19': assert b'sourceMappingURL=data:' not in bundle
 assert b'NetworkPlugin' in b''.join(z.read(n) for n in z.namelist() if n.endswith('.dex'))
print('APK static audit passed:', version, 'release manifest, backup exclusions, TLS, permissions, exported components and assets.')
print('Permissions:', ', '.join(sorted(permissions)))

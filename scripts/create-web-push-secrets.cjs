// Run once locally. Private values are never printed or added to the repository.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const webpush = require('web-push');
const folder = path.resolve(process.argv[2] || 'private-web-push-config');
fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
const envFile = path.join(folder, 'web-push.env');
if (fs.existsSync(envFile)) throw Error('Configuration already exists; refusing to rotate the key');
const keys = webpush.generateVAPIDKeys();
const cron = crypto.randomBytes(32).toString('hex');
fs.writeFileSync(envFile, `WEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_CRON_SECRET=${cron}\nWEB_PUSH_ENABLED=false\n`, { mode: 0o600, flag: 'wx' });
const sql = `create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('https://ihvwqqvndmwtislvgamd.supabase.co', 'todo_web_push_project_url');
select vault.create_secret('${cron}', 'todo_web_push_cron_secret');
select cron.schedule('todo-web-push-reminders', '* * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='todo_web_push_project_url') || '/functions/v1/push-dispatch',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='todo_web_push_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$job$);
`;
fs.writeFileSync(path.join(folder, 'cron.sql'), sql, { mode: 0o600, flag: 'wx' });
console.log('Private configuration saved in:', folder);
console.log('Public VAPID key:', keys.publicKey);

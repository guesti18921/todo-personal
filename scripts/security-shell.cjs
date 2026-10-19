const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
for(const file of fs.readdirSync('dist').filter(name=>name.endsWith('.html'))){
 const target=path.join('dist',file);let html=fs.readFileSync(target,'utf8').replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/g,'');
 const hashes=[];for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(match[1])&&match[2].trim())hashes.push("'sha256-"+crypto.createHash('sha256').update(match[2]).digest('base64')+"'");
 const policy=["default-src 'self'","base-uri 'none'","object-src 'none'","frame-src 'none'","form-action 'self'","script-src 'self' "+hashes.join(' '),"style-src 'self' 'unsafe-inline'","font-src 'self'","img-src 'self' data: blob:","connect-src 'self' https://ihvwqqvndmwtislvgamd.supabase.co wss://ihvwqqvndmwtislvgamd.supabase.co","worker-src 'self'"].join('; ');
 html=html.replace(/<meta charset="[^"]+">/i,match=>match+'\n<meta http-equiv="Content-Security-Policy" content="'+policy+'">');fs.writeFileSync(target,html);
}

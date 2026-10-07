import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

// This file runs ONLY in Supabase Edge Functions, never in the APK/web bundle.
// notebooks.user_id references auth.users(id) ON DELETE CASCADE.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function reply(status, code) {
  return new Response(JSON.stringify({ code }), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, 'method_not_allowed');
  const authorization = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) return reply(401, 'authentication_required');
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return reply(415, 'json_required');
  }

  try {
    // A short, explicit body prevents accidental invocation and client-selected IDs.
    const text = await request.text();
    if (text.length > 256) return reply(400, 'invalid_confirmation');
    let body;
    try { body = JSON.parse(text); } catch (_) { return reply(400, 'invalid_confirmation'); }
    if (!body || body.confirm !== 'DELETE' || Object.keys(body).some(key => key !== 'confirm')) {
      return reply(400, 'invalid_confirmation');
    }
    const url = Deno.env.get('SUPABASE_URL');
    const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serverKey) return reply(503, 'service_unavailable');
    const server = createClient(url, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Verify with the Auth server, not untrusted JWT claims or a submitted user_id.
    const { data, error } = await server.auth.getUser(match[1]);
    if (error || !data?.user?.id) return reply(401, 'authentication_required');
    const result = await server.auth.admin.deleteUser(data.user.id, false);
    if (result.error) return reply(503, 'deletion_failed');
    return reply(200, 'account_deleted');
  } catch (_) {
    // Never return/log bearer tokens, emails, keys, or raw Auth error details.
    return reply(503, 'service_unavailable');
  }
});

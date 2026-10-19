import { parseAuthLink } from './authDeepLink.js';
// Authenticate separately before replacing the active session: pending local
// entries must never be assigned to another user, even if the email changed.
export async function renewAccountSession({ temporaryAuth, activeAuth, owner, currentOwner, email, password }) {
    const { data, error } = await temporaryAuth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!owner || currentOwner() !== owner || data?.user?.id !== owner || data?.session?.user?.id !== owner) throw new Error('account_mismatch');
    const result = await activeAuth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    if (result.error) throw result.error;
    if (currentOwner() !== owner || result.data?.session?.user?.id !== owner) throw new Error('account_mismatch');
}


export function reauthenticationMethods(user) {
    const providers = new Set([...(user?.app_metadata?.providers || []), ...(user?.identities || []).map(identity => identity.provider), user?.app_metadata?.provider].filter(value => typeof value === 'string'));
    return { google: providers.has('google'), password: providers.has('email') || !providers.has('google') };
}

// Validate the returned identity in an isolated client before touching the notebook session.
export async function renewAccountFromLink({ url, temporaryAuth, activeAuth, owner, currentOwner }) {
    const link = parseAuthLink(url);
    if (!link || link.error) throw new Error('invalid_callback');
    const result = link.session ? await temporaryAuth.setSession(link.session) : await temporaryAuth.exchangeCodeForSession(link.code, link.flowId ? { flowId: link.flowId } : undefined);
    if (result.error) throw result.error;
    const verified = await temporaryAuth.getUser();
    if (verified.error) throw verified.error;
    if (!owner || currentOwner() !== owner || verified.data?.user?.id !== owner || result.data?.session?.user?.id !== owner) throw new Error('account_mismatch');
    const session = result.data.session;
    const installed = await activeAuth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (installed.error) throw installed.error;
    if (currentOwner() !== owner || installed.data?.session?.user?.id !== owner) throw new Error('account_mismatch');
}

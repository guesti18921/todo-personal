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

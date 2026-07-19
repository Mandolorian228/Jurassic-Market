/**
 * Supabase client bootstrap.
 * Depends on: config.js, CDN @supabase/supabase-js
 */
(function () {
  let client = null;

  function getClient() {
    if (client) return client;
    if (!window.AppConfig?.isOnlineConfigured()) return null;
    if (!window.supabase?.createClient) {
      console.warn('[JM] supabase-js не загружен');
      return null;
    }
    client = window.supabase.createClient(
      window.AppConfig.SUPABASE_URL,
      window.AppConfig.SUPABASE_ANON_KEY
    );
    return client;
  }

  function isOnlineReady() {
    return Boolean(getClient());
  }

  async function getSession() {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function signUp(email, password, displayName) {
    const sb = getClient();
    if (!sb) throw new Error('Онлайн не настроен (см. js/config.js)');
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
      },
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user, displayName);
    }
    return data;
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) throw new Error('Онлайн не настроен (см. js/config.js)');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await upsertProfile(data.user);
    return data;
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }

  async function upsertProfile(user, displayName) {
    const sb = getClient();
    if (!sb || !user) return null;
    const name =
      displayName ||
      user.user_metadata?.display_name ||
      user.email?.split('@')[0] ||
      'Игрок';
    const colors = window.Game?.PLAYER_COLORS || ['#e63946', '#457b9d', '#f4a261', '#2a9d8f'];
    const color = colors[Math.abs(hashStr(user.id)) % colors.length];
    const { data, error } = await sb.from('profiles').upsert(
      {
        id: user.id,
        display_name: name,
        avatar_color: color,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    ).select().maybeSingle();
    if (error) console.warn('[JM] profile upsert', error.message);
    return data;
  }

  async function getProfile(userId) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  function onAuthStateChange(callback) {
    const sb = getClient();
    if (!sb) return { data: { subscription: { unsubscribe() {} } } };
    return sb.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  window.JMAuth = {
    getClient,
    isOnlineReady,
    getSession,
    getUser,
    signUp,
    signIn,
    signOut,
    upsertProfile,
    getProfile,
    onAuthStateChange,
  };
})();

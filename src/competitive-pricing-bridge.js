import { supabase } from './supabase.js';

// The existing competitive-pricing function still handles rule persistence and
// price mutations. Preview reads are redirected to the public GameBoost
// marketplace reader, which uses the same Inertia items payload discovered from
// the real marketplace page.
const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

supabase.functions.invoke = async (functionName, options = {}) => {
  const body = options?.body || {};
  const action = body?.action || body?.operation;
  if (functionName === 'competitive-pricing' && action === 'preview') {
    return originalInvoke('gameboost-competitors', {
      ...options,
      body: { ...body, operation: 'preview' },
    });
  }
  return originalInvoke(functionName, options);
};

window.GameBoostCompetitors = {
  async search({ game, search, locale = 'id', page = 1, sort = 'price' }) {
    const { data: { session } = {} } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sesi login tidak ditemukan.');
    const { data, error } = await originalInvoke('gameboost-competitors', {
      body: { operation: 'search', game, search, locale, page, sort },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

import { supabase } from './supabase.js';

// Pricing-rule persistence remains on the existing function. Public competitor
// search is separated from Supabase user authentication because the source is
// GameBoost's public marketplace/Inertia response.
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
    const { data, error } = await originalInvoke('gameboost-competitors', {
      body: { operation: 'search', game, search, locale, page, sort },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

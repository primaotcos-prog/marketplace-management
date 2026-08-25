// Server-side GameBoost adapter contract.
// This browser file intentionally contains no GameBoost credentials.
// Actual API calls will be implemented in a Supabase Edge Function.

export const GAMEBOOST_OPERATIONS = Object.freeze([
  'health',
  'offers',
  'orders',
  'inventory',
  'delivery'
]);

export function isGameBoostOperation(value) {
  return GAMEBOOST_OPERATIONS.includes(value);
}

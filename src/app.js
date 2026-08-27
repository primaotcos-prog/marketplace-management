import { supabase } from "./supabase.js";
import { loadCompetitivePreview, savePricingRule, getPricingHistory, renderCompetitorPreview } from "./pricing.js";

// Existing application entrypoint is intentionally preserved here by the deployed build.
// Pricing module exports above are consumed by the listing pricing screen.
export { loadCompetitivePreview, savePricingRule, getPricingHistory, renderCompetitorPreview };

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Credentials and the real GameBoost base URL will be configured as
  // Supabase secrets after the API contract is confirmed. Never expose them
  // to the browser or commit them to GitHub.
  const gameboostApiKey = Deno.env.get("GAMEBOOST_API_KEY");
  const gameboostBaseUrl = Deno.env.get("GAMEBOOST_BASE_URL");

  if (!gameboostApiKey || !gameboostBaseUrl) {
    return new Response(JSON.stringify({
      ok: false,
      configured: false,
      message: "GameBoost API secrets are not configured yet.",
    }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { operation?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is handled below.
  }

  const allowed = new Set(["health", "offers", "orders", "inventory", "delivery"]);
  if (!body.operation || !allowed.has(body.operation)) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Invalid operation",
      allowed: [...allowed],
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Deliberately stop here until the exact GameBoost endpoint/auth contract
  // is wired from the previously verified API integration.
  return new Response(JSON.stringify({
    ok: false,
    configured: true,
    operation: body.operation,
    message: "GameBoost adapter is ready; endpoint mapping is the next step.",
  }), {
    status: 501,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

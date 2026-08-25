import { onRequestGet, onRequestPost } from "./functions/webhooks/gameboost.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Keep the dashboard/static site working while explicitly routing
    // the GameBoost webhook through the real webhook handler.
    if (url.pathname === "/webhooks/gameboost" || url.pathname === "/webhooks/gameboost/test") {
      if (request.method === "GET") return onRequestGet({ request, env, ctx });
      if (request.method === "POST") return onRequestPost({ request, env, ctx });
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, POST" },
      });
    }

    // Cloudflare Pages/Workers static-assets binding.
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Static assets binding is not configured.", { status: 500 });
  },
};

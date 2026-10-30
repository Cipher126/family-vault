import { currentUser } from "./lib/auth";
import { HttpError, json } from "./lib/http";
import { securityHeaders } from "./lib/security";
import { api } from "./routes/api";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" } });
      if (url.pathname.startsWith("/api/")) {
        const user = await currentUser(request, env);
        return securityHeaders(await api({ request, env, url, user }), env);
      }
      return securityHeaders(await env.ASSETS.fetch(request), env);
    } catch (error) {
      if (error instanceof HttpError) return securityHeaders(json({ error: error.message }, { status: error.status }), env);
      console.error("Unhandled request error", error);
      return securityHeaders(json({ error: "Something went wrong. Please try again." }, { status: 500 }), env);
    }
  }
} satisfies ExportedHandler<Env>;

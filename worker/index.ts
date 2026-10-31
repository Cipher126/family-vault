import { currentUser } from "./lib/auth";
import { HttpError, json } from "./lib/http";
import { securityHeaders } from "./lib/security";
import { api, serveAuthenticatedPhoto } from "./routes/api";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" } });
      if (url.pathname.startsWith("/api/")) {
        const media=url.pathname.match(/^\/api\/photos\/([^/]+)\/(small|thumbnail|gallery|viewer|original)$/);
        if(request.method==="GET" && media) return securityHeaders(await serveAuthenticatedPhoto(request,env,media[1],media[2]),env);
        const user = await currentUser(request, env);
        return securityHeaders(await api({ request, env, url, user }), env);
      }
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      if (asset.status === 200 && url.pathname.startsWith("/assets/") && /\.(js|css|woff2)$/.test(url.pathname)) headers.set("Cache-Control","public, max-age=31536000, immutable");
      else if ((headers.get("Content-Type") || "").includes("text/html")) headers.set("Cache-Control","no-cache");
      return securityHeaders(new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers}), env);
    } catch (error) {
      if (error instanceof HttpError) return securityHeaders(json({ error: error.message }, { status: error.status }), env);
      console.error("Unhandled request error", error);
      return securityHeaders(json({ error: "Something went wrong. Please try again." }, { status: 500 }), env);
    }
  }
} satisfies ExportedHandler<Env>;

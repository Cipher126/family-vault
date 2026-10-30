export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string;
  SESSION_TTL_DAYS: string;
  BOOTSTRAP_ADMIN_TOKEN?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
}

export interface RequestContext {
  request: Request;
  env: Env;
  url: URL;
  user: AuthUser | null;
}

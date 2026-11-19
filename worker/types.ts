export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string;
  SESSION_TTL_DAYS: string;
  BOOTSTRAP_ADMIN_TOKEN?: string;
  ADMIN_UPLOAD_EMAIL?: string;
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  PUBLIC_APP_URL?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
}

export interface RequestContext {
  execution?: ExecutionContext;
  request: Request;
  env: Env;
  url: URL;
  user: AuthUser | null;
}

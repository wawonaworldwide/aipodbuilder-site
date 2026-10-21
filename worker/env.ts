import type {
  D1Database,
  R2Bucket,
  RateLimit,
} from '@cloudflare/workers-types';
export interface Env {
  DEPLOY_ENV?: 'local' | 'preview' | 'production';
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  DOWNLOADS: R2Bucket;
  RATE_LIMITER: RateLimit;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DOWNLOAD_TOKEN_SECRET?: string;
  DOWNLOAD_TTL_HOURS?: string;
  DOWNLOAD_MAX_USES?: string;
  SHOW_DRAFTS?: string;
  MAIL_PROVIDER?: 'log' | 'resend';
  MAIL_FROM?: string;
  SUPPORT_EMAIL?: string;
  RESEND_API_KEY?: string;
  KIT_OWNER_TAGS?: string;
  STORE_MODE: 'off' | 'test' | 'live';
  PUBLIC_SITE_URL: string;
  LOCAL_DEV?: string;
  TURNSTILE_MODE?: 'verify' | 'mock';
  TURNSTILE_SECRET_KEY?: string;
  EMAIL_PROVIDER: 'log' | 'd1' | 'kit';
  KIT_API_KEY?: string;
  KIT_FORM_ID?: string;
  KIT_SIGNUP_FORM_ID?: string;
  KIT_UPDATES_FORM_ID?: string;
  KIT_TAG_WEEKLY_NICHES?: string;
  KIT_TAG_APP_UPDATES?: string;
  KIT_TAG_LAUNCH_COUPONS?: string;
}

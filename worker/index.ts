import { checkout } from './stripe/checkout';
import { webhook } from './stripe/webhook';
import { orderStatus } from './stripe/status';
import { download } from './download/serve';
import { resend } from './download/resend';
import { ownerOptIn } from './email/owners';
import { maintenance } from './maintenance';
import { localRequest } from './security/turnstile';
import { reply, privateHeaders } from './security/store';
import type { Env } from './env';
import { subscribe } from './subscribe';
import { secureResponse } from './security/headers';
import { isPublicFeed, discoveryType } from './discovery';
const router = {
  async fetch(
    request: Request,
    env: Env,
    context?: { waitUntil(task: Promise<unknown>): void },
  ): Promise<Response> {
    const url = new URL(request.url);
    if (
      env.DEPLOY_ENV === 'production' &&
      url.hostname === 'www.aipodbuilder.com'
    ) {
      url.hostname = 'aipodbuilder.com';
      url.protocol = 'https:';
      return new Response(null, {
        status: 308,
        headers: { Location: url.href },
      });
    }
    const path = url.pathname;
    if (
      env.STORE_MODE === 'off' &&
      (/^\/api\/(?:stripe\/webhook|order-status|resend-download|order-updates)$/.test(
        path,
      ) ||
        (path.startsWith('/download/') && path !== '/download/expired/'))
    ) {
      return reply({ message: 'App downloads are not available yet.' }, 404);
    }
    if (path === '/api/subscribe') return subscribe(request, env);
    if (path === '/api/checkout') {
      const result = await checkout(request, env);
      if (
        result.status >= 400 &&
        request.headers.get('Accept')?.includes('text/html')
      ) {
        const body = (await result.json()) as { message: string };
        const safe = body.message.replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[c]!,
        );
        return new Response(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Test checkout | AI POD Builder</title><body><main><h1>Checkout needs a moment.</h1><p>${safe}</p><a href="/apps/">Back to the apps</a></main></body></html>`,
          {
            status: result.status,
            headers: {
              ...privateHeaders,
              'Content-Type': 'text/html; charset=utf-8',
            },
          },
        );
      }
      return result;
    }
    if (path === '/api/stripe/webhook')
      return webhook(request, env, undefined, undefined, context);
    if (path === '/api/order-status') return orderStatus(request, env);
    if (path === '/api/resend-download') return resend(request, env);
    if (path === '/api/order-updates') return ownerOptIn(request, env);
    if (path === '/api/_local/maintenance') {
      if (
        request.method !== 'POST' ||
        !localRequest(request, env) ||
        !env.DOWNLOAD_TOKEN_SECRET ||
        request.headers.get('x-local-maintenance') !== env.DOWNLOAD_TOKEN_SECRET
      )
        return reply({ message: 'Unavailable.' }, 404);
      await maintenance(env);
      return reply({ ok: true });
    }
    if (path === '/download/expired/' || path === '/download/expired') {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      for (const [key, value] of Object.entries(privateHeaders))
        response.headers.set(key, value);
      return response;
    }
    if (path.startsWith('/download/')) return download(request, env);
    if (/^\/(api|download)(\/|$)/.test(path) && !isPublicFeed(path))
      return new Response('This feature arrives in a later build phase.', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      });
    const asset = await env.ASSETS.fetch(request);
    if (
      path === '/thanks' ||
      path.startsWith('/thanks/') ||
      path === '/newsletter/thanks/'
    ) {
      const response = new Response(asset.body, asset);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
    if (discoveryType(path) && asset.ok) {
      const response = new Response(asset.body, asset);
      response.headers.set('Content-Type', discoveryType(path)!);
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Cache-Control', 'public, max-age=300');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    }
    return asset;
  },
};

export default {
  async scheduled(_controller: unknown, env: Env) {
    if (env.STORE_MODE !== 'off') await maintenance(env);
  },
  async fetch(
    request: Request,
    env: Env,
    context?: { waitUntil(task: Promise<unknown>): void },
  ) {
    try {
      return await secureResponse(
        await router.fetch(request, env, context),
        env.DEPLOY_ENV === 'preview',
      );
    } catch {
      return secureResponse(
        new Response('Please try again in a moment.', {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        }),
        env.DEPLOY_ENV === 'preview',
      );
    }
  },
};

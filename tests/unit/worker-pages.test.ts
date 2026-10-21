import { expect, it } from 'vitest';
import worker from '../../worker/index';
import type { Env } from '../../worker/env';
const env = {
  ASSETS: {
    fetch: async () =>
      new Response('<h1>Delivery page preview</h1>', {
        headers: { 'Content-Type': 'text/html' },
      }),
  },
} as unknown as Env;
it('serves the thank-you layout with private-page headers', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/thanks/'),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
});
it('protects checkout methods and invalid download tokens', async () => {
  expect(
    (await worker.fetch(new Request('http://localhost/api/checkout'), env))
      .status,
  ).toBe(405);
  expect(
    (await worker.fetch(new Request('http://localhost/download/example'), env))
      .status,
  ).toBe(410);
});
it('passes public feeds to assets with CORS and cache headers while retaining API isolation', async () => {
  const feedEnv = {
    ASSETS: {
      fetch: async () =>
        new Response('{"count":0}', {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
    },
  } as unknown as Env;
  for (const path of [
    '/api/loops.json',
    '/api/loops/design-qa-loop.json',
    '/api/prompts.json',
    '/api/skills.json',
  ]) {
    const response = await worker.fetch(
      new Request('http://localhost' + path),
      feedEnv,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/json; charset=utf-8',
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toContain('max-age=300');
  }
  for (const path of [
    '/api/loops/admin',
    '/api/loops.json/extra',
    '/api/orders.json',
  ])
    expect(
      (await worker.fetch(new Request('http://localhost' + path), feedEnv))
        .status,
    ).toBe(503);
});
it('preserves a missing feed response instead of advertising an HTML 404 as JSON', async () => {
  const missing = {
    ASSETS: {
      fetch: async () =>
        new Response('Missing', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        }),
    },
  } as unknown as Env;
  const response = await worker.fetch(
    new Request('http://localhost/api/loops/missing.json'),
    missing,
  );
  expect(response.status).toBe(404);
  expect(response.headers.get('Content-Type')).toBe('text/html');
});

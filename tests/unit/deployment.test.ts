import { describe, it, expect } from 'vitest';
import {
  readDeploymentConfig,
  deploymentIssues,
  publicBuildSettings,
} from '../../scripts/deployment-config.mjs';
import worker from '../../worker/index';
import type { Env } from '../../worker/env';

describe('deployment boundaries', () => {
  it('keeps isolated test-mode environments and rejects unfinished account settings', () => {
    const config = readDeploymentConfig();
    for (const name of ['preview', 'production']) {
      const v = config.env[name].vars;
      expect(v.STORE_MODE).toBe('off');
      expect(v.LOCAL_DEV).toBe('false');
      expect(v.TURNSTILE_MODE).toBe('verify');
      expect(config.env[name].assets.run_worker_first).toBe(true);
      expect(config.env[name].build.command).toContain('check:deployment');
      // Exercise unfinished settings without depending on real account setup.
      config.env[name].d1_databases[0].database_id =
        '00000000-0000-0000-0000-000000000001';
      v.PUBLIC_TURNSTILE_SITE_KEY = '';
      expect(deploymentIssues(name, config)).toContain(
        'Replace the placeholder D1 database ID.',
      );
      expect(deploymentIssues(name, config)).toContain(
        'Set the real public Turnstile site key.',
      );
    }
    expect(config.env.preview.r2_buckets[0].bucket_name).not.toBe(
      config.env.production.r2_buckets[0]?.bucket_name,
    );
    expect(config.env.preview.ratelimits[0].namespace_id).not.toBe(
      config.env.production.ratelimits[0].namespace_id,
    );
  });
  it('passes public setup only after required placeholders are replaced, and rejects shared storage and live mode', () => {
    const config = readDeploymentConfig();
    const p = config.env.preview;
    p.d1_databases[0].database_id = '11111111-1111-4111-8111-111111111111';
    p.vars.PUBLIC_SITE_URL = 'https://preview.example.test';
    p.vars.PUBLIC_TURNSTILE_SITE_KEY = 'site-key-fixture';
    expect(deploymentIssues('preview', config)).toEqual([]);
    p.d1_databases[0].database_id =
      config.env.production.d1_databases[0].database_id;
    expect(deploymentIssues('preview', config)).toContain(
      'Preview and production must use separate storage.',
    );
    p.vars.STORE_MODE = 'live';
    expect(() => publicBuildSettings('preview', config)).toThrow('Phase 8');
  });
  it('keeps build inputs public and applies draft/indexing rules consistently', () => {
    const config = readDeploymentConfig();
    expect(publicBuildSettings('preview', config)).toMatchObject({
      SHOW_DRAFTS: 'true',
      PUBLIC_INDEXABLE: 'false',
      PUBLIC_DEPLOY_ENV: 'preview',
    });
    expect(publicBuildSettings('production', config)).toMatchObject({
      SHOW_DRAFTS: 'false',
      PUBLIC_INDEXABLE: 'true',
      PUBLIC_DEPLOY_ENV: 'production',
    });
    expect(Object.keys(publicBuildSettings('preview', config))).not.toContain(
      'STRIPE_SECRET_KEY',
    );
  });

  it('accepts the shared Kit form with checkout off and still requires buyer setup if checkout is enabled', () => {
    const config = readDeploymentConfig();
    const p = config.env.preview;
    expect(p.vars.EMAIL_PROVIDER).toBe('kit');
    expect(p.vars.KIT_SIGNUP_FORM_ID).toMatch(/^[1-9]\d*$/);
    expect(p.secrets.required).toContain('KIT_API_KEY');
    expect(deploymentIssues('preview', config)).toEqual([]);
    p.vars.STORE_MODE = 'test';
    expect(deploymentIssues('preview', config)).toContain(
      'Configure the owner tag mapping.',
    );
  });
  it('rejects incomplete shared-form/tag configuration and an undeclared Kit credential', () => {
    const config = readDeploymentConfig();
    const p = config.env.preview;
    p.vars.KIT_SIGNUP_FORM_ID = '';
    p.vars.KIT_TAG_APP_UPDATES = '';
    p.secrets.required = ['TURNSTILE_SECRET_KEY'];
    expect(deploymentIssues('preview', config)).toEqual(
      expect.arrayContaining([
        'Set KIT_SIGNUP_FORM_ID.',
        'Set KIT_TAG_APP_UPDATES.',
        'Declare KIT_API_KEY as a required secret.',
      ]),
    );
  });
  it('keeps the legacy two-form requirements when no shared form is configured', () => {
    const config = readDeploymentConfig();
    const p = config.env.preview;
    delete p.vars.KIT_SIGNUP_FORM_ID;
    expect(deploymentIssues('preview', config)).toEqual(
      expect.arrayContaining([
        'Set KIT_UPDATES_FORM_ID.',
        'Declare KIT_FORM_ID as a required secret.',
      ]),
    );
  });
  it('passes only provider status to builds and keeps D1 fallback copy available', () => {
    const config = readDeploymentConfig();
    expect(publicBuildSettings('preview', config).PUBLIC_EMAIL_PROVIDER).toBe(
      'kit',
    );
    expect(
      Object.keys(publicBuildSettings('preview', config)).some((key) =>
        key.includes('KIT_'),
      ),
    ).toBe(false);
    config.env.preview.vars.EMAIL_PROVIDER = 'd1';
    expect(publicBuildSettings('preview', config).PUBLIC_EMAIL_PROVIDER).toBe(
      'd1',
    );
  });

  it('redirects only the production www hostname and preserves path and query', async () => {
    const env = {
      DEPLOY_ENV: 'production',
      STORE_MODE: 'off',
      ASSETS: { fetch: async () => new Response('asset') },
    } as unknown as Env;
    const response = await worker.fetch(
      new Request('https://www.aipodbuilder.com/free/s01?source=welcome'),
      env,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(
      'https://aipodbuilder.com/free/s01?source=welcome',
    );
    const apex = await worker.fetch(
      new Request('https://aipodbuilder.com/'),
      env,
    );
    expect(apex.status).toBe(200);
    expect(apex.headers.get('X-Robots-Tag')).toBeNull();
  });
  it('keeps disabled store endpoints unavailable without storage or payment credentials', async () => {
    const env = {
      DEPLOY_ENV: 'production',
      STORE_MODE: 'off',
      ASSETS: { fetch: async () => new Response('asset') },
    } as unknown as Env;
    for (const path of [
      '/api/order-status',
      '/api/resend-download',
      '/api/order-updates',
      '/api/stripe/webhook',
      '/download/example',
    ]) {
      const response = await worker.fetch(
        new Request('https://aipodbuilder.com' + path),
        env,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('enforces preview noindex on assets, public APIs and errors while keeping private headers', async () => {
    const env = {
      DEPLOY_ENV: 'preview',
      ASSETS: { fetch: async () => new Response('fixture') },
    } as unknown as Env;
    for (const path of ['/', '/api/loops.json', '/thanks/']) {
      const response = await worker.fetch(
        new Request('https://preview.example.test' + path),
        env,
      );
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      if (path === '/thanks/')
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    env.ASSETS.fetch = async () => {
      throw Error('fixture');
    };
    const failed = await worker.fetch(
      new Request('https://preview.example.test/'),
      env,
    );
    expect(failed.status).toBe(503);
    expect(failed.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

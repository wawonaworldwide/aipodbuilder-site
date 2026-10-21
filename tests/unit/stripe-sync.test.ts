import { it, expect, vi } from 'vitest';
import { syncProducts } from '../../scripts/stripe/sync-products.mjs';
const product = {
  slug: 'ornament-bulk-creator',
  name: 'Ornament Bulk Creator',
  tagline: 'Fixture app',
  version: '1.0.0',
  price_cents: 2499,
  currency: 'usd',
  tax_code: 'txcd_10202000',
  launch_coupon: null,
};
it('test catalog sync is idempotent and creates no coupon when none is configured', async () => {
  let saved: Record<string, unknown> | undefined;
  const prices: Record<string, unknown>[] = [];
  const mutations: string[] = [];
  const run = vi.fn((args: string[]) => {
    expect(args.includes('--live')).toBe(false);
    expect(args.slice(-2)).toEqual(['--stripe-version', '2025-03-31.basil']);
    const [resource, operation] = args;
    if (resource === 'products' && operation === 'search')
      return JSON.stringify({ data: saved ? [saved] : [], has_more: false });
    if (resource === 'products' && operation === 'create') {
      mutations.push('product');
      saved = {
        id: 'prod_fixture',
        livemode: false,
        name: product.name,
        description: product.tagline,
        tax_code: product.tax_code,
        metadata: { slug: product.slug, version: product.version },
      };
      return JSON.stringify(saved);
    }
    if (resource === 'products' && operation === 'update') {
      mutations.push('update');
      saved!.default_price = args[args.indexOf('--default-price') + 1];
      return JSON.stringify(saved);
    }
    if (resource === 'prices' && operation === 'list')
      return JSON.stringify({ data: prices, has_more: false });
    if (resource === 'prices' && operation === 'create') {
      mutations.push('price');
      const price = {
        id: 'price_fixture',
        livemode: false,
        active: true,
        type: 'one_time',
        unit_amount: 2499,
        currency: 'usd',
        tax_behavior: 'exclusive',
      };
      prices.push(price);
      return JSON.stringify(price);
    }
    throw Error('Unexpected mutation');
  });
  const first = await syncProducts([product], run);
  const after = mutations.length;
  const second = await syncProducts([product], run);
  expect(second).toEqual(first);
  expect(mutations).toEqual(['product', 'price', 'update']);
  expect(mutations.length).toBe(after);
  expect(run.mock.calls.every(([args]) => !args[0].includes('coupon'))).toBe(
    true,
  );
});
it('stops on live-mode data or duplicate product matches', async () => {
  await expect(
    syncProducts([product], () =>
      JSON.stringify({ data: [{ livemode: true }], has_more: false }),
    ),
  ).rejects.toThrow();
  await expect(
    syncProducts([product], () =>
      JSON.stringify({ data: [{ id: 'one' }, { id: 'two' }], has_more: false }),
    ),
  ).rejects.toThrow();
});

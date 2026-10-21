import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import matter from '../frontmatter.mjs';
import { cli } from './cli.mjs';
export const catalog = () =>
  readdirSync('src/content/products')
    .filter((x) => x.endsWith('.md'))
    .map(
      (file) =>
        matter(readFileSync('src/content/products/' + file, 'utf8')).data,
    );
const identity = (value) =>
  createHash('sha256').update(value).digest('hex').slice(0, 24);
export async function syncProducts(products, run = cli) {
  const call = (args) => {
    const value = JSON.parse(
      run([...args, '--stripe-version', '2025-03-31.basil']),
    );
    if (value.livemode === true || value.data?.some((x) => x.livemode === true))
      throw Error('Test objects only.');
    return value;
  };
  const ids = {};
  for (const p of products) {
    if (
      !/^[a-z0-9-]+$/.test(p.slug) ||
      p.currency !== 'usd' ||
      !Number.isInteger(p.price_cents) ||
      p.tax_code !== 'txcd_10202000'
    )
      throw Error('Invalid catalog.');
    const match = call([
      'products',
      'search',
      '--query',
      `metadata['slug']:'${p.slug}'`,
      '--limit',
      '100',
    ]);
    if (match.has_more || match.data.length > 1)
      throw Error('Ambiguous test product.');
    let product = match.data[0];
    const fields = [
      '--name',
      p.name,
      '--description',
      p.tagline,
      '-d',
      'tax_code=' + p.tax_code,
      '-d',
      'metadata[slug]=' + p.slug,
      '-d',
      'metadata[version]=' + p.version,
    ];
    if (!product)
      product = call([
        'products',
        'create',
        ...fields,
        '--idempotency',
        'aipb-product-' + p.slug,
      ]);
    else if (
      product.name !== p.name ||
      product.description !== p.tagline ||
      product.tax_code !== p.tax_code ||
      product.metadata?.version !== p.version
    )
      product = call(['products', 'update', product.id, ...fields]);
    const prices = call([
      'prices',
      'list',
      '--product',
      product.id,
      '--limit',
      '100',
    ]);
    if (prices.has_more) throw Error('Too many prices to safely choose.');
    let price = prices.data.find(
      (x) =>
        x.active &&
        x.type === 'one_time' &&
        x.unit_amount === p.price_cents &&
        x.currency === 'usd' &&
        x.tax_behavior === 'exclusive',
    );
    if (!price)
      price = call([
        'prices',
        'create',
        '--product',
        product.id,
        '--unit-amount',
        String(p.price_cents),
        '--currency',
        'usd',
        '-d',
        'tax_behavior=exclusive',
        '--idempotency',
        `aipb-price-${product.id}-${p.price_cents}`,
      ]);
    const defaultId =
      typeof product.default_price === 'object'
        ? product.default_price?.id
        : product.default_price;
    if (defaultId !== price.id)
      call(['products', 'update', product.id, '--default-price', price.id]);
    ids[p.slug] = { product_id: product.id, price_id: price.id };
    if (p.launch_coupon) {
      const c = p.launch_coupon;
      const couponId = 'aipb-' + identity(p.slug + JSON.stringify(c));
      const coupons = call(['coupons', 'list', '--limit', '100']);
      if (coupons.has_more) throw Error('Too many coupons to safely choose.');
      let coupon = coupons.data.find((x) => x.id === couponId);
      if (!coupon)
        coupon = call([
          'coupons',
          'create',
          '--id',
          couponId,
          '--percent-off',
          String(c.percent_off),
          '--duration',
          'once',
          '--redeem-by',
          String(Math.floor(new Date(c.redeem_by).getTime() / 1000)),
          '--max-redemptions',
          String(c.max_redemptions),
          '-d',
          'applies_to[products][]=' + product.id,
          '-d',
          'metadata[slug]=' + p.slug,
          '--idempotency',
          couponId,
        ]);
      const promos = call([
        'promotion_codes',
        'list',
        '--code',
        c.code,
        '--limit',
        '100',
      ]);
      if (promos.has_more) throw Error('Ambiguous promotion code.');
      let promo = promos.data.find(
        (x) => x.active && x.coupon?.id === coupon.id,
      );
      if (!promo && promos.data.some((x) => x.active))
        throw Error('Promotion code belongs to another coupon.');
      if (!promo)
        promo = call([
          'promotion_codes',
          'create',
          '-d',
          'coupon=' + coupon.id,
          '--code',
          c.code,
          '--idempotency',
          'aipb-promo-' + couponId,
        ]);
      Object.assign(ids[p.slug], {
        coupon_id: coupon.id,
        promotion_code_id: promo.id,
      });
    }
  }
  return ids;
}
async function main() {
  if (
    process.argv.includes('--live') ||
    process.argv.some((x) => x.startsWith('--api-key'))
  )
    throw Error('Live mode is unavailable until Phase 8.');
  const products = catalog();
  console.log('TEST MODE plan:');
  for (const p of products)
    console.log(
      `${p.name}: ${(p.price_cents / 100).toFixed(2)} USD + tax, one-time, tax code ${p.tax_code}, exclusive tax; ${p.launch_coupon ? 'coupon configured' : 'no coupon'}.`,
    );
  if (!process.argv.includes('--apply')) {
    console.log('Dry run only. No Stripe request or account change.');
    return;
  }
  if (!process.stdin.isTTY)
    throw Error('Apply needs an interactive test-mode confirmation.');
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await prompt.question(
    'Type APPLY TEST to create or update these Stripe test objects: ',
  );
  prompt.close();
  if (answer !== 'APPLY TEST') throw Error('Apply canceled.');
  const ids = await syncProducts(products);
  writeFileSync(
    'stripe-ids.test.json.tmp',
    JSON.stringify(ids, null, 2) + '\n',
  );
  renameSync('stripe-ids.test.json.tmp', 'stripe-ids.test.json');
  console.log('Test catalog synced. Identifiers saved locally.');
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  main().catch(() => {
    console.error(
      'Test catalog sync stopped. Check CLI login, permissions and catalog uniqueness. No private values printed.',
    );
    process.exitCode = 1;
  });

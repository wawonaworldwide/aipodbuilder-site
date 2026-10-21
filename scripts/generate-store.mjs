import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import matter from './frontmatter.mjs';
export function products() {
  return readdirSync('src/content/products')
    .filter((x) => x.endsWith('.md'))
    .map(
      (file) =>
        matter(readFileSync('src/content/products/' + file, 'utf8')).data,
    );
}
const catalog = products().map(
  ({
    slug,
    name,
    tagline,
    version,
    r2_key,
    price_cents,
    currency,
    tax_code,
    status,
    launch_coupon,
  }) => ({
    slug,
    name,
    tagline,
    version,
    r2_key,
    price_cents,
    currency,
    tax_code,
    status,
    launch_coupon,
  }),
);
writeFileSync(
  'worker/products.json.tmp',
  JSON.stringify(catalog, null, 2) + '\n',
);
renameSync('worker/products.json.tmp', 'worker/products.json');
console.log('Local product catalog prepared. No Stripe request made.');

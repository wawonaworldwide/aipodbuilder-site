import products from '../products.json';
import ids from '../../stripe-ids.test.json';
import type { Env } from '../env';
export type Product = (typeof products)[number];
export type PriceIds = Record<
  string,
  {
    product_id: string;
    price_id: string;
    coupon_id?: string;
    promotion_code_id?: string;
  }
>;
export const priceIds = ids as PriceIds;
export const productFor = (slug: string) =>
  products.find((p) => p.slug === slug);
export function purchasable(product: Product, env: Env) {
  return (
    product.status === 'available' ||
    (product.status === 'draft' &&
      env.LOCAL_DEV === 'true' &&
      env.SHOW_DRAFTS === 'true')
  );
}

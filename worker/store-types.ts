export interface Order {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  slug: string;
  product_name: string;
  version: string;
  r2_key: string;
  email: string;
  amount_total: number;
  currency: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'failed' | 'disputed';
  paid_at: number | null;
  fulfilled_at: number | null;
  email_sent_at: number | null;
  created_at: number;
}
export interface TokenRow {
  token_hash: string;
  seed: string;
  order_id: string;
  expires_at: number;
  max_uses: number;
  uses: number;
  revoked: number;
  created_at: number;
}

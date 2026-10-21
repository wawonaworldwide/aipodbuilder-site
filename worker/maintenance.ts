import type { Env } from './env';
import { drainEvents } from './stripe/webhook';
import { flushOrderMail } from './mail';
import { applyOwner } from './email/owners';
import type { Order } from './store-types';
export async function maintenance(env: Env) {
  await drainEvents(env);
  const jobs = await env.DB.prepare(
    'SELECT DISTINCT order_id FROM mail_jobs WHERE sent_at IS NULL LIMIT 10',
  ).all<{ order_id: string }>();
  for (const job of jobs.results) await flushOrderMail(job.order_id, env);
  const owners = await env.DB.prepare(
    "SELECT o.* FROM owner_consents c JOIN orders o ON o.id=c.order_id WHERE c.applied_at IS NULL AND o.status='fulfilled' LIMIT 10",
  ).all<Order>();
  for (const order of owners.results)
    try {
      await applyOwner(order, env);
    } catch {
      /* Retry on next scheduled pass. */
    }
}

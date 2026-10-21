import type { Env } from '../env';
import type { Signup } from './types';
import { subscriberStatement } from './d1';
export async function saveLog(signup: Signup, env: Env) {
  if (env.LOCAL_DEV !== 'true')
    throw new Error('Local logging is unavailable.');
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.DB.batch([
    subscriberStatement(signup, env),
    env.DB.prepare(
      'INSERT INTO email_outbox(id,payload,created_at) VALUES (?,?,?)',
    ).bind(id, JSON.stringify({ id, ...signup, created_at }), created_at),
  ]);
}

import type { Env } from '../env';
import type { Signup } from './types';
export function subscriberStatement(signup: Signup, env: Env) {
  return env.DB.prepare(
    `INSERT INTO subscribers(email,first_name,source,tags,created_at) VALUES (?1,?2,?3,?4,?5)
  ON CONFLICT(email) DO UPDATE SET first_name=COALESCE(excluded.first_name, subscribers.first_name),source=excluded.source,
  tags=(SELECT json_group_array(value) FROM (SELECT value FROM json_each(subscribers.tags) UNION SELECT value FROM json_each(excluded.tags)))`,
  ).bind(
    signup.email,
    signup.first_name || null,
    signup.source,
    JSON.stringify(signup.tags),
    new Date().toISOString(),
  );
}
export async function saveD1(signup: Signup, env: Env) {
  await subscriberStatement(signup, env).run();
}

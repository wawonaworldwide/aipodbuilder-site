import type { Env } from '../env';
import type { Signup } from './types';
import { saveLog } from './log';
import { saveD1 } from './d1';
import { saveKit } from './kit';
export async function saveSignup(signup: Signup, env: Env) {
  if (env.EMAIL_PROVIDER === 'log') return saveLog(signup, env);
  if (env.EMAIL_PROVIDER === 'd1') return saveD1(signup, env);
  if (env.EMAIL_PROVIDER === 'kit') return saveKit(signup, env);
  throw new Error('Email provider unavailable.');
}

import { mkdirSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
export async function exportDelivery(db, directory = '.dev-outbox') {
  const { results } = await db
    .prepare(
      'SELECT id,payload FROM delivery_outbox ORDER BY created_at LIMIT 100',
    )
    .all();
  if (!results.length) return;
  mkdirSync(directory, { recursive: true });
  for (const row of results) {
    if (!/^[a-zA-Z0-9-]+$/.test(row.id))
      throw Error('Invalid outbox identifier.');
    const path = resolve(directory, row.id + '.json');
    if (!existsSync(path)) {
      writeFileSync(path + '.tmp', row.payload + '\n', { mode: 0o600 });
      renameSync(path + '.tmp', path);
    }
    await db
      .prepare('DELETE FROM delivery_outbox WHERE id=?')
      .bind(row.id)
      .run();
  }
  console.log('email saved to .dev-outbox');
}

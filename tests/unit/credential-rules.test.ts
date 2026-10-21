import { describe, it, expect } from 'vitest';
import { credentialFindings } from '../../scripts/credential-rules.mjs';
const stripeName = ['STRIPE', 'SECRET', 'KEY'].join('_');
const kitName = ['KIT', 'API', 'KEY'].join('_');
const downloadName = ['DOWNLOAD', 'TOKEN', 'SECRET'].join('_');
describe('credential scan rules', () => {
  it('detects every required key prefix at the specified length', () => {
    for (const prefix of [
      'sk_test_',
      'sk_live_',
      'rk_test_',
      'rk_live_',
      'whsec_',
    ]) {
      expect(credentialFindings(prefix + 'x'.repeat(16))).toContain(
        'credential pattern',
      );
      expect(credentialFindings(prefix + 'x'.repeat(15))).toEqual([]);
    }
    expect(credentialFindings('re_' + 'x'.repeat(20))).toContain(
      'credential pattern',
    );
  });
  it('rejects nonempty dotenv, object and JSON private-setting values', () => {
    for (const text of [
      stripeName + '=value',
      '"' + kitName + '":"value"',
      downloadName + ": 'value'",
    ])
      expect(credentialFindings(text).length).toBeGreaterThan(0);
  });
  it('allows empty templates, references and runtime generation', () => {
    for (const text of [
      stripeName + '=\n' + kitName + '=',
      stripeName + ': ""',
      'const key = env.' + stripeName + ';',
      downloadName + ': randomBytes(32)',
    ])
      expect(credentialFindings(text)).toEqual([]);
  });
});

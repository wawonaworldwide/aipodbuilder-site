import { describe, expect, it } from 'vitest';
import matter from '../../scripts/frontmatter.mjs';

describe('frontmatter migration', () => {
  it('preserves the body exactly, including CRLF, blank lines and trailing spaces', () => {
    const body = '\r\n## Prompt\r\n  <city> & "quotes"  \r\n\r\n---\r\n';
    const result = matter(
      '\uFEFF---\r\ntitle: Test\r\nprice: 2499\r\ndate: 2026-10-20\r\noptional: null\r\n---\r\n' +
        body,
    );
    expect(result.content).toBe(body);
    expect(result.data).toEqual({
      title: 'Test',
      price: 2499,
      date: '2026-10-20',
      optional: null,
    });
  });
  it('leaves documents without a metadata header unchanged', () => {
    const body = '# Title\n\n---\nText  \n';
    expect(matter(body)).toEqual({ data: {}, content: body });
  });
  it('refuses ambiguous, unsupported and incomplete metadata', () => {
    for (const source of [
      '---\ntitle: One\ntitle: Two\n---\n',
      '---\n- unexpected array\n---\n',
      '---\ntitle: !unknown value\n---\n',
      '---\ntitle: Unclosed\n',
      '---\njust a scalar\n---\n',
    ])
      expect(() => matter(source)).toThrow();
  });
});

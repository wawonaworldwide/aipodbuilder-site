import { parseDocument } from 'yaml';

// Keep Markdown bytes unchanged; schemas handle dates and other field coercions.
export default function matter(source) {
  const opening = /^(?:\uFEFF)?---[ \t]*\r?\n/.exec(source);
  if (!opening) return { data: {}, content: source };
  const rest = source.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) throw new Error('Frontmatter closing delimiter is missing.');
  const document = parseDocument(rest.slice(0, closing.index), {
    uniqueKeys: true,
  });
  if (document.errors.length || document.warnings.length)
    throw new Error('Frontmatter contains invalid or unsupported YAML.');
  const data = document.toJS({ maxAliasCount: 100 }) ?? {};
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('Frontmatter must be a mapping.');
  return { data, content: rest.slice(closing.index + closing[0].length) };
}

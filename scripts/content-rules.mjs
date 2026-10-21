import { createHash } from 'node:crypto';
export function privateBrandPresent(source) {
  return /mydesigns/i.test(source);
}
export function disallowedCopyPresent(copy) {
  return /\b(game-changer|insane|passive income|secret|in today's video)\b|\b(?:guaranteed|guarantee|promise[sd]?)\b[^.!?\n]{0,60}\b(?:income|earnings|profit)\b/i.test(
    copy,
  );
}
export function paletteIssues(css, canonical) {
  const palette = {
    ink: '#0f1b2d',
    navy: '#16263f',
    panel: '#1f3557',
    teal: '#2ec4b6',
    orange: '#ff9f1c',
    cream: '#fdf0d5',
    magenta: '#ef476f',
    lime: '#a7e05a',
    grey: '#8aa0b8',
  };
  const issues = [];
  for (const [name, hex] of Object.entries(palette)) {
    if (!new RegExp(`--${name}:\\s*${hex}\\s*;`, 'i').test(css))
      issues.push(`Palette token ${name} differs from the brief.`);
    if (
      canonical &&
      !new RegExp(`\\b${name}\\s*:\\s*['"]${hex}['"]`, 'i').test(canonical)
    )
      issues.push(`Studio palette ${name} needs review.`);
  }
  return issues;
}

const ownerDigests = [
  {
    length: 7,
    sha256: '10fe82adb964fa73c3c60be251181c421193f56ae01ba671974d82365a08a410',
  },
  {
    length: 8,
    sha256: '799dda30b3121bbf038937342a316ac4f470812793b70269732ffa3bb0a136d3',
  },
];
// Hashes avoid publishing the blocked names in the repository.
export function blockedDigestPresent(source, digests) {
  const words = new Set(source.toLowerCase().match(/[a-z]+/g) || []);
  for (const word of words)
    for (const { length, sha256 } of digests)
      for (let i = 0; i <= word.length - length; i++)
        if (
          createHash('sha256')
            .update(word.slice(i, i + length))
            .digest('hex') === sha256
        )
          return true;
  return false;
}
export function ownerNamePresent(source) {
  return blockedDigestPresent(source, ownerDigests);
}

export function pricePlacementIssue(path, source) {
  const route =
    '/' +
    path
      .replaceAll('\\', '/')
      .replace(/^\//, '')
      .replace(/index\.html$/, '');
  const allowed =
    /^\/apps(?:\/|\.md$)/.test(route) ||
    /^\/api\/products(?:\.json$|\/)/.test(route) ||
    /^\/(privacy|terms|refunds|license)(?:\/|\.md$)/.test(route);
  return (
    !allowed && /(?:\$|&#0*36;|&#x0*24;|&dollar;|\\u0024)\s*\d/i.test(source)
  );
}

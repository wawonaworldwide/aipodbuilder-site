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

export function ownerNamePresent(source) {
  return /site-owner|site-owner/i.test(source);
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

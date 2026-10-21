/** Preserve every character inside the prompt fence, excluding its framing newline. */
export function extractPrompt(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n');
  const match = normalized.match(
    /^## Prompt\s*\n+```(?:text|plaintext)?\n([\s\S]*?)\n```[ \t]*$/m,
  );
  if (!match)
    throw new Error('Prompt requires a fenced text block under ## Prompt.');
  return match[1];
}

/**
 * Normalize command output: strip ANSI, limit lines, trim.
 * Use on every exec result before returning to UI.
 */
export function cleanOutput(text: string): string {
  return text
    .replace(/\x1B\[[0-9;]*m/g, '') // strip ANSI
    .split('\n')
    .slice(0, 60)
    .join('\n')
    .trim();
}

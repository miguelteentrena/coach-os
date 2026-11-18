export function normEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.replace(/[\s​]+/g, '').toLowerCase();
  return /^[^@]+@[^@]+\.[^@]+$/.test(e) ? e : null;
}

/** Clave de nombre: sin tildes, minúsculas, espacios simples. NO corrige erratas. */
export function nameKey(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de Levenshtein, sólo para SUGERIR candidatos en revisión manual. */
export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

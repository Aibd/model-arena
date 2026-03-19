export function estimateTextTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkLength = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, '').length;

  return cjkCount + Math.ceil(nonCjkLength / 4);
}

export function formatTokenRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    return '0.0';
  }

  return rate.toFixed(1);
}

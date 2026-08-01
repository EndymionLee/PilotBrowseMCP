export interface Scope { allowedOrigins: string[]; }

export function buildScope(targetUrl: string, allowedOrigins?: string[]): Scope {
  const set = new Set<string>();
  try { set.add(new URL(targetUrl).origin); } catch {}
  for (const o of allowedOrigins ?? []) {
    try { set.add(new URL(o).origin); } catch {}
  }
  return { allowedOrigins: [...set] };
}

export function isAllowed(scope: Scope, url: string): boolean {
  try { return scope.allowedOrigins.includes(new URL(url).origin); }
  catch { return false; }
}

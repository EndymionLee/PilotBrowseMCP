const TRUNCATE_MARKER = '...[truncated]';

export function truncate(body: string, maxChars = 500): string {
  if (body.length <= maxChars) return body;
  const keep = Math.max(0, maxChars - TRUNCATE_MARKER.length);
  return body.slice(0, keep) + TRUNCATE_MARKER;
}

export function normalize(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

export function snippetAround(body: string, keyword: string, radius = 80): string {
  if (!keyword) return truncate(body, 200);
  const idx = body.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return truncate(body, 200);
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + keyword.length + radius);
  return (start > 0 ? '...' : '') + body.slice(start, end) + (end < body.length ? '...' : '');
}

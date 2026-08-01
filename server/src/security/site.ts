import path from 'node:path';

export function inferSite(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0] || null;
  } catch { return null; }
}

export function manualSecurityDir(site: string, manualBase = process.env.MANUALS_DIR || 'website-manuals'): string {
  return path.join(manualBase, site, 'security');
}

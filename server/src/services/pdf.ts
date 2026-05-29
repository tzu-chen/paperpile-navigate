import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fetchArxivPdf } from './arxiv';
import { DATA_DIR } from './paths';

const PDF_DIR = path.join(DATA_DIR, 'pdfs');
export const PROXY_CACHE_DIR = path.join(DATA_DIR, 'pdf-cache');
export const MAX_PROXY_CACHE_FILES = 50;

export function initializePdfStorage(): void {
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROXY_CACHE_DIR)) {
    fs.mkdirSync(PROXY_CACHE_DIR, { recursive: true });
  }
}

export function arxivIdToFilename(arxivId: string): string {
  return arxivId.replace(/\//g, '_') + '.pdf';
}

export function getRelativePdfPath(arxivId: string): string {
  return `pdfs/${arxivIdToFilename(arxivId)}`;
}

export function getAbsolutePdfPath(arxivId: string): string {
  return path.join(PDF_DIR, arxivIdToFilename(arxivId));
}

export function getProxyCachePath(arxivId: string): string {
  return path.join(PROXY_CACHE_DIR, arxivIdToFilename(arxivId));
}

export function resolveDbPdfPath(relativePath: string): string {
  return path.join(DATA_DIR, relativePath);
}

export function localPdfExists(arxivId: string): boolean {
  return fs.existsSync(getAbsolutePdfPath(arxivId));
}

/** Remove least-recently-accessed files when the proxy cache exceeds the limit. */
export function evictProxyCache(): void {
  try {
    const entries = fs.readdirSync(PROXY_CACHE_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(f => {
        const filePath = path.join(PROXY_CACHE_DIR, f);
        return { filePath, atime: fs.statSync(filePath).atimeMs };
      });

    if (entries.length <= MAX_PROXY_CACHE_FILES) return;

    entries.sort((a, b) => a.atime - b.atime);
    const toRemove = entries.slice(0, entries.length - MAX_PROXY_CACHE_FILES);
    for (const entry of toRemove) {
      fs.unlinkSync(entry.filePath);
    }
  } catch (err) {
    console.warn('Proxy cache eviction error:', err);
  }
}

export async function downloadAndStorePdf(arxivId: string): Promise<string | null> {
  initializePdfStorage();

  const absPath = getAbsolutePdfPath(arxivId);
  const relativePath = getRelativePdfPath(arxivId);

  if (fs.existsSync(absPath)) {
    return relativePath;
  }

  // If the proxy cache already has this PDF (e.g. it was just viewed),
  // promote it to permanent storage instead of re-hitting arxiv.
  const cachedPath = getProxyCachePath(arxivId);
  if (fs.existsSync(cachedPath)) {
    try {
      fs.renameSync(cachedPath, absPath);
      return relativePath;
    } catch {
      // Fall through to a fresh download if the rename fails for any reason.
    }
  }

  const response = await fetchArxivPdf(arxivId);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(absPath, Buffer.from(buffer));

  return relativePath;
}

export function deleteLocalPdf(relativePath: string): boolean {
  const absPath = resolveDbPdfPath(relativePath);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
    return true;
  }
  return false;
}

export function getLocalPdfPathForArxivId(arxivId: string): string | null {
  const absPath = getAbsolutePdfPath(arxivId);
  return fs.existsSync(absPath) ? absPath : null;
}

export async function storeUploadedPdf(buffer: Buffer): Promise<string> {
  initializePdfStorage();
  const uuid = crypto.randomUUID();
  const filename = `upload-${uuid}.pdf`;
  const absPath = path.join(PDF_DIR, filename);
  fs.writeFileSync(absPath, buffer);
  return `pdfs/${filename}`;
}

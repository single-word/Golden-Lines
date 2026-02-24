import JSZip from 'jszip';
import type { Chapter, QuoteItem, AppSettings } from './types';

// ─── Path Resolution ───────────────────────────────────────────
function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative.substring(1);
  const decoded = decodeURIComponent(relative);
  const baseParts = base.split('/');
  baseParts.pop();
  const relParts = decoded.split('/');
  for (const part of relParts) {
    if (part === '..') baseParts.pop();
    else if (part !== '.') baseParts.push(part);
  }
  return baseParts.join('/');
}

// ─── EPUB Parser ───────────────────────────────────────────────
export async function parseEpub(file: File): Promise<{ title: string; chapters: Chapter[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Read container.xml
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Invalid EPUB: missing container.xml');
  const containerXml = await containerFile.async('text');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
  const rootfileEl = containerDoc.getElementsByTagName('rootfile')[0];
  const opfPath = rootfileEl?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: cannot find OPF path');

  // 2. Read OPF
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error('Invalid EPUB: missing OPF file');
  const opfContent = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');

  // 3. Get book title
  let bookTitle = 'Unknown';
  const dcTitles = opfDoc.getElementsByTagName('dc:title');
  if (dcTitles.length > 0) {
    bookTitle = dcTitles[0].textContent?.trim() || bookTitle;
  } else {
    const titles = opfDoc.getElementsByTagName('title');
    for (let i = 0; i < titles.length; i++) {
      const t = titles[i].textContent?.trim();
      if (t) { bookTitle = t; break; }
    }
  }

  // 4. Build manifest map
  const manifestItems = new Map<string, { href: string; mediaType: string }>();
  const items = opfDoc.getElementsByTagName('item');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = item.getAttribute('id') || '';
    const href = item.getAttribute('href') || '';
    const mediaType = item.getAttribute('media-type') || '';
    manifestItems.set(id, { href, mediaType });
  }

  // 5. Get spine order
  const spineIds: string[] = [];
  const itemrefs = opfDoc.getElementsByTagName('itemref');
  for (let i = 0; i < itemrefs.length; i++) {
    const idref = itemrefs[i].getAttribute('idref');
    if (idref) spineIds.push(idref);
  }

  // 6. Try to parse TOC for chapter titles
  const tocMap = new Map<string, string>();
  // Try toc.ncx
  const tocEntry = Array.from(manifestItems.entries()).find(
    ([, v]) => v.mediaType === 'application/x-dtbncx+xml'
  );
  if (tocEntry) {
    const tocPath = resolvePath(opfPath, tocEntry[1].href);
    const tocFile = zip.file(tocPath);
    if (tocFile) {
      const tocContent = await tocFile.async('text');
      const tocDoc = new DOMParser().parseFromString(tocContent, 'text/xml');
      const navPoints = tocDoc.getElementsByTagName('navPoint');
      for (let i = 0; i < navPoints.length; i++) {
        const np = navPoints[i];
        const textEls = np.getElementsByTagName('text');
        const contentEls = np.getElementsByTagName('content');
        if (textEls.length > 0 && contentEls.length > 0) {
          const label = textEls[0].textContent?.trim() || '';
          const src = contentEls[0].getAttribute('src') || '';
          const href = src.split('#')[0];
          if (label && href) {
            tocMap.set(href, label);
          }
        }
      }
    }
  }

  // Also try nav.xhtml (EPUB 3)
  const navEntry = Array.from(manifestItems.entries()).find(
    ([, v]) => v.href.includes('nav') && v.mediaType.includes('html')
  );
  if (navEntry && tocMap.size === 0) {
    const navPath = resolvePath(opfPath, navEntry[1].href);
    const navFile = zip.file(navPath);
    if (navFile) {
      const navContent = await navFile.async('text');
      const navDoc = new DOMParser().parseFromString(navContent, 'text/html');
      const links = navDoc.querySelectorAll('nav a, [epub\\:type="toc"] a');
      links.forEach(a => {
        const href = (a.getAttribute('href') || '').split('#')[0];
        const label = a.textContent?.trim() || '';
        if (href && label) tocMap.set(href, label);
      });
    }
  }

  // 7. Parse each chapter
  const chapters: Chapter[] = [];
  for (const itemId of spineIds) {
    const item = manifestItems.get(itemId);
    if (!item) continue;
    if (!item.mediaType.includes('html') && !item.mediaType.includes('xml')) continue;

    const chapterPath = resolvePath(opfPath, item.href);
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;

    const content = await chapterFile.async('text');
    const doc = new DOMParser().parseFromString(content, 'text/html');

    // Extract paragraphs
    const paragraphs = extractParagraphs(doc);
    if (paragraphs.length === 0) continue;

    // Get chapter title
    let title = tocMap.get(item.href) || tocMap.get(decodeURIComponent(item.href)) || '';
    if (!title) {
      const headings = doc.querySelectorAll('h1, h2, h3, h4');
      for (let i = 0; i < headings.length; i++) {
        const t = headings[i].textContent?.trim();
        if (t) { title = t; break; }
      }
    }
    if (!title) {
      title = `章节 ${chapters.length + 1}`;
    }

    const wordCount = paragraphs.join('').replace(/\s/g, '').length;

    chapters.push({ title, paragraphs, wordCount });
  }

  return { title: bookTitle, chapters };
}

function extractParagraphs(doc: Document): string[] {
  const paragraphs: string[] = [];
  const pElements = doc.querySelectorAll('p');

  if (pElements.length > 0) {
    pElements.forEach(p => {
      const text = p.textContent?.trim();
      if (text && text.length > 0) {
        paragraphs.push(text);
      }
    });
  }

  // Fallback: try div elements
  if (paragraphs.length === 0) {
    const divs = doc.querySelectorAll('div');
    divs.forEach(div => {
      // Only leaf divs (no child divs)
      if (div.querySelector('div')) return;
      const text = div.textContent?.trim();
      if (text && text.length > 0) {
        paragraphs.push(text);
      }
    });
  }

  // Fallback: split body text by newlines
  if (paragraphs.length === 0) {
    const body = doc.body;
    if (body) {
      const text = body.textContent?.trim();
      if (text) {
        text.split(/\n+/).forEach(line => {
          const trimmed = line.trim();
          if (trimmed.length > 0) paragraphs.push(trimmed);
        });
      }
    }
  }

  return paragraphs;
}

// ─── Default Settings ──────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  paragraphSpacing: 1.2,
  startingId: 1,
  authors: [],
  autoScrollSpeed: 1,
  readMode: 'scroll',
};

// ─── ID Helpers ────────────────────────────────────────────────
export function formatId(num: number): string {
  return String(num).padStart(3, '0');
}

export function getNextId(quotes: QuoteItem[], startingId: number): string {
  if (quotes.length === 0) return formatId(startingId);
  const maxId = Math.max(...quotes.map(q => parseInt(q.id, 10)));
  return formatId(Math.max(maxId + 1, startingId));
}

// ─── Export ────────────────────────────────────────────────────
export function exportQuotes(quotes: QuoteItem[]): void {
  const exportData = quotes.map(q => ({
    id: q.id,
    text: q.text,
    author: q.author,
    source: q.source,
    tags: q.tags,
  }));
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quotes_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

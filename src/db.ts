// IndexedDB for large EPUB storage
import type { BookData, QuoteItem, AppSettings, ReadingProgress } from './types';

const DB_NAME = 'GoldenQuoteDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store for book metadata (title, tags, chapter titles - NOT content)
      if (!db.objectStoreNames.contains('bookMeta')) {
        db.createObjectStore('bookMeta', { keyPath: 'id' });
      }
      
      // Store for chapter content (each chapter stored separately)
      if (!db.objectStoreNames.contains('chapters')) {
        const chapterStore = db.createObjectStore('chapters', { keyPath: 'index' });
        chapterStore.createIndex('bookId', 'bookId', { unique: false });
      }
      
      // Store for quotes
      if (!db.objectStoreNames.contains('quotes')) {
        db.createObjectStore('quotes', { keyPath: 'id' });
      }
      
      // Store for settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      
      // Store for progress
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'id' });
      }
    };
  });
  
  return dbPromise;
}

// ─── Book Storage ──────────────────────────────────────────────

export interface BookMeta {
  id: string;
  title: string;
  tags: string[];
  chapterCount: number;
  chapterMeta: { title: string; wordCount: number }[];
}

export interface StoredChapter {
  index: number;
  bookId: string;
  title: string;
  paragraphs: string[];
  wordCount: number;
}

export async function saveBookToDB(book: BookData): Promise<void> {
  const db = await openDB();
  
  // Save meta
  const meta: BookMeta = {
    id: 'current',
    title: book.title,
    tags: book.tags,
    chapterCount: book.chapters.length,
    chapterMeta: book.chapters.map(c => ({ title: c.title, wordCount: c.wordCount })),
  };
  
  const metaTx = db.transaction('bookMeta', 'readwrite');
  metaTx.objectStore('bookMeta').put(meta);
  
  // Clear old chapters and save new ones
  const chapterTx = db.transaction('chapters', 'readwrite');
  const chapterStore = chapterTx.objectStore('chapters');
  chapterStore.clear();
  
  for (let i = 0; i < book.chapters.length; i++) {
    const chapter = book.chapters[i];
    const stored: StoredChapter = {
      index: i,
      bookId: 'current',
      title: chapter.title,
      paragraphs: chapter.paragraphs,
      wordCount: chapter.wordCount,
    };
    chapterStore.put(stored);
  }
  
  await Promise.all([
    new Promise((resolve, reject) => {
      metaTx.oncomplete = resolve;
      metaTx.onerror = () => reject(metaTx.error);
    }),
    new Promise((resolve, reject) => {
      chapterTx.oncomplete = resolve;
      chapterTx.onerror = () => reject(chapterTx.error);
    }),
  ]);
}

export async function loadBookMeta(): Promise<BookMeta | null> {
  const db = await openDB();
  const tx = db.transaction('bookMeta', 'readonly');
  const request = tx.objectStore('bookMeta').get('current');
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function loadChapter(index: number): Promise<StoredChapter | null> {
  const db = await openDB();
  const tx = db.transaction('chapters', 'readonly');
  const request = tx.objectStore('chapters').get(index);
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function loadChapterRange(start: number, end: number): Promise<StoredChapter[]> {
  const chapters: StoredChapter[] = [];
  const promises: Promise<StoredChapter | null>[] = [];
  
  for (let i = start; i <= end; i++) {
    promises.push(loadChapter(i));
  }
  
  const results = await Promise.all(promises);
  for (const r of results) {
    if (r) chapters.push(r);
  }
  
  return chapters;
}

export async function updateBookMeta(updates: Partial<BookMeta>): Promise<void> {
  const db = await openDB();
  const current = await loadBookMeta();
  if (!current) return;
  
  const tx = db.transaction('bookMeta', 'readwrite');
  tx.objectStore('bookMeta').put({ ...current, ...updates });
  
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearBookData(): Promise<void> {
  const db = await openDB();
  
  const metaTx = db.transaction('bookMeta', 'readwrite');
  metaTx.objectStore('bookMeta').clear();
  
  const chapterTx = db.transaction('chapters', 'readwrite');
  chapterTx.objectStore('chapters').clear();
  
  await Promise.all([
    new Promise(r => { metaTx.oncomplete = r; }),
    new Promise(r => { chapterTx.oncomplete = r; }),
  ]);
}

// ─── Quotes Storage ────────────────────────────────────────────

export async function saveQuotesToDB(quotes: QuoteItem[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('quotes', 'readwrite');
  const store = tx.objectStore('quotes');
  store.clear();
  
  for (const quote of quotes) {
    store.put(quote);
  }
  
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadQuotesFromDB(): Promise<QuoteItem[]> {
  const db = await openDB();
  const tx = db.transaction('quotes', 'readonly');
  const request = tx.objectStore('quotes').getAll();
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ─── Settings Storage ──────────────────────────────────────────

export async function saveSettingsToDB(settings: AppSettings): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ id: 'current', ...settings });
  
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSettingsFromDB(): Promise<AppSettings | null> {
  const db = await openDB();
  const tx = db.transaction('settings', 'readonly');
  const request = tx.objectStore('settings').get('current');
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const { id, ...settings } = result;
        resolve(settings as AppSettings);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Progress Storage ──────────────────────────────────────────

export async function saveProgressToDB(progress: ReadingProgress): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('progress', 'readwrite');
  tx.objectStore('progress').put({ id: 'current', ...progress });
  
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadProgressFromDB(): Promise<ReadingProgress> {
  const db = await openDB();
  const tx = db.transaction('progress', 'readonly');
  const request = tx.objectStore('progress').get('current');
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const { id, ...progress } = result;
        resolve(progress as ReadingProgress);
      } else {
        resolve({ chapterIndex: 0, scrollTop: 0, pageIndex: 0 });
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Clear All ─────────────────────────────────────────────────

export async function clearAllDataFromDB(): Promise<void> {
  const db = await openDB();

  const stores = ['bookMeta', 'chapters', 'quotes', 'settings', 'progress'];
  const transactions = stores.map(store => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return new Promise(r => { tx.oncomplete = r; });
  });

  await Promise.all(transactions);
}

// ─── Export / Import All Data ──────────────────────────────────

export interface ExportData {
  version: 1;
  exportedAt: string;
  bookMeta: BookMeta | null;
  chapters: StoredChapter[];
  quotes: QuoteItem[];
  settings: AppSettings | null;
  progress: ReadingProgress;
}

export async function exportAllData(): Promise<ExportData> {
  const db = await openDB();

  const getAll = (storeName: string): Promise<unknown[]> => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  };

  const [metaArr, chapters, quotes, settingsArr, progressArr] = await Promise.all([
    getAll('bookMeta'),
    getAll('chapters'),
    getAll('quotes'),
    getAll('settings'),
    getAll('progress'),
  ]);

  const meta = (metaArr as BookMeta[])[0] || null;
  const settingsRaw = (settingsArr as (AppSettings & { id?: string })[])[0];
  let settings: AppSettings | null = null;
  if (settingsRaw) {
    const { id, ...rest } = settingsRaw;
    settings = rest as AppSettings;
  }
  const progressRaw = (progressArr as (ReadingProgress & { id?: string })[])[0];
  let progress: ReadingProgress = { chapterIndex: 0, scrollTop: 0, pageIndex: 0 };
  if (progressRaw) {
    const { id, ...rest } = progressRaw;
    progress = rest as ReadingProgress;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookMeta: meta,
    chapters: chapters as StoredChapter[],
    quotes: quotes as QuoteItem[],
    settings,
    progress,
  };
}

export async function importAllData(data: ExportData): Promise<void> {
  // Clear existing data first
  await clearAllDataFromDB();

  const db = await openDB();

  // Import book meta
  if (data.bookMeta) {
    const tx = db.transaction('bookMeta', 'readwrite');
    tx.objectStore('bookMeta').put(data.bookMeta);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }

  // Import chapters
  if (data.chapters && data.chapters.length > 0) {
    const tx = db.transaction('chapters', 'readwrite');
    const store = tx.objectStore('chapters');
    for (const ch of data.chapters) store.put(ch);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }

  // Import quotes
  if (data.quotes && data.quotes.length > 0) {
    const tx = db.transaction('quotes', 'readwrite');
    const store = tx.objectStore('quotes');
    for (const q of data.quotes) store.put(q);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }

  // Import settings
  if (data.settings) {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ id: 'current', ...data.settings });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }

  // Import progress
  if (data.progress) {
    const tx = db.transaction('progress', 'readwrite');
    tx.objectStore('progress').put({ id: 'current', ...data.progress });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
}

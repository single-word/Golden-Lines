import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import type { QuoteItem, AppSettings, ReadingProgress, ViewType } from './types';
import type { BookMeta } from './db';
import {
  loadBookMeta, loadQuotesFromDB, loadSettingsFromDB, loadProgressFromDB,
  saveBookToDB, saveQuotesToDB, saveSettingsToDB, saveProgressToDB,
  clearAllDataFromDB, clearBookData, updateBookMeta,
  exportAllData, importAllData,
} from './db';
import type { ExportData } from './db';
import { parseEpub, DEFAULT_SETTINGS } from './utils';

// Lazy load components
const UploadPage = lazy(() => import('./components/UploadPage').then(m => ({ default: m.UploadPage })));
const Reader = lazy(() => import('./components/Reader').then(m => ({ default: m.Reader })));
const QuoteList = lazy(() => import('./components/QuoteList').then(m => ({ default: m.QuoteList })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));

// Loading fallback
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function App() {
  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<ReadingProgress>({ chapterIndex: 0, scrollTop: 0 });
  const [view, setView] = useState<ViewType>('read');
  const [initialized, setInitialized] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Load data from IndexedDB on mount
  useEffect(() => {
    async function init() {
      try {
        const [meta, savedQuotes, savedSettings, savedProgress] = await Promise.all([
          loadBookMeta(),
          loadQuotesFromDB(),
          loadSettingsFromDB(),
          loadProgressFromDB(),
        ]);

        if (meta) setBookMeta(meta);
        setQuotes(savedQuotes);
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        setProgress(savedProgress);
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setInitialized(true);
      }
    }
    init();
  }, []);

  const handleBookLoaded = useCallback(async (file: File, tags: string[]) => {
    setIsUploading(true);
    try {
      const parsed = await parseEpub(file);
      const bookData = {
        title: parsed.title,
        chapters: parsed.chapters,
        tags,
      };

      await saveBookToDB(bookData);

      const meta: BookMeta = {
        id: 'current',
        title: parsed.title,
        tags,
        chapterCount: parsed.chapters.length,
        chapterMeta: parsed.chapters.map(c => ({ title: c.title, wordCount: c.wordCount })),
      };
      setBookMeta(meta);

      const newProgress = { chapterIndex: 0, scrollTop: 0, pageIndex: 0 };
      setProgress(newProgress);
      await saveProgressToDB(newProgress);

      setView('read');
    } catch (e) {
      console.error('Failed to parse EPUB:', e);
      alert('解析EPUB失败: ' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleAddQuote = useCallback((quote: QuoteItem) => {
    setQuotes(prev => {
      const next = [...prev, quote];
      saveQuotesToDB(next);
      return next;
    });
  }, []);

  const handleRemoveQuote = useCallback((id: string) => {
    setQuotes(prev => {
      const next = prev.filter(q => q.id !== id);
      saveQuotesToDB(next);
      return next;
    });
  }, []);

  const handleUpdateQuote = useCallback((id: string, updates: Partial<QuoteItem>) => {
    setQuotes(prev => {
      const next = prev.map(q => q.id === id ? { ...q, ...updates } : q);
      saveQuotesToDB(next);
      return next;
    });
  }, []);

  const handleUpdateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettingsToDB(newSettings);
  }, []);

  const handleUpdateBookTags = useCallback(async (tags: string[]) => {
    if (!bookMeta) return;
    const updated = { ...bookMeta, tags };
    setBookMeta(updated);
    await updateBookMeta({ tags });
  }, [bookMeta]);

  const handleProgressChange = useCallback((newProgress: ReadingProgress) => {
    setProgress(newProgress);
    // Debounced save
    saveProgressToDB(newProgress);
  }, []);

  const handleClearData = useCallback(async () => {
    await clearAllDataFromDB();
    setBookMeta(null);
    setQuotes([]);
    setSettings(DEFAULT_SETTINGS);
    setProgress({ chapterIndex: 0, scrollTop: 0 });
    setView('read');
  }, []);

  const handleReupload = useCallback(async () => {
    await clearBookData();
    setBookMeta(null);
    setProgress({ chapterIndex: 0, scrollTop: 0 });
    setView('read');
  }, []);

  const handleExportData = useCallback(async () => {
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const title = data.bookMeta?.title || '金句拾光';
      a.download = `${title}_备份_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('导出失败: ' + (e instanceof Error ? e.message : '未知错误'));
    }
  }, []);

  const handleImportData = useCallback(async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;
      if (!data.version || !data.exportedAt) {
        throw new Error('无效的备份文件格式');
      }
      await importAllData(data);

      // Reload all state from DB
      const [meta, savedQuotes, savedSettings, savedProgress] = await Promise.all([
        loadBookMeta(),
        loadQuotesFromDB(),
        loadSettingsFromDB(),
        loadProgressFromDB(),
      ]);
      if (meta) setBookMeta(meta); else setBookMeta(null);
      setQuotes(savedQuotes);
      if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
      else setSettings(DEFAULT_SETTINGS);
      setProgress(savedProgress);
      setView('read');
    } catch (e) {
      console.error('Import failed:', e);
      alert('导入失败: ' + (e instanceof Error ? e.message : '文件格式错误'));
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleNavigateToChapter = useCallback((chapterIndex: number, quoteText: string) => {
    // Extract first line/paragraph of the quote to use as target for locating
    const targetText = quoteText.split('\n')[0];
    const newProgress = { chapterIndex, scrollTop: 0, pageIndex: 0, targetText };
    setProgress(newProgress);
    saveProgressToDB({ chapterIndex, scrollTop: 0, pageIndex: 0 });
    setView('read');
  }, []);

  const navItems = useMemo(() => [
    { key: 'read' as const, label: '阅读' },
    { key: 'quotes' as const, label: '金句' },
    { key: 'settings' as const, label: '设置' },
  ], []);

  // Memoized nav component
  const NavBar = useMemo(() => {
    if (!bookMeta) return null;

    return (
      <nav className="flex-shrink-0 bg-white/80 glass border-b border-warm-100/60">
        <div className="max-w-3xl mx-auto px-5">
          <div className="flex items-center justify-between h-13">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-sm">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <span className="text-[13px] font-semibold text-warm-700 tracking-wide hidden sm:block">金句拾光</span>
            </div>

            <div className="flex items-center bg-warm-100/70 rounded-xl p-[3px]">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={`relative px-4 py-1.5 rounded-[10px] text-[12px] font-medium transition-all duration-200 ${
                    view === item.key
                      ? 'bg-white text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-warm-400 hover:text-warm-600'
                  }`}
                >
                  {item.label}
                  {item.key === 'quotes' && quotes.length > 0 && (
                    <span className="absolute -top-1.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] flex items-center justify-center font-bold">
                      {quotes.length > 99 ? '99+' : quotes.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>
    );
  }, [bookMeta, view, quotes.length, navItems]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <div className="text-warm-400 text-[13px] tracking-wide">加载中</div>
        </div>
      </div>
    );
  }

  if (!bookMeta) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <UploadPage
          onBookLoaded={handleBookLoaded}
          isUploading={isUploading}
          onExport={handleExportData}
          onImport={handleImportData}
          isImporting={isImporting}
        />
      </Suspense>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-warm-50">
      {NavBar}

      <main className="flex-1 overflow-hidden">
        <Suspense fallback={<LoadingSpinner />}>
          {view === 'read' && (
            <Reader
              bookMeta={bookMeta}
              quotes={quotes}
              settings={settings}
              progress={progress}
              onAddQuote={handleAddQuote}
              onRemoveQuote={handleRemoveQuote}
              onProgressChange={handleProgressChange}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
          {view === 'quotes' && (
            <QuoteList
              bookMeta={bookMeta}
              quotes={quotes}
              onUpdateQuote={handleUpdateQuote}
              onRemoveQuote={handleRemoveQuote}
              onNavigateToChapter={handleNavigateToChapter}
            />
          )}
          {view === 'settings' && (
            <SettingsPage
              settings={settings}
              bookMeta={bookMeta}
              onUpdateSettings={handleUpdateSettings}
              onUpdateBookTags={handleUpdateBookTags}
              onClearData={handleClearData}
              onReupload={handleReupload}
              onExportData={handleExportData}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}

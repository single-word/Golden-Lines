import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import type { QuoteItem, AppSettings, ReadingProgress } from '../types';
import type { BookMeta, StoredChapter } from '../db';
import { loadChapterRange } from '../db';
import { getNextId } from '../utils';

interface Props {
  bookMeta: BookMeta;
  quotes: QuoteItem[];
  settings: AppSettings;
  progress: ReadingProgress;
  onAddQuote: (quote: QuoteItem) => void;
  onRemoveQuote: (id: string) => void;
  onProgressChange: (progress: ReadingProgress) => void;
  onUpdateSettings: (settings: AppSettings) => void;
}

// ─── Paragraph ────────────────────────────────────────────────
const Paragraph = memo(function Paragraph({
  text, isQuoted, isSelected, isMultiSelect, style,
  onContextMenu, onTouchStart, onTouchEnd, onTouchMove, onClick,
}: {
  text: string; isQuoted: boolean; isSelected: boolean; isMultiSelect: boolean;
  style: React.CSSProperties;
  onContextMenu: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void; onTouchMove: () => void;
  onClick?: () => void;
}) {
  return (
    <p
      className={`select-none transition-colors duration-200 ${
        isSelected
          ? 'bg-accent/[0.12] border-l-[2px] border-accent pl-4 -ml-4 rounded-r-md'
          : isQuoted
            ? 'bg-accent/[0.06] border-l-[2px] border-accent/50 pl-4 -ml-4 rounded-r-md'
            : isMultiSelect
              ? 'active:bg-warm-100/60 cursor-pointer'
              : ''
      }`}
      style={style}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onClick={onClick}
    >
      {isMultiSelect && (
        <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border mr-2 align-middle text-[10px] ${
          isSelected ? 'bg-accent border-accent text-white' : 'border-warm-300 text-transparent'
        }`}>
          {isSelected ? '✓' : ''}
        </span>
      )}
      {text}
    </p>
  );
});

// ─── Paginate paragraphs into pages using a hidden measurer ───
interface PageParagraph {
  text: string;       // displayed text (may be a fragment if split across pages)
  fullText: string;   // original full paragraph text (for quote operations)
  isContinuation: boolean; // true if this continues from previous page
}

interface PageData {
  paragraphs: PageParagraph[];
  showTitle?: boolean; // whether this page should show the chapter title
}

// Binary search for the maximum number of characters that fit within maxHeight
function findSplitPoint(
  text: string,
  maxHeight: number,
  measurer: HTMLDivElement,
): number {
  let lo = 1, hi = text.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    measurer.textContent = text.substring(0, mid);
    if (measurer.offsetHeight <= maxHeight) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function paginateParagraphs(
  allParagraphs: string[],
  availableHeight: number,
  fontSize: number,
  lineHeight: number,
  paragraphSpacing: number,
  containerWidth: number,
  chapterTitle?: string,
): PageData[] {
  const wrapParas = (ps: string[]) => ps.map(p => ({ text: p, fullText: p, isContinuation: false }));

  if (allParagraphs.length === 0 || availableHeight <= 0 || containerWidth <= 0) {
    return [{ paragraphs: wrapParas(allParagraphs), showTitle: true }];
  }

  // Safety margin to prevent overflow from sub-pixel measurement differences
  const safeHeight = availableHeight - 8;

  // Create offscreen measurer
  const measurer = document.createElement('div');
  measurer.style.cssText = `
    position:absolute;top:-9999px;left:-9999px;visibility:hidden;
    width:${containerWidth}px;
    font-family:"Noto Serif SC",serif;
    font-size:${fontSize}px;
    line-height:${lineHeight};
    white-space:pre-wrap;word-break:break-word;
  `;
  document.body.appendChild(measurer);

  const pages: PageData[] = [];
  let currentPageParas: PageParagraph[] = [];
  let currentHeight = 0;
  const spacingPx = paragraphSpacing * fontSize;
  const minLineHeight = fontSize * lineHeight;

  // Account for chapter title on first page
  const titleFontSize = Math.round(fontSize * 1.25);
  let titleHeight = 0;
  if (chapterTitle) {
    const titleMeasurer = document.createElement('div');
    titleMeasurer.style.cssText = `
      position:absolute;top:-9999px;left:-9999px;visibility:hidden;
      width:${containerWidth}px;
      font-family:"Noto Serif SC",serif;
      font-size:${titleFontSize}px;
      line-height:1.4;
      font-weight:600;
      white-space:pre-wrap;word-break:break-word;
    `;
    titleMeasurer.textContent = chapterTitle;
    document.body.appendChild(titleMeasurer);
    titleHeight = titleMeasurer.offsetHeight + fontSize * 1.5;
    document.body.removeChild(titleMeasurer);
    currentHeight = titleHeight;
  }

  for (let i = 0; i < allParagraphs.length; i++) {
    const fullText = allParagraphs[i];
    let remaining = fullText;
    let isFirstFragment = true;

    while (remaining.length > 0) {
      measurer.textContent = remaining;
      const paraHeight = measurer.offsetHeight;
      const gap = currentPageParas.length > 0 ? spacingPx : 0;
      const needed = paraHeight + gap;
      const space = safeHeight - currentHeight;

      if (needed <= space) {
        // Whole remaining text fits on current page
        currentPageParas.push({ text: remaining, fullText, isContinuation: !isFirstFragment });
        currentHeight += needed;
        break;
      }

      // Doesn't fit — try to split
      const spaceForText = space - gap;

      if (spaceForText >= minLineHeight) {
        const splitIdx = findSplitPoint(remaining, spaceForText, measurer);
        if (splitIdx > 0) {
          currentPageParas.push({ text: remaining.substring(0, splitIdx), fullText, isContinuation: !isFirstFragment });
          remaining = remaining.substring(splitIdx);
          isFirstFragment = false;
          // Flush current page and continue with remainder on next page
          pages.push({ paragraphs: currentPageParas, showTitle: pages.length === 0 });
          currentPageParas = [];
          currentHeight = 0;
          continue;
        }
      }

      // Not enough space or couldn't split
      if (currentPageParas.length > 0) {
        // Flush current page, retry this text on a fresh page
        pages.push({ paragraphs: currentPageParas, showTitle: pages.length === 0 });
        currentPageParas = [];
        currentHeight = 0;
      } else {
        // Edge case: single paragraph taller than a full page — force add
        currentPageParas.push({ text: remaining, fullText, isContinuation: !isFirstFragment });
        pages.push({ paragraphs: currentPageParas, showTitle: pages.length === 0 });
        currentPageParas = [];
        currentHeight = 0;
        break;
      }
    }
  }

  if (currentPageParas.length > 0) {
    pages.push({ paragraphs: currentPageParas, showTitle: pages.length === 0 });
  }

  document.body.removeChild(measurer);
  return pages.length > 0 ? pages : [{ paragraphs: wrapParas(allParagraphs), showTitle: true }];
}

// ─── Reader Component ─────────────────────────────────────────
export const Reader = memo(function Reader({
  bookMeta, quotes, settings, progress,
  onAddQuote, onRemoveQuote, onProgressChange, onUpdateSettings,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  const [currentChapterIndex, setCurrentChapterIndex] = useState(progress.chapterIndex);
  const [loadedChapters, setLoadedChapters] = useState<Map<number, StoredChapter>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // For scroll mode: the range of chapters currently rendered
  const [scrollChapterRange, setScrollChapterRange] = useState<{ start: number; end: number }>({
    start: progress.chapterIndex,
    end: progress.chapterIndex,
  });
  // Track which chapter is currently visible in scroll mode (for header display)
  const [visibleChapterIndex, setVisibleChapterIndex] = useState(progress.chapterIndex);
  // Refs for each chapter section in scroll mode (for intersection detection)
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Lock to prevent scroll position jump when prepending chapters
  const prependLock = useRef(false);

  // Track pending navigation target (from quote jump)
  const pendingTargetRef = useRef<string | null>(progress.targetText || null);

  // Respond to external progress changes (e.g. quote jump from QuoteList)
  const prevProgressRef = useRef(progress);
  useEffect(() => {
    const prev = prevProgressRef.current;
    prevProgressRef.current = progress;
    // Only react if chapterIndex or targetText actually changed from outside
    if (progress.chapterIndex !== prev.chapterIndex || progress.targetText !== prev.targetText) {
      if (progress.targetText) {
        // External navigation with target (e.g. quote jump) — full reset
        pendingTargetRef.current = progress.targetText;
        setCurrentChapterIndex(progress.chapterIndex);
        setScrollChapterRange({ start: progress.chapterIndex, end: progress.chapterIndex });
        setVisibleChapterIndex(progress.chapterIndex);
      } else if (settings.readMode === 'scroll') {
        // In scroll mode without targetText: this is our own save echoing back.
        // Scroll position is managed locally by handleScroll/goToChapter, so skip
        // to avoid resetting scrollChapterRange and destroying loaded chapters.
      } else {
        // Page turn mode
        setCurrentChapterIndex(progress.chapterIndex);
        setPageIndex(progress.pageIndex || 0);
      }
    }
  }, [progress, settings.readMode]);

  // UI state
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [actionMenu, setActionMenu] = useState<{
    text: string; chapterIndex: number; chapterTitle: string; x: number; y: number;
  } | null>(null);
  const [authorPicker, setAuthorPicker] = useState<{
    text: string; chapterIndex: number; chapterTitle: string;
  } | null>(null);
  const [toast, setToast] = useState('');

  // Auto scroll / auto play
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef<number | null>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Page turn mode
  const [pageIndex, setPageIndex] = useState(progress.pageIndex || 0);
  const [pages, setPages] = useState<PageData[]>([]);
  const [paginationVersion, setPaginationVersion] = useState(0);
  const [slideAnim, setSlideAnim] = useState<'left' | 'right' | null>(null);

  // Long press detection
  const longPressRef = useRef<{
    timer: number | null; startX: number; startY: number;
  }>({ timer: null, startX: 0, startY: 0 });

  // Multi-select mode
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedParas, setSelectedParas] = useState<Set<string>>(new Set());
  const multiSelectChapterRef = useRef<{ index: number; title: string }>({ index: 0, title: '' });

  // Quoted texts for quick lookup
  const quotedTexts = useMemo(() => new Set(quotes.map(q => q.text)), [quotes]);

  // ─── Load chapters ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Only show loading if the target chapter isn't already cached
      const alreadyCached = loadedChapters.has(currentChapterIndex);
      if (!alreadyCached) setIsLoading(true);

      // In scroll mode, load the full scroll range + 1 buffer on each side
      // In pageTurn mode, load current ± 1
      let start: number, end: number;
      if (settings.readMode === 'scroll') {
        start = Math.max(0, scrollChapterRange.start);
        end = Math.min(bookMeta.chapterCount - 1, scrollChapterRange.end);
      } else {
        start = Math.max(0, currentChapterIndex - 1);
        end = Math.min(bookMeta.chapterCount - 1, currentChapterIndex + 1);
      }

      const chapters = await loadChapterRange(start, end);
      if (!cancelled) {
        setLoadedChapters(prev => {
          const m = new Map(prev);
          for (const ch of chapters) m.set(ch.index, ch);
          return m;
        });
        setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentChapterIndex, bookMeta.chapterCount, settings.readMode, scrollChapterRange]);

  // ─── Compute available height for page content ────────────────
  const getAvailableHeight = useCallback(() => {
    const content = contentRef.current;
    if (!content) return 500;
    // Use the content div directly — flex layout already accounts for header & bottom bar.
    // Subtract its own vertical padding to get the actual text area height.
    const style = getComputedStyle(content);
    return content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  }, []);

  const getContentWidth = useCallback(() => {
    const content = contentRef.current;
    if (!content) return Math.min(window.innerWidth, 768) - 48;
    // clientWidth includes padding — subtract it to get the actual text flow width.
    const style = getComputedStyle(content);
    return content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }, []);

  // ─── Paginate (DOM-based measurement) ─────────────────────────
  const repaginateRef = useRef<() => void>(() => {});
  repaginateRef.current = () => {
    if (settings.readMode !== 'pageTurn') return;
    const chapter = loadedChapters.get(currentChapterIndex);
    if (!chapter) return;

    const availH = getAvailableHeight();
    const contentW = getContentWidth();
    if (availH <= 0 || contentW <= 0) return;

    const newPages = paginateParagraphs(
      chapter.paragraphs, availH,
      settings.fontSize, settings.lineHeight, settings.paragraphSpacing,
      contentW, chapter.title,
    );
    setPages(newPages);
    setPaginationVersion(v => v + 1);
  };

  // ─── ResizeObserver: auto-repaginate on ANY layout change ─────
  // Watches container, header, and bottom bar for size changes.
  // This covers: settings panel open/close, window resize, font changes, etc.
  useEffect(() => {
    if (settings.readMode !== 'pageTurn' || isLoading) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerRepaginate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => repaginateRef.current(), 50);
    };

    // Initial pagination
    triggerRepaginate();

    const observer = new ResizeObserver(() => {
      triggerRepaginate();
    });

    if (containerRef.current) observer.observe(containerRef.current);
    if (headerRef.current) observer.observe(headerRef.current);
    if (bottomBarRef.current) observer.observe(bottomBarRef.current);

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [
    isLoading, settings.readMode, settings.fontSize,
    settings.lineHeight, settings.paragraphSpacing,
    loadedChapters, currentChapterIndex,
  ]);

  // Track the first paragraph text of the current page for repositioning after repagination
  const currentFirstPara = useRef<string | null>(null);
  useEffect(() => {
    const page = pages[pageIndex];
    if (page && page.paragraphs.length > 0) {
      currentFirstPara.current = page.paragraphs[0].fullText;
    }
  }, [pageIndex, pages]);

  // Clamp/reposition pageIndex when pages change, or navigate to target
  useEffect(() => {
    if (pages.length === 0) return;

    // If there's a pending navigation target, find its page
    if (pendingTargetRef.current) {
      const target = pendingTargetRef.current;
      pendingTargetRef.current = null;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].paragraphs.some(pp => pp.fullText.includes(target) || target.includes(pp.fullText))) {
          setPageIndex(i);
          return;
        }
      }
      // Target not found in any page, go to page 0
      setPageIndex(0);
      return;
    }

    setPageIndex(prev => {
      if (prev === 999) return pages.length - 1; // came from prev chapter

      // Try to find the page containing the paragraph we were reading
      if (currentFirstPara.current) {
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].paragraphs.some(pp => pp.fullText === currentFirstPara.current)) {
            return i;
          }
        }
      }

      // Fallback: clamp
      if (prev >= pages.length) return pages.length - 1;
      return prev;
    });
  }, [pages, paginationVersion]);

  // ─── Auto play: scroll mode → auto scroll + chapter jump ─────
  useEffect(() => {
    if (!isAutoPlaying || settings.readMode !== 'scroll') {
      if (autoPlayRef.current) cancelAnimationFrame(autoPlayRef.current);
      return;
    }

    const speed = settings.autoScrollSpeed;
    let lastTime = performance.now();

    function scroll(time: number) {
      const dt = time - lastTime;
      lastTime = time;
      const el = contentRef.current;
      if (el) {
        el.scrollTop += (dt * speed) / 50;
        // Near bottom → expand range to load next chapter
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
          if (scrollChapterRange.end < bookMeta.chapterCount - 1) {
            setScrollChapterRange(prev => ({ ...prev, end: prev.end + 1 }));
          } else {
            setIsAutoPlaying(false);
          }
        }
      }
      autoPlayRef.current = requestAnimationFrame(scroll);
    }

    autoPlayRef.current = requestAnimationFrame(scroll);
    return () => { if (autoPlayRef.current) cancelAnimationFrame(autoPlayRef.current); };
  }, [isAutoPlaying, settings.autoScrollSpeed, settings.readMode, scrollChapterRange.end, bookMeta.chapterCount]);

  // ─── Auto play: page turn mode → flip pages + chapter jump ────
  useEffect(() => {
    if (!isAutoPlaying || settings.readMode !== 'pageTurn') {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      return;
    }

    // Interval based on speed: speed 0.3 = 6s, speed 1 = 3s, speed 3 = 1s
    const intervalMs = Math.max(800, 3000 / settings.autoScrollSpeed);

    function tick() {
      setPageIndex(prev => {
        const maxPage = pages.length - 1;
        if (prev < maxPage) {
          setSlideAnim('left');
          return prev + 1;
        } else {
          // End of chapter
          if (currentChapterIndex < bookMeta.chapterCount - 1) {
            setCurrentChapterIndex(i => i + 1);
            setSlideAnim('left');
            return 0;
          } else {
            setIsAutoPlaying(false);
            return prev;
          }
        }
      });
      autoPlayTimerRef.current = setTimeout(tick, intervalMs);
    }

    autoPlayTimerRef.current = setTimeout(tick, intervalMs);
    return () => { if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current); };
  }, [isAutoPlaying, settings.readMode, settings.autoScrollSpeed, pages.length, currentChapterIndex, bookMeta.chapterCount]);

  // Reset scroll on chapter change (pageTurn only); scroll to target in scroll mode
  useEffect(() => {
    if (!contentRef.current || settings.readMode !== 'scroll') return;

    const target = pendingTargetRef.current;
    if (target && !isLoading) {
      pendingTargetRef.current = null;
      // Wait for DOM to render, then find the paragraph element
      requestAnimationFrame(() => {
        const container = contentRef.current;
        if (!container) return;
        const paragraphs = container.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent || '';
          if (text.includes(target) || target.includes(text)) {
            p.scrollIntoView({ block: 'center' });
            // Brief highlight
            p.style.transition = 'background-color 0.3s';
            p.style.backgroundColor = 'rgba(176, 141, 110, 0.15)';
            setTimeout(() => { p.style.backgroundColor = ''; }, 1500);
            return;
          }
        }
      });
    }
  }, [settings.readMode, isLoading, scrollChapterRange]);

  // ─── Scroll mode: detect visible chapter + load more at edges ──
  const scrollJumpLock = useRef(false);
  const handleScroll = useCallback(() => {
    if (settings.readMode !== 'scroll') return;
    const el = contentRef.current;
    if (!el || scrollJumpLock.current) return;

    // Detect which chapter is currently visible (topmost in viewport)
    let bestIdx = scrollChapterRange.start;
    const containerTop = el.getBoundingClientRect().top;
    for (let i = scrollChapterRange.start; i <= scrollChapterRange.end; i++) {
      const ref = chapterRefs.current.get(i);
      if (ref) {
        const rect = ref.getBoundingClientRect();
        // If this chapter's bottom is below the container top, it's visible
        if (rect.bottom > containerTop + 60) {
          bestIdx = i;
          break;
        }
      }
    }
    if (bestIdx !== visibleChapterIndex) {
      setVisibleChapterIndex(bestIdx);
      setCurrentChapterIndex(bestIdx);
    }

    // Near bottom → load next chapter
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      if (scrollChapterRange.end < bookMeta.chapterCount - 1) {
        setScrollChapterRange(prev => {
          if (prev.end < bookMeta.chapterCount - 1) return { ...prev, end: prev.end + 1 };
          return prev;
        });
      }
    }

    // Near top → load previous chapter
    if (el.scrollTop < 300) {
      if (scrollChapterRange.start > 0 && !prependLock.current) {
        prependLock.current = true;
        const prevScrollHeight = el.scrollHeight;
        setScrollChapterRange(prev => {
          if (prev.start > 0) return { ...prev, start: prev.start - 1 };
          return prev;
        });
        // After DOM update, adjust scrollTop to keep position stable
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (contentRef.current) {
              const newScrollHeight = contentRef.current.scrollHeight;
              contentRef.current.scrollTop += (newScrollHeight - prevScrollHeight);
            }
            prependLock.current = false;
          });
        });
      }
    }
  }, [settings.readMode, scrollChapterRange, visibleChapterIndex, bookMeta.chapterCount]);

  // ─── Save progress (debounced) ────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    const chIdx = settings.readMode === 'scroll' ? visibleChapterIndex : currentChapterIndex;
    saveTimerRef.current = setTimeout(() => {
      onProgressChange({
        chapterIndex: chIdx,
        scrollTop: contentRef.current?.scrollTop || 0,
        pageIndex,
      });
    }, 800);
    return () => clearTimeout(saveTimerRef.current);
  }, [currentChapterIndex, visibleChapterIndex, pageIndex, onProgressChange, settings.readMode]);

  // ─── Toast ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Slide animation clear ────────────────────────────────────
  useEffect(() => {
    if (!slideAnim) return;
    const t = setTimeout(() => setSlideAnim(null), 300);
    return () => clearTimeout(t);
  }, [slideAnim]);

  // ─── Long press handlers ──────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent, text: string, ci: number, ct: string) => {
    const t = e.touches[0];
    longPressRef.current = {
      timer: window.setTimeout(() => {
        setIsAutoPlaying(false);
        setActionMenu({ text, chapterIndex: ci, chapterTitle: ct, x: t.clientX, y: t.clientY });
      }, 500),
      startX: t.clientX, startY: t.clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current.timer) { clearTimeout(longPressRef.current.timer); longPressRef.current.timer = null; }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressRef.current.timer) { clearTimeout(longPressRef.current.timer); longPressRef.current.timer = null; }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, text: string, ci: number, ct: string) => {
    e.preventDefault();
    setActionMenu({ text, chapterIndex: ci, chapterTitle: ct, x: e.clientX, y: e.clientY });
  }, []);

  // ─── Copy & Quote ─────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!actionMenu) return;
    const source = `《${bookMeta.title}》${actionMenu.chapterTitle}`;
    const fullText = `${actionMenu.text}\n\n——${source}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = fullText;
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setToast('已复制');
    } catch { setToast('复制失败'); }
    setActionMenu(null);
  }, [actionMenu, bookMeta.title]);

  const addQuote = useCallback((text: string, ci: number, ct: string, author: string | null) => {
    const id = getNextId(quotes, settings.startingId);
    const source = `《${bookMeta.title}》${ct}`;
    onAddQuote({ id, text, author, source, tags: bookMeta.tags, chapterIndex: ci, chapterTitle: ct });
    setToast(`已添加金句 #${id}`);
  }, [quotes, settings.startingId, bookMeta, onAddQuote]);

  const handleSetQuote = useCallback(() => {
    if (!actionMenu) return;
    if (quotedTexts.has(actionMenu.text)) {
      const q = quotes.find(q => q.text === actionMenu.text);
      if (q) { onRemoveQuote(q.id); setToast('已取消金句'); }
    } else {
      if (settings.authors.length > 0) {
        setAuthorPicker({ text: actionMenu.text, chapterIndex: actionMenu.chapterIndex, chapterTitle: actionMenu.chapterTitle });
      } else {
        addQuote(actionMenu.text, actionMenu.chapterIndex, actionMenu.chapterTitle, null);
      }
    }
    setActionMenu(null);
  }, [actionMenu, quotedTexts, quotes, settings.authors, onRemoveQuote, addQuote]);

  // ─── Multi-select ──────────────────────────────────────────────
  const handleEnterMultiSelect = useCallback(() => {
    if (!actionMenu) return;
    multiSelectChapterRef.current = { index: actionMenu.chapterIndex, title: actionMenu.chapterTitle };
    setSelectedParas(new Set([actionMenu.text]));
    setMultiSelectMode(true);
    setIsAutoPlaying(false);
    setActionMenu(null);
  }, [actionMenu]);

  const handleTogglePara = useCallback((text: string) => {
    if (!multiSelectMode) return;
    setSelectedParas(prev => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }, [multiSelectMode]);

  const handleCancelMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedParas(new Set());
  }, []);

  const handleConfirmMultiSelect = useCallback(() => {
    if (selectedParas.size === 0) {
      setToast('请至少选择一个段落');
      return;
    }
    // Merge selected paragraphs in chapter order
    const chapter = loadedChapters.get(multiSelectChapterRef.current.index);
    if (!chapter) return;
    const orderedTexts = chapter.paragraphs.filter(p => selectedParas.has(p));
    const mergedText = orderedTexts.join('\n');
    const ci = multiSelectChapterRef.current.index;
    const ct = multiSelectChapterRef.current.title;

    if (settings.authors.length > 0) {
      setAuthorPicker({ text: mergedText, chapterIndex: ci, chapterTitle: ct });
    } else {
      addQuote(mergedText, ci, ct, null);
    }
    setMultiSelectMode(false);
    setSelectedParas(new Set());
  }, [selectedParas, loadedChapters, settings.authors, addQuote]);

  const handleSelectAuthor = useCallback((author: string | null) => {
    if (!authorPicker) return;
    addQuote(authorPicker.text, authorPicker.chapterIndex, authorPicker.chapterTitle, author);
    setAuthorPicker(null);
  }, [authorPicker, addQuote]);

  // ─── Navigation ───────────────────────────────────────────────
  const goToChapter = useCallback((index: number) => {
    setCurrentChapterIndex(index);
    setPageIndex(0);
    setShowToc(false);
    setScrollChapterRange({ start: index, end: index });
    setVisibleChapterIndex(index);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, []);

  const handlePrevPage = useCallback(() => {
    if (settings.readMode === 'pageTurn') {
      if (pageIndex > 0) {
        setPageIndex(p => p - 1);
        setSlideAnim('right');
      } else if (currentChapterIndex > 0) {
        setCurrentChapterIndex(i => i - 1);
        setPageIndex(999); // will be clamped to last page
        setSlideAnim('right');
      }
    } else {
      if (contentRef.current) {
        const el = contentRef.current;
        el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'smooth' });
      }
    }
  }, [settings.readMode, pageIndex, currentChapterIndex]);

  const handleNextPage = useCallback(() => {
    if (settings.readMode === 'pageTurn') {
      if (pageIndex < pages.length - 1) {
        setPageIndex(p => p + 1);
        setSlideAnim('left');
      } else if (currentChapterIndex < bookMeta.chapterCount - 1) {
        setCurrentChapterIndex(i => i + 1);
        setPageIndex(0);
        setSlideAnim('left');
      }
    } else {
      if (contentRef.current) {
        const el = contentRef.current;
        el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'smooth' });
      }
    }
  }, [settings.readMode, pageIndex, pages.length, currentChapterIndex, bookMeta.chapterCount]);

  // ─── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { handlePrevPage(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); handleNextPage(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePrevPage, handleNextPage]);

  // ─── Touch swipe ──────────────────────────────────────────────
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y);

    if (settings.readMode === 'pageTurn' && Math.abs(dx) > 50 && dy < 100) {
      if (dx > 0) handlePrevPage(); else handleNextPage();
    }
    touchStartRef.current = null;
  }, [settings.readMode, handlePrevPage, handleNextPage]);

  // ─── Current data ─────────────────────────────────────────────
  const currentChapter = loadedChapters.get(currentChapterIndex);
  // For scroll mode header: use visibleChapterIndex
  const headerChapterIndex = settings.readMode === 'scroll' ? visibleChapterIndex : currentChapterIndex;
  const chapterMeta = bookMeta.chapterMeta[headerChapterIndex];
  const currentPageData = pages[pageIndex];

  // Build sorted list of chapters to render in scroll mode
  const scrollChapters = useMemo(() => {
    if (settings.readMode !== 'scroll') return [];
    const result: StoredChapter[] = [];
    for (let i = scrollChapterRange.start; i <= scrollChapterRange.end; i++) {
      const ch = loadedChapters.get(i);
      if (ch) result.push(ch);
    }
    return result;
  }, [settings.readMode, scrollChapterRange, loadedChapters]);

  const paraStyle = useMemo(() => ({
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    marginBottom: `${settings.paragraphSpacing}em`,
  }), [settings.fontSize, settings.lineHeight, settings.paragraphSpacing]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" ref={containerRef}>
      {/* Header */}
      <div ref={headerRef} className="flex-shrink-0 bg-white/80 glass border-b border-warm-100/40 px-5 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setShowToc(true)}
            className="flex items-center gap-1.5 text-[13px] text-warm-500 hover:text-warm-700 transition-colors"
          >
            <span className="truncate max-w-[200px] sm:max-w-[300px]">
              {chapterMeta?.title || '加载中...'}
            </span>
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3 text-[11px] text-warm-300 font-medium">
            <span>{chapterMeta?.wordCount || 0} 字</span>
            <span className="w-px h-3 bg-warm-200" />
            <span>{headerChapterIndex + 1}/{bookMeta.chapterCount}</span>
            <span className="w-px h-3 bg-warm-200" />
            <span className="text-accent/70">{quotes.length} 句</span>
          </div>
        </div>
      </div>

      {/* Content area */}
      {settings.readMode === 'pageTurn' ? (
        /* ── Page Turn Mode ── */
        <div
          className="flex-1 overflow-hidden bg-warm-50 min-h-0"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <div
            ref={contentRef}
            className={`max-w-3xl mx-auto px-6 sm:px-8 py-6 h-full overflow-hidden ${
              slideAnim === 'left' ? 'page-slide-left' : slideAnim === 'right' ? 'page-slide-right' : ''
            }`}
            style={{ fontFamily: '"Noto Serif SC", serif' }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : currentPageData ? (
              <>
                {currentPageData.showTitle && currentChapter?.title && (
                  <h2
                    className="font-semibold text-warm-700 select-none"
                    style={{
                      fontSize: `${Math.round(settings.fontSize * 1.25)}px`,
                      lineHeight: 1.4,
                      marginBottom: `${settings.fontSize * 1.5}px`,
                    }}
                  >
                    {currentChapter.title}
                  </h2>
                )}
                {currentPageData.paragraphs.map((pp, i) => (
                  <Paragraph
                    key={`${paginationVersion}-${pageIndex}-${i}`}
                    text={pp.text}
                    isQuoted={quotedTexts.has(pp.fullText)}
                    isSelected={selectedParas.has(pp.fullText)}
                    isMultiSelect={multiSelectMode}
                    style={paraStyle}
                    onContextMenu={(e) => handleContextMenu(e, pp.fullText, currentChapterIndex, currentChapter?.title || '')}
                    onTouchStart={(e) => multiSelectMode ? undefined : handleTouchStart(e, pp.fullText, currentChapterIndex, currentChapter?.title || '')}
                    onTouchEnd={multiSelectMode ? () => {} : handleTouchEnd}
                    onTouchMove={multiSelectMode ? () => {} : handleTouchMove}
                    onClick={multiSelectMode ? () => handleTogglePara(pp.fullText) : undefined}
                  />
                ))}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-warm-300 text-[13px]">暂无内容</div>
            )}
          </div>
        </div>
      ) : (
        /* ── Scroll Mode ── */
        <div
          ref={contentRef}
          className="flex-1 overflow-auto bg-warm-50"
          onScroll={handleScroll}
        >
          <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6" style={{ fontFamily: '"Noto Serif SC", serif' }}>
            {isLoading && scrollChapters.length === 0 ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {scrollChapters.map((chapter) => (
                  <div
                    key={chapter.index}
                    ref={el => { if (el) chapterRefs.current.set(chapter.index, el); else chapterRefs.current.delete(chapter.index); }}
                    data-chapter={chapter.index}
                  >
                    {/* Chapter divider (not for first rendered chapter) */}
                    {chapter.index > scrollChapterRange.start && (
                      <div className="py-6 text-center">
                        <div className="inline-block w-16 h-px bg-warm-200" />
                      </div>
                    )}
                    {chapter.title && (
                      <h2
                        className="font-semibold text-warm-700 select-none"
                        style={{
                          fontSize: `${Math.round(settings.fontSize * 1.25)}px`,
                          lineHeight: 1.4,
                          marginBottom: `${settings.fontSize * 1.5}px`,
                        }}
                      >
                        {chapter.title}
                      </h2>
                    )}
                    {chapter.paragraphs.map((text, i) => (
                      <Paragraph
                        key={`${chapter.index}-${i}`}
                        text={text}
                        isQuoted={quotedTexts.has(text)}
                        isSelected={selectedParas.has(text)}
                        isMultiSelect={multiSelectMode}
                        style={paraStyle}
                        onContextMenu={(e) => handleContextMenu(e, text, chapter.index, chapter.title)}
                        onTouchStart={(e) => multiSelectMode ? undefined : handleTouchStart(e, text, chapter.index, chapter.title)}
                        onTouchEnd={multiSelectMode ? () => {} : handleTouchEnd}
                        onTouchMove={multiSelectMode ? () => {} : handleTouchMove}
                        onClick={multiSelectMode ? () => handleTogglePara(text) : undefined}
                      />
                    ))}
                  </div>
                ))}

                {/* End indicator */}
                <div className="py-8 text-center">
                  <div className="inline-block w-12 h-px bg-warm-200 mb-3" />
                  <p className="text-[11px] text-warm-300">
                    {scrollChapterRange.end < bookMeta.chapterCount - 1
                      ? '继续滑动加载下一章'
                      : '已到达最后一章'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div ref={bottomBarRef} className="flex-shrink-0 bg-white/80 glass border-t border-warm-100/40">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            {/* Left: nav buttons */}
            <div className="flex items-center gap-1">
              <button onClick={handlePrevPage} className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-50 active:bg-warm-100 transition-colors">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={handleNextPage} className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-50 active:bg-warm-100 transition-colors">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Center: progress & mode */}
            <div className="flex items-center gap-3 text-[11px] text-warm-300">
              {settings.readMode === 'pageTurn' && pages.length > 0 && (
                <span className="font-medium">{pageIndex + 1} / {pages.length}</span>
              )}
              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  onUpdateSettings({ ...settings, readMode: settings.readMode === 'scroll' ? 'pageTurn' : 'scroll' });
                }}
                className="px-2.5 py-1 rounded-lg text-warm-400 hover:bg-warm-50 hover:text-warm-600 transition-colors text-[11px]"
              >
                {settings.readMode === 'scroll' ? '滚动' : '翻页'}
              </button>
            </div>

            {/* Right: auto-play & settings */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                className={`p-2 rounded-lg transition-colors ${
                  isAutoPlaying ? 'text-accent bg-accent/8' : 'text-warm-400 hover:text-warm-600 hover:bg-warm-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {isAutoPlaying ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  )}
                </svg>
              </button>
              <button
                onClick={() => setShowSettings(s => !s)}
                className={`p-2 rounded-lg transition-colors ${
                  showSettings ? 'text-accent bg-accent/8' : 'text-warm-400 hover:text-warm-600 hover:bg-warm-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="pt-3 border-t border-warm-100/40 mt-2 space-y-3 fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-warm-400 font-medium">字号</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateSettings({ ...settings, fontSize: Math.max(12, settings.fontSize - 2) })}
                    className="w-7 h-7 rounded-lg bg-warm-50 text-warm-500 text-[12px] hover:bg-warm-100 transition-colors flex items-center justify-center"
                  >A-</button>
                  <span className="text-[12px] text-warm-500 w-7 text-center font-medium">{settings.fontSize}</span>
                  <button
                    onClick={() => onUpdateSettings({ ...settings, fontSize: Math.min(28, settings.fontSize + 2) })}
                    className="w-7 h-7 rounded-lg bg-warm-50 text-warm-500 text-[12px] hover:bg-warm-100 transition-colors flex items-center justify-center"
                  >A+</button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-warm-400 font-medium">行高</span>
                <input type="range" min="1.4" max="2.4" step="0.1" value={settings.lineHeight}
                  onChange={e => onUpdateSettings({ ...settings, lineHeight: parseFloat(e.target.value) })} className="w-28" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-warm-400 font-medium">段距</span>
                <input type="range" min="0.5" max="2" step="0.1" value={settings.paragraphSpacing}
                  onChange={e => onUpdateSettings({ ...settings, paragraphSpacing: parseFloat(e.target.value) })} className="w-28" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-warm-400 font-medium">播放速度</span>
                <input type="range" min="0.3" max="3" step="0.1" value={settings.autoScrollSpeed}
                  onChange={e => onUpdateSettings({ ...settings, autoScrollSpeed: parseFloat(e.target.value) })} className="w-28" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TOC Modal ── */}
      {showToc && (
        <div className="fixed inset-0 z-50 bg-black/30 overlay-enter" onClick={() => setShowToc(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] bg-white rounded-t-2xl overflow-hidden slide-up shadow-[0_-4px_30px_-4px_rgba(0,0,0,0.1)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white/90 glass border-b border-warm-100/40 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-warm-800">目录</h3>
              <button onClick={() => setShowToc(false)} className="text-warm-300 hover:text-warm-500 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-auto max-h-[calc(70vh-52px)]">
              {bookMeta.chapterMeta.map((ch, i) => (
                <button
                  key={i} onClick={() => goToChapter(i)}
                  className={`w-full px-5 py-3.5 text-left transition-colors ${
                    i === currentChapterIndex ? 'bg-accent/[0.06] border-l-2 border-accent' : 'border-l-2 border-transparent hover:bg-warm-50'
                  }`}
                >
                  <div className={`text-[13px] truncate ${i === currentChapterIndex ? 'text-accent font-medium' : 'text-warm-600'}`}>{ch.title}</div>
                  <div className="text-[11px] text-warm-300 mt-0.5">{ch.wordCount} 字</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Action Menu ── */}
      {actionMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setActionMenu(null)}>
          <div
            className="absolute bg-white rounded-xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12)] border border-warm-100/60 overflow-hidden fade-in"
            style={{
              left: Math.min(actionMenu.x, window.innerWidth - 140),
              top: Math.min(actionMenu.y, window.innerHeight - 100),
            }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={handleSetQuote} className="w-full px-4 py-3 text-left text-[13px] hover:bg-warm-50 flex items-center gap-2.5 transition-colors text-warm-600">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {quotedTexts.has(actionMenu.text) ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                )}
              </svg>
              <span>{quotedTexts.has(actionMenu.text) ? '取消金句' : '设为金句'}</span>
            </button>
            <button onClick={handleCopy} className="w-full px-4 py-3 text-left text-[13px] hover:bg-warm-50 flex items-center gap-2.5 border-t border-warm-100/40 transition-colors text-warm-600">
              <svg className="w-4 h-4 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              <span>复制文本</span>
            </button>
            <button onClick={handleEnterMultiSelect} className="w-full px-4 py-3 text-left text-[13px] hover:bg-warm-50 flex items-center gap-2.5 border-t border-warm-100/40 transition-colors text-warm-600">
              <svg className="w-4 h-4 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>多选金句</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Author Picker ── */}
      {authorPicker && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center overlay-enter" onClick={() => setAuthorPicker(null)}>
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15)] w-[280px] max-h-[400px] overflow-hidden fade-in" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-warm-100/40">
              <h3 className="text-[14px] font-semibold text-warm-800 text-center">选择作者</h3>
            </div>
            <div className="overflow-auto max-h-[300px]">
              <button onClick={() => handleSelectAuthor(null)} className="w-full px-5 py-3.5 text-left text-[13px] text-warm-500 hover:bg-warm-50 transition-colors">不指定作者</button>
              {settings.authors.map(a => (
                <button key={a} onClick={() => handleSelectAuthor(a)} className="w-full px-5 py-3.5 text-left text-[13px] text-warm-700 hover:bg-warm-50 border-t border-warm-50/80 transition-colors">{a}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Multi-select Toolbar ── */}
      {multiSelectMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 glass rounded-2xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)] border border-warm-100/60 px-5 py-3 flex items-center gap-4 fade-in">
          <span className="text-[12px] text-warm-500">
            已选 <span className="text-accent font-semibold">{selectedParas.size}</span> 段
          </span>
          <button
            onClick={handleConfirmMultiSelect}
            disabled={selectedParas.size === 0}
            className="px-4 py-1.5 text-[12px] text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-40 font-medium"
          >
            合并为金句
          </button>
          <button
            onClick={handleCancelMultiSelect}
            className="px-3 py-1.5 text-[12px] text-warm-400 hover:text-warm-600 hover:bg-warm-50 rounded-lg transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-warm-800/90 glass text-white text-[13px] rounded-xl shadow-lg toast-in">
          {toast}
        </div>
      )}
    </div>
  );
});

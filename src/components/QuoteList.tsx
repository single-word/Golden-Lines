import { useState, useCallback, useMemo, memo } from 'react';
import type { QuoteItem } from '../types';
import type { BookMeta } from '../db';
import { exportQuotes } from '../utils';

// Clipboard helper: works on both HTTPS and HTTP
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for HTTP
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return Promise.resolve();
  } catch {
    document.body.removeChild(textarea);
    return Promise.reject(new Error('copy failed'));
  }
}

interface Props {
  bookMeta: BookMeta;
  quotes: QuoteItem[];
  onUpdateQuote: (id: string, updates: Partial<QuoteItem>) => void;
  onRemoveQuote: (id: string) => void;
  onNavigateToChapter?: (chapterIndex: number, quoteText: string) => void;
}

const QuoteCard = memo(function QuoteCard({
  quote,
  onUpdate,
  onRemove,
  onNavigate,
}: {
  quote: QuoteItem;
  onUpdate: (updates: Partial<QuoteItem>) => void;
  onRemove: () => void;
  onNavigate?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(quote.text);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  const handleSave = useCallback(() => {
    if (editText.trim() !== quote.text) {
      onUpdate({ text: editText.trim() });
    }
    setIsEditing(false);
  }, [editText, quote.text, onUpdate]);

  const handleCopy = useCallback(async () => {
    const source = quote.source || `《未知》${quote.chapterTitle}`;
    const fullText = `${quote.text}\n\n——${source}`;
    try {
      await copyToClipboard(fullText);
      setCopyStatus('ok');
    } catch {
      setCopyStatus('fail');
    }
    setTimeout(() => setCopyStatus('idle'), 1500);
  }, [quote.text, quote.source, quote.chapterTitle]);

  return (
    <div className="bg-white rounded-xl p-5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] border border-warm-100/50 card-hover">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[11px] font-mono text-accent/80 bg-accent/[0.06] px-2 py-0.5 rounded-md tracking-wide">
          #{quote.id}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-colors ${
              copyStatus === 'ok' ? 'text-green-500' : copyStatus === 'fail' ? 'text-red-400' : 'text-warm-300 hover:text-warm-500 hover:bg-warm-50'
            }`}
            title={copyStatus === 'ok' ? '已复制' : copyStatus === 'fail' ? '复制失败' : '复制'}
          >
            {copyStatus === 'ok' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 rounded-lg text-warm-300 hover:text-warm-500 hover:bg-warm-50 transition-colors"
            title="编辑"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg text-warm-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            title="删除"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full p-3 bg-warm-50/80 rounded-xl text-[13px] text-warm-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 border border-warm-100/40"
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditText(quote.text); setIsEditing(false); }}
              className="px-3.5 py-1.5 text-[12px] text-warm-400 hover:bg-warm-50 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3.5 py-1.5 text-[12px] text-white bg-accent hover:bg-accent-dark rounded-lg transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[14px] text-warm-700 leading-[1.8] whitespace-pre-wrap" style={{ fontFamily: '"Noto Serif SC", serif' }}>
          {quote.text}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-warm-100/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-warm-300">
        <div className="flex items-center gap-2 min-w-0">
          {quote.author && <span className="text-warm-500 font-medium">— {quote.author}</span>}
          <span className="truncate max-w-[240px]">{quote.source}</span>
        </div>
        {onNavigate && (
          <button
            onClick={onNavigate}
            className="flex items-center gap-1 text-accent/70 hover:text-accent transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            跳转
          </button>
        )}
      </div>
    </div>
  );
});

export const QuoteList = memo(function QuoteList({
  bookMeta,
  quotes,
  onUpdateQuote,
  onRemoveQuote,
  onNavigateToChapter,
}: Props) {
  const [filterChapter, setFilterChapter] = useState<number | null>(null);
  const [searchId, setSearchId] = useState('');

  const filteredQuotes = useMemo(() => {
    let result = quotes;

    if (filterChapter !== null) {
      result = result.filter(q => q.chapterIndex === filterChapter);
    }

    if (searchId.trim()) {
      result = result.filter(q => q.id.includes(searchId.trim()));
    }

    return result.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  }, [quotes, filterChapter, searchId]);

  // Get unique chapters that have quotes
  const chaptersWithQuotes = useMemo(() => {
    const indices = new Set(quotes.map(q => q.chapterIndex));
    return Array.from(indices).sort((a, b) => a - b);
  }, [quotes]);

  return (
    <div className="h-full flex flex-col bg-warm-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white/80 glass border-b border-warm-100/40 px-5 py-3.5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold text-warm-800">
              金句列表 <span className="text-accent/60 font-normal text-[12px] ml-1">{quotes.length}</span>
            </h2>
            {quotes.length > 0 && (
              <button
                onClick={() => exportQuotes(quotes)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-accent bg-accent/[0.06] rounded-lg hover:bg-accent/[0.12] transition-colors font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                导出
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select
              value={filterChapter ?? ''}
              onChange={(e) => setFilterChapter(e.target.value ? parseInt(e.target.value) : null)}
              className="flex-1 px-3 py-2 text-[12px] bg-warm-50/80 border border-warm-100/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/15 text-warm-600 appearance-none"
            >
              <option value="">全部章节</option>
              {chaptersWithQuotes.map(i => (
                <option key={i} value={i}>
                  第{i + 1}章 {bookMeta.chapterMeta[i]?.title || ''}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="搜索 ID"
              className="w-20 px-3 py-2 text-[12px] bg-warm-50/80 border border-warm-100/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/15 text-warm-600 placeholder:text-warm-300"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-3">
          {filteredQuotes.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warm-100/60 flex items-center justify-center float-anim">
                <svg className="w-7 h-7 text-warm-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </div>
              <p className="text-warm-400 text-[13px]">
                {quotes.length === 0 ? '还没有金句，去阅读中收集吧' : '没有匹配的金句'}
              </p>
            </div>
          ) : (
            filteredQuotes.map(quote => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                onUpdate={(updates) => onUpdateQuote(quote.id, updates)}
                onRemove={() => onRemoveQuote(quote.id)}
                onNavigate={onNavigateToChapter ? () => onNavigateToChapter(quote.chapterIndex, quote.text) : undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
});

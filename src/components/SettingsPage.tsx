import { useState, useCallback, memo } from 'react';
import type { AppSettings } from '../types';
import type { BookMeta } from '../db';

interface Props {
  settings: AppSettings;
  bookMeta: BookMeta;
  onUpdateSettings: (settings: AppSettings) => void;
  onUpdateBookTags: (tags: string[]) => void;
  onClearData: () => void;
  onReupload: () => void;
  onExportData?: () => void;
}

export const SettingsPage = memo(function SettingsPage({
  settings,
  bookMeta,
  onUpdateSettings,
  onUpdateBookTags,
  onClearData,
  onReupload,
  onExportData,
}: Props) {
  const [newAuthor, setNewAuthor] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showConfirm, setShowConfirm] = useState<'clear' | 'reupload' | null>(null);

  const handleAddAuthor = useCallback(() => {
    const trimmed = newAuthor.trim();
    if (trimmed && !settings.authors.includes(trimmed)) {
      onUpdateSettings({ ...settings, authors: [...settings.authors, trimmed] });
      setNewAuthor('');
    }
  }, [newAuthor, settings, onUpdateSettings]);

  const handleRemoveAuthor = useCallback((author: string) => {
    onUpdateSettings({ ...settings, authors: settings.authors.filter(a => a !== author) });
  }, [settings, onUpdateSettings]);

  const handleAddTag = useCallback(() => {
    const trimmed = newTag.trim();
    if (trimmed && !bookMeta.tags.includes(trimmed)) {
      onUpdateBookTags([...bookMeta.tags, trimmed]);
      setNewTag('');
    }
  }, [newTag, bookMeta.tags, onUpdateBookTags]);

  const handleRemoveTag = useCallback((tag: string) => {
    onUpdateBookTags(bookMeta.tags.filter(t => t !== tag));
  }, [bookMeta.tags, onUpdateBookTags]);

  return (
    <div className="h-full overflow-auto bg-warm-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Book Info */}
        <section className="bg-white rounded-xl p-5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] border border-warm-100/50">
          <h3 className="text-[13px] font-semibold text-warm-800 mb-4">当前书籍</h3>
          <div className="mb-4">
            <p className="text-[14px] font-medium text-warm-700">{bookMeta.title}</p>
            <p className="text-[11px] text-warm-300 mt-1">{bookMeta.chapterCount} 章节</p>
          </div>

          {/* Tags */}
          <div className="space-y-2.5">
            <label className="text-[11px] text-warm-400 font-medium">标签管理</label>
            <div className="flex flex-wrap gap-1.5">
              {bookMeta.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent/[0.06] text-accent-dark text-[11px] rounded-lg font-medium"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-accent/10 rounded-full p-0.5 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="添加标签"
                className="flex-1 px-3 py-2 text-[12px] bg-warm-50/80 rounded-xl border border-warm-100/40 focus:outline-none focus:ring-2 focus:ring-accent/15 placeholder:text-warm-300"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                className="px-3.5 py-2 text-[12px] text-white bg-accent rounded-xl disabled:opacity-40 hover:bg-accent-dark transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </section>

        {/* Authors */}
        <section className="bg-white rounded-xl p-5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] border border-warm-100/50">
          <h3 className="text-[13px] font-semibold text-warm-800 mb-1.5">作者 / 人物</h3>
          <p className="text-[11px] text-warm-300 mb-4">设置金句的可选作者标记</p>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {settings.authors.length === 0 ? (
              <span className="text-[11px] text-warm-300">暂无作者</span>
            ) : (
              settings.authors.map(author => (
                <span
                  key={author}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-warm-50 text-warm-600 text-[11px] rounded-lg font-medium border border-warm-100/40"
                >
                  {author}
                  <button
                    onClick={() => handleRemoveAuthor(author)}
                    className="hover:bg-warm-100 rounded-full p-0.5 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newAuthor}
              onChange={(e) => setNewAuthor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAuthor()}
              placeholder="添加作者"
              className="flex-1 px-3 py-2 text-[12px] bg-warm-50/80 rounded-xl border border-warm-100/40 focus:outline-none focus:ring-2 focus:ring-accent/15 placeholder:text-warm-300"
            />
            <button
              onClick={handleAddAuthor}
              disabled={!newAuthor.trim()}
              className="px-3.5 py-2 text-[12px] text-white bg-accent rounded-xl disabled:opacity-40 hover:bg-accent-dark transition-colors"
            >
              添加
            </button>
          </div>
        </section>

        {/* Reading Settings */}
        <section className="bg-white rounded-xl p-5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] border border-warm-100/50">
          <h3 className="text-[13px] font-semibold text-warm-800 mb-5">阅读设置</h3>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-warm-500">阅读模式</span>
              <div className="flex bg-warm-50 rounded-xl p-[3px] border border-warm-100/40">
                <button
                  onClick={() => onUpdateSettings({ ...settings, readMode: 'scroll' })}
                  className={`px-3.5 py-1.5 text-[11px] rounded-[10px] transition-all duration-200 font-medium ${
                    settings.readMode === 'scroll'
                      ? 'bg-white text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-warm-400'
                  }`}
                >
                  上下滚动
                </button>
                <button
                  onClick={() => onUpdateSettings({ ...settings, readMode: 'pageTurn' })}
                  className={`px-3.5 py-1.5 text-[11px] rounded-[10px] transition-all duration-200 font-medium ${
                    settings.readMode === 'pageTurn'
                      ? 'bg-white text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-warm-400'
                  }`}
                >
                  左右翻页
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-warm-500">字体大小</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateSettings({ ...settings, fontSize: Math.max(12, settings.fontSize - 2) })}
                  className="w-7 h-7 rounded-lg bg-warm-50 text-warm-500 text-[12px] hover:bg-warm-100 transition-colors flex items-center justify-center border border-warm-100/40"
                >
                  A-
                </button>
                <span className="text-[12px] text-warm-600 w-7 text-center font-medium">{settings.fontSize}</span>
                <button
                  onClick={() => onUpdateSettings({ ...settings, fontSize: Math.min(28, settings.fontSize + 2) })}
                  className="w-7 h-7 rounded-lg bg-warm-50 text-warm-500 text-[12px] hover:bg-warm-100 transition-colors flex items-center justify-center border border-warm-100/40"
                >
                  A+
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-warm-500">行高</span>
              <input
                type="range"
                min="1.4"
                max="2.4"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => onUpdateSettings({ ...settings, lineHeight: parseFloat(e.target.value) })}
                className="w-28"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-warm-500">段落间距</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.paragraphSpacing}
                onChange={(e) => onUpdateSettings({ ...settings, paragraphSpacing: parseFloat(e.target.value) })}
                className="w-28"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-warm-500">播放速度</span>
              <input
                type="range"
                min="0.3"
                max="3"
                step="0.1"
                value={settings.autoScrollSpeed}
                onChange={(e) => onUpdateSettings({ ...settings, autoScrollSpeed: parseFloat(e.target.value) })}
                className="w-28"
              />
            </div>
          </div>
        </section>

        {/* ID Settings */}
        <section className="bg-white rounded-xl p-5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] border border-warm-100/50">
          <h3 className="text-[13px] font-semibold text-warm-800 mb-4">ID 设置</h3>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-warm-500">起始 ID</span>
            <input
              type="number"
              min="1"
              value={settings.startingId}
              onChange={(e) => onUpdateSettings({ ...settings, startingId: parseInt(e.target.value) || 1 })}
              className="w-20 px-3 py-2 text-[12px] text-center bg-warm-50/80 rounded-xl border border-warm-100/40 focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-white rounded-xl p-5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] border border-warm-100/50">
          <h3 className="text-[13px] font-semibold text-red-500/80 mb-3">操作</h3>
          <div className="space-y-2">
            {onExportData && (
              <button
                onClick={onExportData}
                className="w-full px-4 py-2.5 text-[12px] text-accent bg-accent/[0.04] rounded-xl hover:bg-accent/[0.08] transition-colors border border-accent/20 flex items-center justify-center gap-2 font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                导出全部数据
              </button>
            )}
            <button
              onClick={() => setShowConfirm('reupload')}
              className="w-full px-4 py-2.5 text-[12px] text-warm-500 bg-warm-50/80 rounded-xl hover:bg-warm-100 transition-colors border border-warm-100/40"
            >
              重新上传书籍
            </button>
            <button
              onClick={() => setShowConfirm('clear')}
              className="w-full px-4 py-2.5 text-[12px] text-red-500/80 bg-red-50/50 rounded-xl hover:bg-red-50 transition-colors border border-red-100/30"
            >
              清除所有数据
            </button>
          </div>
        </section>

        {/* Tips */}
        <section className="bg-warm-100/30 rounded-xl p-5 border border-warm-100/30">
          <h3 className="text-[12px] font-medium text-warm-600 mb-2.5">使用提示</h3>
          <ul className="text-[11px] text-warm-400 space-y-1.5 leading-relaxed">
            <li>长按或右键段落可设为金句或复制</li>
            <li>翻页模式下左右滑动或点击按钮翻页</li>
            <li>滚动模式下点击播放按钮开启自动滚动</li>
            <li>键盘快捷键：左右方向键翻页，空格下一页</li>
          </ul>
        </section>

        <div className="h-4" />
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 overlay-enter">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15)] fade-in">
            <h3 className="text-[15px] font-semibold text-warm-800 mb-2">
              {showConfirm === 'clear' ? '确认清除所有数据？' : '确认重新上传？'}
            </h3>
            <p className="text-[13px] text-warm-400 mb-5 leading-relaxed">
              {showConfirm === 'clear'
                ? '这将删除书籍、金句和所有设置，此操作不可撤销。'
                : '这将删除当前书籍，但保留金句和设置。'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 px-4 py-2.5 text-[13px] text-warm-500 bg-warm-50 rounded-xl hover:bg-warm-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (showConfirm === 'clear') onClearData();
                  else onReupload();
                  setShowConfirm(null);
                }}
                className="flex-1 px-4 py-2.5 text-[13px] text-white bg-red-500/90 rounded-xl hover:bg-red-500 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

import { useState, useCallback, useRef, memo } from 'react';

interface Props {
  onBookLoaded: (file: File, tags: string[]) => void;
  isUploading?: boolean;
  onExport?: () => void;
  onImport?: (file: File) => void;
  isImporting?: boolean;
}

export const UploadPage = memo(function UploadPage({ onBookLoaded, isUploading, onExport, onImport, isImporting }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith('.epub')) {
      setFile(f);
    } else {
      alert('请上传 .epub 格式的文件');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  }, [handleAddTag, tagInput, tags.length]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!file) return;
    if (tags.length === 0) {
      alert('请至少添加一个标签');
      return;
    }
    onBookLoaded(file, tags);
  }, [file, tags, onBookLoaded]);

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-[0_8px_30px_-6px_rgba(176,141,110,0.4)]">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-warm-800 mb-1.5 tracking-wide">金句拾光</h1>
          <p className="text-warm-400 text-[13px] tracking-wider">阅读 · 摘录 · 收藏</p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-[0_2px_20px_-4px_rgba(0,0,0,0.06)] p-6 border border-warm-100/50">
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
              isDragging
                ? 'border-accent bg-accent-light scale-[1.01]'
                : file
                  ? 'border-warm-200 bg-warm-50'
                  : 'border-warm-200 hover:border-warm-300 hover:bg-warm-50/50'
            }`}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-warm-800 truncate max-w-[200px]">{file.name}</p>
                  <p className="text-[11px] text-warm-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="ml-2 p-1.5 rounded-full hover:bg-warm-100 text-warm-300 hover:text-warm-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-warm-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-warm-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-warm-600 text-[13px] mb-1">拖拽 EPUB 文件到这里</p>
                <p className="text-warm-300 text-[11px]">或点击选择文件</p>
              </>
            )}
            <input
              type="file"
              accept=".epub"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          {/* Tags Input */}
          <div className="mt-5">
            <label className="block text-[13px] font-medium text-warm-600 mb-2">
              标签 <span className="text-warm-300 font-normal text-[11px]">回车添加</span>
            </label>
            <div className="flex flex-wrap gap-1.5 p-3 bg-warm-50/80 rounded-xl min-h-[72px] border border-warm-100/60 focus-within:border-accent/30 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent/10 text-accent-dark text-[12px] rounded-lg font-medium"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-accent/10 rounded-full p-0.5 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={handleAddTag}
                placeholder={tags.length === 0 ? "如：哲学、人生、文学..." : ""}
                className="flex-1 min-w-[100px] bg-transparent outline-none text-warm-700 text-[13px] placeholder:text-warm-300"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!file || tags.length === 0 || isUploading}
            className={`w-full mt-5 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 ${
              file && tags.length > 0 && !isUploading
                ? 'bg-gradient-to-r from-accent to-accent-dark hover:shadow-[0_4px_16px_-2px_rgba(176,141,110,0.4)] active:scale-[0.98]'
                : 'bg-warm-200 text-warm-400 cursor-not-allowed'
            }`}
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                解析中...
              </span>
            ) : (
              '开始阅读'
            )}
          </button>
        </div>

        {/* Data Import/Export */}
        <div className="bg-white rounded-2xl shadow-[0_2px_20px_-4px_rgba(0,0,0,0.06)] p-5 border border-warm-100/50 mt-4">
          <h3 className="text-[13px] font-medium text-warm-600 mb-3">数据管理</h3>
          <div className="flex gap-3">
            {onExport && (
              <button
                onClick={onExport}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-medium text-accent border border-accent/20 bg-accent/[0.04] hover:bg-accent/[0.08] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                导出数据
              </button>
            )}
            {onImport && (
              <>
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-medium text-warm-600 border border-warm-200 bg-warm-50/50 hover:bg-warm-100/50 transition-colors disabled:opacity-50"
                >
                  {isImporting ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  )}
                  {isImporting ? '导入中...' : '导入数据'}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImport(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>
          <p className="text-[11px] text-warm-300 mt-2.5">包含书籍、金句、阅读进度和设置</p>
        </div>

        {/* Tips */}
        <p className="text-center text-warm-300 text-[11px] mt-5 tracking-wider">
          支持 EPUB 格式 · 数据保存在本地浏览器
        </p>
      </div>
    </div>
  );
});

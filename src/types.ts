export interface Chapter {
  title: string;
  paragraphs: string[];
  wordCount: number;
}

export interface BookData {
  title: string;
  chapters: Chapter[];
  tags: string[];
}

export interface QuoteItem {
  id: string;
  text: string;
  author: string | null;
  source: string | null;
  tags: string[] | null;
  chapterIndex: number;
  chapterTitle: string;
}

export type ReadMode = 'scroll' | 'pageTurn';

export interface AppSettings {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  startingId: number;
  authors: string[];
  autoScrollSpeed: number;
  readMode: ReadMode;
}

export interface ReadingProgress {
  chapterIndex: number;
  scrollTop: number;
  pageIndex?: number;
  targetText?: string; // text to locate after navigation
}

export type ViewType = 'read' | 'quotes' | 'settings';

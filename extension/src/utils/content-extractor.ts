/**
 * 内容提取工具 - 在 Content Script 中使用
 */
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

/**
 * 使用 Readability + Turndown 将 HTML 转换为 Markdown
 */
export function extractMarkdown(doc: Document): {
  title: string;
  content: string;
  textContent: string;
} | null {
  // 克隆 document 以避免修改原页面
  const documentClone = doc.cloneNode(true) as Document;

  // 使用 Readability 提取正文
  const reader = new Readability(documentClone);
  const article = reader.parse();

  if (!article) {
    // Fallback: 直接使用 body 内容
    const bodyText = doc.body?.textContent ?? '';
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    const markdown = turndown.turndown(doc.body?.innerHTML ?? '');
    return {
      title: doc.title,
      content: markdown,
      textContent: bodyText,
    };
  }

  // 使用 Turndown 将 HTML 转换为 Markdown
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    bulletListMarker: '-',
  });

  const markdown = turndown.turndown(article.content);

  return {
    title: article.title,
    content: markdown,
    textContent: article.textContent,
  };
}

/**
 * 获取纯文本
 */
export function extractText(doc: Document): string {
  return doc.body?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/**
 * 提取文章元信息
 */
export function extractArticle(doc: Document): {
  title: string;
  author: string | null;
  time: string | null;
  content: string;
} | null {
  const documentClone = doc.cloneNode(true) as Document;
  const reader = new Readability(documentClone);
  const article = reader.parse();

  if (!article) return null;

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  return {
    title: article.title,
    author: article.byline,
    time: article.publishedTime,
    content: turndown.turndown(article.content),
  };
}

/**
 * 提取表格数据
 */
export function extractTable(doc: Document, index = 0): Array<Record<string, string>> | null {
  const tables = doc.querySelectorAll('table');
  if (!tables.length || index >= tables.length) return null;

  const table = tables[index];
  const rows = table.querySelectorAll('tr');
  if (!rows.length) return null;

  // 从 thead 或第一行获取表头
  const headerCells = rows[0].querySelectorAll('th, td');
  const headers: string[] = [];
  headerCells.forEach((cell) => {
    headers.push(cell.textContent?.trim() ?? '');
  });

  // 没有表头时使用列索引
  const useIndexHeaders = headers.every((h) => !h);
  const result: Array<Record<string, string>> = [];

  const startRow = headers.some((h) => h) ? 1 : 0; // 跳过表头行
  for (let i = startRow; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll('td, th');
    const row: Record<string, string> = {};
    cells.forEach((cell, j) => {
      const key = useIndexHeaders ? `col_${j}` : headers[j] ?? `col_${j}`;
      row[key] = cell.textContent?.trim() ?? '';
    });
    if (Object.keys(row).length > 0) {
      result.push(row);
    }
  }

  return result;
}

/**
 * 提取所有链接
 */
export function extractLinks(doc: Document): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const anchors = doc.querySelectorAll('a[href]');

  anchors.forEach((a) => {
    const href = (a as HTMLAnchorElement).href;
    if (href && !href.startsWith('javascript:')) {
      links.push({
        text: a.textContent?.trim() ?? '',
        href,
      });
    }
  });

  return links;
}

/**
 * 提取所有图片
 */
export function extractImages(
  doc: Document,
  minWidth?: number,
  minHeight?: number,
): Array<{ src: string; alt: string; width: number; height: number }> {
  const images: Array<{ src: string; alt: string; width: number; height: number }> = [];
  const imgs = doc.querySelectorAll('img');

  imgs.forEach((img) => {
    const src = (img as HTMLImageElement).src;
    const width = (img as HTMLImageElement).width;
    const height = (img as HTMLImageElement).height;

    if (!src) return;
    if (minWidth && width < minWidth) return;
    if (minHeight && height < minHeight) return;

    images.push({
      src,
      alt: img.alt ?? '',
      width,
      height,
    });
  });

  return images;
}

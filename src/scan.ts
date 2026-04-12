// Comment scanner utility
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

export interface CommentMatch {
  file: string;
  line: number;
  keyword: string;
  text: string;
}

type CommentStyle = '//' | '#' | '<!--';

function getCommentStyle(ext: string): CommentStyle | null {
  switch (ext) {
    case '.ts': case '.js': case '.tsx': case '.jsx':
    case '.java': case '.c': case '.cpp': case '.h':
    case '.go': case '.rust': case '.rs': case '.swift':
    case '.kt': case '.cs':
      return '//';
    case '.py': case '.rb': case '.sh': case '.bash':
    case '.zsh': case '.yaml': case '.yml': case '.toml':
      return '#';
    case '.html': case '.xml':
      return '<!--';
    default:
      return null;
  }
}

function isExcluded(filePath: string, repoRoot: string, exclude: string[]): boolean {
  const rel = relative(repoRoot, filePath);
  const parts = rel.split('/');
  return parts.some(part => exclude.includes(part));
}

function walkDir(dir: string, repoRoot: string, exclude: string[]): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (isExcluded(fullPath, repoRoot, exclude)) continue;
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkDir(fullPath, repoRoot, exclude));
      } else if (stat.isFile()) {
        results.push(fullPath);
      }
    } catch {
      // skip inaccessible
    }
  }
  return results;
}

export function scanComments(repoRoot: string, patterns: string[], exclude: string[]): CommentMatch[] {
  const files = walkDir(repoRoot, repoRoot, exclude);
  const matches: CommentMatch[] = [];
  const upperPatterns = patterns.map(p => p.toUpperCase());

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const style = getCommentStyle(ext);
    if (!style) continue;

    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Check if line contains a comment marker
      let commentContent: string | null = null;

      if (style === '//') {
        const idx = line.indexOf('//');
        if (idx !== -1) {
          commentContent = line.slice(idx + 2).trim();
        }
      } else if (style === '#') {
        const idx = line.indexOf('#');
        if (idx !== -1) {
          commentContent = line.slice(idx + 1).trim();
        }
      } else if (style === '<!--') {
        const idx = line.indexOf('<!--');
        if (idx !== -1) {
          commentContent = line.slice(idx + 4).replace(/-->.*$/, '').trim();
        }
      }

      if (commentContent === null) continue;

      // Check for matching keywords
      const upperComment = commentContent.toUpperCase();
      for (const keyword of upperPatterns) {
        const kwIdx = upperComment.indexOf(keyword);
        if (kwIdx !== -1) {
          // Make sure it's a word boundary (keyword followed by non-alpha or end)
          const afterKw = upperComment[kwIdx + keyword.length];
          if (afterKw !== undefined && /[A-Z]/.test(afterKw)) continue;

          // Extract text after keyword
          let text = commentContent.slice(kwIdx + keyword.length).trim();
          // Strip leading ': ' if present
          if (text.startsWith(':')) {
            text = text.slice(1).trim();
          }

          matches.push({
            file,
            line: i + 1,
            keyword,
            text,
          });
          break; // only match first keyword per line
        }
      }
    }
  }

  return matches;
}

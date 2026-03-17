import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

function getAllTsxFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsxFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      files.push(full);
    }
  }
  return files;
}

describe('Architecture: no dead buttons', () => {
  it('every <Button> component has onAction prop or type="submit"', () => {
    const webSrc = resolve(__dirname, '../../');
    const files = getAllTsxFiles(webSrc).filter(f => !f.includes('__tests__') && !f.includes('setupTests'));
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      // Find <Button lines that have neither onAction nor type="submit"
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('<Button') && !line.includes('onAction') && !line.includes('type="submit"')) {
          // Check multi-line: look at next 7 lines
          const context = lines.slice(i, i + 8).join(' ');
          if (!context.includes('onAction') && !context.includes('type="submit"')) {
            violations.push(`${file}:${i + 1} — <Button> without onAction or type="submit"`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

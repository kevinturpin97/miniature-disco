import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const FORBIDDEN_IMPORTS_IN_PACKAGES = [
  'react-router',
  'react-router-dom',
  'axios',
  'framer-motion',
  'lottie-react',
  'driverjs',
  'localStorage',
  'window.location',
  'document.',
];

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

describe('Architecture: no platform-specific imports in packages/*', () => {
  // From apps/web/src/__tests__/architecture/, go up 6 levels to reach monorepo root, then packages/
  const packagesDir = resolve(__dirname, '../../../../../../packages');

  it('packages/core has no forbidden imports', () => {
    const coreDir = join(packagesDir, 'core', 'src');
    const files = getAllTsFiles(coreDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS_IN_PACKAGES) {
        if (content.includes(forbidden)) {
          violations.push(`${file}: found "${forbidden}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('packages/ui has no forbidden imports', () => {
    const uiDir = join(packagesDir, 'ui', 'src');
    const files = getAllTsFiles(uiDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS_IN_PACKAGES) {
        if (content.includes(forbidden)) {
          violations.push(`${file}: found "${forbidden}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

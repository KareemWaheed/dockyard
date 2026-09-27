import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === 'legacy' || f === '__tests__' ? [] : walk(p);
    return /\.(jsx?|mjs)$/.test(f) ? [p] : [];
  });

describe('no browser dialogs outside legacy (spec §6.1)', () => {
  it('has no alert/confirm/prompt calls', () => {
    const offenders = walk(SRC).filter((f) => /(?<![\w.])(window\.)?(alert|confirm|prompt)\(/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { scopeCss } from '../../../scripts/scope-legacy-css.mjs';

describe('scopeCss', () => {
  it('maps :root and body to the scope element', () => {
    const out = scopeCss(':root { --bg: #000; }\nbody { color: red; }');
    expect(out).toContain('.legacy-scope { --bg: #000; }');
    expect(out).toContain('.legacy-scope { color: red; }');
    expect(out).not.toMatch(/^\s*(:root|body)\b/m);
  });

  it('prefixes plain selectors, including each item of a selector list', () => {
    const out = scopeCss('.a, .b:hover > span { x: 1; }');
    expect(out).toContain('.legacy-scope .a,\n.legacy-scope .b:hover > span { x: 1; }');
  });

  it('rewrites the old light-theme selectors to the new dark-class mechanism', () => {
    const out = scopeCss(':root[data-theme="light"] { --bg: #fff; }\nhtml[data-theme="light"] .sidebar { y: 2; }');
    expect(out).toContain('html:not(.dark) .legacy-scope { --bg: #fff; }');
    expect(out).toContain('html:not(.dark) .legacy-scope .sidebar { y: 2; }');
    expect(out).not.toContain('data-theme');
  });

  it('recurses into @media and leaves @keyframes untouched', () => {
    const out = scopeCss('@media (max-width: 480px) { .row { a: 1; } }\n@keyframes spin { from { r: 0; } to { r: 1; } }');
    expect(out).toContain('@media (max-width: 480px) {\n.legacy-scope .row { a: 1; }');
    expect(out).toContain('@keyframes spin { from { r: 0; } to { r: 1; } }');
  });

  it('drops comments so braces inside them cannot confuse the scanner', () => {
    expect(scopeCss('/* { */ .a { b: 1; }')).toContain('.legacy-scope .a { b: 1; }');
  });
});

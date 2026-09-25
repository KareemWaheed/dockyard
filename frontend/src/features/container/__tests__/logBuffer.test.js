import { describe, it, expect } from 'vitest';
import { appendChunk } from '@/features/container/logBuffer';

describe('appendChunk', () => {
  it('splits complete lines and keeps the unfinished tail as partial', () => {
    expect(appendChunk([], '', 'a\nb\nc')).toEqual({ lines: ['a', 'b'], partial: 'c' });
  });
  it('joins a partial with the next chunk', () => {
    expect(appendChunk(['a'], 'hel', 'lo\n')).toEqual({ lines: ['a', 'hello'], partial: '' });
  });
  it('drops the oldest lines beyond the cap', () => {
    expect(appendChunk(['1', '2', '3'], '', '4\n5\n', 4)).toEqual({ lines: ['2', '3', '4', '5'], partial: '' });
  });
});

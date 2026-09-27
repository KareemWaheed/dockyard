export const MAX_LINES = 5000;

// Chunks from `docker logs -f` don't align with line boundaries; keep the tail as `partial`.
export function appendChunk(lines, partial, chunk, max = MAX_LINES) {
  const parts = (partial + chunk).split('\n');
  const rest = parts.pop();
  const next = parts.length ? lines.concat(parts) : lines;
  return { lines: next.length > max ? next.slice(next.length - max) : next, partial: rest };
}

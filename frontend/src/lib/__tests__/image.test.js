import { describe, it, expect } from 'vitest';
import { splitImage, imageTag } from '@/lib/image';

const IMAGE_CASES = [
  ['reg.example.com/ns/frontend:16.3.0-20', 'reg.example.com/ns/frontend', '16.3.0-20'],
  ['192.0.2.1:5000/app', '192.0.2.1:5000/app', 'latest'],
  ['192.0.2.1:5000/app:1.2', '192.0.2.1:5000/app', '1.2'],
  ['repo/app@sha256:abc123', 'repo/app', 'sha256:abc123'],
  ['app', 'app', 'latest'],
  ['', '', 'latest'],
];

describe('splitImage', () => {
  it.each(IMAGE_CASES)('%s', (image, repo, tag) => {
    expect(splitImage(image)).toEqual({ repo, tag });
    expect(imageTag(image)).toBe(tag);
  });
  it('treats undefined as empty', () => expect(splitImage(undefined)).toEqual({ repo: '', tag: 'latest' }));
});

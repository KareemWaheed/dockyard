import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagsInput } from '@/features/builds/TagsInput';
import { addTags } from '@/features/builds/buildArgs';

function Harness({ initial = [], onChange = () => {} }) {
  const [tags, setTags] = useState(initial);
  return <TagsInput id="t" value={tags} onChange={(v) => { setTags(v); onChange(v); }} />;
}

describe('addTags', () => {
  it('splits on commas and whitespace, skipping empties and duplicates', () => {
    expect(addTags(['a'], 'a, b,,c ')).toEqual({ tags: ['a', 'b', 'c'], invalid: [] });
  });
  it('reports entries that are not valid docker tags', () => {
    expect(addTags([], 'ok,bad/tag,-lead')).toEqual({ tags: ['ok'], invalid: ['bad/tag', '-lead'] });
  });
});

describe('TagsInput', () => {
  it('adds a chip on Enter and on comma', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'stage-latest{Enter}prod-latest,');
    expect(onChange).toHaveBeenLastCalledWith(['stage-latest', 'prod-latest']);
    expect(input).toHaveValue('');
  });
  it('commits pending text on blur so it is not lost when clicking Build', async () => {
    const onChange = vi.fn();
    render(<><Harness onChange={onChange} /><button>Build</button></>);
    await userEvent.type(screen.getByRole('textbox'), '16.4.0');
    await userEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(onChange).toHaveBeenLastCalledWith(['16.4.0']);
  });
  it('removes chips with the × button and with Backspace on an empty field', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['a', 'b', 'c']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag b' }));
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
    await userEvent.type(screen.getByRole('textbox'), '{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });
  it('keeps invalid text in the field with an error instead of adding it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'bad/tag{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('bad/tag');
    expect(screen.getByRole('textbox')).toHaveValue('bad/tag');
  });
});

describe('TagsInput review fixes (cubic, PR #7)', () => {
  it('lets Tab move focus on even with invalid text', async () => {
    render(<><Harness /><button>Next</button></>);
    await userEvent.type(screen.getByRole('textbox'), 'bad/tag');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });
  it('keeps typed text separate from a pasted list', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'foo');
    await userEvent.paste('bar,baz');
    expect(onChange).toHaveBeenLastCalledWith(['foo', 'bar', 'baz']);
  });
});

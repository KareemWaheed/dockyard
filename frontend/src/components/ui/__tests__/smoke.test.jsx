import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('toolchain', () => {
  it('renders a shadcn button through the @ alias', () => {
    render(<Button variant="destructive">Stop</Button>);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});

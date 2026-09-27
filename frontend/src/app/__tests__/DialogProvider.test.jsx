import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogProvider, useDialogs } from '@/app/DialogProvider';

let result;
function Trigger({ opts }) {
  const { confirm } = useDialogs();
  return <button onClick={async () => { result = await confirm(opts); }}>ask</button>;
}
const setup = (opts) => {
  result = undefined;
  render(<DialogProvider><Trigger opts={opts} /></DialogProvider>);
  return userEvent.setup();
};

describe('DialogProvider.confirm', () => {
  it('resolves ok on confirm and not ok on cancel', async () => {
    const user = setup({ title: 'Restart?', description: 'd', confirmLabel: 'Restart', level: 'confirm' });
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(result).toEqual({ ok: true, password: undefined });
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(result).toEqual({ ok: false });
  });

  it('typed level only enables confirm when the env key is typed exactly', async () => {
    const user = setup({ title: 'Stop?', description: 'd', confirmLabel: 'Stop', level: 'typed', typedValue: 'prod', destructive: true });
    await user.click(screen.getByText('ask'));
    const button = screen.getByRole('button', { name: 'Stop' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type prod to confirm/), 'pro');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type prod to confirm/), 'd{Enter}');
    expect(result).toEqual({ ok: true, password: undefined });
  });

  it('collects the managed password when required', async () => {
    const user = setup({ title: 'Manage?', description: 'd', confirmLabel: 'Manage', level: 'confirm', requirePassword: true });
    await user.click(screen.getByText('ask'));
    expect(screen.getByRole('button', { name: 'Manage' })).toBeDisabled();
    await user.type(screen.getByLabelText('Managed password'), 's3cret{Enter}');
    expect(result).toEqual({ ok: true, password: 's3cret' });
  });

  it('cancels a pending confirmation when another one is requested (cubic #28)', async () => {
    const results = [];
    function Two() {
      const { confirm } = useDialogs();
      const ask = () => {
        confirm({ title: 'First?', description: 'd' }).then((r) => results.push(['first', r]));
        confirm({ title: 'Second?', description: 'd' }).then((r) => results.push(['second', r]));
      };
      return <button onClick={ask}>two</button>;
    }
    render(<DialogProvider><Two /></DialogProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByText('two'));
    expect(await screen.findByRole('heading', { name: 'Second?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(results).toEqual([['first', { ok: false }], ['second', { ok: true, password: undefined }]]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: () => void) => cb()),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn().mockResolvedValue(''),
  input: vi.fn().mockResolvedValue(''),
}));

const { feedbackCommand } = await import('../../src/commands/feedback.js');

describe('feedbackCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('is a function', () => {
    expect(typeof feedbackCommand).toBe('function');
  });

  it('does nothing and prints a hint when rating and message are both empty', async () => {
    await feedbackCommand(undefined, {});
    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Nothing to send');
  });

  it('builds and opens a GitHub issue URL for a message-only submission', async () => {
    await feedbackCommand('drafts feel repetitive', {});
    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('github.com');
    expect(output).toContain('issues/new');
  });

  it('submits rating-only feedback to Formspree instead of opening GitHub', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await feedbackCommand(undefined, { rating: '5' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://formspree.io/f/xkjgrwdq',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.rating).toBe('5');

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Thanks for the rating');
    expect(output).not.toContain('github.com');

    vi.unstubAllGlobals();
  });

  it('shows a fallback message when the rating submission fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await feedbackCommand(undefined, { rating: '2' });

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Couldn’t send the rating');

    vi.unstubAllGlobals();
  });

  it('opens a GitHub issue URL when a rating is paired with a message', async () => {
    await feedbackCommand('drafts feel repetitive', { rating: '3' });
    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('github.com');
    expect(output).toContain('issues/new');
  });
});

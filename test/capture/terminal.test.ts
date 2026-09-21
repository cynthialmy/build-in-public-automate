import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import {
  recordTerminalSession,
  convertCastToGif,
  describeAsciinemaError,
  describeAggError,
} from '../../src/capture/terminal.js';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

/** A fake child process: emits stderr chunks, then closes with `code`, or emits `error`. */
function fakeProcess() {
  const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  proc.stderr = new EventEmitter();
  return proc;
}

describe('recordTerminalSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('spawns asciinema with inherited stdio and resolves the cast path on success', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = recordTerminalSession('out.cast');
    proc.emit('close', 0);

    await expect(promise).resolves.toBe('out.cast');
    expect(spawnMock).toHaveBeenCalledWith('asciinema', ['rec', 'out.cast'], { stdio: 'inherit' });
  });

  it('passes --window-size when cols/rows are given', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = recordTerminalSession('out.cast', { cols: 100, rows: 30 });
    proc.emit('close', 0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      'asciinema',
      ['rec', 'out.cast', '--window-size', '100x30'],
      { stdio: 'inherit' }
    );
  });

  it('rejects when asciinema exits non-zero', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = recordTerminalSession('out.cast');
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('exited with code 1');
  });

  it('rejects when asciinema is not installed', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = recordTerminalSession('out.cast');
    proc.emit('error', new Error('spawn asciinema ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });
});

describe('convertCastToGif', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs agg and resolves the gif path on success', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertCastToGif('in.cast', 'out.gif');
    proc.emit('close', 0);

    await expect(promise).resolves.toBe('out.gif');
    expect(spawnMock).toHaveBeenCalledWith('agg', ['in.cast', 'out.gif']);
  });

  it('passes --theme when given', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertCastToGif('in.cast', 'out.gif', { theme: 'dracula' });
    proc.emit('close', 0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith('agg', ['in.cast', 'out.gif', '--theme', 'dracula']);
  });

  it('rejects with stderr output when agg exits non-zero', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertCastToGif('in.cast', 'out.gif');
    proc.stderr.emit('data', Buffer.from('invalid cast file'));
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('invalid cast file');
  });

  it('rejects when agg is not installed', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertCastToGif('in.cast', 'out.gif');
    proc.emit('error', new Error('spawn agg ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });
});

describe('describeAsciinemaError', () => {
  it('gives an actionable message when asciinema is missing', () => {
    expect(describeAsciinemaError(new Error('spawn asciinema ENOENT'))).toContain('asciinema not found');
  });

  it('trims other errors to the last few stderr lines', () => {
    const err = new Error('line1\nline2\nline3\nline4\nline5');
    expect(describeAsciinemaError(err)).toBe('line3 line4 line5');
  });

  it('stringifies non-Error values', () => {
    expect(describeAsciinemaError('boom')).toBe('boom');
  });
});

describe('describeAggError', () => {
  it('gives an actionable message when agg is missing', () => {
    expect(describeAggError(new Error('spawn agg ENOENT'))).toContain('agg not found');
  });

  it('trims other errors to the last few stderr lines', () => {
    const err = new Error('line1\nline2\nline3\nline4\nline5');
    expect(describeAggError(err)).toBe('line3 line4 line5');
  });

  it('stringifies non-Error values', () => {
    expect(describeAggError('boom')).toBe('boom');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { convertToMp4, convertToGif, describeFfmpegError } from '../../src/capture/convert.js';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

/** A fake ffmpeg child process: emits stderr chunks, then closes with `code`, or emits `error`. */
function fakeProcess() {
  const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  proc.stderr = new EventEmitter();
  return proc;
}

describe('convertToMp4', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs ffmpeg with libx264/yuv420p and resolves the output path on success', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertToMp4('in.webm', 'out.mp4');
    proc.emit('close', 0);

    await expect(promise).resolves.toBe('out.mp4');
    expect(spawnMock).toHaveBeenCalledWith('ffmpeg', [
      '-y',
      '-i',
      'in.webm',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      'out.mp4',
    ]);
  });

  it('rejects with stderr output when ffmpeg exits non-zero', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertToMp4('in.webm', 'out.mp4');
    proc.stderr.emit('data', Buffer.from('Unknown encoder'));
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('Unknown encoder');
  });

  it('rejects when ffmpeg is not installed', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertToMp4('in.webm', 'out.mp4');
    proc.emit('error', new Error('spawn ffmpeg ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });
});

describe('convertToGif', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies default fps/width in the fps,scale filter', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertToGif('in.webm', 'out.gif');
    proc.emit('close', 0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith('ffmpeg', [
      '-y',
      '-i',
      'in.webm',
      '-vf',
      'fps=10,scale=480:-1:flags=lanczos',
      'out.gif',
    ]);
  });

  it('honors custom fps/width', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc as never);

    const promise = convertToGif('in.webm', 'out.gif', { fps: 24, width: 720 });
    proc.emit('close', 0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith('ffmpeg', [
      '-y',
      '-i',
      'in.webm',
      '-vf',
      'fps=24,scale=720:-1:flags=lanczos',
      'out.gif',
    ]);
  });
});

describe('describeFfmpegError', () => {
  it('gives an actionable message when ffmpeg is missing', () => {
    expect(describeFfmpegError(new Error('spawn ffmpeg ENOENT'))).toContain('ffmpeg not found');
  });

  it('trims other errors to the last few stderr lines', () => {
    const err = new Error('line1\nline2\nline3\nline4\nline5');
    expect(describeFfmpegError(err)).toBe('line3 line4 line5');
  });

  it('stringifies non-Error values', () => {
    expect(describeFfmpegError('boom')).toBe('boom');
  });
});

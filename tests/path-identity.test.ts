import { describe, expect, it } from 'vitest';
import {
  isBlacklistedPath,
  normalizeAppPath
} from '../src/main/path-identity.js';

describe('application path identity', () => {
  it('matches Windows paths case-insensitively and normalizes separators', () => {
    const saved = normalizeAppPath(
      'C:\\Games\\Example\\GAME.EXE',
      'win32'
    );

    expect(
      isBlacklistedPath(
        'c:/Games/Example/game.exe',
        [saved],
        'win32'
      )
    ).toBe(true);
  });

  it('preserves macOS path casing', () => {
    const saved = normalizeAppPath('/Applications/Focus.app', 'darwin');

    expect(
      isBlacklistedPath('/Applications/Focus.app', [saved], 'darwin')
    ).toBe(true);
    expect(
      isBlacklistedPath('/Applications/focus.app', [saved], 'darwin')
    ).toBe(false);
  });

  it('fails open when foreground detection provides no path', () => {
    expect(isBlacklistedPath(undefined, ['anything'], 'win32')).toBe(false);
  });
});

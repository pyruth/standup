import path from 'node:path';
import type { SupportedPlatform } from '../shared/types.js';

export function normalizeAppPath(
  appPath: string,
  platform: SupportedPlatform
): string {
  const normalized = path.normalize(appPath.trim()).replace(/[\\/]+$/, '');
  return platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

export function isBlacklistedPath(
  activePath: string | undefined,
  blacklistedPaths: string[],
  platform: SupportedPlatform
): boolean {
  if (!activePath) {
    return false;
  }

  const normalized = normalizeAppPath(activePath, platform);
  return blacklistedPaths.includes(normalized);
}

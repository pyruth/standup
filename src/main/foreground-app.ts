import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SupportedPlatform } from '../shared/types.js';

interface ActiveWindowResult {
  owner?: {
    path?: string;
  };
}

interface WindowsAddon {
  getActiveWindow(): ActiveWindowResult | undefined;
}

interface ForegroundAppOptions {
  platform: SupportedPlatform;
  packageRoot: string;
  architecture?: string;
}

const require = createRequire(import.meta.url);
const execFile = promisify(childProcess.execFile);
let windowsAddon: WindowsAddon | null = null;

function loadWindowsAddon(
  packageRoot: string,
  architecture: string
): WindowsAddon {
  if (windowsAddon) {
    return windowsAddon;
  }

  const bindingPath = path.join(
    packageRoot,
    'lib',
    'binding',
    `napi-9-win32-unknown-${architecture}`,
    'node-get-windows.node'
  );
  if (!fs.existsSync(bindingPath)) {
    throw new Error(`Foreground application binding is missing: ${bindingPath}`);
  }

  windowsAddon = require(bindingPath) as WindowsAddon;
  return windowsAddon;
}

export async function detectForegroundAppPath({
  platform,
  packageRoot,
  architecture = process.arch
}: ForegroundAppOptions): Promise<string | undefined> {
  if (platform === 'win32') {
    return loadWindowsAddon(packageRoot, architecture).getActiveWindow()?.owner
      ?.path;
  }

  const binaryPath = path.join(packageRoot, 'main');
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Foreground application helper is missing: ${binaryPath}`);
  }

  const { stdout } = await execFile(binaryPath, [
    '--no-accessibility-permission',
    '--no-screen-recording-permission'
  ]);
  const result = JSON.parse(String(stdout)) as ActiveWindowResult;
  return result.owner?.path;
}

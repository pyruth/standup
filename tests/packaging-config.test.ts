import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const tauriConfig = JSON.parse(
  fs.readFileSync(
    path.join(projectRoot, 'src-tauri', 'tauri.conf.json'),
    'utf8'
  )
) as {
  app: {
    security: {
      csp: Record<string, string>;
      capabilities: string[];
    };
  };
  bundle: {
    targets: string[];
    macOS: { minimumSystemVersion: string };
    windows: { webviewInstallMode: { type: string } };
  };
};

describe('Tauri v2 release packaging configuration', () => {
  it('builds only the requested Windows x64 and Apple Silicon artifacts', () => {
    expect(packageJson.scripts['dist:win']).toContain(
      '--target x86_64-pc-windows-msvc'
    );
    expect(packageJson.scripts['dist:mac']).toContain(
      '--target aarch64-apple-darwin'
    );
    expect(tauriConfig.bundle.targets).toEqual(['nsis', 'dmg']);
    expect(tauriConfig.bundle.macOS.minimumSystemVersion).toBe('12.0');
  });

  it('does not include auto-update or runtime network packages', () => {
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.devDependencies)
    ];
    expect(dependencyNames.some((name) => name.includes('updater'))).toBe(false);
    expect(dependencyNames.some((name) => name.includes('http'))).toBe(false);
    expect(tauriConfig.app.security.csp['connect-src']).toBe(
      'ipc: http://ipc.localhost'
    );
  });

  it('uses explicit per-window capabilities', () => {
    expect(tauriConfig.app.security.capabilities).toEqual([
      'settings',
      'popup'
    ]);

    const capabilityText = ['settings.json', 'popup.json']
      .map((file) =>
        fs.readFileSync(
          path.join(projectRoot, 'src-tauri', 'capabilities', file),
          'utf8'
        )
      )
      .join('\n');
    expect(capabilityText).not.toContain('shell:');
    expect(capabilityText).not.toContain('fs:');
    expect(capabilityText).not.toContain('http:');
    expect(capabilityText).not.toContain('updater:');
  });

  it('keeps the normal installer small by bootstrapping WebView2', () => {
    expect(tauriConfig.bundle.windows.webviewInstallMode.type).toBe(
      'downloadBootstrapper'
    );
  });
});

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
    windows: {
      nsis: {
        installerIcon: string;
        uninstallerIcon: string;
      };
      webviewInstallMode: { type: string };
    };
  };
};

describe('Tauri v3 release packaging configuration', () => {
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

  it('ships only bundled reminder visuals without an animation runtime', () => {
    expect(packageJson.dependencies['lottie-web']).toBeUndefined();

    const popupSource = fs.readFileSync(
      path.join(projectRoot, 'src', 'renderer', 'popup.ts'),
      'utf8'
    );
    const reminderSource = fs.readFileSync(
      path.join(projectRoot, 'src-tauri', 'src', 'reminder.rs'),
      'utf8'
    );
    expect(popupSource).toContain("standup-reminder.gif?url");
    expect(reminderSource).not.toContain('./assets/standup-reminder.gif');
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

    const popupCapability = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'src-tauri', 'capabilities', 'popup.json'),
        'utf8'
      )
    ) as { windows: string[] };
    expect(popupCapability.windows).toEqual(['reminder-*']);
  });

  it('keeps the normal installer small by bootstrapping WebView2', () => {
    expect(tauriConfig.bundle.windows.webviewInstallMode.type).toBe(
      'downloadBootstrapper'
    );
  });

  it('brands the installer and uninstaller with the StandUp logo', () => {
    expect(tauriConfig.bundle.windows.nsis.installerIcon).toBe(
      'icons/icon.ico'
    );
    expect(tauriConfig.bundle.windows.nsis.uninstallerIcon).toBe(
      'icons/icon.ico'
    );
    expect(
      fs.existsSync(
        path.join(projectRoot, 'src-tauri', 'icons', 'icon.ico')
      )
    ).toBe(true);
  });

  it('does not open a console window in Windows release builds', () => {
    const rustEntryPoint = fs.readFileSync(
      path.join(projectRoot, 'src-tauri', 'src', 'main.rs'),
      'utf8'
    );
    expect(rustEntryPoint).toContain(
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]'
    );
  });

  it('keeps Windows packaging and gates notarized macOS releases on secrets', () => {
    const workflow = fs.readFileSync(
      path.join(projectRoot, '.github', 'workflows', 'build.yml'),
      'utf8'
    );

    expect(workflow).toContain('name: Package Windows x64');
    expect(workflow).toContain('name: Package macOS Apple Silicon');
    expect(workflow).toContain('environment: apple');
    expect(workflow).toContain(
      'APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}'
    );
    expect(workflow).toContain(
      'APPLE_API_KEY_BASE64: ${{ secrets.APPLE_API_KEY_BASE64 }}'
    );
    expect(workflow).toContain('Verify signed and notarized application');
    expect(workflow).toContain('Build signed and notarized DMG');
    expect(workflow).toContain('Build validation DMG');
    expect(workflow).toContain('APPLE_SIGNING_IDENTITY=-');
  });
});

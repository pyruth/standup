import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageConfiguration {
  scripts: Record<string, string>;
  build: {
    files: string[];
  };
}

describe('release packaging configuration', () => {
  const configuration = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
  ) as PackageConfiguration;

  it('disables electron-builder implicit CI publishing', () => {
    expect(configuration.scripts['dist:win']).toContain('--publish never');
    expect(configuration.scripts['dist:mac']).toContain('--publish never');
  });

  it('excludes unused Darwin native bindings from universal builds', () => {
    const excludedBindings = configuration.build.files.filter((pattern) =>
      pattern.includes('get-windows/lib/binding')
    );

    expect(excludedBindings).toEqual(
      expect.arrayContaining([
        '!node_modules/get-windows/lib/binding/napi-6-darwin-unknown-arm64/**/*',
        '!node_modules/get-windows/lib/binding/napi-6-darwin-unknown-x64/**/*',
        '!node_modules/get-windows/lib/binding/napi-9-darwin-unknown-arm64/**/*'
      ])
    );
  });
});

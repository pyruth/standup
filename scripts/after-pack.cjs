const fs = require('node:fs');
const path = require('node:path');

/**
 * The get-windows macOS helper is a universal Mach-O executable. Ensure its
 * executable bit survives npm installation and app packaging before
 * electron-builder signs the complete application bundle.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const helperPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    'get-windows',
    'main'
  );

  fs.chmodSync(helperPath, 0o755);
};

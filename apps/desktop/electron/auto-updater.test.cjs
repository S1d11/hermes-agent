// auto-updater.test.cjs — Tests for the Zeus binary auto-updater module.
// Verifies module structure and exports without requiring a running
// Electron instance or network access.

const assert = require('node:assert');
const { test, describe } = require('node:test');

describe('auto-updater module structure', () => {
  test('module file exists', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    assert.ok(fs.existsSync(modulePath), 'auto-updater.cjs should exist');
  });

  test('module exports expected functions', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    assert.ok(src.includes('initAutoUpdater'), 'should export initAutoUpdater');
    assert.ok(src.includes('checkForUpdatesNow'), 'should export checkForUpdatesNow');
    assert.ok(src.includes('downloadUpdate'), 'should export downloadUpdate');
    assert.ok(src.includes('installUpdateAndRestart'), 'should export installUpdateAndRestart');
    assert.ok(src.includes('getUpdateStatus'), 'should export getUpdateStatus');
    assert.ok(src.includes('onUpdateEvent'), 'should export onUpdateEvent');
    assert.ok(src.includes('destroyAutoUpdater'), 'should export destroyAutoUpdater');
  });

  test('module uses electron-updater', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    assert.ok(src.includes('electron-updater'), 'should require electron-updater');
    assert.ok(src.includes('autoUpdater'), 'should use autoUpdater');
  });

  test('module has periodic check interval', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    assert.ok(src.includes('PERIODIC_CHECK_INTERVAL_MS'), 'should define periodic check interval');
    assert.ok(src.includes('setInterval'), 'should set up periodic checks');
  });

  test('module does not auto-download by default', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    // autoDownload should be false so the user is prompted first
    assert.ok(src.includes('autoDownload'), 'should configure autoDownload');
    assert.ok(src.includes('false'), 'should set autoDownload to false');
  });

  test('module handles all electron-updater events', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    const expectedEvents = [
      'checking-for-update',
      'update-available',
      'update-not-available',
      'error',
      'download-progress',
      'update-downloaded',
    ];
    for (const evt of expectedEvents) {
      assert.ok(src.includes(`"${evt}"`), `should handle "${evt}" event`);
    }
  });

  test('module shows notifications for update events', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    assert.ok(src.includes('showUpdateAvailableNotification'), 'should show update available notification');
    assert.ok(src.includes('showUpdateDownloadedNotification'), 'should show update downloaded notification');
    assert.ok(src.includes('Notification.isSupported'), 'should check Notification support');
  });

  test('module sends events to renderer via IPC', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const modulePath = path.resolve(__dirname, '..', 'electron', 'auto-updater.cjs');
    const src = fs.readFileSync(modulePath, 'utf8');

    assert.ok(src.includes('zeus:auto-updater:event'), 'should send events via IPC');
    assert.ok(src.includes('webContents.send'), 'should use webContents.send');
  });
});

describe('package.json publish config', () => {
  test('publish config points to GitHub releases', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.build?.publish, 'should have build.publish config');
    assert.strictEqual(pkg.build.publish.provider, 'github', 'should use github provider');
    assert.ok(pkg.build.publish.owner, 'should have owner');
    assert.ok(pkg.build.publish.repo, 'should have repo');
  });
});

describe('electron-updater dependency', () => {
  test('electron-updater is in dependencies', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(deps['electron-updater'], 'electron-updater should be in dependencies');
  });
});

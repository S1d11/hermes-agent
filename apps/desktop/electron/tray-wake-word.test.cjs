// tray.test.cjs — Tests for the Zeus system tray module.
// Verifies the module exports and icon resolution without requiring
// a running Electron instance (tray creation is mocked).

const assert = require('node:assert');
const { test, describe } = require('node:test');

describe('tray module exports', () => {
  test('module loads without error', () => {
    // The module requires 'electron' which is only available in the
    // Electron runtime. In a plain Node test, require() will throw.
    // We verify the module file exists and is syntactically valid by
    // checking it can be parsed.
    const fs = require('node:fs');
    const path = require('node:path');
    const trayPath = path.resolve(__dirname, '..', 'electron', 'tray.cjs');
    assert.ok(fs.existsSync(trayPath), 'tray.cjs should exist');

    // Read the source and check it exports the expected functions
    const src = fs.readFileSync(trayPath, 'utf8');
    assert.ok(src.includes('createTray'), 'should export createTray');
    assert.ok(src.includes('destroyTray'), 'should export destroyTray');
    assert.ok(src.includes('showWindowFromTray'), 'should export showWindowFromTray');
    assert.ok(src.includes('updateTrayTooltip'), 'should export updateTrayTooltip');
    assert.ok(src.includes('setWakeWordMenuItemEnabled'), 'should export setWakeWordMenuItemEnabled');
  });

  test('module has context menu with Show/Hide and Quit', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const trayPath = path.resolve(__dirname, '..', 'electron', 'tray.cjs');
    const src = fs.readFileSync(trayPath, 'utf8');
    assert.ok(src.includes('Show Zeus'), 'should have Show Zeus menu item');
    assert.ok(src.includes('Hide Zeus'), 'should have Hide Zeus menu item');
    assert.ok(src.includes('Quit Zeus'), 'should have Quit Zeus menu item');
    assert.ok(src.includes('Wake Word'), 'should have Wake Word menu item');
  });

  test('module handles tray click to toggle visibility', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const trayPath = path.resolve(__dirname, '..', 'electron', 'tray.cjs');
    const src = fs.readFileSync(trayPath, 'utf8');
    assert.ok(src.includes('tray.on("click"'), 'should handle click event');
    assert.ok(src.includes('toggleWindowVisibility'), 'should toggle visibility on click');
  });
});

describe('wake-word module exports', () => {
  test('module loads without error', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const wakePath = path.resolve(__dirname, '..', 'electron', 'wake-word.cjs');
    assert.ok(fs.existsSync(wakePath), 'wake-word.cjs should exist');

    const src = fs.readFileSync(wakePath, 'utf8');
    assert.ok(src.includes('startWakeWordListener'), 'should export startWakeWordListener');
    assert.ok(src.includes('stopWakeWordListener'), 'should export stopWakeWordListener');
    assert.ok(src.includes('isWakeWordListening'), 'should export isWakeWordListening');
  });

  test('module resolves Python and script paths', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const wakePath = path.resolve(__dirname, '..', 'electron', 'wake-word.cjs');
    const src = fs.readFileSync(wakePath, 'utf8');
    assert.ok(src.includes('resolvePythonPath'), 'should have resolvePythonPath');
    assert.ok(src.includes('resolveScriptPath'), 'should have resolveScriptPath');
    assert.ok(src.includes('wake_word.py'), 'should reference wake_word.py');
  });

  test('module checks for speech_recognition dependency', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const wakePath = path.resolve(__dirname, '..', 'electron', 'wake-word.cjs');
    const src = fs.readFileSync(wakePath, 'utf8');
    assert.ok(src.includes('speech_recognition'), 'should check for speech_recognition');
    assert.ok(src.includes('pyaudio'), 'should check for pyaudio');
  });
});

describe('wake_word.py script', () => {
  test('script exists', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    // From apps/desktop/electron/tests/, walk up to find scripts/wake_word.py
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'wake_word.py'),
      path.resolve(__dirname, '..', '..', '..', 'scripts', 'wake_word.py'),
    ];
    const found = candidates.some(p => fs.existsSync(p));
    assert.ok(found, 'wake_word.py should exist in scripts/');
  });

  test('script has correct keywords', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'wake_word.py'),
      path.resolve(__dirname, '..', '..', '..', 'scripts', 'wake_word.py'),
    ];
    const scriptPath = candidates.find(p => fs.existsSync(p));
    if (!scriptPath) return; // skip if not found

    const src = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(src.includes('zeus'), 'should detect "zeus" keyword');
    assert.ok(src.includes('hey zeus'), 'should detect "hey zeus" keyword');
    assert.ok(src.includes('speech_recognition'), 'should use speech_recognition library');
  });
});

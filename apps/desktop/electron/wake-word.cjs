// wake-word.cjs — Wake word listener for Zeus desktop.
//
// Spawns a Python subprocess (scripts/wake_word.py) that continuously
// listens to the microphone for "zeus" or "hey zeus". When the wake
// word is detected, the Python script prints a JSON line to stdout,
// which this module reads and forwards to a callback.
//
// The callback typically brings the main window to the foreground.
//
// Exports:
//   startWakeWordListener(opts) → boolean (true if started successfully)
//     opts: { onDetected: (phrase, fullText) => void,
//             onError: (msg) => void,
//             onStatus: (msg) => void,
//             pythonPath: string (optional override),
//             scriptPath: string (optional override) }
//   stopWakeWordListener()
//   isWakeWordListening() → boolean

"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let wakeWordProcess = null;
let listening = false;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolvePythonPath() {
  // Try python, then python3
  const { execFileSync } = require("child_process");
  for (const cmd of ["python", "python3"]) {
    try {
      execFileSync(cmd, ["--version"], { stdio: "ignore", timeout: 3000 });
      return cmd;
    } catch {
      // try next
    }
  }
  return null;
}

function resolveScriptPath() {
  // The wake_word.py script lives in <repo>/scripts/wake_word.py
  // From apps/desktop/electron/, that's ../../../scripts/wake_word.py
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "scripts", "wake_word.py"),
    path.resolve(__dirname, "..", "..", "scripts", "wake_word.py"),
    path.resolve(process.resourcesPath || __dirname, "scripts", "wake_word.py"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wake word listener
// ---------------------------------------------------------------------------

/**
 * Start the wake word listener.
 *
 * @param {Object} opts
 * @param {Function} opts.onDetected - called with (phrase, fullText) when wake word is heard
 * @param {Function} opts.onError - called with (message) on errors
 * @param {Function} opts.onStatus - called with (message) for status updates
 * @param {string} [opts.pythonPath] - override Python executable path
 * @param {string} [opts.scriptPath] - override wake_word.py path
 * @returns {boolean} true if started successfully
 */
function startWakeWordListener(opts = {}) {
  if (wakeWordProcess && wakeWordProcess.exitCode === null) {
    // Already running
    return true;
  }

  const pythonPath = opts.pythonPath || resolvePythonPath();
  if (!pythonPath) {
    opts.onError?.("Python not found. Install Python 3.8+ and ensure it's on PATH.");
    return false;
  }

  const scriptPath = opts.scriptPath || resolveScriptPath();
  if (!scriptPath) {
    opts.onError?.("wake_word.py script not found.");
    return false;
  }

  // Check if speech_recognition is installed
  try {
    const { execFileSync } = require("child_process");
    execFileSync(pythonPath, ["-c", "import speech_recognition, pyaudio"], {
      stdio: "ignore",
      timeout: 5000,
    });
  } catch {
    opts.onError?.(
      'Python dependencies missing. Install with: pip install SpeechRecognition PyAudio'
    );
    return false;
  }

  try {
    wakeWordProcess = spawn(pythonPath, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (e) {
    opts.onError?.(`Failed to start wake word process: ${e.message}`);
    return false;
  }

  listening = true;
  let buffer = "";

  // Read stdout line-by-line (JSON events)
  wakeWordProcess.stdout.on("data", (data) => {
    buffer += data.toString("utf8");
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (event.detected) {
          opts.onDetected?.(event.phrase, event.full_text || event.phrase);
        } else if (event.status) {
          opts.onStatus?.(event.status);
        } else if (event.error) {
          opts.onError?.(event.error);
        }
      } catch {
        // Not JSON, ignore
      }
    }
  });

  // Log stderr for debugging
  wakeWordProcess.stderr.on("data", (data) => {
    const msg = data.toString("utf8").trim();
    if (msg) {
      // Wake word stderr is informational (logging), not an error
      // Only forward to onStatus for visibility
      opts.onStatus?.(msg);
    }
  });

  wakeWordProcess.on("error", (err) => {
    listening = false;
    opts.onError?.(`Wake word process error: ${err.message}`);
  });

  wakeWordProcess.on("exit", (code, signal) => {
    listening = false;
    if (code !== 0 && code !== null) {
      opts.onError?.(`Wake word process exited with code ${code}`);
    }
  });

  return true;
}

/**
 * Stop the wake word listener.
 */
function stopWakeWordListener() {
  if (!wakeWordProcess) return;
  try {
    // Send stop command via stdin
    wakeWordProcess.stdin?.write(JSON.stringify({ action: "stop" }) + "\n");
    wakeWordProcess.stdin?.end();
  } catch {
    // ignore
  }
  // Give it a moment to exit gracefully, then kill
  setTimeout(() => {
    if (wakeWordProcess && wakeWordProcess.exitCode === null) {
      try {
        wakeWordProcess.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }, 1000);
  listening = false;
}

/**
 * Check if the wake word listener is currently running.
 * @returns {boolean}
 */
function isWakeWordListening() {
  return listening && wakeWordProcess && wakeWordProcess.exitCode === null;
}

module.exports = {
  startWakeWordListener,
  stopWakeWordListener,
  isWakeWordListening,
};

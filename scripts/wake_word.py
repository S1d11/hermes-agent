#!/usr/bin/env python3
"""Zeus wake word listener — continuously listens for "zeus" or "hey zeus".

When the wake word is detected, prints a JSON line to stdout:
    {"detected": true, "phrase": "zeus", "timestamp": 1234567890.0}

The parent process (Electron) reads stdout line-by-line and brings
the app window to the foreground when a detection event is received.

Commands can be sent to stdin as JSON lines:
    {"action": "stop"}    — stop listening and exit
    {"action": "status"}  — print {"status": "listening"} to stdout

Requirements:
    pip install SpeechRecognition PyAudio

PyAudio is the microphone backend. On Windows it installs cleanly via pip.
On macOS: brew install portaudio && pip install PyAudio
On Linux: sudo apt install portaudio19d && pip install PyAudio

Usage:
    python scripts/wake_word.py
    python scripts/wake_word.py --keyword "zeus"
    python scripts/wake_word.py --keyword "zeus" --keyword "hey zeus"
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="[wake-word] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Speech recognition
# ---------------------------------------------------------------------------

def _try_import_sr() -> Optional[object]:
    """Try to import speech_recognition, return None if unavailable."""
    try:
        import speech_recognition as sr
        return sr
    except ImportError:
        logger.error(
            "speech_recognition not installed. "
            "Install with: pip install SpeechRecognition PyAudio"
        )
        return None


def _has_microphone(sr) -> bool:
    """Check if a microphone is available."""
    try:
        m = sr.Microphone()
        with m as source:
            pass  # just test we can open the mic
        return True
    except Exception as e:
        logger.error("No microphone available: %s", e)
        return False


def listen_for_wake_word(keywords: list[str], cooldown_seconds: float = 2.0) -> None:
    """Continuously listen for wake words and print detection events to stdout.

    Args:
        keywords: List of phrases to detect (case-insensitive).
        cooldown_seconds: Minimum seconds between detections to avoid repeats.
    """
    sr = _try_import_sr()
    if sr is None:
        print(json.dumps({"error": "speech_recognition not installed"}), flush=True)
        return

    if not _has_microphone(sr):
        print(json.dumps({"error": "no microphone available"}), flush=True)
        return

    # Normalize keywords for matching
    keywords_lower = [kw.lower().strip() for kw in keywords]
    logger.info("Listening for wake words: %s", keywords_lower)
    print(json.dumps({"status": "listening", "keywords": keywords_lower}), flush=True)

    recognizer = sr.Recognizer()
    microphone = sr.Microphone()

    # Adjust for ambient noise once on startup (reduces false positives)
    logger.info("Adjusting for ambient noise...")
    try:
        with microphone as source:
            recognizer.adjust_for_ambient_noise(source, duration=1.0)
    except Exception as e:
        logger.warning("Ambient noise adjustment failed: %s", e)
    logger.info("Ready — listening for wake word")

    last_detection_time = 0.0

    while True:
        # Check for stdin commands (non-blocking via a helper thread would be
        # ideal, but for simplicity we just check between recognition cycles)
        try:
            audio = None
            with microphone as source:
                audio = recognizer.listen(source, timeout=None, phrase_time_limit=5)
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.warning("Listen error: %s", e)
            time.sleep(0.5)
            continue

        if audio is None:
            continue

        # Try to recognize speech using Google's free Web Speech API
        try:
            text = recognizer.recognize_google(audio).lower().strip()
            logger.info("Heard: %s", text)
        except sr.UnknownValueError:
            # Speech was unintelligible
            continue
        except sr.RequestError as e:
            logger.warning("Recognition request failed: %s", e)
            time.sleep(1.0)
            continue
        except Exception as e:
            logger.warning("Recognition error: %s", e)
            time.sleep(0.5)
            continue

        # Check if any keyword is in the recognized text
        now = time.time()
        if now - last_detection_time < cooldown_seconds:
            continue

        for kw in keywords_lower:
            if kw in text:
                logger.info("Wake word detected: %s", kw)
                event = {
                    "detected": True,
                    "phrase": kw,
                    "full_text": text,
                    "timestamp": now,
                }
                print(json.dumps(event), flush=True)
                last_detection_time = now
                break


# ---------------------------------------------------------------------------
# Stdin command reader (runs in a background thread)
# ---------------------------------------------------------------------------

def _start_stdin_reader() -> None:
    """Start a background thread that reads commands from stdin."""
    import threading

    def reader():
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError:
                continue
            action = cmd.get("action", "")
            if action == "stop":
                logger.info("Received stop command, exiting")
                # Force exit — the main thread is blocked in recognizer.listen
                # so we can't signal it gracefully. Use os._exit.
                import os
                os._exit(0)
            elif action == "status":
                print(json.dumps({"status": "listening"}), flush=True)

    t = threading.Thread(target=reader, daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Zeus wake word listener — continuously listens for 'zeus' or 'hey zeus'"
    )
    parser.add_argument(
        "--keyword",
        action="append",
        dest="keywords",
        default=[],
        help="Wake word to detect (can be specified multiple times). Default: zeus, hey zeus",
    )
    parser.add_argument(
        "--cooldown",
        type=float,
        default=2.0,
        help="Minimum seconds between detections (default: 2.0)",
    )
    args = parser.parse_args()

    keywords = args.keywords if args.keywords else ["zeus", "hey zeus"]

    _start_stdin_reader()
    listen_for_wake_word(keywords, cooldown_seconds=args.cooldown)


if __name__ == "__main__":
    main()

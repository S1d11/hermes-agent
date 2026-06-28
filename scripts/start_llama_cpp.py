#!/usr/bin/env python3
"""Start a local llama-cpp-python OpenAI-compatible server.

This script launches a llama-cpp-python server that exposes an
OpenAI-compatible API at http://localhost:8080/v1. Once running,
select the "llama-cpp" provider in Hermes (``hermes model``) to use
your local .gguf model for fully offline inference.

Prerequisites:
  pip install llama-cpp-python[server]

Usage:
  python scripts/start_llama_cpp.py --model /path/to/model.gguf
  python scripts/start_llama_cpp.py --model /path/to/model.gguf --port 8080
  python scripts/start_llama_cpp.py --model /path/to/model.gguf --n-gpu-layers -1

The server stays running until Ctrl+C. Hermes connects to it
automatically when the llama-cpp provider is selected.
"""

import argparse
import os
import sys


def main():
    parser = argparse.ArgumentParser(
        description="Start a local llama-cpp-python OpenAI-compatible server."
    )
    parser.add_argument(
        "--model",
        required=True,
        help="Path to the .gguf model file",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Port to serve on (default: 8080)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind (default: 127.0.0.1 — localhost only)",
    )
    parser.add_argument(
        "--n-gpu-layers",
        type=int,
        default=-1,
        help="Number of layers to offload to GPU (-1 = all, 0 = CPU only)",
    )
    parser.add_argument(
        "--n-ctx",
        type=int,
        default=4096,
        help="Context window size in tokens (default: 4096)",
    )
    parser.add_argument(
        "--chat-format",
        default=None,
        help="Chat format (e.g. 'chatml', 'llama-2', 'mistral'). "
        "Auto-detected from model metadata when omitted.",
    )
    args = parser.parse_args()

    # Validate model path
    if not os.path.isfile(args.model):
        print(f"Error: model file not found: {args.model}", file=sys.stderr)
        sys.exit(1)

    # Check llama-cpp-python is installed
    try:
        import llama_cpp  # noqa: F401
    except ImportError:
        print(
            "Error: llama-cpp-python is not installed.\n"
            "Install it with: pip install llama-cpp-python[server]\n"
            "For GPU support: CMAKE_ARGS='-DGGML_CUDA=on' pip install llama-cpp-python[server]",
            file=sys.stderr,
        )
        sys.exit(1)

    # Build server kwargs
    server_kwargs = {
        "model": args.model,
        "n_gpu_layers": args.n_gpu_layers,
        "n_ctx": args.n_ctx,
        "host": args.host,
        "port": args.port,
    }
    if args.chat_format:
        server_kwargs["chat_format"] = args.chat_format

    print(f"Starting llama-cpp-python server...")
    print(f"  Model: {args.model}")
    print(f"  Endpoint: http://{args.host}:{args.port}/v1")
    print(f"  GPU layers: {args.n_gpu_layers}")
    print(f"  Context: {args.n_ctx} tokens")
    print()
    print("Select 'llama-cpp' as your provider in Hermes:")
    print("  hermes model")
    print()
    print("Press Ctrl+C to stop the server.")
    print()

    # Start the server (blocks until Ctrl+C)
    try:
        from llama_cpp.server.app import create_app
        import uvicorn

        app = create_app(**server_kwargs)
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except ImportError as e:
        print(
            f"Error: missing dependency: {e}\n"
            "Install server extras: pip install llama-cpp-python[server]",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()

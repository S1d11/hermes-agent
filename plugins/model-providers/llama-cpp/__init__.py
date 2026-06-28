"""llama-cpp-python in-process inference provider profile.

This profile enables true offline, on-device LLM inference by pointing
Hermes at a local ``llama-cpp-python`` server (which exposes an
OpenAI-compatible API). Unlike the ``custom``/``ollama`` profile which
requires a separate Ollama/vLLM installation, this profile works with
just ``pip install llama-cpp-python`` and a ``.gguf`` model file.

Setup:
  1. Install llama-cpp-python:
       pip install llama-cpp-python[server]

  2. Set your model path in config.yaml or env:
       config.yaml:  model.base_url: http://localhost:8080/v1
                     model.api_key: llama-cpp  (any non-empty string)
       or:           LLAMA_CPP_MODEL_PATH=/path/to/model.gguf

  3. Start the server (see scripts/start_llama_cpp.py or the
     llama-cpp-server skill):
       python scripts/start_llama_cpp.py --model /path/to/model.gguf

  4. Select the provider:
       hermes model  →  choose "llama-cpp"

The profile inherits the same OpenAI-compatible transport as the
``custom`` provider, with llama-cpp-specific defaults:
  - No API key required (uses a dummy key for the Bearer header).
  - Default port 8080 (llama-cpp-python server default).
  - fetch_models returns the loaded model name from the server's /models.
"""

from typing import Any

from providers import register_provider
from providers.base import ProviderProfile


class LlamaCppProfile(ProviderProfile):
    """llama-cpp-python local server provider.

    Points at a local llama-cpp-python OpenAI-compatible server.
    The server must be started separately (see scripts/start_llama_cpp.py
    or the llama-cpp-server skill).
    """

    def fetch_models(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 8.0,
    ) -> list[str] | None:
        """Fetch models from the local llama-cpp-python server.

        The server's /models endpoint returns the loaded model name.
        Falls back to None (caller uses fallback_models) if the server
        is not running.
        """
        if not (base_url or self.base_url):
            return None
        return super().fetch_models(api_key=api_key, base_url=base_url, timeout=timeout)


llama_cpp = LlamaCppProfile(
    name="llama-cpp",
    aliases=(
        "llamacpp",
        "llama.cpp",
        "llama-cpp-python",
        "gguf",
    ),
    display_name="llama-cpp-python (local)",
    description="In-process GGUF inference via llama-cpp-python server",
    signup_url="https://github.com/abetlen/llama-cpp-python",
    env_vars=("LLAMA_CPP_MODEL_PATH",),  # Optional: model path for auto-start
    base_url="http://localhost:8080/v1",
    auth_type="api_key",
    supports_health_check=True,
    # llama-cpp-python supports tool calling via the OpenAI-compatible API
    # when the model has been trained for it (Hermes 2/3, Mistral, etc.).
    supports_vision=False,
    # Common tool-calling GGUF models that work with llama-cpp-python
    fallback_models=(
        "local-model",
    ),
    # No max_tokens floor — llama-cpp-python doesn't truncate like Ollama
    default_max_tokens=4096,
)

register_provider(llama_cpp)

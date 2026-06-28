"""Tests for the llama-cpp model provider plugin.

These tests verify the provider profile registration and configuration
without requiring llama-cpp-python to be installed or a .gguf model to
be present.
"""

import pytest


def test_llama_cpp_provider_registers():
    """The llama-cpp provider must be discoverable in the provider registry."""
    from providers import get_provider_profile, list_providers

    # The plugin auto-registers on import. Trigger discovery if needed.
    profile = get_provider_profile("llama-cpp")
    assert profile is not None, "llama-cpp provider not found in registry"
    assert profile.name == "llama-cpp"


def test_llama_cpp_provider_aliases():
    """The llama-cpp provider must accept common aliases."""
    from providers import get_provider_profile

    for alias in ("llamacpp", "llama.cpp", "llama-cpp-python", "gguf"):
        profile = get_provider_profile(alias)
        assert profile is not None, f"alias {alias!r} not resolved to llama-cpp"
        assert profile.name == "llama-cpp"


def test_llama_cpp_provider_metadata():
    """The llama-cpp provider must have correct metadata."""
    from providers import get_provider_profile

    profile = get_provider_profile("llama-cpp")
    assert profile.display_name == "llama-cpp-python (local)"
    assert "gguf" in profile.description.lower() or "llama" in profile.description.lower()
    assert profile.base_url == "http://localhost:8080/v1"
    assert profile.auth_type == "api_key"


def test_llama_cpp_provider_no_vision():
    """llama-cpp doesn't support vision by default."""
    from providers import get_provider_profile

    profile = get_provider_profile("llama-cpp")
    assert profile.supports_vision is False


def test_llama_cpp_provider_fallback_models():
    """The provider must have fallback models for when the server is down."""
    from providers import get_provider_profile

    profile = get_provider_profile("llama-cpp")
    assert len(profile.fallback_models) > 0, "should have at least one fallback model"


def test_llama_cpp_provider_env_vars():
    """The provider should declare LLAMA_CPP_MODEL_PATH as an env var."""
    from providers import get_provider_profile

    profile = get_provider_profile("llama-cpp")
    assert "LLAMA_CPP_MODEL_PATH" in profile.env_vars


def test_llama_cpp_provider_fetch_models_no_server():
    """fetch_models must return None when no server is running (graceful fallback)."""
    from providers import get_provider_profile

    profile = get_provider_profile("llama-cpp")
    # With no server running, fetch_models should return None
    # (the caller falls back to fallback_models)
    result = profile.fetch_models(api_key="dummy", base_url="http://localhost:1/v1", timeout=1.0)
    assert result is None


def test_start_llama_cpp_script_exists():
    """The helper script must exist at scripts/start_llama_cpp.py."""
    import os

    # Find the hermes-agent root (this test file is in tests/plugins/)
    test_dir = os.path.dirname(os.path.abspath(__file__))
    # Walk up to find scripts/start_llama_cpp.py
    for parent in [test_dir, os.path.dirname(test_dir), os.path.dirname(os.path.dirname(test_dir))]:
        candidate = os.path.join(parent, "scripts", "start_llama_cpp.py")
        if os.path.isfile(candidate):
            return
    # If not found via relative path, check the repo root
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    assert os.path.isfile(os.path.join(repo_root, "scripts", "start_llama_cpp.py")), \
        "scripts/start_llama_cpp.py not found"

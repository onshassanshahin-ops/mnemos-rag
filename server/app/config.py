import json
from pathlib import Path

from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("MNEMOS_DATA_DIR", BASE_DIR / "data"))
CHROMA_DIR = DATA_DIR / "chroma"
SETTINGS_FILE = DATA_DIR / "settings.json"

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
DEFAULT_PROVIDER = os.getenv("MNEMOS_PROVIDER", "gemini").strip().lower() or "gemini"
DEFAULT_OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip() or "http://localhost:11434"
DEFAULT_OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "llama3.1").strip() or "llama3.1"
DEFAULT_OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text").strip() or "nomic-embed-text"
DEFAULT_GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.6-flash").strip() or "gemini-3.6-flash"
DEFAULT_GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001").strip() or "gemini-embedding-001"

DEFAULT_SETTINGS = {
    "provider": DEFAULT_PROVIDER,
    "gemini": {
        "chat_model": DEFAULT_GEMINI_CHAT_MODEL,
        "embed_model": DEFAULT_GEMINI_EMBED_MODEL,
        "embed_dim": 768,
    },
    "ollama": {
        "base_url": DEFAULT_OLLAMA_BASE_URL,
        "chat_model": DEFAULT_OLLAMA_CHAT_MODEL,
        "embed_model": DEFAULT_OLLAMA_EMBED_MODEL,
    },
    "retrieval": {"top_k": 6},
    "voice": {"tts_enabled": True, "tts_voice": "Kore"},
    "folders": [],
    "excluded_files": [],
}


class Settings:
    def __init__(self):
        self._data = json.loads(json.dumps(DEFAULT_SETTINGS))
        if SETTINGS_FILE.exists():
            try:
                stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
                self._deep_merge(self._data, stored)
            except Exception:
                pass
        self._apply_env_overrides()

    def _apply_env_overrides(self):
        provider = os.getenv("MNEMOS_PROVIDER", "").strip().lower()
        if provider:
            self._data["provider"] = provider

        base_url = os.getenv("OLLAMA_BASE_URL", "").strip()
        if base_url:
            self._data.setdefault("ollama", {})["base_url"] = base_url

        chat_model = os.getenv("OLLAMA_CHAT_MODEL", "").strip()
        if chat_model:
            self._data.setdefault("ollama", {})["chat_model"] = chat_model

        embed_model = os.getenv("OLLAMA_EMBED_MODEL", "").strip()
        if embed_model:
            self._data.setdefault("ollama", {})["embed_model"] = embed_model

        gemini_chat = os.getenv("GEMINI_CHAT_MODEL", "").strip()
        if gemini_chat:
            self._data.setdefault("gemini", {})["chat_model"] = gemini_chat

        gemini_embed = os.getenv("GEMINI_EMBED_MODEL", "").strip()
        if gemini_embed:
            self._data.setdefault("gemini", {})["embed_model"] = gemini_embed

    @staticmethod
    def _deep_merge(base: dict, override: dict):
        for k, v in override.items():
            if isinstance(v, dict) and isinstance(base.get(k), dict):
                Settings._deep_merge(base[k], v)
            else:
                base[k] = v

    def save(self):
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        SETTINGS_FILE.write_text(
            json.dumps(self._data, indent=2), encoding="utf-8"
        )

    def get(self, *keys):
        node = self._data
        for k in keys:
            node = node[k]
        return node

    def update(self, payload: dict) -> dict:
        self._deep_merge(self._data, payload)
        self.save()
        return self._data

    @property
    def data(self) -> dict:
        return self._data


settings = Settings()


def model_key() -> str:
    provider = settings.get("provider")
    return f"{provider}:{settings.get(provider, 'embed_model')}"


def sanitize_key(key: str) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in key)

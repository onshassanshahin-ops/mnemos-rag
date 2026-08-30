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

DEFAULT_SETTINGS = {
    "provider": "gemini",
    "gemini": {
        "chat_model": "gemini-2.5-flash",
        "embed_model": "gemini-embedding-001",
        "embed_dim": 768,
    },
    "ollama": {
        "base_url": "http://localhost:11434",
        "chat_model": "llama3.1",
        "embed_model": "nomic-embed-text",
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

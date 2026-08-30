import base64
import io
import json
import struct
import wave
from typing import Iterator, Optional

import httpx
from google import genai
from google.genai import types as gtypes

from .config import GEMINI_API_KEY, settings


def _wav_from_pcm(pcm: bytes, sample_rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


class GeminiProvider:
    name = "gemini"

    def __init__(self):
        self.client = (
            genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
        )

    @property
    def ready(self) -> bool:
        return self.client is not None

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        cfg = settings.get("gemini")
        res = self.client.models.embed_content(
            model=cfg["embed_model"],
            contents=texts,
            config=gtypes.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=cfg.get("embed_dim", 768),
            ),
        )
        return [e.values for e in res.embeddings]

    def embed_query(self, text: str) -> list[float]:
        cfg = settings.get("gemini")
        res = self.client.models.embed_content(
            model=cfg["embed_model"],
            contents=[text],
            config=gtypes.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=cfg.get("embed_dim", 768),
            ),
        )
        return res.embeddings[0].values

    def chat_stream(self, messages: list[dict]) -> Iterator[str]:
        cfg = settings.get("gemini")
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        contents = [m["content"] for m in messages if m["role"] != "system"]
        stream = self.client.models.generate_content_stream(
            model=cfg["chat_model"],
            contents=contents,
            config=gtypes.GenerateContentConfig(
                system_instruction=system or None,
                temperature=0.3,
            ),
        )
        for chunk in stream:
            if chunk.text:
                yield chunk.text

    def transcribe(self, audio: bytes, mime_type: str) -> str:
        cfg = settings.get("gemini")
        res = self.client.models.generate_content(
            model=cfg["chat_model"],
            contents=[
                gtypes.Part.from_bytes(data=audio, mime_type=mime_type),
                "Transcribe this audio verbatim. Output only the transcript text.",
            ],
        )
        return (res.text or "").strip()

    def describe_image(self, image: bytes, mime_type: str, path_hint: str) -> str:
        cfg = settings.get("gemini")
        res = self.client.models.generate_content(
            model=cfg["chat_model"],
            contents=[
                gtypes.Part.from_bytes(data=image, mime_type=mime_type),
                "Describe this image in rich detail so it can be found via text search. Include any visible text verbatim.",
            ],
        )
        return f"[Image file: {path_hint}]\n{(res.text or '').strip()}"

    def tts(self, text: str) -> Optional[bytes]:
        voice = settings.get("voice", "tts_voice") or "Kore"
        try:
            res = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=text,
                config=gtypes.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=gtypes.SpeechConfig(
                        voice_config=gtypes.VoiceConfig(
                            prebuilt_voice_config=gtypes.PrebuiltVoiceConfig(
                                voice_name=voice
                            )
                        )
                    ),
                ),
            )
            pcm = res.candidates[0].content.parts[0].inline_data.data
            return _wav_from_pcm(pcm)
        except Exception:
            return None


class OllamaProvider:
    name = "ollama"

    def __init__(self):
        self.base_url = settings.get("ollama", "base_url").rstrip("/")

    @property
    def ready(self) -> bool:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=3)
            return r.status_code == 200
        except Exception:
            return False

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        model = settings.get("ollama", "embed_model")
        out = []
        with httpx.Client(timeout=None) as client:
            r = client.post(
                f"{self.base_url}/api/embed",
                json={"model": model, "input": texts},
            )
            r.raise_for_status()
            out = r.json()["embeddings"]
        return out

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]

    def chat_stream(self, messages: list[dict]) -> Iterator[str]:
        model = settings.get("ollama", "chat_model")
        msgs = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m["role"] in ("system", "user", "assistant")
        ]
        with httpx.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={"model": model, "messages": msgs, "stream": True},
            timeout=None,
        ) as resp:
            for line in resp.iter_lines():
                if not line.strip():
                    continue
                obj = json.loads(line)
                tok = obj.get("message", {}).get("content", "")
                if tok:
                    yield tok
                if obj.get("done"):
                    break

    def transcribe(self, audio: bytes, mime_type: str) -> str:
        raise RuntimeError("Ollama transcription not available; using browser STT fallback.")

    def describe_image(self, image: bytes, mime_type: str, path_hint: str) -> str:
        raise RuntimeError("Image indexing requires the Gemini provider.")

    def tts(self, text: str) -> Optional[bytes]:
        return None


_gemini_singleton: Optional[GeminiProvider] = None


def get_provider() -> GeminiProvider | OllamaProvider:
    global _gemini_singleton
    if _gemini_singleton is None:
        _gemini_singleton = GeminiProvider()
    if settings.get("provider") == "ollama":
        return OllamaProvider()
    return _gemini_singleton


def get_active_collection_key() -> str:
    from .config import sanitize_key, model_key
    return sanitize_key(model_key())

import json
import re
from typing import Iterator

from .config import settings
from .ingest import _active_key
from .providers import get_provider
from .store import store

SYSTEM_PROMPT = """You are Mnemos, a precise knowledge assistant grounded strictly in the user's indexed files.

Rules:
- Answer ONLY from the provided sources. Never invent facts.
- Cite every claim with bracketed reference numbers matching the source blocks, e.g. [1] or [2][3].
- If the sources do not contain the answer, say so plainly and suggest what to look for.
- Be concise and well structured. Use markdown (short paragraphs, bullet lists, code fences for code).
- When quoting code or config, keep it exact."""


def retrieve(question: str) -> list[dict]:
    provider = get_provider()
    key = _active_key()
    vector = provider.embed_query(question)
    return store.query(key, vector, settings.get("retrieval", "top_k"))


def build_context(hits: list[dict]) -> str:
    blocks = []
    for i, hit in enumerate(hits, 1):
        m = hit["meta"]
        loc = f"lines {m['line_start']}-{m['line_end']}"
        if m.get("page", -1) > 0:
            loc = f"page {m['page']}, {loc}"
        rel = m.get("rel_path") or m.get("name")
        blocks.append(f"[{i}] {m['name']} — {rel} ({loc})\n{hit['text']}")
    return "\n\n".join(blocks)


def source_payloads(hits: list[dict]) -> list[dict]:
    out = []
    for i, hit in enumerate(hits, 1):
        m = hit["meta"]
        out.append({
            "i": i,
            "path": m.get("path"),
            "rel_path": m.get("rel_path") or m.get("name"),
            "name": m.get("name"),
            "ext": m.get("ext"),
            "page": m.get("page") if m.get("page", -1) > 0 else None,
            "line_start": m.get("line_start"),
            "line_end": m.get("line_end"),
            "snippet": hit["text"][:600],
            "score": hit["score"],
        })
    return out


def sse_format(obj: dict) -> str:
    return "data: " + json.dumps(obj) + "\n\n"


def stream_answer_sse(question: str, session_id: str | None = None) -> Iterator[str]:
    from . import chats

    if session_id:
        chats.append_message(session_id, "user", question)

    try:
        hits = retrieve(question)
    except Exception as exc:
        err = f"Retrieval failed: {str(exc)[:250]}"
        yield sse_format({"type": "sources", "sources": []})
        yield sse_format({"type": "error", "error": err})
        if session_id:
            chats.append_message(session_id, "assistant", f"_Error: {err}_", [])
        yield sse_format({"type": "done"})
        return
    sources = source_payloads(hits)
    yield sse_format({"type": "sources", "sources": sources})
    if not hits:
        msg = "No relevant content found in your indexed folders yet. Add a folder in the sidebar and wait for indexing to finish, then ask again."
        yield sse_format({"type": "delta", "t": msg})
        if session_id:
            chats.append_message(session_id, "assistant", msg, sources)
        yield sse_format({"type": "done"})
        return

    context = build_context(hits)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Sources from the user's indexed workspace:\n\n"
                f"{context}\n\n---\nQuestion: {question}"
            ),
        },
    ]
    answer_parts: list[str] = []
    try:
        for tok in get_provider().chat_stream(messages):
            answer_parts.append(tok)
            yield sse_format({"type": "delta", "t": tok})
    except Exception as exc:
        err = str(exc)[:300]
        yield sse_format({"type": "error", "error": err})
        answer_parts.append(f"\n\n_Error: {err}_")
    if session_id:
        chats.append_message(session_id, "assistant", "".join(answer_parts), sources)
    yield sse_format({"type": "done"})


CITE_RE = re.compile(r"\[(\d{1,2})\]")


def link_citations(text: str) -> str:
    return CITE_RE.sub(r"[[\1]](#cite-\1)", text)

import json
import re
import time
import uuid
from pathlib import Path
from typing import Optional

from .config import DATA_DIR

CHATS_DIR = DATA_DIR / "chats"
_ID_RE = re.compile(r"^[0-9a-f]{6,40}$")


def _path(chat_id: str) -> Optional[Path]:
    if not _ID_RE.match(chat_id or ""):
        return None
    return CHATS_DIR / f"{chat_id}.json"


def _write(data: dict):
    CHATS_DIR.mkdir(parents=True, exist_ok=True)
    _path(data["id"]).write_text(json.dumps(data, indent=2), encoding="utf-8")


def create(title: str) -> dict:
    now = time.time()
    data = {
        "id": uuid.uuid4().hex[:12],
        "title": (title or "New chat").strip()[:80] or "New chat",
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }
    _write(data)
    return data


def get(chat_id: str) -> Optional[dict]:
    p = _path(chat_id)
    if p is None or not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def append_message(chat_id: str, role: str, content: str, sources: Optional[list] = None):
    data = get(chat_id)
    if data is None:
        return
    data["messages"].append({
        "role": role,
        "content": content,
        "sources": sources or [],
        "ts": time.time(),
    })
    data["updated_at"] = time.time()
    _write(data)


def list_all() -> list[dict]:
    if not CHATS_DIR.exists():
        return []
    out = []
    for f in CHATS_DIR.glob("*.json"):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({
                "id": d["id"],
                "title": d.get("title", "New chat"),
                "updated_at": d.get("updated_at", 0),
                "message_count": len(d.get("messages", [])),
            })
        except Exception:
            continue
    out.sort(key=lambda x: x["updated_at"], reverse=True)
    return out


def delete(chat_id: str) -> bool:
    p = _path(chat_id)
    if p is not None and p.exists():
        p.unlink()
        return True
    return False

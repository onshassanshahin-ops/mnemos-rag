import queue
import threading
import time
from pathlib import Path
from typing import Callable

from .loaders import (
    IGNORED_DIRS,
    IMAGE_EXTS,
    SUPPORTED_EXTS,
    build_chunks,
    describe_image_chunk,
    file_signature,
    is_supported_file,
)
from .providers import get_provider
from .store import store


class EventBus:
    def __init__(self):
        self._subs: list[queue.Queue] = []
        self._lock = threading.Lock()
        self.recent: list[dict] = []

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=500)
        with self._lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        with self._lock:
            if q in self._subs:
                self._subs.remove(q)

    def emit(self, event: dict):
        event = {"ts": time.time(), **event}
        self.recent = ([event] + self.recent)[:50]
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass


events = EventBus()


def is_ignored_dir(name: str) -> bool:
    return name.lower() in IGNORED_DIRS or name.startswith(".")


def iter_supported_files(root: str):
    base = Path(root)
    if not base.exists():
        return
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        if any(is_ignored_dir(p.name) for p in path.parents):
            continue
        if is_supported_file(path):
            yield path


class IngestWorker:
    def __init__(self, num_workers: int = 2):
        self.q: "queue.Queue[tuple[str, bool]]" = queue.Queue()
        self.pending: dict[str, bool] = {}
        self.lock = threading.Lock()
        self.num_workers = num_workers

    def enqueue(self, file_path: str, force: bool = False):
        with self.lock:
            if file_path in self.pending:
                self.pending[file_path] = self.pending[file_path] or force
                return
            self.pending[file_path] = force
        self.q.put((file_path, force))

    def size(self) -> int:
        with self.lock:
            return len(self.pending)

    def start(self):
        for i in range(self.num_workers):
            threading.Thread(
                target=self._run, name=f"ingest-{i}", daemon=True
            ).start()

    def _run(self):
        while True:
            file_path, force = self.q.get()
            try:
                with self.lock:
                    force = self.pending.get(file_path, force)
                self.process(file_path, force)
            finally:
                with self.lock:
                    self.pending.pop(file_path, None)

    def process(self, file_path: str, force: bool = False):
        path = Path(file_path)
        provider = get_provider()
        try:
            from .config import settings
            if str(path.resolve()) in settings.get("excluded_files"):
                store.delete_file(str(path))
                return
            if not path.exists():
                store.delete_file(file_path)
                events.emit({"type": "removed", "path": file_path})
                return
            ext = path.suffix.lower()
            root = self._root_for(path)

            key_meta = store.get_file_meta(_active_key(), str(path))
            if key_meta is not None and not force:
                try:
                    if key_meta.get("signature") == file_signature(path):
                        return
                except OSError:
                    return

            if ext in IMAGE_EXTS:
                chunk = None
                try:
                    chunk = describe_image_chunk(
                        path, Path(root), provider.describe_image
                    )
                except Exception:
                    chunk = None
                if chunk is None:
                    events.emit({
                        "type": "failed", "path": str(path),
                        "error": "image indexing needs Gemini provider/key",
                    })
                    return
                chunks = [chunk]
            else:
                built = build_chunks(path, Path(root))
                if not built:
                    events.emit({
                        "type": "failed", "path": str(path),
                        "error": "unsupported or unreadable",
                    })
                    return
                chunks = built["chunks"]

            unique_chunks = []
            seen_texts: set[str] = set()
            for chunk in chunks:
                if chunk["text"] not in seen_texts:
                    seen_texts.add(chunk["text"])
                    unique_chunks.append(chunk)
            chunks = unique_chunks
            texts = [c["text"] for c in chunks]
            # Embed before touching existing data: if this raises (quota, network,
            # provider error), the file's previously-indexed chunks stay intact and
            # searchable instead of being wiped with nothing to replace them.
            vectors = self._embed_with_retry(provider, texts)
            store.delete_file(str(path))
            store.upsert(
                _active_key(),
                [c["id"] for c in chunks],
                vectors,
                texts,
                [c["meta"] for c in chunks],
            )
            events.emit({
                "type": "indexed",
                "path": str(path),
                "chunks": len(chunks),
            })
        except Exception as exc:
            events.emit({"type": "failed", "path": str(path), "error": str(exc)[:300]})

    EMBED_BATCH_SIZE = 100

    @classmethod
    def _embed_with_retry(cls, provider, texts: list[str]):
        vectors: list = []
        for i in range(0, len(texts), cls.EMBED_BATCH_SIZE):
            vectors.extend(cls._embed_batch_with_retry(provider, texts[i:i + cls.EMBED_BATCH_SIZE]))
        return vectors

    @staticmethod
    def _embed_batch_with_retry(provider, texts: list[str]):
        last_error = None
        for attempt in range(3):
            try:
                return provider.embed_documents(texts)
            except Exception as exc:
                last_error = exc
                if attempt < 2:
                    is_rate_limited = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)
                    delay = 8 * (attempt + 1) if is_rate_limited else 1.5 * (attempt + 1)
                    time.sleep(delay)
        raise last_error

    def _root_for(self, path: Path) -> str:
        from .config import settings

        best = str(path.anchor)
        pstr = str(path)
        for f in settings.get("folders"):
            if pstr.startswith(f) and len(f) > len(best):
                best = f
        return best


worker = IngestWorker()


_active_state = {"key": None}


def _active_key() -> str:
    from .config import model_key, sanitize_key

    return sanitize_key(model_key())


def reindex_all(force: bool = False):
    from .config import settings

    total = 0
    for folder in list(settings.get("folders")):
        for f in iter_supported_files(folder):
            worker.enqueue(str(f), force=force)
            total += 1
    return total


def reindex_failed():
    from .config import settings

    excluded = set(settings.get("excluded_files"))
    queued: set[str] = set()
    for event in events.recent:
        path = event.get("path")
        if event.get("type") != "failed" or not path or path in excluded:
            continue
        candidate = Path(path)
        if candidate.is_file() and is_supported_file(candidate):
            queued.add(str(candidate.resolve()))
    for path in queued:
        worker.enqueue(path, force=True)
    return len(queued)

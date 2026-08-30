import time
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .ingest import is_ignored_dir, worker
from .loaders import is_supported_file

DEBOUNCE_SECONDS = 1.0


class ChangeHandler(FileSystemEventHandler):
    def __init__(self, debounce: float = DEBOUNCE_SECONDS):
        self.debounce = debounce
        self._last: dict[str, float] = {}

    def _maybe(self, path: str):
        p = Path(path)
        from .config import settings
        if str(p.resolve()) in settings.get("excluded_files"):
            return
        if not is_supported_file(p):
            return
        if any(is_ignored_dir(x.name) for x in p.parents):
            return
        now = time.time()
        last = self._last.get(path, 0)
        if now - last < self.debounce:
            return
        self._last[path] = now
        if len(self._last) > 20000:
            cutoff = now - 3600
            self._last = {k: v for k, v in self._last.items() if v > cutoff}
        worker.enqueue(path)

    def on_created(self, event):
        if not event.is_directory:
            self._maybe(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._maybe(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._maybe(event.dest_path)


class FolderWatcher:
    def __init__(self):
        self.observer = Observer(timeout=1.0)
        self.handler = ChangeHandler()
        self.watching: set[str] = set()

    def sync_folders(self, folders: list[str]):
        current = {str(Path(f).resolve()) for f in folders}
        for gone in self.watching - current:
            self._unwatch(gone)
        for add in current - self.watching:
            self._watch(add)

    def _watch(self, folder: str):
        try:
            self.observer.schedule(self.handler, folder, recursive=True)
            self.watching.add(folder)
        except Exception:
            pass

    def _unwatch(self, folder: str):
        for emb in list(self.observer.emitters):
            if str(emb.watch.path).lower() == folder.lower():
                emb.stop()
                try:
                    emb.join(1)
                except Exception:
                    pass
            self.watching.discard(folder)

    def start(self):
        self.observer.start()

    def stop(self):
        self.observer.stop()
        try:
            self.observer.join(2)
        except Exception:
            pass


watcher = FolderWatcher()

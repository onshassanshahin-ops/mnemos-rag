import asyncio
import json
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import chats
from .config import GEMINI_API_KEY, settings
from .ingest import _active_key, events, iter_supported_files, reindex_all, reindex_failed, worker
from .loaders import CHUNKER_VERSION
from .providers import GeminiProvider, get_provider
from .rag import sse_format, stream_answer_sse
from .store import store
from .watcher import watcher

app = FastAPI(title="Mnemos RAG", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int | None = None


class FolderRequest(BaseModel):
    path: str


class SettingsRequest(BaseModel):
    data: dict


class ReindexRequest(BaseModel):
    force: bool = False


class FileRequest(BaseModel):
    path: str


class TtsRequest(BaseModel):
    text: str


@app.on_event("startup")
def startup():
    worker.start()
    watcher.sync_folders(list(settings.get("folders")))
    reindex_all()
    try:
        watcher.start()
    except RuntimeError:
        pass


@app.get("/api/health")
def health():
    provider = get_provider()
    return {
        "ok": True,
        "provider": settings.get("provider"),
        "provider_ready": provider.ready,
        "gemini_key_present": bool(GEMINI_API_KEY),
    }


@app.get("/api/status")
def status():
    key = _active_key()
    ids, metas = store.all_metas(key)
    files: dict[str, dict] = {}
    for m in metas:
        p = m.get("path", "")
        entry = files.setdefault(p, {"path": p, "name": m.get("name"), "chunks": 0})
        entry["chunks"] += 1

    folders = list(settings.get("folders"))
    discovered: dict[str, str] = {}
    for folder in folders:
        for path in iter_supported_files(folder):
            resolved = str(path.resolve())
            discovered[resolved] = folder
            files.setdefault(resolved, {"path": resolved, "name": path.name, "chunks": 0})
    failed = {}
    for event in events.recent:
        if event.get("type") == "failed" and event.get("path"):
            failed.setdefault(event["path"], event.get("error", "Indexing failed"))
    for path, error in failed.items():
        if path in files and files[path]["chunks"] == 0:
            files[path]["status"] = "failed"
            files[path]["error"] = error
    excluded = set(settings.get("excluded_files"))
    indexed_files = sum(1 for file in files.values() if file["chunks"] and file["path"] not in excluded)
    failed_files = sum(1 for file in files.values() if file.get("status") == "failed")
    excluded_files = sum(1 for file in files.values() if file["path"] in excluded)
    pending_files = len(files) - indexed_files - failed_files - excluded_files
    projects = []
    for folder in folders:
        pf = [f for f in files.values() if discovered.get(f["path"]) == folder or str(f["path"]).startswith(folder)]
        projects.append({
            "root": folder,
            "name": Path(folder).name or folder,
            "files": len(pf),
            "chunks": sum(f["chunks"] for f in pf),
        })

    known_roots = {str(Path(f).resolve()).lower() for f in folders}
    orphan_files = {
        f["path"]
        for f in files.values()
        if str(Path(f["path"]).resolve()).lower() not in known_roots
    }

    provider = get_provider()
    return {
        "provider": settings.get("provider"),
        "provider_ready": provider.ready,
        "gemini_key_present": bool(GEMINI_API_KEY),
        "collection": key,
        "chunker_version": CHUNKER_VERSION,
        "collections": store.counts(),
        "total_files": len(files),
        "total_chunks": len(ids),
        "indexed_files": indexed_files,
        "pending_files": pending_files,
        "failed_files": failed_files,
        "excluded_files": excluded_files,
        "queue": worker.size(),
        "folders": folders,
        "projects": projects,
        "orphan_files": sorted(orphan_files),
        "recent_events": events.recent[:20],
        "settings": settings.data,
    }


@app.get("/api/files")
def files(root: str | None = None):
    ids, metas = store.all_metas(_active_key())
    grouped: dict[str, dict] = {}
    excluded = set(settings.get("excluded_files"))
    for folder in settings.get("folders"):
        if root and str(Path(folder).resolve()) != str(Path(root).resolve()):
            continue
        for path in iter_supported_files(folder):
            resolved = str(path.resolve())
            grouped[resolved] = {
                "path": resolved,
                "rel_path": str(path.relative_to(folder)).replace("\\", "/"),
                "root": folder,
                "ext": path.suffix.lower().lstrip(".") or "txt",
                "chunks": 0,
                "excluded": resolved in excluded,
                "status": "excluded" if resolved in excluded else "pending",
            }
    for m in metas:
        if root and m.get("root") != root:
            continue
        g = grouped.setdefault(
            m.get("path", ""),
            {"path": m.get("path"), "rel_path": m.get("rel_path"),
             "root": m.get("root"), "ext": m.get("ext"), "chunks": 0,
             "excluded": m.get("path") in excluded, "status": "indexed"},
        )
        g["chunks"] += 1
        g["excluded"] = m.get("path") in excluded
        g["status"] = "excluded" if g["excluded"] else "indexed"
    for event in events.recent:
        path = event.get("path")
        if event.get("type") == "failed" and path in grouped and not grouped[path]["chunks"]:
            grouped[path]["status"] = "failed"
            grouped[path]["error"] = event.get("error", "Indexing failed")
    return {"files": sorted(grouped.values(), key=lambda x: x["rel_path"] or "")}


@app.post("/api/files/reindex")
def reindex_file(req: FileRequest):
    path = str(Path(req.path).resolve())
    if not Path(path).is_file():
        raise HTTPException(404, "File does not exist")
    excluded = [p for p in settings.get("excluded_files") if p != path]
    settings.update({"excluded_files": excluded})
    worker.enqueue(path, force=True)
    events.emit({"type": "reindex_queued", "path": path})
    return {"queued": True, "path": path}


@app.post("/api/files/exclude")
def exclude_file(req: FileRequest):
    path = str(Path(req.path).resolve())
    excluded = list(settings.get("excluded_files"))
    if path not in excluded:
        excluded.append(path)
        settings.update({"excluded_files": excluded})
    store.delete_file(path)
    events.emit({"type": "excluded", "path": path})
    return {"excluded": True, "path": path}


@app.post("/api/files/include")
def include_file(req: FileRequest):
    path = str(Path(req.path).resolve())
    settings.update({"excluded_files": [p for p in settings.get("excluded_files") if p != path]})
    worker.enqueue(path, force=True)
    events.emit({"type": "included", "path": path})
    return {"excluded": False, "path": path}


@app.post("/api/search")
def search(req: SearchRequest):
    from .rag import retrieve, source_payloads

    if not get_provider().ready:
        raise HTTPException(
            503,
            "No embedding provider ready. Set GEMINI_API_KEY in server/.env or start Ollama.",
        )
    if req.top_k:
        settings._data.setdefault("retrieval", {})["top_k"] = req.top_k
    try:
        hits = retrieve(req.query)
    except Exception as exc:
        raise HTTPException(502, f"Embedding failed: {str(exc)[:250]}")
    return {"results": source_payloads(hits)}


@app.post("/api/chat")
def chat(req: ChatRequest):
    q = req.question.strip()
    if not q:
        raise HTTPException(400, "Empty question")

    session_id = req.session_id
    is_new = not session_id or chats.get(session_id) is None
    if is_new:
        session_id = chats.create(q)["id"]

    def gen():
        if is_new:
            yield sse_format({"type": "session", "id": session_id})
        yield from stream_answer_sse(q, session_id)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/chats")
def list_chats():
    return {"chats": chats.list_all()}


@app.get("/api/chats/{chat_id}")
def get_chat(chat_id: str):
    data = chats.get(chat_id)
    if data is None:
        raise HTTPException(404, "Chat not found")
    return data


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str):
    if not chats.delete(chat_id):
        raise HTTPException(404, "Chat not found")
    return {"deleted": True}


@app.post("/api/folders")
def add_folder(req: FolderRequest):
    p = Path(req.path)
    if not p.exists() or not p.is_dir():
        raise HTTPException(400, f"Folder does not exist: {req.path}")
    resolved = str(p.resolve())
    folders = list(settings.get("folders"))
    if resolved not in folders:
        folders.append(resolved)
        settings.update({"folders": folders})
    watcher.sync_folders(folders)
    count = sum(1 for _ in iter_supported_files(resolved))
    for f in iter_supported_files(resolved):
        worker.enqueue(str(f))
    events.emit({"type": "folder_added", "path": resolved, "files": count})
    return {"folders": folders, "discovered_files": count}


@app.post("/api/folders/pick")
def pick_folder():
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="Choose a folder to index")
        root.destroy()
    except Exception as exc:
        raise HTTPException(503, f"Folder picker unavailable: {str(exc)[:200]}")
    if not selected:
        return {"cancelled": True}
    return add_folder(FolderRequest(path=selected))


@app.delete("/api/folders")
def remove_folder(path: str):
    folders = [f for f in settings.get("folders") if f != path]
    settings.update({"folders": folders})
    watcher.sync_folders(folders)
    removed_ids = []
    for col in store._all_cols():
        try:
            res = col.get(where={"root": path}, include=[])
            if res["ids"]:
                col.delete(ids=res["ids"])
                removed_ids.extend(res["ids"])
        except Exception:
            pass
    events.emit({"type": "folder_removed", "path": path})
    return {"folders": folders, "removed_chunks": len(removed_ids)}


@app.post("/api/reindex")
def reindex(req: ReindexRequest):
    total = reindex_all(force=req.force)
    return {"queued": total}


@app.post("/api/reindex/failed")
def retry_failed():
    return {"queued": reindex_failed()}


@app.post("/api/settings")
def update_settings(req: SettingsRequest):
    old_provider = settings.get("provider")
    data = settings.update(req.data)
    if data.get("provider") != old_provider:
        pass
    watcher.sync_folders(list(data.get("folders", [])))
    return data


@app.post("/api/voice/transcribe")
async def transcribe(file: UploadFile = File(...)):
    gemini = GeminiProvider()
    if not gemini.ready:
        raise HTTPException(
            503, "Voice transcription requires GEMINI_API_KEY (set it in server/.env)"
        )
    data = await file.read()
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        audio_bytes = Path(tmp_path).read_bytes()
        mime = file.content_type or "audio/webm"
        text = gemini.transcribe(audio_bytes, mime)
        return {"text": text}
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/api/voice/tts")
def tts(req: TtsRequest):
    gemini = GeminiProvider()
    if gemini.ready and settings.get("voice", "tts_enabled"):
        wav = gemini.tts(req.text[:3000])
        if wav:
            import io

            return StreamingResponse(io.BytesIO(wav), media_type="audio/wav")
    raise HTTPException(503, "TTS unavailable; client fallback will be used")


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    q = events.subscribe()

    async def pump():
        while True:
            item = await asyncio.to_thread(q.get)
            await ws.send_text(json.dumps(item))

    try:
        await pump()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        events.unsubscribe(q)


UI_DIST = Path(__file__).resolve().parent.parent.parent / "ui" / "dist"
if UI_DIST.exists():
    app.mount("/", StaticFiles(directory=str(UI_DIST), html=True), name="ui")

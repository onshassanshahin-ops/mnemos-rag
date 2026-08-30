# Mnemos — Semantic RAG Engine

A fully local semantic search and RAG (Retrieval-Augmented Generation) system with a polished dark UI. Drop folders in, get instant indexing, ask questions, get answers with per-file per-line citations.

---

## Features

- **Folder Watching** — add folders; files are automatically indexed on creation/modification
- **Semantic Search** — query your entire workspace by meaning, not just keywords
- **RAG Chat** — streaming answers grounded in your indexed files, with `[1]` `[2]` citations
- **Per-file Citations** — every answer shows exactly which file, page, and line range it came from
- **Gemini + Ollama** — Gemini API by default, one-click switch to local Ollama
- **Voice Mode** — speak questions via browser mic, transcribed by Gemini; TTS playback
- **Real-time Activity** — WebSocket feed of indexing events as they happen
- **Dark Glass UI** — professional, responsive, minimal

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐
│  React UI    │◄─────►│  FastAPI Server   │
│  (Vite/TW4)  │  WS   │  (Python 3.13)   │
└──────────────┘       └────────┬─────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
     ┌────────▼────────┐ ┌─────▼──────┐ ┌────────▼────────┐
     │  ChromaDB       │ │  Gemini /  │ │  Watchdog       │
     │  (Vectors)      │ │  Ollama    │ │  (Folder Watch) │
     └─────────────────┘ └────────────┘ └─────────────────┘
```

---

## Quick Start

### Prerequisites

- **Python 3.13** (or 3.12+)
- **Node.js 20+**
- A **Gemini API key** ([get one here](https://aistudio.google.com/app/apikey)) or **Ollama** running locally

### One command (recommended)

```bash
cd mnemos-rag

# Copy and set your API key
cp server/.env.example server/.env
# Edit server/.env → GEMINI_API_KEY=your_key_here

# Start everything
npm run dev
```

That starts the backend (port 8000) and frontend dev server (port 5173) together. Open **http://localhost:5173**.

### Or step by step

```bash
cd server

# Create virtual environment
py -3.13 -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY

# Run
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd ui

# Install dependencies
npm install

# Development mode (hot reload, proxies to backend)
npm run dev

# OR build for production (served by backend)
npm run build
```

### 3. Access

| Mode | URL |
|------|-----|
| Development | http://localhost:5173 (Vite dev server) |
| Production | http://localhost:8000 (FastAPI serves built UI) |

---

## Usage

1. **Add a Folder** — type a path in the sidebar input and press Enter or click `+`
2. **Wait for Indexing** — watch the Activity feed; files are chunked and embedded
3. **Ask Questions** — type in the chat or use the mic button for voice
4. **Follow Citations** — click `[1]` `[2]` chips to jump to the source file/line

### Supported File Types

| Type | Extensions |
|------|-----------|
| Text/Code | `.py`, `.js`, `.ts`, `.tsx`, `.jsx`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.h`, `.cs`, `.rb`, `.php`, `.swift`, `.kt`, `.sh`, `.sql` |
| Documents | `.md`, `.txt`, `.rst`, `.csv`, `.json`, `.yaml`, `.toml`, `.xml`, `.svg` |
| PDFs | `.pdf` (via PyMuPDF, page-level citation) |
| Word | `.docx` |
| PowerPoint | `.pptx` |
| Jupyter | `.ipynb` |
| Images | `.png`, `.jpg`, `.webp` (described by Gemini, not available in Ollama mode) |

---

## Ollama (Local) Mode

No API key needed. Run Ollama locally:

```bash
# Install Ollama: https://ollama.com
ollama pull llama3.1
ollama pull nomic-embed-text
```

Then switch to Ollama in Settings (sidebar gear icon). Both chat and embedding will use your local models.

---

## Configuration

Settings are stored in `server/data/settings.json`. You can also change them via the UI Settings panel.

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `gemini` | `gemini` or `ollama` |
| `gemini.chat_model` | `gemini-2.5-flash` | Gemini chat model |
| `gemini.embed_model` | `gemini-embedding-001` | Gemini embedding model (768-dim) |
| `ollama.base_url` | `http://localhost:11434` | Ollama server URL |
| `ollama.chat_model` | `llama3.1` | Ollama chat model |
| `ollama.embed_model` | `nomic-embed-text` | Ollama embedding model |
| `retrieval.top_k` | `6` | Number of source chunks to retrieve per query |

---

## Voice Mode

- **Recording** — click the mic icon; speak your question
- **Transcription** — audio is sent to Gemini for transcription (requires API key)
- **TTS Playback** — optional text-to-speech via Gemini; falls back to browser speechSynthesis

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health + provider status |
| `/api/status` | GET | Full status: files, chunks, projects, settings |
| `/api/chat` | POST | SSE streaming chat (`{ question }`) |
| `/api/search` | POST | Semantic search (`{ query, top_k? }`) |
| `/api/folders` | POST | Add folder (`{ path }`) |
| `/api/folders` | DELETE | Remove folder (`?path=...`) |
| `/api/reindex` | POST | Re-index all folders (`{ force? }`) |
| `/api/settings` | POST | Update settings |
| `/api/voice/transcribe` | POST | Audio → text (multipart) |
| `/api/voice/tts` | POST | Text → WAV audio |
| `/ws/events` | WebSocket | Real-time indexing events |

---

## Project Structure

```
mnemos-rag/
├── server/
│   ├── app/
│   │   ├── config.py          # Settings management, env
│   │   ├── providers.py       # Gemini + Ollama abstraction
│   │   ├── loaders.py         # File extraction + chunking
│   │   ├── store.py           # ChromaDB vector store
│   │   ├── ingest.py          # Ingestion pipeline + worker queue
│   │   ├── watcher.py         # Watchdog folder monitoring
│   │   ├── rag.py             # RAG retrieval + streaming answer generation
│   │   └── main.py            # FastAPI app, routes, WebSocket
│   ├── data/                  # Persistent storage (created at runtime)
│   ├── requirements.txt
│   ├── .env.example
│   └── .venv/
└── ui/
    ├── src/
    │   ├── App.tsx            # Main layout + chat state
    │   ├── components/
    │   │   ├── Sidebar.tsx    # Projects, status, feed, search
    │   │   ├── MessageBubble.tsx  # Chat messages + citations
    │   │   ├── Composer.tsx   # Input + voice recording
    │   │   ├── SettingsModal.tsx  # Provider/config settings
    │   │   └── ActivityFeed.tsx   # Live indexing events
    │   ├── hooks/
    │   │   └── useVoice.ts    # MediaRecorder + audio analysis
    │   └── lib/
    │       ├── api.ts         # API client + SSE streaming
    │       └── types.ts       # TypeScript types
    ├── dist/                  # Production build
    ├── package.json
    └── vite.config.ts
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No embedding provider ready" | Set `GEMINI_API_KEY` in `server/.env` or switch to Ollama |
| Files not being indexed | Check Activity feed for errors; verify file extension is supported |
| Voice not working | Requires HTTPS or localhost; check mic permissions |
| Ollama connection refused | Ensure Ollama is running (`ollama serve`) |
| Stale vectors | Click "Reindex All" in the sidebar |

---

## License

MIT

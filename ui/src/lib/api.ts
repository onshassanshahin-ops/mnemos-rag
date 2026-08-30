import { ChatDetail, ChatSummary } from "./types";

const BASE = "";

export async function getStatus() {
  const r = await fetch(`${BASE}/api/status`);
  if (!r.ok) throw new Error("Failed to load status");
  return r.json();
}

export async function getHealth() {
  const r = await fetch(`${BASE}/api/health`);
  return r.json();
}

export function chatStream(
  question: string,
  sessionId: string | null,
  onDelta: (text: string) => void,
  onSources: (sources: any[]) => void,
  onSession: (id: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): AbortController {
  const ctrl = new AbortController();

  fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const t = await res.text();
      onError(t);
      onDone();
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const obj = JSON.parse(line.slice(6));
          if (obj.type === "delta") onDelta(obj.t);
          else if (obj.type === "sources") onSources(obj.sources);
          else if (obj.type === "session") onSession(obj.id);
          else if (obj.type === "error") onError(obj.error);
          else if (obj.type === "done") onDone();
        } catch {}
      }
    }
    onDone();
  }).catch((err) => {
    if (err.name !== "AbortError") {
      onError(String(err));
      onDone();
    }
  });

  return ctrl;
}

export async function listChats(): Promise<ChatSummary[]> {
  const r = await fetch(`${BASE}/api/chats`);
  if (!r.ok) return [];
  const d = await r.json();
  return d.chats;
}

export async function getChat(id: string): Promise<ChatDetail> {
  const r = await fetch(`${BASE}/api/chats/${id}`);
  if (!r.ok) throw new Error("Chat not found");
  return r.json();
}

export async function deleteChat(id: string) {
  const r = await fetch(`${BASE}/api/chats/${id}`, { method: "DELETE" });
  return r.json();
}

export async function addFolder(path: string) {
  const r = await fetch(`${BASE}/api/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || "Failed to add folder");
  }
  return r.json();
}

export async function pickFolder() {
  const r = await fetch(`${BASE}/api/folders/pick`, { method: "POST" });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || "Folder picker unavailable");
  }
  return r.json();
}

export async function removeFolder(path: string) {
  const r = await fetch(`${BASE}/api/folders?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
  return r.json();
}

export async function updateSettings(data: any) {
  const r = await fetch(`${BASE}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  return r.json();
}

export async function reindex(force = false) {
  const r = await fetch(`${BASE}/api/reindex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || "Reindex failed");
  }
  return r.json();
}

export async function retryFailed() {
  const r = await fetch(`${BASE}/api/reindex/failed`, { method: "POST" });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || "Retry failed");
  }
  return r.json();
}

export async function search(query: string) {
  const r = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error("Search failed");
  return r.json();
}

export async function getFiles(root?: string) {
  const query = root ? `?root=${encodeURIComponent(root)}` : "";
  const r = await fetch(`${BASE}/api/files${query}`);
  if (!r.ok) throw new Error("Failed to load files");
  return r.json();
}

async function fileAction(action: string, path: string) {
  const r = await fetch(`${BASE}/api/files/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!r.ok) throw new Error((await r.text()) || `Failed to ${action} file`);
  return r.json();
}

export const reindexFile = (path: string) => fileAction("reindex", path);
export const excludeFile = (path: string) => fileAction("exclude", path);
export const includeFile = (path: string) => fileAction("include", path);

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  const r = await fetch(`${BASE}/api/voice/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!r.ok) throw new Error("Transcription failed");
  const d = await r.json();
  return d.text;
}

export async function tts(text: string): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/api/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function connectEvents(onEvent: (e: any) => void): WebSocket {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws/events`);
  ws.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {}
  };
  ws.onclose = () => {
    setTimeout(() => connectEvents(onEvent), 3000);
  };
  return ws;
}

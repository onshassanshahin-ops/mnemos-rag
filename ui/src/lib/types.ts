export interface Source {
  i: number;
  path: string;
  rel_path: string;
  name: string;
  ext: string;
  page: number | null;
  line_start: number;
  line_end: number;
  snippet: string;
  score: number;
}

export interface Project {
  root: string;
  name: string;
  files: number;
  chunks: number;
}

export interface ProjectFile {
  path: string;
  rel_path: string;
  root: string;
  ext: string;
  chunks: number;
  excluded: boolean;
  status: "indexed" | "pending" | "excluded" | "failed";
  error?: string;
}

export interface Status {
  provider: string;
  provider_ready: boolean;
  gemini_key_present: boolean;
  collection: string;
  chunker_version: string;
  collections: Record<string, number>;
  total_files: number;
  total_chunks: number;
  indexed_files: number;
  pending_files: number;
  failed_files: number;
  excluded_files: number;
  queue: number;
  folders: string[];
  projects: Project[];
  orphan_files: string[];
  recent_events: Event[];
  settings: Settings;
}

export interface Settings {
  provider: string;
  gemini: { chat_model: string; embed_model: string; embed_dim: number };
  ollama: { base_url: string; chat_model: string; embed_model: string };
  retrieval: { top_k: number };
  voice: { tts_enabled: boolean; tts_voice: string };
  folders: string[];
}

export interface Event {
  ts: number;
  type: string;
  path?: string;
  chunks?: number;
  error?: string;
  files?: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  updated_at: number;
  message_count: number;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  ts: number;
}

export interface ChatDetail {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  messages: StoredMessage[];
}

export interface SearchResult {
  i: number;
  rel_path: string;
  name: string;
  ext: string;
  page: number | null;
  line_start: number;
  line_end: number;
  snippet: string;
  score: number;
}

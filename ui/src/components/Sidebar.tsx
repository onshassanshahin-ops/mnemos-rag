import { useState, useEffect } from "react";
import {
  FolderPlus, Trash2, RefreshCw, Search as SearchIcon,
  Settings as SettingsIcon, Database, Cpu, Zap, ChevronDown,
  Folder, HardDrive, AlertTriangle, Eye, EyeOff, MessageSquare, Plus, RotateCw
} from "lucide-react";
import { Status, SearchResult, ProjectFile, ChatSummary } from "../lib/types";
import { addFolder, excludeFile, getFiles, includeFile, pickFolder, reindex, reindexFile, removeFolder, retryFailed, search } from "../lib/api";
import ActivityFeed from "./ActivityFeed";

interface Props {
  status: Status;
  onSettings: () => void;
  onRefresh: () => void;
  events: any[];
  chats: ChatSummary[];
  currentChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export default function Sidebar({ status, onSettings, onRefresh, events, chats, currentChatId, onNewChat, onSelectChat, onDeleteChat }: Props) {
  const [chatsOpen, setChatsOpen] = useState(true);
  const [folderInput, setFolderInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [fileAction, setFileAction] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<"all" | "pending" | "failed" | "indexed">("all");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!selectedProject) return;
    getFiles(selectedProject).then((result) => setProjectFiles(result.files)).catch(() => {});
  }, [events, selectedProject]);

  const handleAdd = async () => {
    if (!folderInput.trim()) return;
    setAdding(true);
    try {
      await addFolder(folderInput.trim());
      setFolderInput("");
      onRefresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handlePick = async () => {
    setAdding(true);
    try {
      const result = await pickFolder();
      if (!result.cancelled) onRefresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (path: string) => {
    if (!confirm(`Remove "${path}" from indexing?`)) return;
    await removeFolder(path);
    onRefresh();
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      await reindex(false);
      onRefresh();
    } catch (e: any) {
      alert(e.message || "Reindex failed");
    } finally {
      setReindexing(false);
    }
  };

  const handleForceReindex = async () => {
    if (!confirm("This re-embeds every indexed file from scratch, even unchanged ones. It can be slow and uses significant API quota. Continue?")) return;
    setReindexing(true);
    try {
      await reindex(true);
      onRefresh();
    } catch (e: any) {
      alert(e.message || "Reindex failed");
    } finally {
      setReindexing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    setSearching(true);
    try {
      const res = await search(searchInput);
      setSearchResults(res.results);
      setShowSearch(true);
    } catch {} finally {
      setSearching(false);
    }
  };

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      await retryFailed();
      onRefresh();
    } catch (e: any) {
      alert(e.message || "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const openProject = async (root: string) => {
    if (selectedProject === root) {
      setSelectedProject(null);
      return;
    }
    try {
      const result = await getFiles(root);
      setProjectFiles(result.files);
      setSelectedProject(root);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const runFileAction = async (action: "reindex" | "exclude" | "include", file: ProjectFile) => {
    setFileAction(file.path);
    try {
      if (action === "reindex") await reindexFile(file.path);
      if (action === "exclude") await excludeFile(file.path);
      if (action === "include") await includeFile(file.path);
      const result = await getFiles(file.root);
      setProjectFiles(result.files);
      onRefresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setFileAction(null);
    }
  };

  const isGemini = status.provider === "gemini";

  return (
    <aside className="w-80 shrink-0 flex flex-col border-r border-white/6 bg-surface h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-indigo-500 via-cyan-500 to-green-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-base font-bold text-white drop-shadow">M</span>
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text tracking-tight">Mnemos</h1>
            <p className="text-[11px] text-white/30">Semantic RAG Engine</p>
          </div>
        </div>
      </div>

      {/* Chat History */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setChatsOpen(!chatsOpen)}
            className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors"
          >
            <MessageSquare size={12} />
            Chats ({chats.length})
            <ChevronDown size={12} className={`transition-transform ${chatsOpen ? "" : "-rotate-90"}`} />
          </button>
          <button
            onClick={onNewChat}
            title="New chat"
            className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-indigo-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        {chatsOpen && (
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {chats.map((c) => (
              <div
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelectChat(c.id)}
                role="button"
                tabIndex={0}
                className={`group/chat relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                  currentChatId === c.id ? "bg-indigo-500/10 border border-indigo-500/20" : "hover:bg-white/4"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-white/70">{c.title}</div>
                  <div className="text-[10px] text-white/25">{timeAgo(c.updated_at)} · {c.message_count} msg</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteChat(c.id); }}
                  className="w-6 h-6 rounded-md opacity-0 group-hover/chat:opacity-100 hover:bg-red-500/20 flex items-center justify-center transition-all shrink-0"
                  title="Delete chat"
                >
                  <Trash2 size={11} className="text-red-400" />
                </button>
              </div>
            ))}
            {!chats.length && <p className="text-xs text-white/20 italic px-1 py-1">No conversations yet</p>}
          </div>
        )}
      </div>

      {/* Status Card */}
      <div className="mx-4 mb-4 glass rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Status</span>
          <span
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              status.provider_ready
                ? "bg-green-500/15 text-green-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.provider_ready ? "bg-green-400" : "bg-amber-400"} animate-pulse`} />
            {status.provider_ready ? "Ready" : "Needs Key"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="glass rounded-lg py-2">
            <div className="text-base font-bold text-white/90 tabular-nums">{status.total_chunks}</div>
            <div className="text-[10px] text-white/30">Chunks</div>
          </div>
          <div className="glass rounded-lg py-2">
            <div className="text-base font-bold text-white/90 tabular-nums">{status.total_files}</div>
            <div className="text-[10px] text-white/30">Files</div>
          </div>
          <div className="glass rounded-lg py-2">
            <div className="text-base font-bold text-white/90 tabular-nums">{status.queue}</div>
            <div className="text-[10px] text-white/30">Queue</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-green-400/80">{status.indexed_files} indexed</span>
          <span className="text-amber-400/80">{status.pending_files} pending</span>
          <span className={status.failed_files ? "text-red-400" : "text-white/25"}>{status.failed_files} failed</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-white/30">
          <Cpu size={12} />
          {isGemini ? "Gemini" : "Ollama"}: {(status.settings as any)[status.provider]?.embed_model}
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/25">
          <Database size={11} />
          Index format {status.chunker_version}
        </div>
      </div>

      {/* Folder Input */}
      <div className="px-4 mb-3 flex gap-2">
        <button
          onClick={handlePick}
          disabled={adding}
          title="Choose folder"
          className="h-9 shrink-0 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-40"
        >
          Choose folder
        </button>
        <input
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add folder path..."
          className="min-w-0 flex-1 bg-white/3 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 outline-none focus:border-indigo-500/40 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30 flex items-center justify-center transition-colors disabled:opacity-40"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {/* Projects */}
      <div className="px-4 mb-3">
        <button
          onClick={() => setProjectsOpen(!projectsOpen)}
          className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 hover:text-white/60 transition-colors w-full"
        >
          <Folder size={12} />
          Projects ({status.projects.length})
          <ChevronDown size={12} className={`ml-auto transition-transform ${projectsOpen ? "" : "-rotate-90"}`} />
        </button>
        {projectsOpen && (
          <div className="flex flex-col gap-1.5">
            {status.projects.map((p) => (
              <div key={p.root} className="group">
                <div onClick={() => openProject(p.root)} onKeyDown={(event) => event.key === "Enter" && openProject(p.root)} role="button" tabIndex={0} className={`w-full glass rounded-xl px-3 py-2.5 flex items-center gap-3 text-left cursor-pointer ${selectedProject === p.root ? "border border-indigo-500/30 bg-indigo-500/5" : ""}`}>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <Folder size={14} className="text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white/80 truncate">{p.name}</div>
                  <div className="text-[10px] text-white/30">{p.files} files · {p.chunks} chunks</div>
                </div>
                <button
                  onClick={(event) => { event.stopPropagation(); handleRemove(p.root); }}
                  className="w-6 h-6 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/20 flex items-center justify-center transition-all"
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
                </div>
                {selectedProject === p.root && (
                  <div className="ml-4 mt-1 mb-2 border-l border-white/10 pl-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1 mb-1">
                      {(["all", "pending", "failed", "indexed"] as const).map((filter) => (
                        <button key={filter} onClick={() => setFileFilter(filter)} className={`px-2 py-1 rounded text-[10px] capitalize ${fileFilter === filter ? "bg-teal-500/20 text-teal-300" : "text-white/35 hover:text-white/60"}`}>
                          {filter}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                    {projectFiles.filter((file) => fileFilter === "all" || file.status === fileFilter).map((file) => (
                      <div key={file.path} className="group/file relative flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/4">
                        <HardDrive size={13} className={file.excluded ? "text-amber-400" : "text-teal-400"} />
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-xs ${file.excluded ? "text-white/40 line-through" : "text-white/70"}`} title={file.path}>{file.rel_path}</div>
                          <div className={`text-[10px] ${file.status === "failed" ? "text-red-400" : "text-white/30"}`}>{file.excluded ? "Excluded from answers" : file.status === "indexed" ? `${file.chunks} chunks` : file.status === "failed" ? (file.error || "Indexing failed") : "Waiting to index"}</div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                          <button
                            disabled={fileAction === file.path}
                            onClick={() => runFileAction("reindex", file)}
                            title={file.status === "failed" ? "Retry indexing" : "Reindex this file"}
                            className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-indigo-300 transition-colors disabled:opacity-30"
                          >
                            <RefreshCw size={12} className={fileAction === file.path ? "animate-spin" : ""} />
                          </button>
                          {file.excluded ? (
                            <button
                              disabled={fileAction === file.path}
                              onClick={() => runFileAction("include", file)}
                              title="Use in answers"
                              className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-teal-300 transition-colors disabled:opacity-30"
                            >
                              <Eye size={12} />
                            </button>
                          ) : (
                            <button
                              disabled={fileAction === file.path}
                              onClick={() => runFileAction("exclude", file)}
                              title="Exclude from answers"
                              className="h-6 w-6 rounded-md hover:bg-red-500/10 flex items-center justify-center text-white/40 hover:text-red-400 transition-colors disabled:opacity-30"
                            >
                              <EyeOff size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {!projectFiles.filter((file) => fileFilter === "all" || file.status === fileFilter).length && <p className="px-2 py-2 text-xs text-white/35">No matching files.</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {status.projects.length === 0 && (
              <p className="text-xs text-white/20 italic px-1">No folders indexed yet</p>
            )}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div className="px-4 mb-3 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-2">
          <Zap size={12} />
          Activity
        </div>
        <div className="flex-1 overflow-y-auto">
          <ActivityFeed events={events} />
        </div>
      </div>

      {/* Quick Search */}
      <div className="px-4 mb-2">
        {showSearch && searchResults.length > 0 && (
          <div className="glass rounded-xl mb-2 max-h-48 overflow-y-auto">
            {searchResults.slice(0, 6).map((r) => (
              <div key={r.i} className="px-3 py-2 border-b border-white/4 last:border-0 hover:bg-white/3">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="citation-chip text-[10px]">{r.i}</span>
                  <span className="text-white/60 truncate">{r.rel_path}</span>
                  <span className="text-white/25 ml-auto">{(r.score * 100).toFixed(0)}%</span>
                </div>
                <p className="text-[10px] text-white/30 mt-0.5 line-clamp-2 font-mono">{r.snippet.slice(0, 120)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Quick search..."
            className="flex-1 bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/20 outline-none focus:border-indigo-500/40 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="w-9 h-9 rounded-xl bg-white/3 border border-white/10 hover:bg-white/6 flex items-center justify-center transition-colors"
          >
            <SearchIcon size={14} className="text-white/40" />
          </button>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={handleReindex}
          disabled={reindexing}
          title="Scan folders for new or changed files; already-indexed files are left alone"
          className="flex-1 glass-bright rounded-xl py-2.5 text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/6 flex items-center justify-center gap-2 transition-all disabled:opacity-40"
        >
          <RefreshCw size={13} className={reindexing ? "animate-spin" : ""} />
          {reindexing ? "Checking..." : "Reindex All"}
        </button>
        <button
          onClick={handleForceReindex}
          disabled={reindexing}
          title="Force re-embed every file from scratch (uses more API quota)"
          className="glass-bright rounded-xl w-10 flex items-center justify-center text-white/50 hover:text-amber-300 hover:bg-white/6 transition-all disabled:opacity-30"
        >
          <RotateCw size={15} />
        </button>
        <button
          onClick={handleRetryFailed}
          disabled={retrying || !status.failed_files}
          title="Retry failed files"
          className="glass-bright rounded-xl w-10 flex items-center justify-center text-white/50 hover:text-red-300 hover:bg-white/6 transition-all disabled:opacity-30"
        >
          <AlertTriangle size={15} className={retrying ? "animate-pulse" : ""} />
        </button>
        <button
          onClick={onSettings}
          className="glass-bright rounded-xl w-10 flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/6 transition-all"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </aside>
  );
}

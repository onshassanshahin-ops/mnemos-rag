import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, Sparkles, Brain, FileText } from "lucide-react";
import { Status, Source, Event, ChatSummary } from "./lib/types";
import { getStatus, chatStream, connectEvents, listChats, getChat, deleteChat } from "./lib/api";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import MessageBubble, { UserBubble } from "./components/MessageBubble";
import Composer from "./components/Composer";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  isStreaming: boolean;
}

const SUGGESTIONS = [
  { icon: FileText, label: "Summarize my project", q: "Give me a high-level summary of everything in my indexed folders." },
  { icon: Brain, label: "Find patterns", q: "What patterns, conventions, or style guides are used across these files?" },
  { icon: Sparkles, label: "Explain architecture", q: "Walk me through the overall architecture of this codebase." },
];

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshChats = useCallback(() => {
    listChats().then(setChats).catch(() => {});
  }, []);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => {});
    refreshChats();
    const ws = connectEvents((e) => {
      setEvents((prev) => [e, ...prev].slice(0, 50));
      if (e.type === "indexed" || e.type === "failed" || e.type === "removed" || e.type === "folder_added") {
        getStatus().then(setStatus).catch(() => {});
      }
    });
    return () => ws.close();
  }, [refreshChats]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback((text: string) => {
    if (!text.trim() || busy) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      sources: [],
      isStreaming: false,
    };
    const aiMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      sources: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setBusy(true);

    let sources: Source[] = [];
    const ctrl = chatStream(
      text,
      currentChatId,
      (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + delta };
          }
          return next;
        });
      },
      (srcs) => {
        sources = srcs;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, sources: srcs };
          }
          return next;
        });
      },
      (id) => {
        setCurrentChatId(id);
        refreshChats();
      },
      () => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, isStreaming: false };
          }
          return next;
        });
        setBusy(false);
        refreshChats();
      },
      (err) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content || `Error: ${err}`,
              isStreaming: false,
            };
          }
          return next;
        });
        setBusy(false);
      }
    );
    abortRef.current = ctrl;
  }, [busy, currentChatId, refreshChats]);

  const handleNewChat = useCallback(() => {
    if (busy) return;
    setMessages([]);
    setCurrentChatId(null);
  }, [busy]);

  const handleSelectChat = useCallback(async (id: string) => {
    if (busy || id === currentChatId) return;
    try {
      const chat = await getChat(id);
      setMessages(
        chat.messages.map((m, i) => ({
          id: `${m.role[0]}-${chat.id}-${i}`,
          role: m.role,
          content: m.content,
          sources: m.sources,
          isStreaming: false,
        }))
      );
      setCurrentChatId(chat.id);
    } catch {
      refreshChats();
    }
  }, [busy, currentChatId, refreshChats]);

  const handleDeleteChat = useCallback(async (id: string) => {
    await deleteChat(id).catch(() => {});
    if (id === currentChatId) {
      setMessages([]);
      setCurrentChatId(null);
    }
    refreshChats();
  }, [currentChatId, refreshChats]);

  const empty = messages.length === 0;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {status ? (
        <Sidebar
          status={status}
          onSettings={() => setShowSettings(true)}
          onRefresh={() => getStatus().then(setStatus).catch(() => {})}
          events={events}
          chats={chats}
          currentChatId={currentChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
        />
      ) : (
        <aside className="w-80 shrink-0 border-r border-white/6 bg-surface p-5">
          <div className="h-10 w-32 rounded-lg bg-white/6 animate-pulse" />
        </aside>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center px-6 border-b border-white/6 shrink-0">
          <div className="flex items-center gap-3 text-sm text-white/50">
            <MessageSquare size={16} />
            <span>Chat</span>
            {status && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                status.provider === "gemini"
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-green-500/15 text-green-400"
              }`}>
                {status.provider === "gemini" ? "Gemini" : "Ollama"}
              </span>
            )}
          </div>
        </header>

        {/* Chat area */}
        <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {empty ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br flex items-center justify-center mb-6 shadow-2xl glow-ring">
                <Brain size={28} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold gradient-text mb-2">Your indexed workspace</h2>
              <p className="text-sm text-white/30 mb-8 max-w-md">
                Add a folder, then search and discuss the files that matter.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s.q)}
                    className="glass-bright rounded-xl px-5 py-3 flex items-center gap-3 text-sm text-white/60 hover:text-white/90 hover:bg-white/6 transition-all"
                  >
                    <s.icon size={16} className="text-indigo-400" />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} content={m.content} />
              ) : (
                <MessageBubble
                  key={m.id}
                  content={m.content}
                  sources={m.sources}
                  isStreaming={m.isStreaming}
                />
              )
            )
          )}
        </div>

        {/* Composer */}
        <Composer onSend={send} disabled={busy} />
      </main>

      {showSettings && status && (
        <SettingsModal
          settings={status.settings}
          onUpdated={(s) => {
            setStatus((prev) => (prev ? { ...prev, settings: s } : null));
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

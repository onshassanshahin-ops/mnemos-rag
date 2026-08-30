import { useRef, useState } from "react";
import { Source } from "../lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Volume2, Square, Loader2 } from "lucide-react";
import { tts } from "../lib/api";

interface Props {
  content: string;
  sources: Source[];
  isStreaming: boolean;
}

function stripForSpeech(text: string): string {
  return text
    .replace(/\[(\d{1,2})\]/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function SpeakButton({ content }: { content: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setState("idle");
  };

  const play = async () => {
    const clean = stripForSpeech(content);
    if (!clean) return;
    setState("loading");
    const url = await tts(clean);
    if (url) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("idle");
      setState("playing");
      audio.play().catch(() => setState("idle"));
    } else if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.onend = () => setState("idle");
      utter.onerror = () => setState("idle");
      setState("playing");
      window.speechSynthesis.speak(utter);
    } else {
      setState("idle");
    }
  };

  return (
    <button
      onClick={state === "idle" ? play : stop}
      title={state === "playing" ? "Stop" : "Read aloud"}
      className="w-6 h-6 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 flex items-center justify-center transition-all text-white/40 hover:text-white/80 shrink-0"
    >
      {state === "loading" ? (
        <Loader2 size={13} className="animate-spin" />
      ) : state === "playing" ? (
        <Square size={11} />
      ) : (
        <Volume2 size={13} />
      )}
    </button>
  );
}

function ExtBadge({ ext }: { ext: string }) {
  const colors: Record<string, string> = {
    py: "bg-amber-500/20 text-amber-300",
    js: "bg-yellow-400/20 text-yellow-300",
    ts: "bg-blue-500/20 text-blue-300",
    tsx: "bg-cyan-500/20 text-cyan-300",
    jsx: "bg-cyan-500/20 text-cyan-300",
    md: "bg-green-500/20 text-green-300",
    pdf: "bg-red-500/20 text-red-300",
    txt: "bg-zinc-400/20 text-zinc-300",
    json: "bg-indigo-400/20 text-indigo-300",
    go: "bg-sky-500/20 text-sky-300",
    rs: "bg-orange-500/20 text-orange-300",
  };
  const cls = colors[ext] || "bg-zinc-500/20 text-zinc-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
      {ext}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function SourcesPanel({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
        <span className="w-3 h-3 rounded-full bg-indigo-500/30" />
        Sources ({sources.length})
      </div>
      {sources.map((s) => (
        <a
          key={s.i}
          id={`cite-${s.i}`}
          href={`#src-${s.i}`}
          className="glass-bright rounded-lg px-3 py-2.5 flex flex-col gap-1.5 hover:border-indigo-500/30 transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="citation-chip text-[11px]">{s.i}</span>
            <ExtBadge ext={s.ext} />
            <span className="text-white/70 truncate">{s.rel_path}</span>
            <span className="text-white/30 ml-auto">
              {s.page ? `p${s.page} ` : ""}L{s.line_start}–{s.line_end}
            </span>
          </div>
          <p className="text-xs text-white/50 leading-relaxed line-clamp-3 font-mono">
            {s.snippet.slice(0, 300)}
          </p>
          <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="score-bar"
              style={{ width: `${Math.round(s.score * 100)}%` }}
            />
          </div>
        </a>
      ))}
    </div>
  );
}

function SmartLink(sources: Source[]) {
  return ({ href, children }: any) => {
    if (href?.startsWith("#cite-")) {
      const n = parseInt(href.slice(6));
      const s = sources.find((x) => x.i === n);
      return (
        <span
          id={`src-${n}`}
          className="citation-chip"
          title={s ? `${s.rel_path} L${s.line_start}–${s.line_end}` : ""}
          onClick={() => {
            document
              .getElementById(`cite-${n}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          {children}
        </span>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">
        {children}
      </a>
    );
  };
}

export default function MessageBubble({ content, sources, isStreaming }: Props) {
  const formatted = content.replace(/\[(\d{1,2})\]/g, "[$1](#cite-$1)");

  return (
    <div className="flex gap-4 group">
      <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0 mt-1 glow-ring">
        <span className="text-xs font-bold text-white/90">M</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="glass rounded-2xl rounded-tl-sm px-5 py-4 inline-flex items-start gap-2 max-w-[72ch]">
          <div className="prose prose-invert prose-p:my-2 prose-pre:bg-[#0a0a10] prose-pre:border prose-pre:border-white/10 prose-code:text-indigo-300 prose-code:text-sm max-w-none text-[15px] leading-relaxed text-white/90 min-w-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ a: SmartLink(sources) }}
            >
              {formatted}
            </ReactMarkdown>
            {isStreaming && <TypingDots />}
          </div>
          {!isStreaming && content && <SpeakButton content={content} />}
        </div>
        <SourcesPanel sources={sources} />
      </div>
    </div>
  );
}

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end group">
      <div className="glass-bright rounded-2xl rounded-tr-sm px-5 py-3 max-w-[72ch] bg-white/3">
        <p className="text-[15px] leading-relaxed text-white/80 whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

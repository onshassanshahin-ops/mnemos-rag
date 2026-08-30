import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { useVoice } from "../hooks/useVoice";
import { transcribeAudio } from "../lib/api";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function Composer({ onSend, disabled }: Props) {
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { state: voiceState, level, startRecording, stopRecording, cancel } = useVoice();

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const submit = () => {
    const t = input.trim();
    if (!t || disabled) return;
    onSend(t);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleVoice = async () => {
    if (voiceState === "recording") {
      const blob = await stopRecording();
      if (blob) {
        try {
          const text = await transcribeAudio(blob);
          if (text) {
            onSend(text);
          }
        } catch {
          // silent - user can type instead
        }
      }
    } else if (voiceState === "idle") {
      await startRecording();
    }
  };

  const cancelVoice = () => {
    cancel();
  };

  return (
    <div className="flex items-end gap-3 px-4 pb-4">
      <div className="flex-1 relative glass rounded-2xl">
        <div className="flex items-end">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={voiceState === "recording" ? "Listening..." : "Ask your workspace anything..."}
            disabled={disabled || voiceState === "processing"}
            rows={1}
            className="w-full bg-transparent px-5 py-3.5 text-sm text-white/90 placeholder:text-white/25 outline-none resize-none disabled:opacity-40"
          />
          {input.trim() && (
            <button
              onClick={submit}
              disabled={disabled}
              className="absolute right-2 bottom-2 w-9 h-9 rounded-xl bg-indigo-500 hover:bg-indigo-400 transition-colors flex items-center justify-center disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        {voiceState === "recording" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-red-500 to-pink-400 transition-all duration-75 rounded-full"
              style={{ width: `${Math.min(level * 200, 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pb-1">
        {voiceState === "recording" && (
          <button
            onClick={cancelVoice}
            className="w-11 h-11 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-colors"
          >
            <MicOff size={18} />
          </button>
        )}

        <button
          onClick={toggleVoice}
          disabled={disabled && voiceState !== "recording"}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            voiceState === "recording"
              ? "bg-red-500/20 border border-red-500/30 text-red-400 animate-pulse"
              : voiceState === "processing"
              ? "bg-white/5 border border-white/10 text-white/30"
              : "glass-bright hover:bg-white/10 text-white/60 hover:text-white/90"
          }`}
        >
          {voiceState === "processing" ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Mic size={18} />
          )}
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Settings as SettingsIcon, X, ChevronDown, Save } from "lucide-react";
import { updateSettings } from "../lib/api";
import { Settings } from "../lib/types";

interface Props {
  settings: Settings;
  onUpdated: (s: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onUpdated, onClose }: Props) {
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (path: string, val: any) => {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let node = next;
      for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
      node[keys[keys.length - 1]] = val;
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateSettings(form);
      onUpdated(res);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass glow-ring rounded-2xl w-full max-w-lg mx-4 p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
              <SettingsIcon size={18} />
            </div>
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
            <X size={18} className="text-white/50" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Provider */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Provider</span>
            <div className="flex gap-2">
              {(["gemini", "ollama"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => set("provider", p)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    form.provider === p
                      ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300"
                      : "glass-bright hover:bg-white/10 text-white/50"
                  }`}
                >
                  {p === "gemini" ? "Google Gemini" : "Ollama (Local)"}
                </button>
              ))}
            </div>
          </label>

          {form.provider === "gemini" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Chat Model</span>
                <input
                  value={form.gemini.chat_model}
                  onChange={(e) => set("gemini.chat_model", e.target.value)}
                  className="bg-white/3 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none focus:border-indigo-500/40 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Embed Model</span>
                <input
                  value={form.gemini.embed_model}
                  onChange={(e) => set("gemini.embed_model", e.target.value)}
                  className="bg-white/3 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none focus:border-indigo-500/40 transition-colors"
                />
              </label>
            </>
          )}

          {form.provider === "ollama" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Ollama URL</span>
                <input
                  value={form.ollama.base_url}
                  onChange={(e) => set("ollama.base_url", e.target.value)}
                  className="bg-white/3 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none focus:border-indigo-500/40 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Chat Model</span>
                <input
                  value={form.ollama.chat_model}
                  onChange={(e) => set("ollama.chat_model", e.target.value)}
                  className="bg-white/3 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none focus:border-indigo-500/40 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Embed Model</span>
                <input
                  value={form.ollama.embed_model}
                  onChange={(e) => set("ollama.embed_model", e.target.value)}
                  className="bg-white/3 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none focus:border-indigo-500/40 transition-colors"
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Top K Results</span>
            <input
              type="number"
              min={1}
              max={20}
              value={form.retrieval.top_k}
              onChange={(e) => set("retrieval.top_k", parseInt(e.target.value) || 5)}
              className="bg-white/3 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none focus:border-indigo-500/40 transition-colors w-24"
            />
          </label>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 transition-colors font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save size={16} />
          {saved ? "Saved!" : saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

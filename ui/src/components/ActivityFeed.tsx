import { Event } from "../lib/types";
import { FileText, X, AlertCircle, FolderPlus, RefreshCw } from "lucide-react";

interface Props {
  events: Event[];
}

const ICONS: Record<string, any> = {
  indexed: FileText,
  failed: AlertCircle,
  folder_added: FolderPlus,
  removed: FileText,
  folder_removed: FileText,
};

const COLORS: Record<string, string> = {
  indexed: "text-green-400",
  failed: "text-red-400",
  folder_added: "text-cyan-400",
  removed: "text-amber-400",
  folder_removed: "text-amber-400",
};

export default function ActivityFeed({ events }: Props) {
  if (!events.length) return null;

  return (
    <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
      {events.map((e, i) => {
        const Icon = ICONS[e.type] || FileText;
        const color = COLORS[e.type] || "text-white/40";
        const name = e.path?.split(/[/\\]/).pop() || "";
        return (
          <div key={`${e.ts}-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/3 transition-colors">
            <Icon size={13} className={color} />
            <span className="text-xs text-white/60 truncate flex-1">
              {e.type === "indexed" && <>{name} <span className="text-green-400/60">({e.chunks} chunks)</span></>}
              {e.type === "failed" && <span className="text-red-400/60">{name}: {e.error?.slice(0, 50)}</span>}
              {e.type === "folder_added" && <>{e.path?.split(/[/\\]/).pop()} <span className="text-cyan-400/60">({e.files} files)</span></>}
              {e.type === "removed" && <>{name} <X size={10} className="inline" /></>}
              {e.type === "folder_removed" && <span>Removed folder</span>}
            </span>
            <span className="text-[10px] text-white/20 tabular-nums">
              {new Date(e.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

import type { ElementType } from "react";
import {
  Archive,
  Code,
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Image,
  Music,
  Presentation,
} from "lucide-react";

export const COMPACT_MODE_WIDTH = 140;
export const HEADER_FORCE_NORMAL_WIDTH = 260;
export const HEADER_MIN_VISIBLE_WIDTH = 96;
export const HEADER_COMPACT_HYSTERESIS = 16;
export const WEB_SOURCE_CARD_ID = "__web_source_default__";

export const FILE_TYPE_CONFIG: Record<
  string,
  { icon: ElementType; color: string; bgGradient: string }
> = {
  pdf: {
    icon: FileText,
    color: "text-rose-500",
    bgGradient: "bg-gradient-to-br from-rose-50 to-red-50",
  },
  word: {
    icon: FileType,
    color: "text-blue-500",
    bgGradient: "bg-gradient-to-br from-blue-50 to-indigo-50",
  },
  video: {
    icon: FileVideo,
    color: "text-purple-500",
    bgGradient: "bg-gradient-to-br from-purple-50 to-violet-50",
  },
  image: {
    icon: Image,
    color: "text-emerald-500",
    bgGradient: "bg-gradient-to-br from-emerald-50 to-teal-50",
  },
  ppt: {
    icon: Presentation,
    color: "text-orange-500",
    bgGradient: "bg-gradient-to-br from-orange-50 to-amber-50",
  },
  txt: {
    icon: FileText,
    color: "text-slate-500",
    bgGradient: "bg-gradient-to-br from-slate-50 to-gray-50",
  },
  excel: {
    icon: FileSpreadsheet,
    color: "text-green-500",
    bgGradient: "bg-gradient-to-br from-green-50 to-emerald-50",
  },
  audio: {
    icon: Music,
    color: "text-pink-500",
    bgGradient: "bg-gradient-to-br from-pink-50 to-rose-50",
  },
  archive: {
    icon: Archive,
    color: "text-yellow-600",
    bgGradient: "bg-gradient-to-br from-yellow-50 to-orange-50",
  },
  code: {
    icon: Code,
    color: "text-cyan-500",
    bgGradient: "bg-gradient-to-br from-cyan-50 to-blue-50",
  },
  other: {
    icon: File,
    color: "text-zinc-400",
    bgGradient: "bg-gradient-to-br from-zinc-50 to-zinc-100",
  },
};

export const STATUS_CONFIG: Record<string, { color: string; pulse?: boolean }> = {
  uploading: { color: "bg-amber-400", pulse: true },
  parsing: { color: "bg-amber-400", pulse: true },
  ready: { color: "bg-emerald-400" },
  failed: { color: "bg-red-400" },
};

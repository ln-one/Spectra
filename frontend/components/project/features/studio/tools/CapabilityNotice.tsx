import type { CapabilityStatus } from "./types";

interface CapabilityNoticeProps {
  status: CapabilityStatus;
  reason: string;
}

const STATUS_STYLE: Record<CapabilityStatus, string> = {
  backend_ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  backend_placeholder: "border-amber-200 bg-amber-50 text-amber-700",
  backend_not_implemented: "border-orange-200 bg-orange-50 text-orange-700",
  backend_error: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<CapabilityStatus, string> = {
  backend_ready: "后端真实内容",
  backend_placeholder: "后端等待中",
  backend_not_implemented: "后端暂未实现",
  backend_error: "后端解析失败",
};

export function CapabilityNotice({ status, reason }: CapabilityNoticeProps) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${STATUS_STYLE[status]}`}
    >
      <p className="font-semibold">{STATUS_LABEL[status]}</p>
      <p className="mt-1 leading-5">{reason}</p>
    </div>
  );
}

export function FallbackPreviewHint() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
      正在等待后端返回真实内容
    </div>
  );
}

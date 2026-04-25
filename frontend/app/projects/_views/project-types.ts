export interface Project {
  id: string;
  name: string;
  nameSource?: string;
  name_source?: string;
  subject?: string;
  grade_level?: string;
  status: string;
  visibility?: string;
  created_at: string;
}

export const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-zinc-100 text-zinc-600" },
  active: { label: "进行中", color: "bg-blue-50 text-blue-600" },
  completed: { label: "已完成", color: "bg-emerald-50 text-emerald-600" },
  archived: { label: "已归档", color: "bg-zinc-50 text-zinc-500" },
};

export function formatDate(dateString: string) {
  if (!dateString) return "未知时间";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "未知时间";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

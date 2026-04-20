import { Beaker, FileText, FolderOpen, Globe, Laptop } from "lucide-react";
import { createLucideIconAdapter } from "../shared/createLucideIconAdapter";

export const ProjectKindGlobalIcon = createLucideIconAdapter(Globe);
export const ProjectKindWorkspaceIcon = createLucideIconAdapter(Laptop);
export const ProjectKindFolderIcon = createLucideIconAdapter(FolderOpen);
export const ProjectKindDocumentIcon = createLucideIconAdapter(FileText);
export const ProjectKindLabIcon = createLucideIconAdapter(Beaker);

const PROJECT_KIND_STYLE_TOKENS = [
  {
    bg: "bg-emerald-50 text-emerald-600",
    Icon: ProjectKindGlobalIcon,
  },
  {
    bg: "bg-blue-50 text-blue-600",
    Icon: ProjectKindWorkspaceIcon,
  },
  {
    bg: "bg-purple-50 text-purple-600",
    Icon: ProjectKindFolderIcon,
  },
  {
    bg: "bg-orange-50 text-orange-600",
    Icon: ProjectKindDocumentIcon,
  },
  {
    bg: "bg-rose-50 text-rose-600",
    Icon: ProjectKindLabIcon,
  },
] as const;

export function getProjectKindVisuals(iconClassName: string) {
  return PROJECT_KIND_STYLE_TOKENS.map(({ bg, Icon }) => ({
    bg,
    icon: <Icon className={iconClassName} />,
  }));
}

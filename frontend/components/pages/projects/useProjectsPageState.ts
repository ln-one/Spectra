import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/sdk";
import { TokenStorage } from "@/lib/auth";
import type { Project } from "./project-types";

export function useProjectsPageState() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await projectsApi.getProjects();
      setProjects(response?.data?.projects ?? []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      const message = error instanceof Error ? error.message : "加载项目失败";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    fetchProjects();
  }, [router, fetchProjects]);

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [projects, searchQuery]
  );

  return {
    router,
    projects,
    isLoading,
    errorMessage,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    filteredProjects,
    fetchProjects,
  };
}

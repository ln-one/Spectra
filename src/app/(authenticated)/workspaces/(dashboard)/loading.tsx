import { WorkspaceSkeleton } from "@/features/workspaces/dashboard/WorkspaceItems";

export default function WorkspacesLoading() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] p-8">
      <div className="mx-auto max-w-7xl">
        <WorkspaceSkeleton />
      </div>
    </main>
  );
}

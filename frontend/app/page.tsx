import { Sidebar } from "@/components/Sidebar";
import { SplitView } from "@/components/SplitView";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";

export default function Home() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 ml-20 p-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your courses and content
          </p>
        </div>

        <div className="h-[600px]">
          <SplitView />
        </div>

        <div className="max-w-2xl">
          <FileUploadDropzone />
        </div>
      </main>
    </div>
  );
}

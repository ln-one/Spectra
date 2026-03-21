import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LightRays } from "@/components/ui/light-rays";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectDetailLoading() {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-zinc-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 20%, rgba(153, 174, 255, 0.2), transparent 42%), radial-gradient(circle at 84% 10%, rgba(147, 197, 253, 0.16), transparent 38%), linear-gradient(160deg, #f5f7fb 0%, #edf1f8 55%, #e7edf5 100%)",
        }}
      />
      <LightRays
        count={8}
        color="rgba(141, 168, 255, 0.22)"
        blur={46}
        speed={17}
        length="88vh"
        className="opacity-60"
      />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="relative z-10 h-[min(82vh,780px)] w-[min(94vw,1240px)] rounded-[28px] border border-white/60 bg-white/55 p-4 shadow-[0_30px_90px_-35px_rgba(63,94,161,0.45)] backdrop-blur-xl md:p-6"
      >
        <div className="h-full w-full rounded-2xl border border-zinc-200/70 bg-white/60 p-4 md:p-5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-44 rounded-full" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>

          <div className="mt-4 grid h-[calc(100%-3.2rem)] grid-cols-1 gap-3 md:mt-5 md:grid-cols-12 md:gap-4">
            <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3 md:col-span-5">
              <Skeleton className="h-6 w-40 rounded-lg" />
              <div className="mt-3 space-y-2.5">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-36 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3 md:col-span-4">
              <div className="space-y-2.5">
                <Skeleton className="h-8 w-32 rounded-full" />
                <Skeleton className="h-10 w-4/5 rounded-xl" />
                <Skeleton className="h-10 w-3/4 rounded-xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-10 w-2/3 rounded-xl" />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3 md:col-span-3">
              <Skeleton className="h-6 w-28 rounded-lg" />
              <div className="mt-3 space-y-2.5">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function ProjectDetailNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
      <LightRays
        count={8}
        color="rgba(180, 200, 255, 0.15)"
        blur={40}
        speed={16}
        length="80vh"
        className="opacity-70"
      />
      <div className="text-center relative z-10">
        <p className="text-zinc-600">项目不存在</p>
        <Button onClick={onBack} className="mt-4 rounded-full px-5">
          返回项目列表
        </Button>
      </div>
    </div>
  );
}

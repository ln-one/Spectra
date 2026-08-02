import { notFound } from "next/navigation";
import { serverEnvironment } from "@/environment/server";
import { getTaskAgentAttemptDiagnostics } from "@/features/artifacts/task-agent/diagnostics.server";
import { getCurrentActor } from "@/features/identity/current";

export const dynamic = "force-dynamic";

export default async function TaskAttemptDiagnosticsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  if (serverEnvironment().NODE_ENV === "production") notFound();
  const [{ attemptId }, actor] = await Promise.all([params, getCurrentActor()]);
  const diagnostic = await getTaskAgentAttemptDiagnostics(actor, attemptId).catch(() => null);
  if (!diagnostic) notFound();

  const links = Object.entries(diagnostic.links).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm text-slate-400">Task Agent diagnostics</p>
          <h1 className="font-mono text-xl">{diagnostic.attemptId}</h1>
        </header>
        <dl className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 md:grid-cols-2">
          {[
            ["Artifact", diagnostic.artifactId],
            ["Kind", diagnostic.kind],
            ["Phase", diagnostic.phase ?? "queued"],
            ["Attempt state", diagnostic.state],
            ["Conversation", diagnostic.conversationId],
            ["OpenHands", diagnostic.remoteStatus ?? diagnostic.runtimeError ?? "unknown"],
            ["Last event", diagnostic.lastEventAt ?? "none"],
            ["Failure", diagnostic.failureDetail ?? diagnostic.failureCode ?? "none"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="break-all font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Timings</h2>
          <pre className="overflow-auto rounded-xl bg-slate-900 p-4 text-xs">
            {JSON.stringify(diagnostic.timings, null, 2)}
          </pre>
        </section>
        {links.length > 0 ? (
          <nav className="flex flex-wrap gap-3">
            {links.map(([label, href]) => (
              <a
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                href={href}
                key={label}
              >
                {label}
              </a>
            ))}
          </nav>
        ) : null}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Latest OpenHands events</h2>
          <pre className="max-h-[40rem] overflow-auto rounded-xl bg-slate-900 p-4 text-xs">
            {JSON.stringify(diagnostic.events, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}

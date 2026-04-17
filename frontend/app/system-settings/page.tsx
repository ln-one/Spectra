"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import {
  chatApi,
  systemSettingsApi,
  type SystemSettingsPayload,
  type SystemSettingsUpdateRequest,
} from "@/lib/sdk";
import {
  getChatLatencyNotice,
  getChatRequestErrorMessage,
  getErrorMessage,
} from "@/lib/sdk/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type NullableSettings = SystemSettingsPayload | null;

function buildSettingsPatch(
  initial: SystemSettingsPayload,
  draft: SystemSettingsPayload
): SystemSettingsUpdateRequest {
  const patch: SystemSettingsUpdateRequest = {};
  const sections = [
    "models",
    "generation_defaults",
    "feature_flags",
    "experience",
  ] as const;

  for (const section of sections) {
    const initialSection = initial[section] as Record<string, unknown>;
    const draftSection = draft[section] as Record<string, unknown>;
    const sectionPatch: Record<string, unknown> = {};

    for (const key of Object.keys(draftSection)) {
      if (draftSection[key] !== initialSection[key]) {
        sectionPatch[key] = draftSection[key];
      }
    }

    if (Object.keys(sectionPatch).length > 0) {
      patch[section] = sectionPatch as never;
    }
  }

  return patch;
}

export default function SystemSettingsPage() {
  const [initialSettings, setInitialSettings] =
    useState<NullableSettings>(null);
  const [draftSettings, setDraftSettings] = useState<NullableSettings>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [smokeProjectId, setSmokeProjectId] = useState("");
  const [smokeSessionId, setSmokeSessionId] = useState("");
  const [isSmokeRunning, setIsSmokeRunning] = useState(false);
  const [smokeTrace, setSmokeTrace] = useState<Record<string, unknown> | null>(
    null
  );

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await systemSettingsApi.get();
      setInitialSettings(response.data);
      setDraftSettings(response.data);
    } catch (error) {
      toast({
        title: "加载失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updateSettings = <K extends keyof SystemSettingsPayload>(
    section: K,
    patch: Partial<SystemSettingsPayload[K]>
  ) => {
    setDraftSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...prev[section],
          ...patch,
        },
      };
    });
  };

  const settingsPatch = useMemo(() => {
    if (!initialSettings || !draftSettings) return null;
    return buildSettingsPatch(initialSettings, draftSettings);
  }, [draftSettings, initialSettings]);

  const hasChanges = Boolean(
    settingsPatch && Object.keys(settingsPatch).length > 0
  );

  const saveSettings = async () => {
    if (!initialSettings || !draftSettings || !settingsPatch) return;
    if (Object.keys(settingsPatch).length === 0) {
      toast({
        title: "无需保存",
        description: "当前没有变更字段。",
      });
      return;
    }
    try {
      setIsSaving(true);
      const response = await systemSettingsApi.patch(settingsPatch);
      setInitialSettings(response.data);
      setDraftSettings(response.data);

      const verify = await systemSettingsApi.get();
      const isConsistent =
        JSON.stringify(verify.data) === JSON.stringify(response.data);
      if (!isConsistent) {
        toast({
          title: "保存后校验不一致",
          description: "后端生效结果与回填不同，请重试。",
          variant: "destructive",
        });
      }

      toast({
        title: "保存成功",
        description: "已按脏字段 PATCH 并完成一次 GET 校验。",
      });
    } catch (error) {
      toast({
        title: "保存失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const runSmokeChat = async () => {
    if (!smokeProjectId.trim()) {
      toast({
        title: "缺少 project_id",
        description: "请先填写 project_id。",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSmokeRunning(true);
      const response = await chatApi.sendMessage({
        project_id: smokeProjectId.trim(),
        session_id: smokeSessionId.trim() || undefined,
        content: "[system-settings-smoke] 验证 default_model 生效",
      });
      setSmokeTrace({
        session_id: response?.data?.session_id ?? null,
        rag_hit:
          typeof response?.data?.rag_hit === "boolean"
            ? response.data.rag_hit
            : null,
        observability: response?.data?.observability ?? null,
      });
      const latencyNotice = getChatLatencyNotice(
        response?.data?.observability ?? null
      );
      toast({
        title: "验证请求已发送",
        description: latencyNotice ?? "下方可查看 request trace。",
      });
    } catch (error) {
      toast({
        title: "验证请求失败",
        description: getChatRequestErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSmokeRunning(false);
    }
  };

  if (isLoading && !draftSettings) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-8">
        <div className="flex items-center gap-3 text-zinc-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>正在加载系统配置...</span>
        </div>
      </main>
    );
  }

  if (!draftSettings) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-4 p-8">
        <p className="text-zinc-700">未获取到系统配置。</p>
        <Button onClick={() => void loadSettings()}>重试</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-6 p-6 md:p-10">
      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">系统级业务配置</h1>
        <p className="mt-2 text-sm text-zinc-600">
          这是系统级运行时配置，变更会影响后续请求，不是 .env 持久化中心。
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" onClick={() => void loadSettings()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button
            onClick={() => void saveSettings()}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存配置
          </Button>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">模型配置</h2>
          <div className="space-y-3">
            <Input
              value={draftSettings.models.default_model}
              onChange={(event) =>
                updateSettings("models", { default_model: event.target.value })
              }
              placeholder="default_model"
            />
            <Input
              value={draftSettings.models.large_model}
              onChange={(event) =>
                updateSettings("models", { large_model: event.target.value })
              }
              placeholder="large_model"
            />
            <Input
              value={draftSettings.models.small_model}
              onChange={(event) =>
                updateSettings("models", { small_model: event.target.value })
              }
              placeholder="small_model"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">
            生成默认值
          </h2>
          <div className="space-y-3">
            <Input
              value={draftSettings.generation_defaults.default_output_type}
              onChange={(event) =>
                updateSettings("generation_defaults", {
                  default_output_type: event.target.value,
                })
              }
              placeholder="default_output_type"
            />
            <Input
              type="number"
              value={draftSettings.generation_defaults.default_page_count}
              onChange={(event) =>
                updateSettings("generation_defaults", {
                  default_page_count: Number(event.target.value || 0),
                })
              }
              placeholder="default_page_count"
            />
            <Input
              value={draftSettings.generation_defaults.default_outline_style}
              onChange={(event) =>
                updateSettings("generation_defaults", {
                  default_outline_style: event.target.value,
                })
              }
              placeholder="default_outline_style"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">功能开关</h2>
          <label className="mb-2 flex items-center gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={Boolean(
                draftSettings.feature_flags.enable_ai_generation
              )}
              onChange={(event) =>
                updateSettings("feature_flags", {
                  enable_ai_generation: event.target.checked,
                })
              }
            />
            enable_ai_generation
          </label>
          <label className="flex items-center gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={Boolean(draftSettings.feature_flags.enable_file_upload)}
              onChange={(event) =>
                updateSettings("feature_flags", {
                  enable_file_upload: event.target.checked,
                })
              }
            />
            enable_file_upload
          </label>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">
            体验与超时
          </h2>
          <div className="space-y-3">
            <Input
              type="number"
              value={draftSettings.experience.chat_timeout_seconds}
              onChange={(event) =>
                updateSettings("experience", {
                  chat_timeout_seconds: Number(event.target.value || 0),
                })
              }
              placeholder="chat_timeout_seconds"
            />
            <Input
              type="number"
              value={draftSettings.experience.ai_request_timeout_seconds}
              onChange={(event) =>
                updateSettings("experience", {
                  ai_request_timeout_seconds: Number(event.target.value || 0),
                })
              }
              placeholder="ai_request_timeout_seconds"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">
          最小验收请求
        </h2>
        <p className="mb-3 text-xs text-zinc-600">
          保存 default_model 后，发送一次 chat 请求并回显 request trace。
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={smokeProjectId}
            onChange={(event) => setSmokeProjectId(event.target.value)}
            placeholder="project_id"
          />
          <Input
            value={smokeSessionId}
            onChange={(event) => setSmokeSessionId(event.target.value)}
            placeholder="session_id (可选)"
          />
          <Button onClick={() => void runSmokeChat()} disabled={isSmokeRunning}>
            {isSmokeRunning ? "请求中..." : "发送验证请求"}
          </Button>
        </div>
        {smokeTrace ? (
          <pre className="mt-3 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">
            {JSON.stringify(smokeTrace, null, 2)}
          </pre>
        ) : null}
      </section>
    </main>
  );
}

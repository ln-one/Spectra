"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { systemSettingsApi, type SystemSettingsPayload } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type NullableSettings = SystemSettingsPayload | null;

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<NullableSettings>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await systemSettingsApi.get();
      setSettings(response.data);
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
    setSettings((prev) => {
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

  const saveSettings = async () => {
    if (!settings) return;
    try {
      setIsSaving(true);
      const response = await systemSettingsApi.patch(settings);
      setSettings(response.data);
      toast({
        title: "保存成功",
        description: "系统级业务配置已更新。",
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

  if (isLoading && !settings) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-8">
        <div className="flex items-center gap-3 text-zinc-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>正在加载系统配置...</span>
        </div>
      </main>
    );
  }

  if (!settings) {
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
          调试与联调用配置页，更新后作用于后续新请求。
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" onClick={() => void loadSettings()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button onClick={() => void saveSettings()} disabled={isSaving}>
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
              value={settings.models.default_model}
              onChange={(event) =>
                updateSettings("models", { default_model: event.target.value })
              }
              placeholder="default_model"
            />
            <Input
              value={settings.models.large_model}
              onChange={(event) =>
                updateSettings("models", { large_model: event.target.value })
              }
              placeholder="large_model"
            />
            <Input
              value={settings.models.small_model}
              onChange={(event) =>
                updateSettings("models", { small_model: event.target.value })
              }
              placeholder="small_model"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">生成默认值</h2>
          <div className="space-y-3">
            <Input
              value={settings.generation_defaults.default_output_type}
              onChange={(event) =>
                updateSettings("generation_defaults", {
                  default_output_type: event.target.value,
                })
              }
              placeholder="default_output_type"
            />
            <Input
              type="number"
              value={settings.generation_defaults.default_page_count}
              onChange={(event) =>
                updateSettings("generation_defaults", {
                  default_page_count: Number(event.target.value || 0),
                })
              }
              placeholder="default_page_count"
            />
            <Input
              value={settings.generation_defaults.default_outline_style}
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
              checked={Boolean(settings.feature_flags.enable_ai_generation)}
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
              checked={Boolean(settings.feature_flags.enable_file_upload)}
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
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">体验与超时</h2>
          <div className="space-y-3">
            <Input
              type="number"
              value={settings.experience.chat_timeout_seconds}
              onChange={(event) =>
                updateSettings("experience", {
                  chat_timeout_seconds: Number(event.target.value || 0),
                })
              }
              placeholder="chat_timeout_seconds"
            />
            <Input
              type="number"
              value={settings.experience.ai_request_timeout_seconds}
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
    </main>
  );
}

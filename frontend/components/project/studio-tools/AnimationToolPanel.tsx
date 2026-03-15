"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

export function AnimationToolPanel({ toolName }: ToolPanelProps) {
  const [speed, setSpeed] = useState(50);
  const [showTrail, setShowTrail] = useState(true);
  const [splitView, setSplitView] = useState(true);

  const codeText = useMemo(
    () =>
      `const orbitSpeed = ${speed / 100};\nconst showTrail = ${showTrail};\n\nrenderOrbit({\n  speed: orbitSpeed,\n  trail: showTrail,\n});`,
    [showTrail, speed]
  );

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="支持参数调节与代码/预览切换，后续接入真实动画引擎。"
      previewTitle="动画双屏占位"
      previewDescription="可选分栏显示代码与效果，参数变化即时反映到预览。"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">速度：{speed}% · 轨迹：{showTrail ? "开启" : "关闭"}</span>
          <Button type="button" size="sm" className="h-8 rounded-lg text-xs" disabled>
            应用到真实动画（后续）
          </Button>
        </div>
      }
      preview={
        <div className={splitView ? "grid grid-cols-2 gap-2" : "space-y-2"}>
          <div className="rounded-lg bg-zinc-900 p-3 text-[11px] text-zinc-100 whitespace-pre-wrap">{codeText}</div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">预览画布</p>
            <div className="mt-3 h-24 rounded-md bg-gradient-to-r from-zinc-100 to-zinc-200 relative overflow-hidden">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-emerald-500 transition-all duration-300"
                style={{ left: `${Math.max(5, Math.min(90, speed))}%` }}
              />
              {showTrail ? (
                <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-zinc-400/60" />
              ) : null}
            </div>
          </div>
        </div>
      }
    >
      <section className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-zinc-600">分栏模式</Label>
          <Switch checked={splitView} onCheckedChange={setSplitView} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-zinc-600">公转速度</Label>
          <Slider
            value={[speed]}
            min={10}
            max={100}
            step={5}
            onValueChange={(value) => setSpeed(value[0] ?? 50)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-zinc-600">显示轨迹虚线</Label>
          <Switch checked={showTrail} onCheckedChange={setShowTrail} />
        </div>
      </section>

      <Tabs defaultValue="code">
        <TabsList className="w-full">
          <TabsTrigger value="code" className="flex-1 text-xs">
            代码视图
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex-1 text-xs">
            预览视图
          </TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="text-xs text-zinc-500">
          当前已进入“代码”标签页。
        </TabsContent>
        <TabsContent value="preview" className="text-xs text-zinc-500">
          当前已进入“预览”标签页。
        </TabsContent>
      </Tabs>
    </ToolPanelShell>
  );
}

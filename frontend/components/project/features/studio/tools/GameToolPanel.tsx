"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

const GAME_VARIANTS = [
  {
    name: "航海路线选择",
    desc: "文字冒险：在补给与风险之间做决策。",
    code: `const state = { hp: 3, time: 90 };\nfunction choose(route) {\n  // route: safe | risky\n  state.time -= route === "safe" ? 20 : 8;\n}`,
  },
  {
    name: "物资配比挑战",
    desc: "资源管理：在粮食、淡水、弹药中做最优配比。",
    code: `const supplies = { food: 60, water: 50, ammo: 30 };\nfunction rebalance(key, amount) {\n  supplies[key] += amount;\n}`,
  },
  {
    name: "港口谈判小游戏",
    desc: "策略选择：通过谈判选项争取补给和时间。",
    code: `function negotiate(choice) {\n  // choice: bargain | trade | pressure\n  return choice === "bargain" ? "+2 supply" : "-1 reputation";\n}`,
  },
];

export function GameToolPanel({ toolName }: ToolPanelProps) {
  const [theme, setTheme] = useState("我要讲大航海时代");
  const [variantIndex, setVariantIndex] = useState(0);
  const [life, setLife] = useState(3);
  const [countdown, setCountdown] = useState(60);

  const current = useMemo(() => GAME_VARIANTS[variantIndex], [variantIndex]);

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="开放式描述游戏主题，界面模拟代码重写与沙盒刷新。"
      previewTitle="沙盒预览占位"
      previewDescription="后续接入真实 iframe/Sandpack 运行环境。"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            当前规则：倒计时 {countdown}s，生命值 {life}
          </span>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() =>
              setVariantIndex((prev) => (prev + 1) % GAME_VARIANTS.length)
            }
          >
            重新生成规则
          </Button>
        </div>
      }
      preview={
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">沙盒：{current.name}</p>
            <p className="text-sm text-zinc-700 mt-1">{current.desc}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="text-xs"
              onClick={() => {
                setCountdown((prev) => Math.max(10, prev - 10));
                setLife((prev) => Math.max(1, prev - 1));
              }}
            >
              触发错误选项（扣生命）
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-xs"
              onClick={() => {
                setCountdown((prev) => Math.min(120, prev + 5));
              }}
            >
              触发奖励选项（加时间）
            </Button>
          </div>
          <pre className="rounded-lg bg-zinc-900 p-3 text-[11px] leading-5 text-zinc-100 overflow-x-auto">
            {current.code}
          </pre>
        </div>
      }
    >
      <section className="space-y-1.5">
        <Label className="text-[11px] text-zinc-500">主题描述</Label>
        <Input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="h-9 text-xs"
        />
      </section>
    </ToolPanelShell>
  );
}

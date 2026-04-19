import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RunOption {
  value: string;
  label: string;
  status: string;
}

interface RunSelectorPopoverProps {
  options: RunOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function getStatusColor(status: string) {
  switch (status.toUpperCase()) {
    case "SUCCEEDED":
      return "bg-emerald-500/10 text-emerald-600";
    case "FAILED":
      return "bg-red-500/10 text-red-600";
    case "SLIDES_GENERATING":
    case "COMPILING":
    case "OUTLINE_DRAFTING":
    case "AWAITING_OUTLINE_CONFIRM":
      return "bg-amber-500/10 text-amber-600 animate-pulse";
    default:
      return "bg-zinc-500/10 text-zinc-600";
  }
}

function getStatusLabel(status: string) {
  switch (status.toUpperCase()) {
    case "SUCCEEDED":
      return "成功";
    case "FAILED":
      return "失败";
    case "SLIDES_GENERATING":
      return "生成中";
    case "COMPILING":
      return "编译中";
    case "OUTLINE_DRAFTING":
      return "草纲中";
    case "AWAITING_OUTLINE_CONFIRM":
      return "待确认";
    default:
      return status;
  }
}

export function RunSelectorPopover({
  options,
  value,
  onChange,
  disabled,
}: RunSelectorPopoverProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between h-9 px-3 font-normal text-sm border-black/10 hover:border-black/25"
        >
          <div className="flex items-center gap-2 truncate">
            {selectedOption ? (
              <>
                <span className="truncate">{selectedOption.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    getStatusColor(selectedOption.status)
                  )}
                >
                  {getStatusLabel(selectedOption.status)}
                </span>
              </>
            ) : (
              "选择 run"
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索 run..." />
          <CommandList>
            <CommandEmpty>未找到对应的 run</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="truncate text-sm">{option.label}</span>
                    <span
                      className={cn(
                        "w-fit rounded px-1.5 py-0.5 text-[10px] font-medium",
                        getStatusColor(option.status)
                      )}
                    >
                      {getStatusLabel(option.status)}
                    </span>
                  </div>
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import * as React from "react";
import { Search, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)
    );
  }, [options, search]);

  // Position
  const triggerRect = triggerRef.current?.getBoundingClientRect();
  const position = React.useMemo(() => {
    if (!triggerRect) return { top: 0, left: 0, width: 0 };
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const top = spaceBelow >= 280 || spaceBelow >= triggerRect.top
      ? triggerRect.bottom + 4
      : triggerRect.top - 280 - 4;
    return { top, left: triggerRect.left, width: triggerRect.width };
  }, [triggerRect?.top, triggerRect?.left, triggerRect?.bottom, triggerRect?.width]);

  // Click outside
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      function handlePointerDown(e: PointerEvent) {
        const target = e.target as Node;
        if (
          contentRef.current && !contentRef.current.contains(target) &&
          triggerRef.current && !triggerRef.current.contains(target)
        ) {
          setOpen(false);
          setSearch("");
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Focus input on open
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function handleSelect(val: string) {
    onValueChange(val);
    setOpen(false);
    setSearch("");
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-zinc-400",
          className
        )}
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <ChevronDown size={14} className={cn("ml-2 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <div
          ref={contentRef}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: Math.max(position.width, 220),
            zIndex: 9999,
          }}
          className="rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-500">Nenhum resultado</p>
            ) : (
              filtered.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors",
                    value === option.value
                      ? "bg-zinc-800 text-zinc-50"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  )}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelect(option.value);
                  }}
                >
                  <Check size={14} className={cn("shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.group && (
                      <span className="ml-1.5 text-[10px] text-zinc-500">{option.group}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

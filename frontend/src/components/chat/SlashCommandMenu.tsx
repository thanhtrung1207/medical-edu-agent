"use client";

import * as React from "react";
import * as Icons from "lucide-react";

import { commandRegistry } from "@/lib/slash-commands/registry";
import type { SlashCommand } from "@/lib/slash-commands/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  case: "Ca lâm sàng",
  analysis: "Phân tích",
};

const CATEGORY_ORDER = ["case", "analysis"] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SlashCommandMenuProps {
  query: string;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  disabledCommandIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlashCommandMenu({
  query,
  onSelect,
  onClose,
  disabledCommandIds,
}: SlashCommandMenuProps) {
  const allCommands = commandRegistry.search(query);

  const isDisabled = (cmd: SlashCommand) =>
    disabledCommandIds?.has(cmd.id) ?? false;

  const navigableCommands = allCommands.filter((c) => !isDisabled(c));

  // -------------------------------------------------------------------------
  // Focused-index state — kept in both React state (for re-renders) and a ref
  // (for synchronous read inside the keydown handler without stale closure).
  // -------------------------------------------------------------------------

  const [focusedIndex, _setFocusedIndex] = React.useState(0);
  const focusedIndexRef = React.useRef(0);

  const setFocusedIndex = React.useCallback(
    (updater: number | ((prev: number) => number)) => {
      const next =
        typeof updater === "function"
          ? updater(focusedIndexRef.current)
          : updater;
      focusedIndexRef.current = next;
      _setFocusedIndex(next);
    },
    [],
  );

  // Keep navigable list and callbacks in refs so the keydown handler (mounted
  // once) always reads the latest values without needing to re-register.
  const navigableCommandsRef = React.useRef(navigableCommands);
  navigableCommandsRef.current = navigableCommands;

  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  // Reset focused index whenever the query changes.
  React.useEffect(() => {
    setFocusedIndex(0);
  }, [query, setFocusedIndex]);

  // Global keydown handler — registered once on mount.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // IME guard — skip all navigation while a composition session is active.
      if (e.isComposing) return;

      const nav = navigableCommandsRef.current;
      const len = Math.max(nav.length, 1);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => (i + 1) % len);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => (i - 1 + len) % len);
          break;
        case "Enter": {
          e.preventDefault();
          const cmd = nav[focusedIndexRef.current];
          if (cmd) onSelectRef.current(cmd);
          break;
        }
        case "Escape":
          e.preventDefault();
          onCloseRef.current();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setFocusedIndex]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderGroup = (commands: SlashCommand[], category: string) => {
    if (commands.length === 0) return null;

    return (
      <div key={category}>
        {/* Category heading */}
        <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {CATEGORY_LABELS[category]}
        </div>

        {/* Command items */}
        {commands.map((cmd) => {
          const IconComp = (
            Icons as unknown as Record<
              string,
              React.ComponentType<{ className?: string }>
            >
          )[cmd.icon];

          const disabled = isDisabled(cmd);
          const navIdx = navigableCommands.indexOf(cmd);
          const isFocused = !disabled && navIdx === focusedIndex;

          return (
            <button
              key={cmd.id}
              type="button"
              disabled={disabled}
              aria-selected={isFocused}
              onClick={() => {
                // Guard for jsdom (which fires click on disabled buttons).
                if (!disabled) onSelect(cmd);
              }}
              className={[
                "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                isFocused
                  ? "bg-primary/10 dark:bg-primary/20"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800",
                disabled
                  ? "cursor-not-allowed opacity-40"
                  : "cursor-pointer",
              ].join(" ")}
            >
              {IconComp && (
                <IconComp className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
              )}
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {cmd.label}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {cmd.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="absolute z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      {CATEGORY_ORDER.map((cat) =>
        renderGroup(
          allCommands.filter((c) => c.category === cat),
          cat,
        ),
      )}
    </div>
  );
}

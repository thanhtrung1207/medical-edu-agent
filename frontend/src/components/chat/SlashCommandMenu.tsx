"use client";

import * as React from "react";
import {
  ClipboardPlus,
  CheckCircle,
  GitCompare,
  ListChecks,
  Stethoscope,
} from "lucide-react";

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

/**
 * Static map of the icon names used by the command registry.
 * Replaces the previous `import * as Icons from "lucide-react"` wildcard so
 * bundlers can tree-shake the rest of the icon library (I-2).
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ClipboardPlus,
  CheckCircle,
  GitCompare,
  ListChecks,
  Stethoscope,
};

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

  // Refs for each navigable menu-item button (indexed by navigableCommands position).
  // Used for programmatic DOM focus when keyboard navigation changes focusedIndex (C-2).
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Tracks whether the component has mounted; we skip the very first focus call
  // so the menu does not steal focus from the input on open.
  const hasMountedRef = React.useRef(false);

  // Programmatic focus — fires after every focusedIndex change caused by keyboard
  // navigation (C-2 / correct focus-management pattern for role="menu").
  React.useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

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

        {/* Command items — role="menuitem" (C-1) with programmatic focus (C-2) */}
        {commands.map((cmd) => {
          const IconComp = ICON_MAP[cmd.icon];

          const disabled = isDisabled(cmd);
          const navIdx = navigableCommands.indexOf(cmd);
          const isFocused = !disabled && navIdx === focusedIndex;

          return (
            <button
              key={cmd.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={disabled}
              aria-current={isFocused ? "true" : undefined}
              ref={(el) => {
                if (!disabled) itemRefs.current[navIdx] = el;
              }}
              onClick={() => {
                // Guard for jsdom (which fires click on aria-disabled buttons).
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
      role="menu"
      aria-label="Slash commands"
      className="max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/10"
    >
      {allCommands.length === 0 ? (
        /* Empty-state row (I-3) */
        <ul role="none">
          <li
            role="menuitem"
            aria-disabled="true"
            className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500"
          >
            Không có lệnh nào phù hợp.
          </li>
        </ul>
      ) : (
        CATEGORY_ORDER.map((cat) =>
          renderGroup(
            allCommands.filter((c) => c.category === cat),
            cat,
          ),
        )
      )}
    </div>
  );
}

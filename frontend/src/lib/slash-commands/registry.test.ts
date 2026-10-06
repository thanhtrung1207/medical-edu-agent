import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "@/lib/slash-commands/commands";
import {
  commandRegistry,
  CommandRegistry,
} from "@/lib/slash-commands/registry";
import type { SlashCommand } from "@/lib/slash-commands/types";

function makeCmd(overrides: Partial<SlashCommand> = {}): SlashCommand {
  return {
    id: "test",
    label: "Test",
    description: "Test command",
    icon: "Beaker",
    category: "analysis",
    handler: "send-message",
    ...overrides,
  };
}

describe("CommandRegistry", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it("registers and retrieves a command", () => {
    const cmd = makeCmd({ id: "foo" });

    registry.register(cmd);

    expect(registry.getById("foo")).toEqual(cmd);
  });

  it("getAll returns commands in insertion order", () => {
    registry.register(makeCmd({ id: "a" }));
    registry.register(makeCmd({ id: "b" }));

    expect(registry.getAll().map((command) => command.id)).toEqual(["a", "b"]);
  });

  it("getByCategory filters correctly", () => {
    registry.register(makeCmd({ id: "a", category: "case" }));
    registry.register(makeCmd({ id: "b", category: "analysis" }));

    expect(registry.getByCategory("case").map((command) => command.id)).toEqual(["a"]);
  });

  describe("diacritics-insensitive search", () => {
    beforeEach(() => {
      registry.register(makeCmd({ id: "chan-doan", label: "Phân tích chẩn đoán" }));
      registry.register(makeCmd({ id: "ke-hoach-dieu-tri", label: "Lập kế hoạch điều trị" }));
      registry.register(makeCmd({ id: "đặc-biệt", label: "Đặc biệt" }));
    });

    it("matches unaccented Vietnamese labels", () => {
      expect(registry.search("chan doan").map((command) => command.id)).toContain("chan-doan");
      expect(registry.search("ke hoach").map((command) => command.id)).toContain(
        "ke-hoach-dieu-tri",
      );
    });

    it("trims nonblank queries before normalizing", () => {
      expect(registry.search("  chan doan  ").map((command) => command.id)).toContain(
        "chan-doan",
      );
    });

    it("normalizes lowercase and uppercase Vietnamese d-strokes", () => {
      expect(registry.search("dac").map((command) => command.id)).toContain("đặc-biệt");
      expect(registry.search("DAC").map((command) => command.id)).toContain("đặc-biệt");
    });

    it("returns all commands for an empty or whitespace-only query", () => {
      expect(registry.search("").map((command) => command.id)).toEqual([
        "chan-doan",
        "ke-hoach-dieu-tri",
        "đặc-biệt",
      ]);
      expect(registry.search("   ").map((command) => command.id)).toEqual([
        "chan-doan",
        "ke-hoach-dieu-tri",
        "đặc-biệt",
      ]);
    });
  });
});

describe("DEFAULT_COMMANDS", () => {
  const expectedIds = [
    "benh-an-co-dinh",
    "benh-an-thao-lap",
    "chan-doan",
    "ke-hoach-dieu-tri",
    "so-sanh",
    "ket-thuc",
  ];

  it("declares exactly the six expected distinct commands", () => {
    const ids = DEFAULT_COMMANDS.map((command) => command.id);

    expect(ids).toEqual(expectedIds);
    expect(new Set(ids)).toHaveLength(6);
  });

  it("registers all default commands on the singleton", () => {
    expect(commandRegistry.getAll()).toEqual(DEFAULT_COMMANDS);
  });
});

import { describe, expect, it } from "vitest";
import "@/lib/slash-commands/commands";
import { commandRegistry } from "@/lib/slash-commands/registry";

const BACKEND_WHITELIST = new Set([
  "chan-doan",
  "ke-hoach-dieu-tri",
  "so-sanh",
  "ket-thuc",
]);

describe("registry/whitelist sync", () => {
  it("every send-message and action command is in the backend whitelist", () => {
    const backendCommands = commandRegistry
      .getAll()
      .filter((command) => command.handler === "send-message" || command.handler === "action");

    for (const command of backendCommands) {
      expect(BACKEND_WHITELIST.has(command.id), `${command.id} missing from backend whitelist`).toBe(
        true,
      );
    }
  });

  it("form-wizard commands are NOT in the backend whitelist", () => {
    const wizardCommands = commandRegistry
      .getAll()
      .filter((command) => command.handler === "form-wizard");

    for (const command of wizardCommands) {
      expect(
        BACKEND_WHITELIST.has(command.id),
        `${command.id} should not be in backend whitelist`,
      ).toBe(false);
    }
  });
});

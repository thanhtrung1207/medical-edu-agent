import type { CommandCategory, SlashCommand } from "./types";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): void {
    this.commands.set(command.id, command);
  }

  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  getById(id: string): SlashCommand | undefined {
    return this.commands.get(id);
  }

  search(query: string): SlashCommand[] {
    if (!query.trim()) {
      return this.getAll();
    }

    const normalizedQuery = normalize(query);

    return this.getAll().filter((command) =>
      normalize(`${command.id} ${command.label}`).includes(normalizedQuery),
    );
  }

  getByCategory(category: CommandCategory): SlashCommand[] {
    return this.getAll().filter((command) => command.category === category);
  }
}

export const commandRegistry = new CommandRegistry();

export type CommandCategory = "case" | "analysis";
export type CommandHandler = "form-wizard" | "send-message" | "action";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: CommandCategory;
  requiresClinicalRecord?: boolean;
  handler: CommandHandler;
  formSchemaId?: string;
}

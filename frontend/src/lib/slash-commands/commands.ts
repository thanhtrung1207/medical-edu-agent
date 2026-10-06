import { commandRegistry } from "./registry";
import type { SlashCommand } from "./types";

const DEFAULT_COMMANDS: SlashCommand[] = [
  {
    id: "benh-an-co-dinh",
    label: "Bệnh án Phục Hình Cố Định",
    description: "Tạo bệnh án phục hình cố định",
    icon: "ClipboardPlus",
    category: "case",
    handler: "form-wizard",
    formSchemaId: "co-dinh",
  },
  {
    id: "benh-an-thao-lap",
    label: "Bệnh án Phục Hình Tháo Lắp",
    description: "Tạo bệnh án phục hình tháo lắp",
    icon: "ClipboardPlus",
    category: "case",
    handler: "form-wizard",
    formSchemaId: "thao-lap",
  },
  {
    id: "chan-doan",
    label: "Phân tích chẩn đoán",
    description: "Phân tích chẩn đoán dựa trên bệnh án",
    icon: "Stethoscope",
    category: "analysis",
    requiresClinicalRecord: true,
    handler: "send-message",
  },
  {
    id: "ke-hoach-dieu-tri",
    label: "Lập kế hoạch điều trị",
    description: "Lập kế hoạch điều trị cho ca lâm sàng",
    icon: "ListChecks",
    category: "analysis",
    requiresClinicalRecord: true,
    handler: "send-message",
  },
  {
    id: "so-sanh",
    label: "So sánh phương án phục hình",
    description: "So sánh ưu nhược điểm các phương án",
    icon: "GitCompare",
    category: "analysis",
    requiresClinicalRecord: true,
    handler: "send-message",
  },
  {
    id: "ket-thuc",
    label: "Tóm tắt và lưu case",
    description: "Kết thúc ca lâm sàng và lưu tóm tắt",
    icon: "CheckCircle",
    category: "analysis",
    requiresClinicalRecord: true,
    handler: "action",
  },
];

for (const command of DEFAULT_COMMANDS) {
  commandRegistry.register(command);
}

export { DEFAULT_COMMANDS };

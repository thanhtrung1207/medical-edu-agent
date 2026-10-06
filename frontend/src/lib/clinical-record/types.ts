export interface ToothStatus {
  condition: "normal" | "decay" | "missing" | "restored" | "mobile" | "treatment-needed";
  note?: string;
}

export interface ClinicalRecordData {
  id: string;
  schemaId: "co-dinh" | "thao-lap";
  data: Record<string, unknown>;
  serializedText: string;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  summary?: string | null;
  closedAt?: string;
}

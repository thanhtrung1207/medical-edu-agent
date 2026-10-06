import type { ClinicalRecordData } from "./types";

const STORAGE_KEY = "unident_clinical_records";
const OLD_KEY = "dcs_saved_cases";

function readAll(): ClinicalRecordData[] {
  if (localStorage.getItem(OLD_KEY)) {
    localStorage.removeItem(OLD_KEY);
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ClinicalRecordData[];
  } catch {
    return [];
  }
}

function writeAll(records: ClinicalRecordData[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function saveClinicalRecord(record: ClinicalRecordData): void {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
  }
  writeAll(records);
}

export function getClinicalRecord(id: string): ClinicalRecordData | undefined {
  return readAll().find((r) => r.id === id);
}

export function listClinicalRecords(): ClinicalRecordData[] {
  return readAll();
}

export function deleteClinicalRecord(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function getActiveRecord(): ClinicalRecordData | undefined {
  return readAll()
    .filter((r) => !r.closedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function closeRecord(id: string, summary: string | null): void {
  const records = readAll();
  const record = records.find((r) => r.id === id);
  if (record) {
    record.closedAt = new Date().toISOString();
    record.summary = summary;
    writeAll(records);
  }
}

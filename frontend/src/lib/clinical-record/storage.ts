import type { ClinicalRecordData } from "./types";

const STORAGE_KEY = "unident_clinical_records";
const OLD_KEY = "dcs_saved_cases";

// Retains changes for this browser session until localStorage can be read and written again.
let fallbackRecords: ClinicalRecordData[] | undefined;

function isRecordData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClinicalRecordData(value: unknown): value is ClinicalRecordData {
  if (!isRecordData(value)) return false;

  return (
    typeof value.id === "string" &&
    (value.schemaId === "co-dinh" || value.schemaId === "thao-lap") &&
    isRecordData(value.data) &&
    typeof value.serializedText === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.summary === undefined ||
      value.summary === null ||
      typeof value.summary === "string") &&
    (value.closedAt === undefined || typeof value.closedAt === "string")
  );
}

function cloneRecord(record: ClinicalRecordData): ClinicalRecordData {
  return structuredClone(record);
}

function cloneRecords(records: ClinicalRecordData[]): ClinicalRecordData[] {
  return records.map(cloneRecord);
}

function readAll(): ClinicalRecordData[] {
  if (fallbackRecords) {
    const records = cloneRecords(fallbackRecords);
    writeAll(records);
    return records;
  }

  try {
    if (localStorage.getItem(OLD_KEY)) {
      try {
        localStorage.removeItem(OLD_KEY);
      } catch {
        // Continue loading current records when legacy cleanup is unavailable.
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records: unknown = JSON.parse(raw);
    return Array.isArray(records) ? records.filter(isClinicalRecordData) : [];
  } catch {
    return [];
  }
}

function writeAll(records: ClinicalRecordData[]): void {
  fallbackRecords = cloneRecords(records);

  try {
    const serializedRecords = JSON.stringify(records);
    localStorage.setItem(STORAGE_KEY, serializedRecords);

    if (localStorage.getItem(STORAGE_KEY) === serializedRecords) {
      fallbackRecords = undefined;
    }
  } catch {
    // Retain records in memory until localStorage can be read and written again.
  }
}

export function saveClinicalRecord(record: ClinicalRecordData): void {
  const records = readAll();
  const recordCopy = cloneRecord(record);
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    records[idx] = recordCopy;
  } else {
    records.push(recordCopy);
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

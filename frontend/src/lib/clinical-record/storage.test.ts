import { describe, it, expect, beforeEach } from "vitest";
import {
  saveClinicalRecord,
  getClinicalRecord,
  listClinicalRecords,
  deleteClinicalRecord,
  getActiveRecord,
  closeRecord,
} from "@/lib/clinical-record/storage";
import type { ClinicalRecordData } from "@/lib/clinical-record/types";

function makeRecord(overrides: Partial<ClinicalRecordData> = {}): ClinicalRecordData {
  return {
    id: crypto.randomUUID(),
    schemaId: "co-dinh",
    data: {},
    serializedText: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("clinical-record storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves a record", () => {
    const record = makeRecord();
    saveClinicalRecord(record);
    expect(getClinicalRecord(record.id)).toEqual(record);
  });

  it("lists all records", () => {
    const r1 = makeRecord();
    const r2 = makeRecord();
    saveClinicalRecord(r1);
    saveClinicalRecord(r2);
    expect(listClinicalRecords()).toHaveLength(2);
  });

  it("deletes a record", () => {
    const record = makeRecord();
    saveClinicalRecord(record);
    deleteClinicalRecord(record.id);
    expect(getClinicalRecord(record.id)).toBeUndefined();
  });

  it("getActiveRecord returns most recent unclosed record", () => {
    const old = makeRecord({ createdAt: "2026-01-01T00:00:00Z" });
    const recent = makeRecord({ createdAt: "2026-10-06T00:00:00Z" });
    saveClinicalRecord(old);
    saveClinicalRecord(recent);
    expect(getActiveRecord()?.id).toBe(recent.id);
  });

  it("getActiveRecord skips closed records", () => {
    const closed = makeRecord({ closedAt: "2026-10-06T00:00:00Z" });
    saveClinicalRecord(closed);
    expect(getActiveRecord()).toBeUndefined();
  });

  it("closeRecord sets summary and closedAt", () => {
    const record = makeRecord();
    saveClinicalRecord(record);
    closeRecord(record.id, "Tóm tắt bệnh án");
    const updated = getClinicalRecord(record.id);
    expect(updated?.closedAt).toBeTruthy();
    expect(updated?.summary).toBe("Tóm tắt bệnh án");
  });

  it("closeRecord with null summary sets closedAt only", () => {
    const record = makeRecord();
    saveClinicalRecord(record);
    closeRecord(record.id, null);
    const updated = getClinicalRecord(record.id);
    expect(updated?.closedAt).toBeTruthy();
    expect(updated?.summary).toBeNull();
  });

  it("deletes old dcs_saved_cases key on first load", () => {
    localStorage.setItem("dcs_saved_cases", "old data");
    listClinicalRecords();
    expect(localStorage.getItem("dcs_saved_cases")).toBeNull();
  });
});

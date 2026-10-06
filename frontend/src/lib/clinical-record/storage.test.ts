import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    listClinicalRecords();
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

  it.each(["null", "{}", '"not an array"'])(
    "returns an empty list when stored JSON is %s",
    (storedValue) => {
      localStorage.setItem("unident_clinical_records", storedValue);
      expect(listClinicalRecords()).toEqual([]);
    },
  );

  it("replaces an existing record when saving the same id", () => {
    const record = makeRecord();
    saveClinicalRecord(record);

    const replacement = {
      ...record,
      serializedText: "Updated record",
      updatedAt: "2026-10-07T00:00:00Z",
    };
    saveClinicalRecord(replacement);

    expect(listClinicalRecords()).toEqual([replacement]);
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

  it.each([[null], [{}]])(
    "filters malformed stored entries %j without throwing",
    (records) => {
      localStorage.setItem("unident_clinical_records", JSON.stringify(records));

      expect(() => listClinicalRecords()).not.toThrow();
      expect(listClinicalRecords()).toEqual([]);
      expect(() => getActiveRecord()).not.toThrow();
      expect(getActiveRecord()).toBeUndefined();
    },
  );

  it("preserves valid records while filtering malformed stored entries", () => {
    const record = makeRecord();
    localStorage.setItem(
      "unident_clinical_records",
      JSON.stringify([record, null, {}]),
    );

    expect(listClinicalRecords()).toEqual([record]);
    expect(getActiveRecord()).toEqual(record);
  });

  it("does not throw when localStorage.getItem fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const record = makeRecord();

    for (const operation of [
      () => saveClinicalRecord(record),
      () => getClinicalRecord(record.id),
      () => listClinicalRecords(),
      () => deleteClinicalRecord(record.id),
      () => getActiveRecord(),
      () => closeRecord(record.id, null),
    ]) {
      expect(operation).not.toThrow();
    }
  });

  it("does not throw when localStorage.removeItem fails", () => {
    localStorage.setItem("dcs_saved_cases", "old data");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const record = makeRecord();

    for (const operation of [
      () => saveClinicalRecord(record),
      () => getClinicalRecord(record.id),
      () => listClinicalRecords(),
      () => deleteClinicalRecord(record.id),
      () => getActiveRecord(),
      () => closeRecord(record.id, null),
    ]) {
      expect(operation).not.toThrow();
    }
  });

  it("does not throw when localStorage.setItem fails", () => {
    const record = makeRecord();
    localStorage.setItem("unident_clinical_records", JSON.stringify([record]));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(() => saveClinicalRecord(makeRecord())).not.toThrow();
    expect(() => deleteClinicalRecord(record.id)).not.toThrow();
    expect(() => closeRecord(record.id, null)).not.toThrow();
  });

  it("retains CRUD changes in memory when localStorage reads and writes fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const record = makeRecord();

    saveClinicalRecord(record);

    expect(getClinicalRecord(record.id)).toEqual(record);
    expect(listClinicalRecords()).toEqual([record]);
    expect(getActiveRecord()).toEqual(record);

    closeRecord(record.id, "Tóm tắt bệnh án");
    expect(getClinicalRecord(record.id)).toMatchObject({
      ...record,
      summary: "Tóm tắt bệnh án",
    });
    expect(getActiveRecord()).toBeUndefined();

    deleteClinicalRecord(record.id);
    expect(getClinicalRecord(record.id)).toBeUndefined();
    expect(listClinicalRecords()).toEqual([]);

    saveClinicalRecord(record);
    vi.restoreAllMocks();
    expect(listClinicalRecords()).toEqual([record]);
    localStorage.clear();
    expect(listClinicalRecords()).toEqual([]);
  });

  it("deletes old dcs_saved_cases key on first load", () => {
    localStorage.setItem("dcs_saved_cases", "old data");
    listClinicalRecords();
    expect(localStorage.getItem("dcs_saved_cases")).toBeNull();
  });
});

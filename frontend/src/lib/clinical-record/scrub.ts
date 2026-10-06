const PII_FIELDS = new Set(["ho_ten", "sdt", "dia_chi"]);

const PHONE_REGEX =
  /(?<!\d)(?:(?:\+?84[\s.\-]?|0)(?:24|28)[\s.\-]?\d{4}[\s.\-]?\d{4}|(?:\+?84|0)[\s.\-]?\d{2,3}[\s.\-]?\d{3}[\s.\-]?\d{3,4})(?!\d)/g;

export function scrubPII(text: string, fieldId?: string): string {
  if (fieldId && PII_FIELDS.has(fieldId)) {
    return "";
  }

  return text.replace(PHONE_REGEX, "[SĐT]");
}

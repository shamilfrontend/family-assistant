export type DocumentType =
  | "PASSPORT"
  | "INTERNATIONAL_PASSPORT"
  | "POLICY"
  | "LICENSE"
  | "CERTIFICATE"
  | "OTHER";

export type FamilyDocument = {
  id: string;
  ownerMemberId: string;
  type: DocumentType;
  numberMasked: string | null;
  number?: string | null;
  expiresAt: string;
  expiresSoon: boolean;
};

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "PASSPORT", label: "паспорт" },
  { value: "INTERNATIONAL_PASSPORT", label: "загранпаспорт" },
  { value: "POLICY", label: "полис" },
  { value: "LICENSE", label: "права" },
  { value: "CERTIFICATE", label: "свидетельство" },
  { value: "OTHER", label: "другое" },
];

export function documentTypeLabel(type: DocumentType): string {
  return DOCUMENT_TYPES.find((item) => item.value === type)?.label ?? type;
}

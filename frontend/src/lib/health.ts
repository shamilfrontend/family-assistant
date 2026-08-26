export type HealthKind = "DOCTOR" | "VACCINATION" | "CHECKUP" | "APPOINTMENT";

export type HealthRecord = {
  id: string;
  memberId: string;
  kind: HealthKind;
  doctorName: string | null;
  specialty: string | null;
  phone: string | null;
  vaccineName: string | null;
  vaccinatedAt: string | null;
  checkupType: string | null;
  checkupAt: string | null;
  note: string | null;
  appointmentTitle: string | null;
  appointmentAt: string | null;
  eventId: string | null;
};

export type HealthFormState = {
  kind: HealthKind;
  doctorName: string;
  specialty: string;
  phone: string;
  vaccineName: string;
  vaccinatedAt: string;
  checkupType: string;
  checkupAt: string;
  note: string;
  appointmentTitle: string;
  appointmentAt: string;
};

export const HEALTH_KINDS: { value: HealthKind; label: string }[] = [
  { value: "DOCTOR", label: "врач" },
  { value: "VACCINATION", label: "прививка" },
  { value: "CHECKUP", label: "осмотр" },
  { value: "APPOINTMENT", label: "приём" },
];

export function healthKindLabel(kind: HealthKind) {
  return HEALTH_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export function emptyHealthForm(kind: HealthKind = "DOCTOR"): HealthFormState {
  return {
    kind,
    doctorName: "",
    specialty: "",
    phone: "",
    vaccineName: "",
    vaccinatedAt: "",
    checkupType: "",
    checkupAt: "",
    note: "",
    appointmentTitle: "",
    appointmentAt: "",
  };
}

export function formFromRecord(record: HealthRecord, appointmentLocal: string): HealthFormState {
  return {
    kind: record.kind,
    doctorName: record.doctorName ?? "",
    specialty: record.specialty ?? "",
    phone: record.phone ?? "",
    vaccineName: record.vaccineName ?? "",
    vaccinatedAt: record.vaccinatedAt ?? "",
    checkupType: record.checkupType ?? "",
    checkupAt: record.checkupAt ?? "",
    note: record.note ?? "",
    appointmentTitle: record.appointmentTitle ?? "",
    appointmentAt: appointmentLocal,
  };
}

export function healthPayload(form: HealthFormState, appointmentIso: string | null) {
  const base = { kind: form.kind };
  switch (form.kind) {
    case "DOCTOR":
      return {
        ...base,
        doctorName: form.doctorName.trim(),
        specialty: form.specialty.trim(),
        phone: form.phone.trim() || null,
      };
    case "VACCINATION":
      return {
        ...base,
        vaccineName: form.vaccineName.trim(),
        vaccinatedAt: form.vaccinatedAt,
      };
    case "CHECKUP":
      return {
        ...base,
        checkupType: form.checkupType.trim(),
        checkupAt: form.checkupAt,
        note: form.note.trim() || null,
      };
    case "APPOINTMENT":
      return {
        ...base,
        appointmentTitle: form.appointmentTitle.trim(),
        appointmentAt: appointmentIso,
      };
  }
}

export function recordTitle(record: HealthRecord) {
  switch (record.kind) {
    case "DOCTOR":
      return record.doctorName ?? "врач";
    case "VACCINATION":
      return record.vaccineName ?? "прививка";
    case "CHECKUP":
      return record.checkupType ?? "осмотр";
    case "APPOINTMENT":
      return record.appointmentTitle ?? "приём";
  }
}

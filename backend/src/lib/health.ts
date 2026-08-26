import type { HealthKind, HealthRecord, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { createEventRow } from "./calendar.js";
import { forbidden, notFound, validation } from "./errors.js";
import type { Actor } from "./serialize.js";
import { parseInstant } from "./time.js";
import {
  asRecord,
  formatDate,
  optionalString,
  parseDateOnly,
  parseHealthKind,
  parseTitle,
  parseUuid,
} from "./validate.js";

export type HealthRecordWithEvent = HealthRecord & { event: { id: string } | null };

const EMPTY_FIELDS = {
  doctorName: null as string | null,
  specialty: null as string | null,
  phone: null as string | null,
  vaccineName: null as string | null,
  vaccinatedAt: null as Date | null,
  checkupType: null as string | null,
  checkupAt: null as Date | null,
  note: null as string | null,
  appointmentTitle: null as string | null,
  appointmentAt: null as Date | null,
};

export function serializeHealthRecord(record: HealthRecordWithEvent) {
  return {
    id: record.id,
    memberId: record.memberId,
    kind: record.kind,
    doctorName: record.doctorName,
    specialty: record.specialty,
    phone: record.phone,
    vaccineName: record.vaccineName,
    vaccinatedAt: record.vaccinatedAt ? formatDate(record.vaccinatedAt) : null,
    checkupType: record.checkupType,
    checkupAt: record.checkupAt ? formatDate(record.checkupAt) : null,
    note: record.note,
    appointmentTitle: record.appointmentTitle,
    appointmentAt: record.appointmentAt?.toISOString() ?? null,
    eventId: record.event?.id ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function compactHealthFact(
  record: HealthRecord,
  member: { id: string; name: string },
): Record<string, unknown> {
  const base = {
    id: record.id,
    kind: record.kind,
    member,
  };
  switch (record.kind) {
    case "DOCTOR":
      return {
        ...base,
        doctorName: record.doctorName,
        specialty: record.specialty,
        ...(record.phone ? { phone: record.phone } : {}),
      };
    case "VACCINATION":
      return {
        ...base,
        vaccineName: record.vaccineName,
        vaccinatedAt: record.vaccinatedAt ? formatDate(record.vaccinatedAt) : null,
      };
    case "CHECKUP":
      return {
        ...base,
        checkupType: record.checkupType,
        checkupAt: record.checkupAt ? formatDate(record.checkupAt) : null,
        ...(record.note ? { note: record.note } : {}),
      };
    case "APPOINTMENT":
      return {
        ...base,
        appointmentTitle: record.appointmentTitle,
        appointmentAt: record.appointmentAt?.toISOString() ?? null,
      };
  }
}

export async function assertMemberInFamily(familyId: string, memberId: string): Promise<void> {
  const member = await prisma.member.findFirst({ where: { id: memberId, familyId } });
  if (!member) throw validation("Член семьи не найден");
}

export async function loadHealthRecord(
  familyId: string,
  id: string,
): Promise<HealthRecordWithEvent> {
  const record = await prisma.healthRecord.findFirst({
    where: { id, familyId },
    include: { event: { select: { id: true } } },
  });
  if (!record) throw notFound();
  return record;
}

export function assertCanViewHealth(actor: Actor, memberId: string): void {
  if (actor.role === "CHILD" && memberId !== actor.memberId) {
    throw forbidden();
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") throw validation(`Укажите ${field}`);
  const text = value.trim();
  if (!text) throw validation(`Укажите ${field}`);
  if (text.length > 120) throw validation(`${field}: слишком длинное`);
  return text;
}

function optionalLimited(value: unknown, field: string): string | null {
  const text = optionalString(value) ?? null;
  if (text && text.length > 120) throw validation(`${field}: слишком длинное`);
  return text;
}

type HealthFields = typeof EMPTY_FIELDS;

function fieldsForKind(
  kind: HealthKind,
  body: Record<string, unknown>,
  partial: boolean,
): Partial<HealthFields> {
  const fields: Partial<HealthFields> = partial ? {} : { ...EMPTY_FIELDS };
  switch (kind) {
    case "DOCTOR":
      if (!partial || body.doctorName !== undefined) fields.doctorName = requiredText(body.doctorName, "имя врача");
      if (!partial || body.specialty !== undefined) fields.specialty = requiredText(body.specialty, "специальность");
      if (!partial || body.phone !== undefined) fields.phone = optionalLimited(body.phone, "телефон");
      break;
    case "VACCINATION":
      if (!partial || body.vaccineName !== undefined) {
        fields.vaccineName = requiredText(body.vaccineName, "название прививки");
      }
      if (!partial || body.vaccinatedAt !== undefined) {
        fields.vaccinatedAt = parseDateOnly(body.vaccinatedAt, "vaccinatedAt");
      }
      break;
    case "CHECKUP":
      if (!partial || body.checkupType !== undefined) fields.checkupType = requiredText(body.checkupType, "тип осмотра");
      if (!partial || body.checkupAt !== undefined) fields.checkupAt = parseDateOnly(body.checkupAt, "checkupAt");
      if (!partial || body.note !== undefined) fields.note = optionalString(body.note) ?? null;
      break;
    case "APPOINTMENT":
      if (!partial || body.appointmentTitle !== undefined) {
        fields.appointmentTitle = parseTitle(body.appointmentTitle);
      }
      if (!partial || body.appointmentAt !== undefined) {
        fields.appointmentAt = parseInstant(body.appointmentAt, "appointmentAt").toJSDate();
      }
      break;
  }
  return fields;
}

export function parseHealthCreate(body: unknown): {
  memberId: string;
  kind: HealthKind;
  fields: typeof EMPTY_FIELDS;
} {
  const data = asRecord(body);
  const kind = parseHealthKind(data.kind);
  return {
    memberId: parseUuid(data.memberId, "memberId"),
    kind,
    fields: { ...EMPTY_FIELDS, ...fieldsForKind(kind, data, false) },
  };
}

export function parseHealthPatch(
  existing: HealthRecord,
  body: unknown,
): { memberId?: string; kind: HealthKind; kindChanged: boolean; fields: Partial<HealthFields> } {
  const data = asRecord(body);
  const kind = data.kind !== undefined ? parseHealthKind(data.kind) : existing.kind;
  const kindChanged = kind !== existing.kind;
  const memberId = data.memberId !== undefined ? parseUuid(data.memberId, "memberId") : undefined;
  const fields = fieldsForKind(kind, data, !kindChanged);
  if (memberId === undefined && !kindChanged && Object.keys(fields).length === 0) {
    throw validation("Нечего менять");
  }
  return { memberId, kind, kindChanged, fields };
}

async function syncAppointmentEvent(
  tx: Prisma.TransactionClient,
  record: HealthRecord,
  createdByMemberId: string | null,
): Promise<void> {
  const existing = await tx.event.findUnique({ where: { healthRecordId: record.id } });
  if (record.kind !== "APPOINTMENT" || !record.appointmentTitle || !record.appointmentAt) {
    if (existing) await tx.event.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    await tx.event.update({
      where: { id: existing.id },
      data: {
        title: record.appointmentTitle,
        startsAt: record.appointmentAt,
        participants: {
          deleteMany: {},
          create: [{ memberId: record.memberId }],
        },
      },
    });
    return;
  }

  await createEventRow(tx, {
    familyId: record.familyId,
    title: record.appointmentTitle,
    type: "HEALTH_APPOINTMENT",
    startsAt: record.appointmentAt,
    endsAt: null,
    allDay: false,
    recurrence: "NONE",
    recurrenceUntil: null,
    remindInUi: true,
    createdByMemberId,
    participantIds: [record.memberId],
    healthRecordId: record.id,
  });
}

const withEvent = { event: { select: { id: true } } } as const;

export async function createHealthRecord(
  actor: Actor,
  body: unknown,
): Promise<HealthRecordWithEvent> {
  const parsed = parseHealthCreate(body);
  await assertMemberInFamily(actor.familyId, parsed.memberId);

  return prisma.$transaction(async (tx) => {
    const record = await tx.healthRecord.create({
      data: {
        familyId: actor.familyId,
        memberId: parsed.memberId,
        kind: parsed.kind,
        ...parsed.fields,
      },
    });
    await syncAppointmentEvent(tx, record, actor.memberId);
    return tx.healthRecord.findFirstOrThrow({
      where: { id: record.id },
      include: withEvent,
    });
  });
}

export async function updateHealthRecord(
  actor: Actor,
  id: string,
  body: unknown,
): Promise<HealthRecordWithEvent> {
  const existing = await loadHealthRecord(actor.familyId, id);
  const parsed = parseHealthPatch(existing, body);
  if (parsed.memberId) await assertMemberInFamily(actor.familyId, parsed.memberId);

  return prisma.$transaction(async (tx) => {
    const record = await tx.healthRecord.update({
      where: { id: existing.id },
      data: {
        ...(parsed.memberId ? { memberId: parsed.memberId } : {}),
        ...(parsed.kindChanged ? { kind: parsed.kind } : {}),
        ...parsed.fields,
      },
    });
    await syncAppointmentEvent(tx, record, actor.memberId);
    return tx.healthRecord.findFirstOrThrow({
      where: { id: record.id },
      include: withEvent,
    });
  });
}

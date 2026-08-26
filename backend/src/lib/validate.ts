import {
  DocumentType,
  EventRecurrence,
  EventType,
  HealthKind,
  MemberRole,
  PurchaseCategory,
  TaskRecurrence,
  TaskStatus,
} from "@prisma/client";
import { validation } from "./errors.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw validation("Невалидное тело");
  }
  return body as Record<string, unknown>;
}

export function parseEmail(value: unknown): string {
  if (typeof value !== "string") throw validation("Укажите email");
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw validation("Невалидный email");
  return email;
}

export function parsePassword(value: unknown): string {
  if (typeof value !== "string") throw validation("Укажите пароль");
  if (value.length < 8 || value.length > 72) {
    throw validation("Пароль: 8–72 символа");
  }
  return value;
}

export function parseName(value: unknown): string {
  if (typeof value !== "string") throw validation("Укажите имя");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw validation("Имя: 1–80 символов");
  }
  return name;
}

export function parseBirthDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validation("Дата рождения: YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw validation("Невалидная дата рождения");
  }
  return date;
}

export function parseTimezone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw validation("Укажите часовой пояс");
  }
  const timezone = value.trim();
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw validation("Невалидный часовой пояс");
  }
  return timezone;
}

export function parseRole(value: unknown): MemberRole {
  if (value === "ADULT" || value === "CHILD") return value;
  throw validation("Роль: ADULT или CHILD");
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw validation("Невалидное поле");
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isAdultDeclared(value: unknown): boolean {
  return value === true;
}

const EVENT_TYPES = new Set<string>(Object.values(EventType));

export function parseEventType(value: unknown): EventType {
  if (typeof value !== "string" || !EVENT_TYPES.has(value)) {
    throw validation("Невалидный тип события");
  }
  if (value === "HEALTH_APPOINTMENT") {
    throw validation("Тип HEALTH_APPOINTMENT нельзя создать из календаря");
  }
  return value as EventType;
}

export function parseEventRecurrence(value: unknown): EventRecurrence {
  if (value === "NONE" || value === "WEEKLY" || value === "YEARLY") return value;
  throw validation("Повтор: NONE, WEEKLY или YEARLY");
}

export function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw validation(`${field}: укажите да или нет`);
  return value;
}

export function parseTitle(value: unknown): string {
  if (typeof value !== "string") throw validation("Укажите название");
  const title = value.trim();
  if (title.length < 1 || title.length > 120) {
    throw validation("Название: 1–120 символов");
  }
  return title;
}

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw validation(`${field}: невалидный id`);
  }
  return value;
}

export function parseUuidList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw validation(`${field}: минимум один`);
  }
  return [...new Set(value.map((item) => parseUuid(item, field)))];
}

export function parseTaskRecurrence(value: unknown): TaskRecurrence {
  if (value === "NONE" || value === "DAILY" || value === "WEEKLY") return value;
  throw validation("Повтор: NONE, DAILY или WEEKLY");
}

export function parseTaskStatus(value: unknown): TaskStatus {
  if (value === "OPEN" || value === "DONE") return value;
  throw validation("Статус: OPEN или DONE");
}

const DOCUMENT_TYPES = new Set<string>(Object.values(DocumentType));

export function parseDocumentType(value: unknown): DocumentType {
  if (typeof value !== "string" || !DOCUMENT_TYPES.has(value)) {
    throw validation("Невалидный тип документа");
  }
  return value as DocumentType;
}

const HEALTH_KINDS = new Set<string>(Object.values(HealthKind));

export function parseHealthKind(value: unknown): HealthKind {
  if (typeof value !== "string" || !HEALTH_KINDS.has(value)) {
    throw validation("Вид записи: DOCTOR, VACCINATION, CHECKUP или APPOINTMENT");
  }
  return value as HealthKind;
}

export function parseDateOnly(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validation(`${field}: YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw validation(`${field}: невалидная дата`);
  }
  return date;
}

const PURCHASE_CATEGORIES = new Set<string>(Object.values(PurchaseCategory));

export function parsePurchaseCategory(value: unknown): PurchaseCategory {
  if (typeof value !== "string" || !PURCHASE_CATEGORIES.has(value)) {
    throw validation("Категория: FOOD, HOUSEHOLD, PHARMACY или OTHER");
  }
  return value as PurchaseCategory;
}

export function optionalPurchaseCategory(value: unknown): PurchaseCategory | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parsePurchaseCategory(value);
}

export function parseQuantity(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw validation("Количество: положительное число");
  }
  if (value > 99_999_999) throw validation("Количество слишком большое");
  return Math.round(value * 100) / 100;
}

export function parseMessageContent(value: unknown): string {
  if (typeof value !== "string") throw validation("Укажите сообщение");
  const content = value.trim();
  if (content.length < 1) throw validation("Укажите сообщение");
  if (content.length > 4000) throw validation("Сообщение слишком длинное");
  return content;
}

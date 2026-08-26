import type { AiDraft, AiDraftOperation, PurchaseCategory } from "@prisma/client";
import { prisma } from "../prisma.js";
import { createPurchase, markPurchaseBought } from "../purchases.js";
import { createCalendarEvent, familyTimezone, serializeCreatedEvent } from "../calendar.js";
import { completeTask, createTask, loadTask, serializeTask } from "../tasks.js";
import { createExpense, serializeExpense } from "../budget.js";
import { parseInstant, startOfToday } from "../time.js";
import { conflict, forbidden, notFound, validation } from "../errors.js";
import type { Actor } from "../serialize.js";
import { serializePurchase } from "../serialize.js";
import {
  asRecord,
  formatDate,
  optionalPurchaseCategory,
  parseAmount,
  parseDateOnly,
  parseExpenseTitle,
  parseTaskRecurrence,
  parseTitle,
  parseUuid,
} from "../validate.js";

const DRAFT_TTL_MS = 60 * 60 * 1000;

export function draftExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + DRAFT_TTL_MS);
}

export function serializeDraft(draft: AiDraft) {
  return {
    id: draft.id,
    operation: draft.operation,
    payload: draft.payload,
    status: draft.status,
    expiresAt: draft.expiresAt.toISOString(),
    messageId: draft.messageId,
  };
}

function asPayload(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function parsePurchasePayload(raw: unknown): { title: string; category: PurchaseCategory } {
  const payload = asPayload(raw);
  return {
    title: parseTitle(payload.title),
    category: optionalPurchaseCategory(payload.category) ?? "OTHER",
  };
}

export function parseCreateTaskPayload(raw: unknown) {
  const payload = asPayload(raw);
  return {
    title: parseTitle(payload.title),
    assigneeMemberId: parseUuid(payload.assigneeMemberId, "assigneeMemberId"),
    dueAt: parseInstant(payload.dueAt, "dueAt").toJSDate(),
    recurrence:
      payload.recurrence === undefined ? ("NONE" as const) : parseTaskRecurrence(payload.recurrence),
  };
}

export function parseTaskIdPayload(raw: unknown): string {
  return parseUuid(asPayload(raw).taskId, "taskId");
}

export function parsePurchaseIdPayload(raw: unknown): string {
  return parseUuid(asPayload(raw).purchaseId, "purchaseId");
}

export function parseCreateExpensePayload(raw: unknown) {
  const payload = asPayload(raw);
  return {
    title: parseExpenseTitle(payload.title),
    amount: parseAmount(payload.amount),
    categoryId: parseUuid(payload.categoryId, "categoryId"),
    spentByMemberId: parseUuid(payload.spentByMemberId, "spentByMemberId"),
    spentAt:
      payload.spentAt === undefined || payload.spentAt === null || payload.spentAt === ""
        ? undefined
        : formatDate(parseDateOnly(payload.spentAt, "spentAt")),
  };
}

export function parseEventPayload(raw: unknown): Record<string, unknown> {
  return asRecord(raw);
}

export async function applyDraft(actor: Actor, chatId: string, draftId: string) {
  const draft = await prisma.aiDraft.findFirst({
    where: { id: draftId, chatId },
  });
  if (!draft) throw notFound();
  if (draft.status !== "PENDING") throw conflict("Черновик уже обработан");
  if (draft.expiresAt <= new Date()) {
    await prisma.aiDraft.update({
      where: { id: draft.id },
      data: { status: "EXPIRED" },
    });
    throw validation("Черновик истёк");
  }

  if (
    actor.role === "CHILD" &&
    (draft.operation === "CREATE_EVENT" ||
      draft.operation === "CREATE_TASK" ||
      draft.operation === "CREATE_EXPENSE")
  ) {
    throw forbidden();
  }

  let entity: unknown;
  switch (draft.operation) {
    case "CREATE_PURCHASE": {
      const payload = parsePurchasePayload(draft.payload);
      const purchase = await createPurchase({
        familyId: actor.familyId,
        addedByMemberId: actor.memberId,
        title: payload.title,
        category: payload.category,
      });
      entity = serializePurchase(purchase);
      break;
    }
    case "CREATE_EVENT": {
      const tz = await familyTimezone(actor.familyId);
      const event = await createCalendarEvent({
        familyId: actor.familyId,
        createdByMemberId: actor.memberId,
        timezone: tz,
        body: draft.payload,
        allowOptionalFlags: true,
      });
      entity = serializeCreatedEvent(event);
      break;
    }
    case "CREATE_TASK": {
      const payload = parseCreateTaskPayload(draft.payload);
      const task = await createTask({
        familyId: actor.familyId,
        title: payload.title,
        assigneeMemberId: payload.assigneeMemberId,
        createdByMemberId: actor.memberId,
        dueAt: payload.dueAt,
        recurrence: payload.recurrence,
      });
      entity = serializeTask(task);
      break;
    }
    case "COMPLETE_TASK": {
      const taskId = parseTaskIdPayload(draft.payload);
      const task = await loadTask(actor.familyId, taskId);
      const tz = await familyTimezone(actor.familyId);
      const completed = await prisma.$transaction(async (tx) => completeTask(actor, task, tz, tx));
      entity = serializeTask(completed);
      break;
    }
    case "MARK_PURCHASE_BOUGHT": {
      const purchaseId = parsePurchaseIdPayload(draft.payload);
      const purchase = await markPurchaseBought(actor, purchaseId);
      entity = serializePurchase(purchase);
      break;
    }
    case "CREATE_EXPENSE": {
      const payload = parseCreateExpensePayload(draft.payload);
      const tz = await familyTimezone(actor.familyId);
      const today = startOfToday(tz).toISODate();
      const spentAt = parseDateOnly(payload.spentAt ?? today, "spentAt");
      const expense = await createExpense({
        familyId: actor.familyId,
        title: payload.title,
        amount: payload.amount,
        categoryId: payload.categoryId,
        spentByMemberId: payload.spentByMemberId,
        createdByMemberId: actor.memberId,
        spentAt,
      });
      entity = serializeExpense(expense);
      break;
    }
    default:
      throw forbidden();
  }

  const updated = await prisma.aiDraft.update({
    where: { id: draft.id },
    data: { status: "APPLIED", appliedAt: new Date() },
  });
  return { draft: serializeDraft(updated), entity };
}

export async function rejectDraft(chatId: string, draftId: string) {
  const draft = await prisma.aiDraft.findFirst({
    where: { id: draftId, chatId },
  });
  if (!draft) throw notFound();
  if (draft.status !== "PENDING") throw conflict("Черновик уже обработан");
  if (draft.expiresAt <= new Date()) {
    await prisma.aiDraft.update({
      where: { id: draft.id },
      data: { status: "EXPIRED" },
    });
    throw validation("Черновик истёк");
  }
  const updated = await prisma.aiDraft.update({
    where: { id: draft.id },
    data: { status: "REJECTED" },
  });
  return serializeDraft(updated);
}

export function operationFromToolName(name: string): AiDraftOperation | null {
  switch (name) {
    case "propose_create_purchase":
      return "CREATE_PURCHASE";
    case "propose_create_event":
      return "CREATE_EVENT";
    case "propose_create_task":
      return "CREATE_TASK";
    case "propose_complete_task":
      return "COMPLETE_TASK";
    case "propose_mark_purchase_bought":
      return "MARK_PURCHASE_BOUGHT";
    case "propose_create_expense":
      return "CREATE_EXPENSE";
    default:
      return null;
  }
}

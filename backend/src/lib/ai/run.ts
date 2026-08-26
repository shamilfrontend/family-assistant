import { randomUUID } from "node:crypto";
import type { AiDraftOperation, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError } from "../errors.js";
import type { Actor } from "../serialize.js";
import { completeChat, type LlmMessage, type LlmToolCall } from "./client.js";
import {
  draftExpiresAt,
  operationFromToolName,
  parseCreateTaskPayload,
  parseCreateExpensePayload,
  parseEventPayload,
  parsePurchaseIdPayload,
  parsePurchasePayload,
  parseTaskIdPayload,
  serializeDraft,
} from "./drafts.js";
import { buildFacts } from "./facts.js";
import { systemPrompt } from "./system.js";
import { toolsForPhase } from "./tools.js";

type PreparedDraft = {
  id: string;
  operation: AiDraftOperation;
  payload: Prisma.InputJsonValue;
};

function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function draftFromTool(call: LlmToolCall): PreparedDraft | { error: string } {
  const operation = operationFromToolName(call.name);
  if (!operation) return { error: "unknown tool" };
  const args = parseToolArgs(call.arguments);
  try {
    let payload: Prisma.InputJsonValue;
    switch (operation) {
      case "CREATE_PURCHASE":
        payload = parsePurchasePayload(args);
        break;
      case "CREATE_EVENT":
        payload = parseEventPayload(args) as Prisma.InputJsonValue;
        break;
      case "CREATE_TASK": {
        const parsed = parseCreateTaskPayload(args);
        payload = {
          title: parsed.title,
          assigneeMemberId: parsed.assigneeMemberId,
          dueAt: parsed.dueAt.toISOString(),
          recurrence: parsed.recurrence,
        };
        break;
      }
      case "COMPLETE_TASK":
        payload = { taskId: parseTaskIdPayload(args) };
        break;
      case "MARK_PURCHASE_BOUGHT":
        payload = { purchaseId: parsePurchaseIdPayload(args) };
        break;
      case "CREATE_EXPENSE": {
        const parsed = parseCreateExpensePayload(args);
        payload = {
          title: parsed.title,
          amount: parsed.amount,
          categoryId: parsed.categoryId,
          spentByMemberId: parsed.spentByMemberId,
          ...(parsed.spentAt ? { spentAt: parsed.spentAt } : {}),
        };
        break;
      }
    }
    return { id: randomUUID(), operation, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid payload";
    return { error: message };
  }
}

export async function runAssistant(actor: Actor, chatId: string, content: string) {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: actor.familyId },
    select: { timezone: true },
  });
  const tz = family.timezone;

  const history = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  history.reverse();

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt(actor, tz) },
    { role: "system", content: await buildFacts(actor, tz) },
    ...history.map((msg) => ({
      role: msg.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: msg.content,
    })),
    { role: "user", content },
  ];

  const tools = toolsForPhase(actor);
  const prepared: PreparedDraft[] = [];

  try {
    let response = await completeChat(messages, tools);
    let rounds = 0;
    while (response.toolCalls.length && rounds < 2) {
      rounds += 1;
      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });
      for (const call of response.toolCalls) {
        const result = draftFromTool(call);
        if ("error" in result) {
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify({ error: result.error }),
          });
          continue;
        }
        prepared.push(result);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ draftId: result.id, operation: result.operation }),
        });
      }
      response = await completeChat(messages, tools);
    }

    const assistantText =
      response.content?.trim() ||
      (prepared.length ? "Подтвердите действие кнопкой." : "Не поняла запрос.");

    const saved = await prisma.$transaction(async (tx) => {
      const userMessage = await tx.chatMessage.create({
        data: { chatId, role: "USER", content },
      });
      const assistantMessage = await tx.chatMessage.create({
        data: { chatId, role: "ASSISTANT", content: assistantText },
      });
      const drafts = [];
      for (const item of prepared) {
        drafts.push(
          await tx.aiDraft.create({
            data: {
              id: item.id,
              chatId,
              userId: actor.userId,
              messageId: assistantMessage.id,
              operation: item.operation,
              payload: item.payload,
              expiresAt: draftExpiresAt(),
            },
          }),
        );
      }
      return { userMessage, assistantMessage, drafts };
    });

    return {
      user: {
        id: saved.userMessage.id,
        role: saved.userMessage.role,
        content: saved.userMessage.content,
        createdAt: saved.userMessage.createdAt.toISOString(),
      },
      message: {
        id: saved.assistantMessage.id,
        role: saved.assistantMessage.role,
        content: saved.assistantMessage.content,
        createdAt: saved.assistantMessage.createdAt.toISOString(),
      },
      drafts: saved.drafts.map(serializeDraft),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw err;
  }
}

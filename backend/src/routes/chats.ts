import type { Chat, Member, User } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { applyDraft, rejectDraft, serializeDraft } from "../lib/ai/drafts.js";
import { runAssistant } from "../lib/ai/run.js";
import { forbidden, notFound, validation } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import type { Actor } from "../lib/serialize.js";
import { asRecord, parseMessageContent } from "../lib/validate.js";

export const chatsRouter = Router();

type ChatWithOwner = Chat & { owner: User & { member: Member | null } };

function serializeChatSummary(chat: ChatWithOwner) {
  const member = chat.owner.member;
  return {
    chatId: chat.id,
    memberId: member?.id ?? null,
    name: member?.name ?? "",
  };
}

async function loadChat(familyId: string, id: string): Promise<ChatWithOwner> {
  const chat = await prisma.chat.findFirst({
    where: { id, familyId },
    include: { owner: { include: { member: true } } },
  });
  if (!chat) throw notFound();
  return chat;
}

function canRead(actor: Actor, chat: ChatWithOwner): boolean {
  if (chat.ownerUserId === actor.userId) return true;
  return actor.role === "ADULT" && chat.owner.member?.role === "CHILD";
}

function assertOwnChat(actor: Actor, chat: ChatWithOwner): void {
  if (chat.ownerUserId !== actor.userId) throw forbidden();
}

function serializeMessage(msg: { id: string; role: string; content: string; createdAt: Date }) {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
  };
}

chatsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const own = await prisma.chat.findUnique({
      where: { ownerUserId: actor.userId },
      include: { owner: { include: { member: true } } },
    });
    const items = own ? [serializeChatSummary(own)] : [];

    if (actor.role === "ADULT") {
      const children = await prisma.member.findMany({
        where: { familyId: actor.familyId, role: "CHILD", userId: { not: null } },
        include: { user: { include: { chat: true } } },
      });
      for (const child of children) {
        const chat = child.user?.chat;
        if (chat) {
          items.push({ chatId: chat.id, memberId: child.id, name: child.name });
        }
      }
    }

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

chatsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const chat = await loadChat(actor.familyId, req.params.id);
    if (!canRead(actor, chat)) throw forbidden();
    res.json({
      id: chat.id,
      ...serializeChatSummary(chat),
      readOnly: chat.ownerUserId !== actor.userId,
    });
  } catch (err) {
    next(err);
  }
});

chatsRouter.get("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const chat = await loadChat(actor.familyId, req.params.id);
    if (!canRead(actor, chat)) throw forbidden();

    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 50;
    const before = typeof req.query.before === "string" ? req.query.before : undefined;

    let createdBefore: Date | undefined;
    if (before) {
      const cursor = await prisma.chatMessage.findFirst({
        where: { id: before, chatId: chat.id },
      });
      if (!cursor) throw validation("before: неизвестное сообщение");
      createdBefore = cursor.createdAt;
    }

    const rows = await prisma.chatMessage.findMany({
      where: {
        chatId: chat.id,
        ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ items: rows.reverse().map(serializeMessage) });
  } catch (err) {
    next(err);
  }
});

chatsRouter.post("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const chat = await loadChat(actor.familyId, req.params.id);
    assertOwnChat(actor, chat);
    const body = asRecord(req.body);
    const content = parseMessageContent(body.content);
    const result = await runAssistant(actor, chat.id, content);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

chatsRouter.get("/:id/drafts", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const chat = await loadChat(actor.familyId, req.params.id);
    assertOwnChat(actor, chat);
    const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
    if (status !== "PENDING") throw validation("status: PENDING");
    const items = await prisma.aiDraft.findMany({
      where: {
        chatId: chat.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json({ items: items.map(serializeDraft) });
  } catch (err) {
    next(err);
  }
});

chatsRouter.post("/:id/drafts/:draftId/apply", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const chat = await loadChat(actor.familyId, req.params.id);
    assertOwnChat(actor, chat);
    const result = await applyDraft(actor, chat.id, req.params.draftId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

chatsRouter.post("/:id/drafts/:draftId/reject", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const chat = await loadChat(actor.familyId, req.params.id);
    assertOwnChat(actor, chat);
    const draft = await rejectDraft(chat.id, req.params.draftId);
    res.json({ draft });
  } catch (err) {
    next(err);
  }
});

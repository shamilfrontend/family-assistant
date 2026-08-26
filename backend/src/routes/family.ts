import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asRecord, parseTimezone } from "../lib/validate.js";
import { validation } from "../lib/errors.js";
import { DELETION_KEYS } from "../lib/rbac.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import { clearSessionCookie } from "../lib/session.js";

export const familyRouter = Router();

familyRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: req.actor!.familyId },
    });
    res.json({
      id: family.id,
      timezone: family.timezone,
      createdAt: family.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

familyRouter.patch("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const timezone = parseTimezone(asRecord(req.body).timezone);
    const family = await prisma.family.update({
      where: { id: req.actor!.familyId },
      data: { timezone },
    });
    res.json({
      id: family.id,
      timezone: family.timezone,
      createdAt: family.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

familyRouter.get("/deletion-preview", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const familyId = req.actor!.familyId;
    const [members, events, tasks, purchases, documents, healthRecords, expenses, chats] =
      await Promise.all([
        prisma.member.count({ where: { familyId } }),
        prisma.event.count({ where: { familyId } }),
        prisma.task.count({ where: { familyId } }),
        prisma.purchase.count({ where: { familyId } }),
        prisma.document.count({ where: { familyId } }),
        prisma.healthRecord.count({ where: { familyId } }),
        prisma.expense.count({ where: { familyId } }),
        prisma.chat.count({ where: { familyId } }),
      ]);
    res.json({
      members,
      events,
      tasks,
      purchases,
      documents,
      healthRecords,
      expenses,
      chats,
    });
  } catch (err) {
    next(err);
  }
});

familyRouter.delete("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    if (body.confirm !== true) throw validation("Нужно подтверждение");
    if (!Array.isArray(body.acknowledge)) throw validation("Укажите список того, что сотрётся");

    const got = [...body.acknowledge].map(String).sort();
    const expected = [...DELETION_KEYS].sort();
    if (got.length !== expected.length || got.some((key, i) => key !== expected[i])) {
      throw validation("Список подтверждения не совпадает");
    }

    const actor = req.actor!;
    await prisma.$transaction(async (tx) => {
      const members = await tx.member.findMany({
        where: { familyId: actor.familyId },
        select: { userId: true },
      });
      const userIds = members.map((m) => m.userId).filter((id): id is string => Boolean(id));

      await tx.auditLog.create({
        data: {
          familyId: actor.familyId,
          userId: actor.userId,
          action: "FAMILY_DELETE",
          entityType: "Family",
          entityId: actor.familyId,
          metadata: { actorEmail: actor.email, actorMemberId: actor.memberId },
        },
      });

      await tx.family.delete({ where: { id: actor.familyId } });
      if (userIds.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });

    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

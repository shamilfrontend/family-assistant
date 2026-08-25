import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asRecord, parseRole } from "../lib/validate.js";
import { conflict, notFound, validation } from "../lib/errors.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import { appOrigin, INVITE_MS, newInviteToken } from "../lib/session.js";

export const invitesRouter = Router();

invitesRouter.get("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const now = new Date();
    const items = await prisma.invite.findMany({
      where: {
        familyId: req.actor!.familyId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: items.map((invite) => ({
        id: invite.id,
        role: invite.role,
        memberId: invite.memberId,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

invitesRouter.post("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    const role = parseRole(body.role);
    const memberId = typeof body.memberId === "string" ? body.memberId : undefined;

    if (memberId) {
      const card = await prisma.member.findFirst({
        where: { id: memberId, familyId: req.actor!.familyId },
      });
      if (!card) throw notFound();
      if (card.userId) throw conflict("У карточки уже есть аккаунт");
      if (card.role !== role) throw validation("Роль не совпадает с карточкой");
    }

    const { token, tokenHash } = newInviteToken();
    const invite = await prisma.invite.create({
      data: {
        familyId: req.actor!.familyId,
        role,
        memberId: memberId ?? null,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_MS),
        createdByUserId: req.actor!.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        familyId: req.actor!.familyId,
        userId: req.actor!.userId,
        action: "INVITE_CREATE",
        entityType: "Invite",
        entityId: invite.id,
      },
    });

    res.status(201).json({
      id: invite.id,
      token,
      url: `${appOrigin()}/invite/${token}`,
      expiresAt: invite.expiresAt.toISOString(),
      role: invite.role,
      memberId: invite.memberId,
    });
  } catch (err) {
    next(err);
  }
});

invitesRouter.post("/:id/revoke", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const invite = await prisma.invite.findFirst({
      where: { id: req.params.id, familyId: req.actor!.familyId },
    });
    if (!invite) throw notFound();
    if (invite.usedAt) throw conflict("Приглашение уже использовано");
    if (invite.revokedAt) throw conflict("Приглашение уже отозвано");

    await prisma.invite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        familyId: req.actor!.familyId,
        userId: req.actor!.userId,
        action: "INVITE_REVOKE",
        entityType: "Invite",
        entityId: invite.id,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

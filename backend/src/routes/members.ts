import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  asRecord,
  optionalString,
  parseBirthDate,
  parseName,
  parseRole,
} from "../lib/validate.js";
import { notFound } from "../lib/errors.js";
import { assertNotLastAdult } from "../lib/rbac.js";
import { serializeMember } from "../lib/serialize.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";

export const membersRouter = Router();

function viewerOpts(req: { actor?: { role: string; memberId: string } }) {
  const actor = req.actor!;
  return {
    viewerIsAdult: actor.role === "ADULT",
    viewerMemberId: actor.memberId,
  };
}

membersRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const members = await prisma.member.findMany({
      where: { familyId: req.actor!.familyId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ items: members.map((m) => serializeMember(m, viewerOpts(req))) });
  } catch (err) {
    next(err);
  }
});

membersRouter.post("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    const member = await prisma.member.create({
      data: {
        familyId: req.actor!.familyId,
        name: parseName(body.name),
        role: parseRole(body.role),
        birthDate: parseBirthDate(body.birthDate),
        phone: optionalString(body.phone) ?? null,
        email: optionalString(body.email)?.toLowerCase() ?? null,
        allergies: optionalString(body.allergies) ?? null,
      },
    });
    res.status(201).json(serializeMember(member, viewerOpts(req)));
  } catch (err) {
    next(err);
  }
});

membersRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const member = await prisma.member.findFirst({
      where: { id: req.params.id, familyId: req.actor!.familyId },
    });
    if (!member) throw notFound();
    res.json(serializeMember(member, viewerOpts(req)));
  } catch (err) {
    next(err);
  }
});

membersRouter.patch("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    const member = await prisma.$transaction(async (tx) => {
      const current = await tx.member.findFirst({
        where: { id: req.params.id, familyId: req.actor!.familyId },
      });
      if (!current) throw notFound();

      const data: {
        name?: string;
        role?: "ADULT" | "CHILD";
        birthDate?: Date;
        phone?: string | null;
        email?: string | null;
        allergies?: string | null;
      } = {};

      if (body.name !== undefined) data.name = parseName(body.name);
      if (body.birthDate !== undefined) data.birthDate = parseBirthDate(body.birthDate);
      if (body.phone !== undefined) data.phone = optionalString(body.phone) ?? null;
      if (body.email !== undefined) data.email = optionalString(body.email)?.toLowerCase() ?? null;
      if (body.allergies !== undefined) data.allergies = optionalString(body.allergies) ?? null;

      if (body.role !== undefined) {
        const role = parseRole(body.role);
        if (current.role === "ADULT" && role === "CHILD") {
          await assertNotLastAdult(req.actor!.familyId, "ADULT", tx);
        }
        if (role !== current.role) {
          await tx.auditLog.create({
            data: {
              familyId: req.actor!.familyId,
              userId: req.actor!.userId,
              action: "MEMBER_ROLE_CHANGE",
              entityType: "Member",
              entityId: current.id,
              metadata: { from: current.role, to: role },
            },
          });
        }
        data.role = role;
      }

      return tx.member.update({ where: { id: current.id }, data });
    });
    res.json(serializeMember(member, viewerOpts(req)));
  } catch (err) {
    next(err);
  }
});

membersRouter.delete("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: req.params.id, familyId: req.actor!.familyId },
      });
      if (!member) throw notFound();
      await assertNotLastAdult(req.actor!.familyId, member.role, tx);
      if (member.userId) {
        await tx.user.delete({ where: { id: member.userId } });
      }
      await tx.member.delete({ where: { id: member.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

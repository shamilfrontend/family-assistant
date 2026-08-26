import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  asRecord,
  isAdultDeclared,
  parseBirthDate,
  parseEmail,
  parseName,
  parsePassword,
  parseTimezone,
} from "../lib/validate.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  AppError,
  conflict,
  inviteExpired,
  validation,
} from "../lib/errors.js";
import { assertNotLastLoggedInAdult } from "../lib/rbac.js";
import { serializeMe } from "../lib/serialize.js";
import { seedDefaultCategories } from "../lib/budget.js";
import { requireAuth } from "../middleware/auth.js";
import {
  clearSessionCookie,
  createSession,
  hashInviteToken,
  setSessionCookie,
} from "../lib/session.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    if (!isAdultDeclared(body.declaredAdult)) {
      throw validation("Нужно подтвердить возраст 18+");
    }
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    const timezone = parseTimezone(body.timezone);
    const name = parseName(body.name);
    const birthDate = parseBirthDate(body.birthDate);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("Email уже занят");

    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          declaredAdultAt: new Date(),
        },
      });
      const family = await tx.family.create({
        data: { timezone, createdByUserId: user.id },
      });
      const member = await tx.member.create({
        data: {
          familyId: family.id,
          userId: user.id,
          name,
          role: "ADULT",
          birthDate,
        },
      });
      await tx.chat.create({
        data: { familyId: family.id, ownerUserId: user.id },
      });
      await seedDefaultCategories(family.id, tx);
      const session = await createSession(tx, user.id);
      return { user, family, member, session };
    });

    setSessionCookie(res, result.session.id);
    res.status(201).json(
      serializeMe(
        {
          userId: result.user.id,
          email: result.user.email,
          memberId: result.member.id,
          familyId: result.family.id,
          role: result.member.role,
          sessionId: result.session.id,
        },
        result.member,
        result.family.timezone,
      ),
    );
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { member: { include: { family: true } } },
    });
    if (!user || !user.member) {
      throw new AppError("unauthorized", "Неверный email или пароль");
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw new AppError("unauthorized", "Неверный email или пароль");

    const session = await createSession(prisma, user.id);
    setSessionCookie(res, session.id);
    res.json(
      serializeMe(
        {
          userId: user.id,
          email: user.email,
          memberId: user.member.id,
          familyId: user.member.familyId,
          role: user.member.role,
          sessionId: session.id,
        },
        user.member,
        user.member.family.timezone,
      ),
    );
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.session.delete({ where: { id: req.actor!.sessionId } });
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: actor.memberId },
      include: { family: true },
    });
    res.json(serializeMe(actor, member, member.family.timezone));
  } catch (err) {
    next(err);
  }
});

authRouter.get("/invite-preview", async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) throw validation("Укажите токен");

    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { member: true },
    });
    if (!invite || !isInviteActive(invite)) throw inviteExpired();

    res.json({
      role: invite.role,
      memberName: invite.member?.name ?? null,
      expiresAt: invite.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/accept-invite", async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    if (typeof body.token !== "string" || !body.token) {
      throw validation("Укажите токен");
    }
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);

    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashInviteToken(body.token) },
      include: { member: true },
    });
    if (!invite || !isInviteActive(invite)) throw inviteExpired();

    if (invite.role === "ADULT" && !isAdultDeclared(body.declaredAdult)) {
      throw validation("Нужно подтвердить возраст 18+");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("Email уже занят");

    let name: string;
    let birthDate: Date;
    if (invite.memberId) {
      if (!invite.member) throw inviteExpired();
      if (invite.member.userId) throw conflict("У карточки уже есть аккаунт");
      if (invite.member.role !== invite.role) throw validation("Роль не совпадает с карточкой");
      name = invite.member.name;
      birthDate = invite.member.birthDate;
    } else {
      name = parseName(body.name);
      birthDate = parseBirthDate(body.birthDate);
    }

    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.invite.findUnique({ where: { id: invite.id } });
      if (!fresh || !isInviteActive(fresh)) throw inviteExpired();

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          declaredAdultAt: invite.role === "ADULT" ? new Date() : null,
        },
      });

      let member;
      if (invite.memberId) {
        member = await tx.member.update({
          where: { id: invite.memberId },
          data: { userId: user.id },
        });
      } else {
        member = await tx.member.create({
          data: {
            familyId: invite.familyId,
            userId: user.id,
            name,
            role: invite.role,
            birthDate,
          },
        });
      }

      await tx.chat.create({
        data: { familyId: invite.familyId, ownerUserId: user.id },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          familyId: invite.familyId,
          userId: user.id,
          action: "INVITE_ACCEPT",
          entityType: "Invite",
          entityId: invite.id,
        },
      });
      const session = await createSession(tx, user.id);
      const family = await tx.family.findUniqueOrThrow({ where: { id: invite.familyId } });
      return { user, member, session, family };
    });

    setSessionCookie(res, result.session.id);
    res.status(201).json(
      serializeMe(
        {
          userId: result.user.id,
          email: result.user.email,
          memberId: result.member.id,
          familyId: result.member.familyId,
          role: result.member.role,
          sessionId: result.session.id,
        },
        result.member,
        result.family.timezone,
      ),
    );
  } catch (err) {
    next(err);
  }
});

authRouter.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUniqueOrThrow({ where: { id: actor.memberId } });
      await assertNotLastLoggedInAdult(actor.familyId, member.role, tx);
      await tx.auditLog.create({
        data: {
          familyId: actor.familyId,
          userId: actor.userId,
          action: "ACCOUNT_DELETE",
          entityType: "User",
          entityId: actor.userId,
          metadata: { actorEmail: actor.email, actorMemberId: actor.memberId },
        },
      });
      await tx.user.delete({ where: { id: actor.userId } });
    });
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

function isInviteActive(invite: {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): boolean {
  if (invite.usedAt || invite.revokedAt) return false;
  return invite.expiresAt > new Date();
}

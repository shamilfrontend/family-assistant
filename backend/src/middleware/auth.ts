import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { COOKIE_NAME } from "../lib/session.js";
import type { Actor } from "../lib/serialize.js";

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.[COOKIE_NAME];
    if (typeof sid !== "string" || !sid) throw unauthorized();

    const session = await prisma.session.findUnique({
      where: { id: sid },
      include: {
        user: { include: { member: true } },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      throw unauthorized();
    }

    const member = session.user.member;
    if (!member) throw unauthorized();

    req.actor = {
      userId: session.user.id,
      email: session.user.email,
      memberId: member.id,
      familyId: member.familyId,
      role: member.role,
      sessionId: session.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdult(req: Request, _res: Response, next: NextFunction) {
  if (!req.actor) return next(unauthorized());
  if (req.actor.role !== "ADULT") {
    return next(new AppError("forbidden", "Недостаточно прав"));
  }
  next();
}

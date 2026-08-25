import { randomBytes, createHash } from "node:crypto";
import type { CookieOptions, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export const COOKIE_NAME = "sid";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_MS = 48 * 60 * 60 * 1000;

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS,
  };
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(COOKIE_NAME, sessionId, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
}

export async function createSession(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
) {
  return tx.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + SESSION_MS),
    },
  });
}

export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appOrigin(): string {
  return process.env.APP_ORIGIN ?? "http://localhost";
}

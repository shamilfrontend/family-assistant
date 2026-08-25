import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import { familyTimezone } from "../lib/calendar.js";
import {
  assertCanViewDocument,
  assertOwner,
  loadDocument,
  serializeDocument,
} from "../lib/documents.js";
import {
  asRecord,
  optionalString,
  parseDateOnly,
  parseDocumentType,
  parseUuid,
} from "../lib/validate.js";
import { validation } from "../lib/errors.js";

export const documentsRouter = Router();

documentsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const where: Prisma.DocumentWhereInput = { familyId: actor.familyId };
    if (actor.role === "CHILD") where.ownerMemberId = actor.memberId;

    const items = await prisma.document.findMany({
      where,
      orderBy: { expiresAt: "asc" },
    });
    res.json({
      items: items.map((doc) => serializeDocument(doc, tz, { includeNumber: false })),
    });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const tz = await familyTimezone(actor.familyId);
    const ownerMemberId = parseUuid(body.ownerMemberId, "ownerMemberId");
    await assertOwner(actor.familyId, ownerMemberId);
    const number = optionalString(body.number) ?? null;

    const document = await prisma.document.create({
      data: {
        familyId: actor.familyId,
        ownerMemberId,
        type: parseDocumentType(body.type),
        number,
        expiresAt: parseDateOnly(body.expiresAt, "expiresAt"),
      },
    });
    res.status(201).json(serializeDocument(document, tz, { includeNumber: false }));
  } catch (err) {
    next(err);
  }
});

documentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const document = await loadDocument(actor.familyId, req.params.id);
    assertCanViewDocument(actor, document);

    if (actor.role === "ADULT") {
      await prisma.auditLog.create({
        data: {
          familyId: actor.familyId,
          userId: actor.userId,
          action: "DOCUMENT_NUMBER_VIEW",
          entityType: "Document",
          entityId: document.id,
          metadata: { type: document.type, ownerMemberId: document.ownerMemberId },
        },
      });
    }

    res.json(
      serializeDocument(document, tz, { includeNumber: actor.role === "ADULT" }),
    );
  } catch (err) {
    next(err);
  }
});

documentsRouter.patch("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const tz = await familyTimezone(actor.familyId);
    const document = await loadDocument(actor.familyId, req.params.id);
    const data: Prisma.DocumentUpdateInput = {};

    if (body.ownerMemberId !== undefined) {
      const ownerMemberId = parseUuid(body.ownerMemberId, "ownerMemberId");
      await assertOwner(actor.familyId, ownerMemberId);
      data.owner = { connect: { id: ownerMemberId } };
    }
    if (body.type !== undefined) data.type = parseDocumentType(body.type);
    if (body.number !== undefined) data.number = optionalString(body.number) ?? null;
    if (body.expiresAt !== undefined) data.expiresAt = parseDateOnly(body.expiresAt, "expiresAt");
    if (Object.keys(data).length === 0) throw validation("Нечего менять");

    const updated = await prisma.document.update({ where: { id: document.id }, data });
    res.json(serializeDocument(updated, tz, { includeNumber: false }));
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const document = await loadDocument(actor.familyId, req.params.id);
    await prisma.document.delete({ where: { id: document.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import {
  assertCanViewHealth,
  createHealthRecord,
  loadHealthRecord,
  serializeHealthRecord,
  updateHealthRecord,
} from "../lib/health.js";
import { parseUuid } from "../lib/validate.js";

export const healthRecordsRouter = Router();

healthRecordsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const where: Prisma.HealthRecordWhereInput = { familyId: actor.familyId };
    let memberId: string | undefined;
    if (typeof req.query.memberId === "string" && req.query.memberId) {
      memberId = parseUuid(req.query.memberId, "memberId");
      assertCanViewHealth(actor, memberId);
      where.memberId = memberId;
    } else if (actor.role === "CHILD") {
      where.memberId = actor.memberId;
      memberId = actor.memberId;
    }

    const items = await prisma.healthRecord.findMany({
      where,
      include: { event: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });

    await prisma.auditLog.create({
      data: {
        familyId: actor.familyId,
        userId: actor.userId,
        action: "HEALTH_READ",
        entityType: "HealthRecord",
        metadata: { memberId: memberId ?? null, count: items.length },
      },
    });

    res.json({ items: items.map(serializeHealthRecord) });
  } catch (err) {
    next(err);
  }
});

healthRecordsRouter.post("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const record = await createHealthRecord(req.actor!, req.body);
    res.status(201).json(serializeHealthRecord(record));
  } catch (err) {
    next(err);
  }
});

healthRecordsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const record = await loadHealthRecord(actor.familyId, req.params.id);
    assertCanViewHealth(actor, record.memberId);

    await prisma.auditLog.create({
      data: {
        familyId: actor.familyId,
        userId: actor.userId,
        action: "HEALTH_READ",
        entityType: "HealthRecord",
        entityId: record.id,
        metadata: { kind: record.kind, memberId: record.memberId },
      },
    });

    res.json(serializeHealthRecord(record));
  } catch (err) {
    next(err);
  }
});

healthRecordsRouter.patch("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const record = await updateHealthRecord(req.actor!, req.params.id, req.body);
    res.json(serializeHealthRecord(record));
  } catch (err) {
    next(err);
  }
});

healthRecordsRouter.delete("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const record = await loadHealthRecord(actor.familyId, req.params.id);
    await prisma.healthRecord.delete({ where: { id: record.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

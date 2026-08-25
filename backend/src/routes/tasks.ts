import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import { familyTimezone } from "../lib/calendar.js";
import {
  assertAssignee,
  assertCanViewTask,
  completeTask,
  createTask,
  loadTask,
  reopenTask,
  serializeTask,
} from "../lib/tasks.js";
import { parseInstant } from "../lib/time.js";
import {
  asRecord,
  parseTaskRecurrence,
  parseTaskStatus,
  parseTitle,
  parseUuid,
} from "../lib/validate.js";
import { forbidden, validation } from "../lib/errors.js";

export const tasksRouter = Router();

tasksRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const where: Prisma.TaskWhereInput = { familyId: actor.familyId };

    if (typeof req.query.status === "string" && req.query.status) {
      where.status = parseTaskStatus(req.query.status);
    }

    let assigneeId: string | undefined;
    if (typeof req.query.assigneeId === "string" && req.query.assigneeId) {
      assigneeId = parseUuid(req.query.assigneeId, "assigneeId");
    }

    if (actor.role === "CHILD") {
      if (assigneeId && assigneeId !== actor.memberId) throw forbidden();
      where.assigneeMemberId = actor.memberId;
    } else if (assigneeId) {
      where.assigneeMemberId = assigneeId;
    }

    const items = await prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    });
    res.json({ items: items.map(serializeTask) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const task = await createTask({
      familyId: actor.familyId,
      title: parseTitle(body.title),
      assigneeMemberId: parseUuid(body.assigneeMemberId, "assigneeMemberId"),
      createdByMemberId: actor.memberId,
      dueAt: parseInstant(body.dueAt, "dueAt").toJSDate(),
      recurrence: parseTaskRecurrence(body.recurrence),
    });
    res.status(201).json(serializeTask(task));
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const task = await loadTask(actor.familyId, req.params.id);
    assertCanViewTask(actor, task);
    res.json(serializeTask(task));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const task = await loadTask(actor.familyId, req.params.id);
    const data: Prisma.TaskUpdateInput = {};

    if (body.title !== undefined) data.title = parseTitle(body.title);
    if (body.assigneeMemberId !== undefined) {
      const assigneeMemberId = parseUuid(body.assigneeMemberId, "assigneeMemberId");
      await assertAssignee(actor.familyId, assigneeMemberId);
      data.assignee = { connect: { id: assigneeMemberId } };
    }
    if (body.dueAt !== undefined) data.dueAt = parseInstant(body.dueAt, "dueAt").toJSDate();
    if (body.recurrence !== undefined) data.recurrence = parseTaskRecurrence(body.recurrence);
    if (Object.keys(data).length === 0) throw validation("Нечего менять");

    const updated = await prisma.task.update({ where: { id: task.id }, data });
    res.json(serializeTask(updated));
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/:id", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const task = await loadTask(actor.familyId, req.params.id);
    await prisma.task.delete({ where: { id: task.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/:id/complete", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const tz = await familyTimezone(actor.familyId);
    const task = await loadTask(actor.familyId, req.params.id);
    const completed = await prisma.$transaction(async (tx) => completeTask(actor, task, tz, tx));
    res.json(serializeTask(completed));
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/:id/reopen", requireAuth, requireAdult, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const task = await loadTask(actor.familyId, req.params.id);
    const reopened = await reopenTask(task);
    res.json(serializeTask(reopened));
  } catch (err) {
    next(err);
  }
});

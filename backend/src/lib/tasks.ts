import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { Prisma, Task, TaskRecurrence } from "@prisma/client";
import { prisma } from "./prisma.js";
import { forbidden, notFound, validation } from "./errors.js";
import type { Actor } from "./serialize.js";

export function serializeTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    assigneeMemberId: task.assigneeMemberId,
    createdByMemberId: task.createdByMemberId,
    dueAt: task.dueAt.toISOString(),
    status: task.status,
    recurrence: task.recurrence,
    seriesId: task.seriesId,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function assertAssignee(familyId: string, memberId: string): Promise<void> {
  const member = await prisma.member.findFirst({ where: { id: memberId, familyId } });
  if (!member) throw validation("Исполнитель не из этой семьи");
}

export async function loadTask(familyId: string, id: string): Promise<Task> {
  const task = await prisma.task.findFirst({ where: { id, familyId } });
  if (!task) throw notFound();
  return task;
}

export function assertCanViewTask(actor: Actor, task: Task): void {
  if (actor.role === "CHILD" && task.assigneeMemberId !== actor.memberId) {
    throw forbidden();
  }
}

export async function createTask(data: {
  familyId: string;
  title: string;
  assigneeMemberId: string;
  createdByMemberId: string | null;
  dueAt: Date;
  recurrence: TaskRecurrence;
}): Promise<Task> {
  await assertAssignee(data.familyId, data.assigneeMemberId);
  const id = randomUUID();
  return prisma.task.create({
    data: {
      id,
      seriesId: id,
      familyId: data.familyId,
      title: data.title,
      assigneeMemberId: data.assigneeMemberId,
      createdByMemberId: data.createdByMemberId,
      dueAt: data.dueAt,
      recurrence: data.recurrence,
    },
  });
}

function addTaskPeriod(dueAt: Date, recurrence: "DAILY" | "WEEKLY", tz: string): Date {
  const local = DateTime.fromJSDate(dueAt, { zone: "utc" }).setZone(tz);
  const next = recurrence === "DAILY" ? local.plus({ days: 1 }) : local.plus({ weeks: 1 });
  return next.toUTC().toJSDate();
}

export async function completeTask(
  actor: Actor,
  task: Task,
  tz: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Task> {
  if (actor.role === "CHILD" && task.assigneeMemberId !== actor.memberId) {
    throw forbidden();
  }
  if (task.status === "DONE") throw validation("Дело уже сделано");

  const completed = await tx.task.update({
    where: { id: task.id },
    data: { status: "DONE", completedAt: new Date() },
  });

  if (task.recurrence === "NONE") return completed;

  await tx.task.create({
    data: {
      familyId: task.familyId,
      title: task.title,
      assigneeMemberId: task.assigneeMemberId,
      createdByMemberId: task.createdByMemberId,
      dueAt: addTaskPeriod(task.dueAt, task.recurrence, tz),
      recurrence: task.recurrence,
      seriesId: task.seriesId,
      status: "OPEN",
    },
  });

  return completed;
}

export async function reopenTask(task: Task): Promise<Task> {
  if (task.status === "OPEN") throw validation("Дело уже открыто");
  return prisma.task.update({
    where: { id: task.id },
    data: { status: "OPEN", completedAt: null },
  });
}

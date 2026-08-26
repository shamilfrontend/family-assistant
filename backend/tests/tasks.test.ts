import { DateTime } from "luxon";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const tz = "Europe/Moscow";

function cookie(res: request.Response): string {
  const raw = res.headers["set-cookie"];
  if (!raw) throw new Error("no set-cookie");
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => c.split(";")[0]).join("; ");
}

const parent = {
  email: "anna@example.com",
  password: "password1",
  declaredAdult: true,
  timezone: tz,
  name: "Анна",
  birthDate: "1990-05-12",
};

async function register() {
  const res = await request(app).post("/api/v1/auth/register").send(parent);
  expect(res.status).toBe(201);
  return { sid: cookie(res), memberId: res.body.member.id as string };
}

async function inviteChild(sid: string) {
  const card = await request(app).post("/api/v1/members").set("Cookie", sid).send({
    name: "Дима",
    role: "CHILD",
    birthDate: "2015-03-04",
  });
  expect(card.status).toBe(201);
  const invite = await request(app).post("/api/v1/invites").set("Cookie", sid).send({
    role: "CHILD",
    memberId: card.body.id,
  });
  const child = await request(app).post("/api/v1/auth/accept-invite").send({
    token: invite.body.token,
    email: "dima@example.com",
    password: "password1",
  });
  expect(child.status).toBe(201);
  return { sid: cookie(child), memberId: child.body.member.id as string };
}

describe("tasks", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "AiDraft", "ChatMessage", "Chat", "AuditLog", "HealthRecord",
        "Expense", "BudgetCategory",
        "Document", "Purchase", "Task", "EventParticipant", "Event",
        "Invite", "Session", "Member", "Family", "User"
      CASCADE
    `);
  });

  it("forbids a child from creating tasks and seeing others'", async () => {
    const parentAuth = await register();
    const child = await inviteChild(parentAuth.sid);
    const today = DateTime.now().setZone(tz).set({ hour: 18, minute: 0, second: 0, millisecond: 0 });

    const own = await request(app).post("/api/v1/tasks").set("Cookie", parentAuth.sid).send({
      title: "Отчёт",
      assigneeMemberId: parentAuth.memberId,
      dueAt: today.toUTC().toISO(),
      recurrence: "NONE",
    });
    expect(own.status).toBe(201);

    const childTask = await request(app).post("/api/v1/tasks").set("Cookie", parentAuth.sid).send({
      title: "Собрать портфель",
      assigneeMemberId: child.memberId,
      dueAt: today.toUTC().toISO(),
      recurrence: "NONE",
    });
    expect(childTask.status).toBe(201);

    const create = await request(app).post("/api/v1/tasks").set("Cookie", child.sid).send({
      title: "Нельзя",
      assigneeMemberId: child.memberId,
      dueAt: today.toUTC().toISO(),
      recurrence: "NONE",
    });
    expect(create.status).toBe(403);

    const filter = await request(app)
      .get("/api/v1/tasks")
      .set("Cookie", child.sid)
      .query({ assigneeId: parentAuth.memberId });
    expect(filter.status).toBe(403);

    const list = await request(app).get("/api/v1/tasks").set("Cookie", child.sid);
    expect(list.status).toBe(200);
    expect(list.body.items.map((t: { title: string }) => t.title)).toEqual(["Собрать портфель"]);

    const hidden = await request(app)
      .get(`/api/v1/tasks/${own.body.id}`)
      .set("Cookie", child.sid);
    expect(hidden.status).toBe(403);

    const completeOwn = await request(app)
      .post(`/api/v1/tasks/${childTask.body.id}/complete`)
      .set("Cookie", child.sid);
    expect(completeOwn.status).toBe(200);
    expect(completeOwn.body.status).toBe("DONE");

    const completeOther = await request(app)
      .post(`/api/v1/tasks/${own.body.id}/complete`)
      .set("Cookie", child.sid);
    expect(completeOther.status).toBe(403);
  });

  it("shifts dueAt from the original due date on recurring complete", async () => {
    const { sid, memberId } = await register();
    const due = DateTime.now().setZone(tz).minus({ days: 2 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });

    const created = await request(app).post("/api/v1/tasks").set("Cookie", sid).send({
      title: "Витамины",
      assigneeMemberId: memberId,
      dueAt: due.toUTC().toISO(),
      recurrence: "DAILY",
    });
    expect(created.status).toBe(201);

    const completed = await request(app)
      .post(`/api/v1/tasks/${created.body.id}/complete`)
      .set("Cookie", sid);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("DONE");

    const list = await request(app).get("/api/v1/tasks").set("Cookie", sid).query({ status: "OPEN" });
    expect(list.body.items).toHaveLength(1);
    const nextDue = DateTime.fromISO(list.body.items[0].dueAt);
    const expected = due.plus({ days: 1 }).toUTC();
    expect(nextDue.toUTC().toISO()).toBe(expected.toISO());
    expect(list.body.items[0].seriesId).toBe(created.body.seriesId);
  });

  it("does not delete the next occurrence on reopen", async () => {
    const { sid, memberId } = await register();
    const due = DateTime.now().setZone(tz).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });

    const created = await request(app).post("/api/v1/tasks").set("Cookie", sid).send({
      title: "Мусор",
      assigneeMemberId: memberId,
      dueAt: due.toUTC().toISO(),
      recurrence: "WEEKLY",
    });

    await request(app).post(`/api/v1/tasks/${created.body.id}/complete`).set("Cookie", sid);

    const reopened = await request(app)
      .post(`/api/v1/tasks/${created.body.id}/reopen`)
      .set("Cookie", sid);
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("OPEN");
    expect(reopened.body.completedAt).toBeNull();

    const list = await request(app).get("/api/v1/tasks").set("Cookie", sid);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((t: { status: string }) => t.status === "OPEN")).toHaveLength(2);
  });
});

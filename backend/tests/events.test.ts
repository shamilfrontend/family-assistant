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
  return {
    sid: cookie(child),
    memberId: child.body.member.id as string,
  };
}

type Occ = { id: string; occurrenceStart: string; title: string; recurrence: string };

describe("events and reminders", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "AiDraft", "ChatMessage", "Chat", "AuditLog", "HealthRecord",
        "Document", "Purchase", "Task", "EventParticipant", "Event",
        "Invite", "Session", "Member", "Family", "User"
      CASCADE
    `);
  });

  it("expands weekly club and yearly birthday in a range", async () => {
    const { sid, memberId } = await register();
    const today = DateTime.now().setZone(tz).startOf("day");
    const clubStart = today.set({ hour: 18, minute: 0 });
    const birthday = today.plus({ days: 10 }).startOf("day");

    const club = await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "Футбол",
      type: "CLUB",
      startsAt: clubStart.toUTC().toISO(),
      allDay: false,
      recurrence: "WEEKLY",
      participantIds: [memberId],
      remindInUi: true,
    });
    expect(club.status).toBe(201);
    expect(club.body.recurrence).toBe("WEEKLY");
    expect(club.body.participantIds).toEqual([memberId]);

    const bday = await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "День рождения Димы",
      type: "BIRTHDAY",
      startsAt: birthday.minus({ years: 1 }).toUTC().toISO(),
      allDay: true,
      recurrence: "YEARLY",
      participantIds: [memberId],
      remindInUi: true,
    });
    expect(bday.status).toBe(201);

    const list = await request(app).get("/api/v1/events").set("Cookie", sid).query({
      from: today.toISODate(),
      to: today.plus({ days: 21 }).toISODate(),
    });
    expect(list.status).toBe(200);
    const items = list.body.items as Occ[];
    const football = items.filter((i) => i.title === "Футбол");
    expect(football).toHaveLength(4);
    const birthdays = items.filter((i) => i.title === "День рождения Димы");
    expect(birthdays).toHaveLength(1);
  });

  it("forbids child from creating events and seeing others' occurrences", async () => {
    const parentAuth = await register();
    const child = await inviteChild(parentAuth.sid);
    const today = DateTime.now().setZone(tz).startOf("day");

    const own = await request(app).post("/api/v1/events").set("Cookie", parentAuth.sid).send({
      title: "Только Анна",
      type: "WORK",
      startsAt: today.set({ hour: 10 }).toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [parentAuth.memberId],
      remindInUi: false,
    });
    expect(own.status).toBe(201);

    const shared = await request(app).post("/api/v1/events").set("Cookie", parentAuth.sid).send({
      title: "Забрать Диму",
      type: "PICKUP",
      startsAt: today.set({ hour: 16 }).toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [parentAuth.memberId, child.memberId],
      remindInUi: true,
    });
    expect(shared.status).toBe(201);

    const far = await request(app).post("/api/v1/events").set("Cookie", parentAuth.sid).send({
      title: "Далёкий кружок",
      type: "CLUB",
      startsAt: today.plus({ days: 40 }).set({ hour: 18 }).toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [child.memberId],
      remindInUi: false,
    });
    expect(far.status).toBe(201);

    const create = await request(app).post("/api/v1/events").set("Cookie", child.sid).send({
      title: "Нельзя",
      type: "OTHER",
      startsAt: today.toUTC().toISO(),
      allDay: true,
      recurrence: "NONE",
      participantIds: [child.memberId],
      remindInUi: false,
    });
    expect(create.status).toBe(403);

    const filter = await request(app).get("/api/v1/events").set("Cookie", child.sid).query({
      from: today.toISODate(),
      to: today.plus({ days: 60 }).toISODate(),
      memberId: parentAuth.memberId,
    });
    expect(filter.status).toBe(403);

    const list = await request(app).get("/api/v1/events").set("Cookie", child.sid).query({
      from: today.toISODate(),
      to: today.plus({ days: 60 }).toISODate(),
    });
    expect(list.status).toBe(200);
    const titles = (list.body.items as Occ[]).map((i) => i.title);
    expect(titles).toEqual(["Забрать Диму"]);

    const farGet = await request(app)
      .get(`/api/v1/events/${far.body.id}`)
      .set("Cookie", child.sid);
    expect(farGet.status).toBe(200);
    expect(farGet.body.title).toBe("Далёкий кружок");

    const hidden = await request(app)
      .get(`/api/v1/events/${own.body.id}`)
      .set("Cookie", child.sid);
    expect(hidden.status).toBe(403);
  });

  it("splits a series on scope=this without duplicating the date", async () => {
    const { sid, memberId } = await register();
    const today = DateTime.now().setZone(tz).startOf("day").set({ hour: 18 });

    const created = await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "Кружок",
      type: "CLUB",
      startsAt: today.toUTC().toISO(),
      allDay: false,
      recurrence: "WEEKLY",
      participantIds: [memberId],
      remindInUi: false,
    });
    expect(created.status).toBe(201);

    const second = DateTime.fromISO(created.body.occurrenceStart).plus({ weeks: 1 });
    const patch = await request(app)
      .patch(`/api/v1/events/${created.body.id}`)
      .query({ scope: "this" })
      .set("Cookie", sid)
      .send({
        occurrenceStart: second.toUTC().toISO(),
        title: "Кружок только в этот день",
      });
    expect(patch.status).toBe(200);
    expect(patch.body.title).toBe("Кружок только в этот день");
    expect(patch.body.recurrence).toBe("NONE");
    expect(patch.body.isDetached).toBe(true);
    expect(patch.body.id).not.toBe(created.body.id);

    const list = await request(app).get("/api/v1/events").set("Cookie", sid).query({
      from: today.minus({ days: 1 }).toISODate(),
      to: today.plus({ days: 21 }).toISODate(),
    });
    const items = list.body.items as Occ[];
    const starts = items.map((i) => i.occurrenceStart);
    expect(new Set(starts).size).toBe(starts.length);
    const secondIso = second.toUTC().toISO();
    const onSecond = items.filter((i) => i.occurrenceStart === secondIso);
    expect(onSecond).toHaveLength(1);
    expect(onSecond[0].title).toBe("Кружок только в этот день");
    expect(items.filter((i) => i.title === "Кружок").length).toBeGreaterThanOrEqual(2);
  });

  it("rejects deleting a single occurrence and HEALTH_APPOINTMENT", async () => {
    const { sid, memberId } = await register();
    const today = DateTime.now().setZone(tz).startOf("day");
    const created = await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "Кружок",
      type: "CLUB",
      startsAt: today.set({ hour: 18 }).toUTC().toISO(),
      allDay: false,
      recurrence: "WEEKLY",
      participantIds: [memberId],
      remindInUi: false,
    });

    const delThis = await request(app)
      .delete(`/api/v1/events/${created.body.id}`)
      .query({ scope: "this" })
      .set("Cookie", sid);
    expect(delThis.status).toBe(422);

    const health = await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "Приём",
      type: "HEALTH_APPOINTMENT",
      startsAt: today.toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [memberId],
      remindInUi: false,
    });
    expect(health.status).toBe(422);

    const delSeries = await request(app)
      .delete(`/api/v1/events/${created.body.id}`)
      .query({ scope: "series" })
      .set("Cookie", sid);
    expect(delSeries.status).toBe(204);
  });

  it("returns reminders for today and soon, with empty tasks and documents", async () => {
    const { sid, memberId } = await register();
    const today = DateTime.now().setZone(tz).startOf("day");

    await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "Сегодня работа",
      type: "WORK",
      startsAt: today.set({ hour: 9 }).toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [memberId],
      remindInUi: false,
    });
    await request(app).post("/api/v1/events").set("Cookie", sid).send({
      title: "Скоро кружок",
      type: "CLUB",
      startsAt: today.plus({ days: 3 }).set({ hour: 18 }).toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [memberId],
      remindInUi: true,
    });

    const res = await request(app).get("/api/v1/reminders").set("Cookie", sid);
    expect(res.status).toBe(200);
    expect(res.body.today.tasks).toEqual([]);
    expect(res.body.soon.documents).toEqual([]);
    expect(res.body.today.events.map((e: Occ) => e.title)).toContain("Сегодня работа");
    expect(res.body.soon.events.map((e: Occ) => e.title)).toContain("Скоро кружок");
    expect(res.body.soon.events.map((e: Occ) => e.title)).not.toContain("Сегодня работа");
  });
});

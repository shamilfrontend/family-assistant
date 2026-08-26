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

describe("health records", () => {
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

  it("creates all four kinds and requires kind-specific fields", async () => {
    const { sid, memberId } = await register();

    const missing = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "DOCTOR",
    });
    expect(missing.status).toBe(422);

    const doctor = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "DOCTOR",
      doctorName: "Иванова",
      specialty: "педиатр",
      phone: "+7999",
    });
    expect(doctor.status).toBe(201);
    expect(doctor.body.kind).toBe("DOCTOR");
    expect(doctor.body.doctorName).toBe("Иванова");
    expect(doctor.body.vaccineName).toBeNull();
    expect(doctor.body.eventId).toBeNull();

    const vax = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "VACCINATION",
      vaccineName: "АКДС",
      vaccinatedAt: "2024-04-01",
    });
    expect(vax.status).toBe(201);
    expect(vax.body.vaccinatedAt).toBe("2024-04-01");

    const checkup = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "CHECKUP",
      checkupType: "диспансеризация",
      checkupAt: "2026-01-15",
      note: "всё хорошо",
    });
    expect(checkup.status).toBe(201);
    expect(checkup.body.checkupType).toBe("диспансеризация");

    const at = DateTime.now().setZone(tz).plus({ days: 2 }).set({ hour: 11, minute: 0, second: 0, millisecond: 0 });
    const appointment = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "APPOINTMENT",
      appointmentTitle: "ЛОР",
      appointmentAt: at.toUTC().toISO(),
    });
    expect(appointment.status).toBe(201);
    expect(appointment.body.eventId).toBeTruthy();

    const event = await request(app)
      .get(`/api/v1/events/${appointment.body.eventId}`)
      .set("Cookie", sid);
    expect(event.status).toBe(200);
    expect(event.body.type).toBe("HEALTH_APPOINTMENT");
    expect(event.body.title).toBe("ЛОР");
    expect(event.body.healthRecordId).toBe(appointment.body.id);
    expect(event.body.participantIds).toEqual([memberId]);
    expect(event.body.remindInUi).toBe(true);

    const list = await request(app).get("/api/v1/health-records").set("Cookie", sid);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(4);

    const logs = await prisma.auditLog.findMany({ where: { action: "HEALTH_READ" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs)).not.toContain("АКДС");
  });

  it("syncs appointment event on patch and delete, and forbids calendar edits", async () => {
    const { sid, memberId } = await register();
    const first = DateTime.now().setZone(tz).plus({ days: 1 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    const created = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "APPOINTMENT",
      appointmentTitle: "Окулист",
      appointmentAt: first.toUTC().toISO(),
    });
    expect(created.status).toBe(201);
    const eventId = created.body.eventId as string;

    const later = first.plus({ hours: 2 });
    const patched = await request(app)
      .patch(`/api/v1/health-records/${created.body.id}`)
      .set("Cookie", sid)
      .send({
        appointmentTitle: "Окулист повторно",
        appointmentAt: later.toUTC().toISO(),
      });
    expect(patched.status).toBe(200);
    expect(patched.body.eventId).toBe(eventId);

    const event = await request(app).get(`/api/v1/events/${eventId}`).set("Cookie", sid);
    expect(event.body.title).toBe("Окулист повторно");
    expect(new Date(event.body.startsAt).getTime()).toBe(later.toUTC().toMillis());

    const calPatch = await request(app).patch(`/api/v1/events/${eventId}`).set("Cookie", sid).send({
      title: "нельзя",
      type: "OTHER",
      startsAt: later.toUTC().toISO(),
      allDay: false,
      recurrence: "NONE",
      participantIds: [memberId],
      remindInUi: true,
    });
    expect(calPatch.status).toBe(403);

    const calDel = await request(app).delete(`/api/v1/events/${eventId}`).set("Cookie", sid);
    expect(calDel.status).toBe(403);

    const asDoctor = await request(app)
      .patch(`/api/v1/health-records/${created.body.id}`)
      .set("Cookie", sid)
      .send({ kind: "DOCTOR", doctorName: "Петров", specialty: "окулист" });
    expect(asDoctor.status).toBe(200);
    expect(asDoctor.body.eventId).toBeNull();
    const gone = await request(app).get(`/api/v1/events/${eventId}`).set("Cookie", sid);
    expect(gone.status).toBe(404);

    const again = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "APPOINTMENT",
      appointmentTitle: "УЗИ",
      appointmentAt: first.toUTC().toISO(),
    });
    const del = await request(app)
      .delete(`/api/v1/health-records/${again.body.id}`)
      .set("Cookie", sid);
    expect(del.status).toBe(204);
    const eventGone = await request(app)
      .get(`/api/v1/events/${again.body.eventId}`)
      .set("Cookie", sid);
    expect(eventGone.status).toBe(404);
  });

  it("lets a child read only own records and forbids writes", async () => {
    const parentAuth = await register();
    const child = await inviteChild(parentAuth.sid);

    const adultRec = await request(app).post("/api/v1/health-records").set("Cookie", parentAuth.sid).send({
      memberId: parentAuth.memberId,
      kind: "VACCINATION",
      vaccineName: "грипп",
      vaccinatedAt: "2025-10-01",
    });
    expect(adultRec.status).toBe(201);

    const childRec = await request(app).post("/api/v1/health-records").set("Cookie", parentAuth.sid).send({
      memberId: child.memberId,
      kind: "VACCINATION",
      vaccineName: "корь",
      vaccinatedAt: "2023-06-01",
    });
    expect(childRec.status).toBe(201);

    const list = await request(app).get("/api/v1/health-records").set("Cookie", child.sid);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(childRec.body.id);

    const peekList = await request(app)
      .get("/api/v1/health-records")
      .query({ memberId: parentAuth.memberId })
      .set("Cookie", child.sid);
    expect(peekList.status).toBe(403);

    const peek = await request(app)
      .get(`/api/v1/health-records/${adultRec.body.id}`)
      .set("Cookie", child.sid);
    expect(peek.status).toBe(403);

    const own = await request(app)
      .get(`/api/v1/health-records/${childRec.body.id}`)
      .set("Cookie", child.sid);
    expect(own.status).toBe(200);
    expect(own.body.vaccineName).toBe("корь");

    const create = await request(app).post("/api/v1/health-records").set("Cookie", child.sid).send({
      memberId: child.memberId,
      kind: "DOCTOR",
      doctorName: "Смирнов",
      specialty: "терапевт",
    });
    expect(create.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/health-records/${childRec.body.id}`)
      .set("Cookie", child.sid)
      .send({ vaccineName: "нет" });
    expect(patch.status).toBe(403);

    const remove = await request(app)
      .delete(`/api/v1/health-records/${childRec.body.id}`)
      .set("Cookie", child.sid);
    expect(remove.status).toBe(403);

    const missing = await request(app)
      .get("/api/v1/health-records/00000000-0000-4000-8000-000000000000")
      .set("Cookie", child.sid);
    expect(missing.status).toBe(404);
  });

  it("rejects a too-long doctor phone", async () => {
    const { sid, memberId } = await register();
    const res = await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "DOCTOR",
      doctorName: "Иванова",
      specialty: "педиатр",
      phone: "x".repeat(121),
    });
    expect(res.status).toBe(422);
  });

  it("moves appointment event participant when memberId changes", async () => {
    const parentAuth = await register();
    const child = await inviteChild(parentAuth.sid);
    const at = DateTime.now().setZone(tz).plus({ days: 3 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    const created = await request(app).post("/api/v1/health-records").set("Cookie", parentAuth.sid).send({
      memberId: parentAuth.memberId,
      kind: "APPOINTMENT",
      appointmentTitle: "ЛОР",
      appointmentAt: at.toUTC().toISO(),
    });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/v1/health-records/${created.body.id}`)
      .set("Cookie", parentAuth.sid)
      .send({ memberId: child.memberId });
    expect(patched.status).toBe(200);
    expect(patched.body.memberId).toBe(child.memberId);

    const event = await request(app)
      .get(`/api/v1/events/${created.body.eventId}`)
      .set("Cookie", parentAuth.sid);
    expect(event.status).toBe(200);
    expect(event.body.participantIds).toEqual([child.memberId]);
  });
});

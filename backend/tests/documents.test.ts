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

describe("documents", () => {
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

  it("masks numbers in lists and hides short numbers completely", async () => {
    const { sid, memberId } = await register();
    const soon = DateTime.now().setZone(tz).plus({ days: 10 }).toISODate();

    const passport = await request(app).post("/api/v1/documents").set("Cookie", sid).send({
      ownerMemberId: memberId,
      type: "PASSPORT",
      number: "1234567890",
      expiresAt: soon,
    });
    expect(passport.status).toBe(201);
    expect(passport.body.number).toBeUndefined();
    expect(passport.body.numberMasked).toBe("••••7890");
    expect(passport.body.expiresSoon).toBe(true);

    const short = await request(app).post("/api/v1/documents").set("Cookie", sid).send({
      ownerMemberId: memberId,
      type: "OTHER",
      number: "12",
      expiresAt: soon,
    });
    expect(short.status).toBe(201);
    expect(short.body.numberMasked).toBe("••••");

    const list = await request(app).get("/api/v1/documents").set("Cookie", sid);
    expect(list.status).toBe(200);
    expect(list.body.items.every((d: { number?: string }) => d.number === undefined)).toBe(true);

    const card = await request(app).get(`/api/v1/documents/${passport.body.id}`).set("Cookie", sid);
    expect(card.status).toBe(200);
    expect(card.body.number).toBe("1234567890");
    expect(card.body.numberMasked).toBe("••••7890");

    const logs = await prisma.auditLog.findMany({ where: { action: "DOCUMENT_NUMBER_VIEW" } });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].metadata)).not.toContain("1234567890");
  });

  it("forbids a child from seeing someone else's document", async () => {
    const parentAuth = await register();
    const child = await inviteChild(parentAuth.sid);
    const soon = DateTime.now().setZone(tz).plus({ days: 5 }).toISODate();

    const adultDoc = await request(app).post("/api/v1/documents").set("Cookie", parentAuth.sid).send({
      ownerMemberId: parentAuth.memberId,
      type: "PASSPORT",
      number: "99887766",
      expiresAt: soon,
    });
    expect(adultDoc.status).toBe(201);

    const childDoc = await request(app).post("/api/v1/documents").set("Cookie", parentAuth.sid).send({
      ownerMemberId: child.memberId,
      type: "CERTIFICATE",
      number: "AB123456",
      expiresAt: soon,
    });
    expect(childDoc.status).toBe(201);

    const list = await request(app).get("/api/v1/documents").set("Cookie", child.sid);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(childDoc.body.id);
    expect(list.body.items[0].number).toBeUndefined();
    expect(list.body.items[0].numberMasked).toBe("••••3456");

    const peek = await request(app)
      .get(`/api/v1/documents/${adultDoc.body.id}`)
      .set("Cookie", child.sid);
    expect(peek.status).toBe(403);

    const own = await request(app)
      .get(`/api/v1/documents/${childDoc.body.id}`)
      .set("Cookie", child.sid);
    expect(own.status).toBe(200);
    expect(own.body.number).toBeUndefined();
    expect(own.body.numberMasked).toBe("••••3456");
  });

  it("puts expiring documents into reminders.soon", async () => {
    const { sid, memberId } = await register();
    const soon = DateTime.now().setZone(tz).plus({ days: 12 }).toISODate();
    const later = DateTime.now().setZone(tz).plus({ days: 40 }).toISODate();

    await request(app).post("/api/v1/documents").set("Cookie", sid).send({
      ownerMemberId: memberId,
      type: "PASSPORT",
      number: "1111222233",
      expiresAt: soon,
    });
    await request(app).post("/api/v1/documents").set("Cookie", sid).send({
      ownerMemberId: memberId,
      type: "LICENSE",
      number: "4444555566",
      expiresAt: later,
    });

    const reminders = await request(app).get("/api/v1/reminders").set("Cookie", sid);
    expect(reminders.status).toBe(200);
    expect(reminders.body.soon.documents).toHaveLength(1);
    expect(reminders.body.soon.documents[0].type).toBe("PASSPORT");
    expect(reminders.body.soon.documents[0].number).toBeUndefined();
    expect(reminders.body.soon.documents[0].numberMasked).toBe("••••2233");
  });
});

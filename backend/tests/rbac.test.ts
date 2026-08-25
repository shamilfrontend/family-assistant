import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();

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
  timezone: "Europe/Moscow",
  name: "Анна",
  birthDate: "1990-05-12",
};

async function register(overrides: Partial<typeof parent> = {}) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ ...parent, ...overrides });
  return res;
}

describe("RBAC and family access", () => {
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

  it("sets sid cookie on register and returns me", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(cookie(res)).toMatch(/^sid=/);
    expect(res.body.member.role).toBe("ADULT");
    expect(res.body.family.timezone).toBe("Europe/Moscow");

    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie(res));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("anna@example.com");
  });

  it("rejects register without 18+", async () => {
    const res = await register({ declaredAdult: false as unknown as true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("validation");
  });

  it("rejects duplicate email", async () => {
    expect((await register()).status).toBe(201);
    const res = await register();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("does not delete the last adult account", async () => {
    const sid = cookie(await register());
    const res = await request(app).delete("/api/v1/auth/account").set("Cookie", sid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("does not delete the last adult member or demote them", async () => {
    const created = await register();
    const sid = cookie(created);
    const memberId = created.body.member.id;

    const del = await request(app).delete(`/api/v1/members/${memberId}`).set("Cookie", sid);
    expect(del.status).toBe(409);

    const patch = await request(app)
      .patch(`/api/v1/members/${memberId}`)
      .set("Cookie", sid)
      .send({ role: "CHILD" });
    expect(patch.status).toBe(409);
  });

  it("invites a second adult; then the first can leave", async () => {
    const created = await register();
    const sid = cookie(created);

    const invite = await request(app)
      .post("/api/v1/invites")
      .set("Cookie", sid)
      .send({ role: "ADULT" });
    expect(invite.status).toBe(201);
    expect(invite.body.token).toBeTruthy();
    expect(invite.body.url).toContain("/invite/");

    const preview = await request(app).get("/api/v1/auth/invite-preview").query({
      token: invite.body.token,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.role).toBe("ADULT");
    expect(preview.body.memberName).toBeNull();

    const second = await request(app).post("/api/v1/auth/accept-invite").send({
      token: invite.body.token,
      email: "ivan@example.com",
      password: "password1",
      name: "Иван",
      birthDate: "1988-01-01",
      declaredAdult: true,
    });
    expect(second.status).toBe(201);
    expect(second.body.member.role).toBe("ADULT");

    const leave = await request(app).delete("/api/v1/auth/account").set("Cookie", sid);
    expect(leave.status).toBe(204);

    const last = await request(app)
      .delete("/api/v1/auth/account")
      .set("Cookie", cookie(second));
    expect(last.status).toBe(409);
  });

  it("forbids child from family settings and invites", async () => {
    const created = await register();
    const sid = cookie(created);

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
    expect(invite.status).toBe(201);

    const child = await request(app).post("/api/v1/auth/accept-invite").send({
      token: invite.body.token,
      email: "dima@example.com",
      password: "password1",
    });
    expect(child.status).toBe(201);
    const childSid = cookie(child);

    const patchFamily = await request(app)
      .patch("/api/v1/family")
      .set("Cookie", childSid)
      .send({ timezone: "UTC" });
    expect(patchFamily.status).toBe(403);

    const invites = await request(app).get("/api/v1/invites").set("Cookie", childSid);
    expect(invites.status).toBe(403);

    const createInvite = await request(app)
      .post("/api/v1/invites")
      .set("Cookie", childSid)
      .send({ role: "CHILD" });
    expect(createInvite.status).toBe(403);

    const list = await request(app).get("/api/v1/members").set("Cookie", childSid);
    expect(list.status).toBe(200);
    const parentCard = list.body.items.find((m: { name: string }) => m.name === "Анна");
    expect(parentCard).toEqual({ id: parentCard.id, name: "Анна", role: "ADULT" });
    const self = list.body.items.find((m: { name: string }) => m.name === "Дима");
    expect(self.birthDate).toBe("2015-03-04");
    expect(self.hasLogin).toBe(true);
  });

  it("rejects invite when role does not match the card", async () => {
    const sid = cookie(await register());
    const card = await request(app).post("/api/v1/members").set("Cookie", sid).send({
      name: "Маша",
      role: "CHILD",
      birthDate: "2016-01-01",
    });
    const res = await request(app).post("/api/v1/invites").set("Cookie", sid).send({
      role: "ADULT",
      memberId: card.body.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("validation");
  });
});

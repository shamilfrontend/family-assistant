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

describe("purchases", () => {
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

  it("defaults category to OTHER", async () => {
    const { sid, memberId } = await register();
    const res = await request(app).post("/api/v1/purchases").set("Cookie", sid).send({
      title: "молоко",
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("молоко");
    expect(res.body.category).toBe("OTHER");
    expect(res.body.quantity).toBeNull();
    expect(res.body.isBought).toBe(false);
    expect(res.body.addedByMemberId).toBe(memberId);

    const list = await request(app).get("/api/v1/purchases").set("Cookie", sid);
    expect(list.body.items).toHaveLength(1);
  });

  it("lets a child mark any item bought but not unmark or edit others", async () => {
    const { sid } = await register();
    const child = await inviteChild(sid);

    const milk = await request(app).post("/api/v1/purchases").set("Cookie", sid).send({
      title: "молоко",
      category: "FOOD",
    });
    expect(milk.status).toBe(201);

    const bread = await request(app).post("/api/v1/purchases").set("Cookie", child.sid).send({
      title: "хлеб",
    });
    expect(bread.status).toBe(201);

    const mark = await request(app)
      .patch(`/api/v1/purchases/${milk.body.id}`)
      .set("Cookie", child.sid)
      .send({ isBought: true });
    expect(mark.status).toBe(200);
    expect(mark.body.isBought).toBe(true);

    const unmark = await request(app)
      .patch(`/api/v1/purchases/${milk.body.id}`)
      .set("Cookie", child.sid)
      .send({ isBought: false });
    expect(unmark.status).toBe(403);

    const editOther = await request(app)
      .patch(`/api/v1/purchases/${milk.body.id}`)
      .set("Cookie", child.sid)
      .send({ title: "кефир" });
    expect(editOther.status).toBe(403);

    const editOwn = await request(app)
      .patch(`/api/v1/purchases/${bread.body.id}`)
      .set("Cookie", child.sid)
      .send({ title: "батон" });
    expect(editOwn.status).toBe(200);
    expect(editOwn.body.title).toBe("батон");

    const deleteBought = await request(app)
      .delete(`/api/v1/purchases/${milk.body.id}`)
      .set("Cookie", child.sid);
    expect(deleteBought.status).toBe(403);

    const deleteOther = await request(app)
      .delete(`/api/v1/purchases/${milk.body.id}`)
      .set("Cookie", child.sid);
    expect(deleteOther.status).toBe(403);
  });

  it("lets a child delete own unbought item", async () => {
    const { sid } = await register();
    const child = await inviteChild(sid);
    const item = await request(app).post("/api/v1/purchases").set("Cookie", child.sid).send({
      title: "сок",
    });
    const del = await request(app)
      .delete(`/api/v1/purchases/${item.body.id}`)
      .set("Cookie", child.sid);
    expect(del.status).toBe(204);
  });

  it("lets an adult unmark and clear bought items", async () => {
    const { sid } = await register();
    const child = await inviteChild(sid);
    const a = await request(app).post("/api/v1/purchases").set("Cookie", sid).send({ title: "молоко" });
    const b = await request(app).post("/api/v1/purchases").set("Cookie", child.sid).send({ title: "хлеб" });

    await request(app).patch(`/api/v1/purchases/${a.body.id}`).set("Cookie", sid).send({ isBought: true });
    await request(app).patch(`/api/v1/purchases/${b.body.id}`).set("Cookie", sid).send({ isBought: true });

    const unmark = await request(app)
      .patch(`/api/v1/purchases/${a.body.id}`)
      .set("Cookie", sid)
      .send({ isBought: false });
    expect(unmark.status).toBe(200);
    expect(unmark.body.isBought).toBe(false);

    const childClear = await request(app)
      .post("/api/v1/purchases/clear-bought")
      .set("Cookie", child.sid);
    expect(childClear.status).toBe(403);

    const clear = await request(app).post("/api/v1/purchases/clear-bought").set("Cookie", sid);
    expect(clear.status).toBe(200);

    const list = await request(app).get("/api/v1/purchases").set("Cookie", sid);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].title).toBe("молоко");
  });

  it("filters by bought query", async () => {
    const { sid } = await register();
    const open = await request(app).post("/api/v1/purchases").set("Cookie", sid).send({ title: "чай" });
    const done = await request(app).post("/api/v1/purchases").set("Cookie", sid).send({ title: "кофе" });
    await request(app).patch(`/api/v1/purchases/${done.body.id}`).set("Cookie", sid).send({ isBought: true });

    const hidden = await request(app).get("/api/v1/purchases?bought=false").set("Cookie", sid);
    expect(hidden.body.items.map((i: { id: string }) => i.id)).toEqual([open.body.id]);

    const bought = await request(app).get("/api/v1/purchases?bought=true").set("Cookie", sid);
    expect(bought.body.items.map((i: { id: string }) => i.id)).toEqual([done.body.id]);
  });
});

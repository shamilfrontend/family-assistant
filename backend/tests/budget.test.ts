import { DateTime } from "luxon";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DELETION_KEYS } from "../src/lib/rbac.js";
import { TBANK_CSV_FIXTURE } from "./tbank-csv.test.js";

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

describe("budget", () => {
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

  it("seeds default categories on register", async () => {
    const { sid } = await register();
    const res = await request(app).get("/api/v1/budget/categories").set("Cookie", sid);
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual([
      "Продукты",
      "Быт",
      "Аптека",
      "Транспорт",
      "Другое",
    ]);
  });

  it("creates an expense and summarizes who spent how much", async () => {
    const { sid, memberId } = await register();
    const child = await inviteChild(sid);
    const categories = await request(app).get("/api/v1/budget/categories").set("Cookie", sid);
    const food = categories.body.items.find((c: { name: string }) => c.name === "Продукты");
    const month = DateTime.now().setZone(tz).toFormat("yyyy-MM");
    const spentAt = DateTime.now().setZone(tz).toISODate();

    const milk = await request(app).post("/api/v1/budget/expenses").set("Cookie", sid).send({
      title: "Молоко",
      amount: 89.9,
      categoryId: food.id,
      spentByMemberId: memberId,
      spentAt,
    });
    expect(milk.status).toBe(201);
    expect(milk.body.amount).toBe(89.9);
    expect(milk.body.categoryName).toBe("Продукты");
    expect(milk.body.spentByName).toBe("Анна");

    const ice = await request(app).post("/api/v1/budget/expenses").set("Cookie", sid).send({
      title: "Мороженое",
      amount: 120,
      categoryId: food.id,
      spentByMemberId: child.memberId,
      spentAt,
    });
    expect(ice.status).toBe(201);

    const summary = await request(app)
      .get("/api/v1/budget/summary")
      .query({ month })
      .set("Cookie", sid);
    expect(summary.status).toBe(200);
    expect(summary.body.total).toBe(209.9);
    const anna = summary.body.byMember.find((m: { name: string }) => m.name === "Анна");
    const dima = summary.body.byMember.find((m: { name: string }) => m.name === "Дима");
    expect(anna.total).toBe(89.9);
    expect(dima.total).toBe(120);
    const foodRow = summary.body.byCategory.find((c: { name: string }) => c.name === "Продукты");
    expect(foodRow.total).toBe(209.9);

    const list = await request(app)
      .get("/api/v1/budget/expenses")
      .query({ month })
      .set("Cookie", sid);
    expect(list.body.items).toHaveLength(2);
  });

  it("forbids a child from every budget endpoint", async () => {
    const { sid } = await register();
    const child = await inviteChild(sid);
    const paths = [
      { method: "get", path: "/api/v1/budget/summary" },
      { method: "get", path: "/api/v1/budget/expenses" },
      { method: "post", path: "/api/v1/budget/expenses" },
      { method: "get", path: "/api/v1/budget/categories" },
      { method: "post", path: "/api/v1/budget/categories" },
    ] as const;

    for (const item of paths) {
      const req = request(app)[item.method](item.path).set("Cookie", child.sid);
      const res = item.method === "post" ? await req.send({ title: "x" }) : await req;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }

    const imported = await request(app)
      .post("/api/v1/budget/import")
      .set("Cookie", child.sid)
      .attach("file", Buffer.from(TBANK_CSV_FIXTURE), "ops.csv");
    expect(imported.status).toBe(403);
    expect(imported.body.error.code).toBe("forbidden");
  });

  it("does not delete a category that has expenses", async () => {
    const { sid, memberId } = await register();
    const categories = await request(app).get("/api/v1/budget/categories").set("Cookie", sid);
    const food = categories.body.items.find((c: { name: string }) => c.name === "Продукты");
    const spentAt = DateTime.now().setZone(tz).toISODate();
    const created = await request(app).post("/api/v1/budget/expenses").set("Cookie", sid).send({
      title: "Хлеб",
      amount: 50,
      categoryId: food.id,
      spentByMemberId: memberId,
      spentAt,
    });
    expect(created.status).toBe(201);

    const del = await request(app)
      .delete(`/api/v1/budget/categories/${food.id}`)
      .set("Cookie", sid);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("conflict");

    const extra = await request(app).post("/api/v1/budget/categories").set("Cookie", sid).send({
      name: "Кафе",
    });
    expect(extra.status).toBe(201);
    const remove = await request(app)
      .delete(`/api/v1/budget/categories/${extra.body.id}`)
      .set("Cookie", sid);
    expect(remove.status).toBe(204);
  });

  it("requires expenses in the family deletion acknowledge list", async () => {
    const { sid, memberId } = await register();
    const categories = await request(app).get("/api/v1/budget/categories").set("Cookie", sid);
    const food = categories.body.items[0];
    await request(app).post("/api/v1/budget/expenses").set("Cookie", sid).send({
      title: "Такси",
      amount: 400,
      categoryId: food.id,
      spentByMemberId: memberId,
    });

    const preview = await request(app).get("/api/v1/family/deletion-preview").set("Cookie", sid);
    expect(preview.status).toBe(200);
    expect(preview.body.expenses).toBe(1);
    expect(Object.keys(preview.body).sort()).toEqual([...DELETION_KEYS].sort());

    const incomplete = await request(app)
      .delete("/api/v1/family")
      .set("Cookie", sid)
      .send({
        confirm: true,
        acknowledge: DELETION_KEYS.filter((key) => key !== "expenses"),
      });
    expect(incomplete.status).toBe(422);

    const gone = await request(app).delete("/api/v1/family").set("Cookie", sid).send({
      confirm: true,
      acknowledge: [...DELETION_KEYS],
    });
    expect(gone.status).toBe(204);
    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.budgetCategory.count()).toBe(0);
  });

  it("imports a T-Bank CSV, skips non-expenses, and does not duplicate on reimport", async () => {
    const { sid, memberId } = await register();
    const first = await request(app)
      .post("/api/v1/budget/import")
      .set("Cookie", sid)
      .attach("file", Buffer.from(TBANK_CSV_FIXTURE), "ops.csv");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      imported: 5,
      skippedDuplicate: 0,
      skippedOther: 3,
    });
    expect(first.body.errors).toEqual([{ line: 10, message: "Невалидная дата" }]);

    const list = await request(app)
      .get("/api/v1/budget/expenses")
      .query({ month: "2018-10" })
      .set("Cookie", sid);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(5);
    const byTitle = Object.fromEntries(
      list.body.items.map((item: { title: string; amount: number; categoryName: string; spentByMemberId: string }) => [
        item.title,
        item,
      ]),
    );
    expect(byTitle["Пятерочка"].amount).toBe(1053.77);
    expect(byTitle["Пятерочка"].categoryName).toBe("Продукты");
    expect(byTitle["Горздрав"].categoryName).toBe("Аптека");
    expect(byTitle["Яндекс Такси"].categoryName).toBe("Транспорт");
    expect(byTitle["Перевод Маме"].categoryName).toBe("Другое");
    expect(byTitle["Пятерочка"].spentByMemberId).toBe(memberId);

    const second = await request(app)
      .post("/api/v1/budget/import")
      .set("Cookie", sid)
      .attach("file", Buffer.from(TBANK_CSV_FIXTURE), "ops.csv");
    expect(second.status).toBe(200);
    expect(second.body.imported).toBe(0);
    expect(second.body.skippedDuplicate).toBe(5);
    expect(await prisma.expense.count()).toBe(5);
  });

  it("imports the current T-Bank operations CSV", async () => {
    const { sid } = await register();
    const csv = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/tbank-operations-2026-07.csv"),
    );
    const res = await request(app)
      .post("/api/v1/budget/import")
      .set("Cookie", sid)
      .attach("file", csv, "Operations_Wed_Jul_01_2026-Fri_Jul_31_2026.csv");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ imported: 8, skippedDuplicate: 0, skippedOther: 8 });
    expect(res.body.errors).toEqual([]);

    const list = await request(app)
      .get("/api/v1/budget/expenses")
      .query({ month: "2026-07" })
      .set("Cookie", sid);
    expect(list.body.items).toHaveLength(8);
    const ozon = list.body.items.find((item: { title: string }) => item.title === "Ozon");
    expect(ozon.amount).toBe(2273);
    expect(ozon.categoryName).toBe("Быт");
  });

  it("rejects a file that is not a T-Bank statement", async () => {
    const { sid } = await register();
    const res = await request(app)
      .post("/api/v1/budget/import")
      .set("Cookie", sid)
      .attach("file", Buffer.from("Date,Amount\n1,2"), "other.csv");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("validation");
  });
});

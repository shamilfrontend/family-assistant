import request from "supertest";
import { DateTime } from "luxon";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/ai/client.js", () => ({
  completeChat: vi.fn(),
}));

import { completeChat } from "../src/lib/ai/client.js";
import { llmUnavailable } from "../src/lib/errors.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const mockedComplete = vi.mocked(completeChat);

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

function mockPurchaseTools(titles: string[]) {
  mockedComplete.mockImplementation(async (messages) => {
    if (messages.some((m) => m.role === "tool")) {
      return { content: `Добавить ${titles.join(" и ")}?`, toolCalls: [] };
    }
    return {
      content: null,
      toolCalls: titles.map((title, i) => ({
        id: `call_${i}`,
        name: "propose_create_purchase",
        arguments: JSON.stringify({ title, category: "FOOD" }),
      })),
    };
  });
}

describe("chats and AI drafts", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    mockedComplete.mockReset();
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "AiDraft", "ChatMessage", "Chat", "AuditLog", "HealthRecord",
        "Document", "Purchase", "Task", "EventParticipant", "Event",
        "Invite", "Session", "Member", "Family", "User"
      CASCADE
    `);
  });

  it("hides an adult chat from a child and forbids writing to a child chat", async () => {
    const { sid } = await register();
    const child = await inviteChild(sid);

    const adultChats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    expect(adultChats.status).toBe(200);
    expect(adultChats.body.items).toHaveLength(2);
    const adultChat = adultChats.body.items.find((c: { memberId: string }) => c.memberId !== child.memberId);
    const childChat = adultChats.body.items.find((c: { memberId: string }) => c.memberId === child.memberId);
    expect(adultChat).toBeTruthy();
    expect(childChat).toBeTruthy();

    const childList = await request(app).get("/api/v1/chats").set("Cookie", child.sid);
    expect(childList.body.items).toHaveLength(1);
    expect(childList.body.items[0].memberId).toBe(child.memberId);

    const peek = await request(app)
      .get(`/api/v1/chats/${adultChat.chatId}`)
      .set("Cookie", child.sid);
    expect(peek.status).toBe(403);

    const readChild = await request(app).get(`/api/v1/chats/${childChat.chatId}`).set("Cookie", sid);
    expect(readChild.status).toBe(200);
    expect(readChild.body.readOnly).toBe(true);

    mockedComplete.mockResolvedValue({ content: "привет", toolCalls: [] });
    const write = await request(app)
      .post(`/api/v1/chats/${childChat.chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "привет" });
    expect(write.status).toBe(403);
  });

  it("applies a purchase draft once and rejects a second apply", async () => {
    const { sid } = await register();
    const chats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const chatId = chats.body.items[0].chatId as string;
    mockPurchaseTools(["молоко"]);

    const sent = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "Добавь молоко в список" });
    expect(sent.status).toBe(201);
    expect(sent.body.drafts).toHaveLength(1);
    expect(sent.body.drafts[0].operation).toBe("CREATE_PURCHASE");
    expect(sent.body.drafts[0].payload.title).toBe("молоко");

    const draftId = sent.body.drafts[0].id as string;
    const applied = await request(app)
      .post(`/api/v1/chats/${chatId}/drafts/${draftId}/apply`)
      .set("Cookie", sid);
    expect(applied.status).toBe(200);
    expect(applied.body.entity.title).toBe("молоко");
    expect(applied.body.entity.category).toBe("FOOD");

    const list = await request(app).get("/api/v1/purchases").set("Cookie", sid);
    expect(list.body.items).toHaveLength(1);

    const again = await request(app)
      .post(`/api/v1/chats/${chatId}/drafts/${draftId}/apply`)
      .set("Cookie", sid);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("conflict");
  });

  it("does not save a user message when the LLM is down", async () => {
    const { sid } = await register();
    const chats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const chatId = chats.body.items[0].chatId as string;
    mockedComplete.mockRejectedValue(llmUnavailable());

    const sent = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "Что сегодня?" });
    expect(sent.status).toBe(503);
    expect(sent.body.error.code).toBe("llm_unavailable");

    const messages = await request(app).get(`/api/v1/chats/${chatId}/messages`).set("Cookie", sid);
    expect(messages.body.items).toHaveLength(0);
    expect(await prisma.purchase.count()).toBe(0);
  });

  it("splits milk and bread into two drafts with one messageId", async () => {
    const { sid } = await register();
    const chats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const chatId = chats.body.items[0].chatId as string;
    mockPurchaseTools(["молоко", "хлеб"]);

    const sent = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "молоко и хлеб" });
    expect(sent.status).toBe(201);
    expect(sent.body.drafts).toHaveLength(2);
    expect(sent.body.drafts.map((d: { payload: { title: string } }) => d.payload.title)).toEqual([
      "молоко",
      "хлеб",
    ]);
    expect(sent.body.drafts[0].messageId).toBe(sent.body.message.id);
    expect(sent.body.drafts[1].messageId).toBe(sent.body.message.id);
  });

  it("lets a child apply a purchase draft in their own chat", async () => {
    const { sid } = await register();
    const child = await inviteChild(sid);
    const chats = await request(app).get("/api/v1/chats").set("Cookie", child.sid);
    const chatId = chats.body.items[0].chatId as string;
    mockPurchaseTools(["сок"]);

    const sent = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Cookie", child.sid)
      .send({ content: "добавь сок" });
    const draftId = sent.body.drafts[0].id as string;
    const applied = await request(app)
      .post(`/api/v1/chats/${chatId}/drafts/${draftId}/apply`)
      .set("Cookie", child.sid);
    expect(applied.status).toBe(200);
    expect(applied.body.entity.addedByMemberId).toBe(child.memberId);

    const parentApply = await request(app)
      .post(`/api/v1/chats/${chatId}/drafts/${draftId}/apply`)
      .set("Cookie", sid);
    expect(parentApply.status).toBe(403);
  });

  it("lets an adult apply a task draft and forbids a child from applying create event/task", async () => {
    const { sid, memberId } = await register();
    const child = await inviteChild(sid);
    const dueAt = new Date(Date.now() + 86400000).toISOString();

    const adultChats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const adultChatId = adultChats.body.items.find(
      (c: { memberId: string }) => c.memberId === memberId,
    ).chatId as string;

    mockedComplete.mockImplementation(async (messages) => {
      if (messages.some((m) => m.role === "tool")) {
        return { content: "Добавить дело?", toolCalls: [] };
      }
      return {
        content: null,
        toolCalls: [
          {
            id: "call_task",
            name: "propose_create_task",
            arguments: JSON.stringify({
              title: "Купить форму",
              assigneeMemberId: memberId,
              dueAt,
              recurrence: "NONE",
            }),
          },
        ],
      };
    });

    const sent = await request(app)
      .post(`/api/v1/chats/${adultChatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "добавь дело купить форму" });
    expect(sent.status).toBe(201);
    expect(sent.body.drafts[0].operation).toBe("CREATE_TASK");
    const applied = await request(app)
      .post(`/api/v1/chats/${adultChatId}/drafts/${sent.body.drafts[0].id}/apply`)
      .set("Cookie", sid);
    expect(applied.status).toBe(200);
    expect(applied.body.entity.title).toBe("Купить форму");

    const childChats = await request(app).get("/api/v1/chats").set("Cookie", child.sid);
    expect(childChats.body.items).toHaveLength(1);
    const childChatId = childChats.body.items[0].chatId as string;
    const childMe = await request(app).get("/api/v1/auth/me").set("Cookie", child.sid);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const eventDraft = await prisma.aiDraft.create({
      data: {
        chatId: childChatId,
        userId: childMe.body.user.id,
        operation: "CREATE_EVENT",
        payload: {
          title: "Кружок",
          type: "CLUB",
          startsAt: dueAt,
          allDay: false,
          participantIds: [child.memberId],
          recurrence: "NONE",
          remindInUi: false,
        },
        expiresAt,
      },
    });
    const childApplyEvent = await request(app)
      .post(`/api/v1/chats/${childChatId}/drafts/${eventDraft.id}/apply`)
      .set("Cookie", child.sid);
    expect(childApplyEvent.status).toBe(403);

    const taskDraft = await prisma.aiDraft.create({
      data: {
        chatId: childChatId,
        userId: childMe.body.user.id,
        operation: "CREATE_TASK",
        payload: {
          title: "Нельзя",
          assigneeMemberId: child.memberId,
          dueAt,
          recurrence: "NONE",
        },
        expiresAt,
      },
    });
    const childApplyTask = await request(app)
      .post(`/api/v1/chats/${childChatId}/drafts/${taskDraft.id}/apply`)
      .set("Cookie", child.sid);
    expect(childApplyTask.status).toBe(403);
  });

  it("applies complete task and mark purchase bought drafts", async () => {
    const { sid, memberId } = await register();
    const dueAt = new Date().toISOString();
    const task = await request(app).post("/api/v1/tasks").set("Cookie", sid).send({
      title: "Полить цветы",
      assigneeMemberId: memberId,
      dueAt,
      recurrence: "NONE",
    });
    const purchase = await request(app).post("/api/v1/purchases").set("Cookie", sid).send({
      title: "хлеб",
    });
    const chats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const chatId = chats.body.items[0].chatId as string;

    mockedComplete.mockImplementation(async (messages) => {
      if (messages.some((m) => m.role === "tool")) {
        return { content: "Отметить?", toolCalls: [] };
      }
      return {
        content: null,
        toolCalls: [
          {
            id: "call_complete",
            name: "propose_complete_task",
            arguments: JSON.stringify({ taskId: task.body.id }),
          },
          {
            id: "call_bought",
            name: "propose_mark_purchase_bought",
            arguments: JSON.stringify({ purchaseId: purchase.body.id }),
          },
        ],
      };
    });

    const sent = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "цветы политы, хлеб куплен" });
    expect(sent.body.drafts).toHaveLength(2);

    const complete = sent.body.drafts.find((d: { operation: string }) => d.operation === "COMPLETE_TASK");
    const bought = sent.body.drafts.find(
      (d: { operation: string }) => d.operation === "MARK_PURCHASE_BOUGHT",
    );
    const done = await request(app)
      .post(`/api/v1/chats/${chatId}/drafts/${complete.id}/apply`)
      .set("Cookie", sid);
    expect(done.status).toBe(200);
    expect(done.body.entity.status).toBe("DONE");

    const marked = await request(app)
      .post(`/api/v1/chats/${chatId}/drafts/${bought.id}/apply`)
      .set("Cookie", sid);
    expect(marked.status).toBe(200);
    expect(marked.body.entity.isBought).toBe(true);
  });

  it("does not put a document number into facts", async () => {
    const { sid, memberId } = await register();
    const secret = "SECRETNUM99";
    await request(app).post("/api/v1/documents").set("Cookie", sid).send({
      ownerMemberId: memberId,
      type: "PASSPORT",
      number: secret,
      expiresAt: "2026-11-01",
    });
    const chats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const chatId = chats.body.items[0].chatId as string;
    mockedComplete.mockResolvedValue({ content: "паспорт скоро истекает", toolCalls: [] });

    const sent = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "Когда истекает паспорт Анны?" });
    expect(sent.status).toBe(201);
    expect(sent.body.message.content).not.toContain(secret);

    const factsMessage = mockedComplete.mock.calls[0][0].find(
      (m: { role: string; content: string | null }) =>
        m.role === "system" && (m.content ?? "").includes("Facts (JSON"),
    );
    expect(factsMessage?.content).toBeTruthy();
    expect(factsMessage?.content).not.toContain(secret);
    expect(factsMessage?.content).toContain("PASSPORT");
  });

  it("puts vaccinations into facts and does not offer health-write tools", async () => {
    const { sid, memberId } = await register();
    const child = await inviteChild(sid);
    await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId: child.memberId,
      kind: "VACCINATION",
      vaccineName: "АКДС",
      vaccinatedAt: "2024-04-01",
    });
    const appointmentAt = DateTime.now()
      .setZone("Europe/Moscow")
      .plus({ days: 2 })
      .set({ hour: 11, minute: 0, second: 0, millisecond: 0 });
    await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId: child.memberId,
      kind: "APPOINTMENT",
      appointmentTitle: "ЛОР Димы",
      appointmentAt: appointmentAt.toUTC().toISO(),
    });
    await request(app).post("/api/v1/health-records").set("Cookie", sid).send({
      memberId,
      kind: "VACCINATION",
      vaccineName: "SECRET_VAX_ANNA",
      vaccinatedAt: "2024-01-01",
    });
    await request(app).patch(`/api/v1/members/${memberId}`).set("Cookie", sid).send({
      allergies: "пыльца",
    });

    const chats = await request(app).get("/api/v1/chats").set("Cookie", sid);
    const adultChat = chats.body.items.find((c: { memberId: string }) => c.memberId === memberId);
    mockedComplete.mockResolvedValue({ content: "у Димы АКДС", toolCalls: [] });

    const sent = await request(app)
      .post(`/api/v1/chats/${adultChat.chatId}/messages`)
      .set("Cookie", sid)
      .send({ content: "Какие прививки у Димы?" });
    expect(sent.status).toBe(201);

    const tools = mockedComplete.mock.calls[0][1] as Array<{ function: { name: string } }>;
    expect(tools.map((t) => t.function.name).join(",")).not.toMatch(/health|vaccin|doctor/i);
    expect(tools.some((t) => t.function.name.startsWith("propose_create_"))).toBe(true);

    const factsMessage = mockedComplete.mock.calls[0][0].find(
      (m: { role: string; content: string | null }) =>
        m.role === "system" && (m.content ?? "").includes("Facts (JSON"),
    );
    expect(factsMessage?.content).toContain("АКДС");
    expect(factsMessage?.content).toContain("SECRET_VAX_ANNA");
    expect(factsMessage?.content).toContain("пыльца");
    expect(factsMessage?.content).toContain("ЛОР Димы");
    const factsRaw = String(factsMessage?.content);
    const facts = JSON.parse(factsRaw.slice(factsRaw.indexOf("\n") + 1)) as {
      events: { type: string }[];
      health: { kind: string; appointmentTitle?: string }[];
    };
    expect(facts.events.every((event) => event.type !== "HEALTH_APPOINTMENT")).toBe(true);
    expect(facts.health.some((record) => record.kind === "APPOINTMENT" && record.appointmentTitle === "ЛОР Димы")).toBe(
      true,
    );

    const childChats = await request(app).get("/api/v1/chats").set("Cookie", child.sid);
    mockedComplete.mockClear();
    mockedComplete.mockResolvedValue({ content: "есть корь", toolCalls: [] });
    const childSent = await request(app)
      .post(`/api/v1/chats/${childChats.body.items[0].chatId}/messages`)
      .set("Cookie", child.sid)
      .send({ content: "Какие прививки?" });
    expect(childSent.status).toBe(201);

    const childFacts = mockedComplete.mock.calls[0][0].find(
      (m: { role: string; content: string | null }) =>
        m.role === "system" && (m.content ?? "").includes("Facts (JSON"),
    );
    expect(childFacts?.content).toContain("АКДС");
    expect(childFacts?.content).not.toContain("SECRET_VAX_ANNA");
    expect(childFacts?.content).not.toContain("пыльца");
  });
});

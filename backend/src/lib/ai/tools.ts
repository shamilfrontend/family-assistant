import type { LlmTool } from "./client.js";
import type { Actor } from "../serialize.js";

export const CREATE_PURCHASE_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "propose_create_purchase",
    description:
      "Предложить добавить одну позицию в список покупок семьи. Один вызов — одна позиция. Не записывает в базу: только черновик. Для «молоко и хлеб» вызови дважды.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Название позиции" },
        category: {
          type: "string",
          enum: ["FOOD", "HOUSEHOLD", "PHARMACY", "OTHER"],
          description: "Категория. Если неясно — OTHER",
        },
      },
      required: ["title"],
    },
  },
};

export const CREATE_EVENT_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "propose_create_event",
    description:
      "Предложить создать событие в календаре семьи. Не записывает в базу: только черновик. participantIds — id членов из Facts. Если по имени 0 совпадений — не вызывай; если больше одного — уточни списком, не бери первого.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["SCHOOL", "CLUB", "WORK", "BIRTHDAY", "DOCTOR", "PICKUP", "OTHER"],
        },
        startsAt: { type: "string", description: "ISO 8601 начала" },
        endsAt: { type: "string", description: "ISO 8601 окончания, необязательно" },
        allDay: { type: "boolean" },
        participantIds: { type: "array", items: { type: "string" } },
        recurrence: { type: "string", enum: ["NONE", "WEEKLY", "YEARLY"] },
        remindInUi: { type: "boolean" },
      },
      required: ["title", "type", "startsAt", "allDay", "participantIds"],
    },
  },
};

export const CREATE_TASK_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "propose_create_task",
    description:
      "Предложить создать дело. Не записывает в базу: только черновик. assigneeMemberId — id исполнителя из Facts.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        assigneeMemberId: { type: "string" },
        dueAt: { type: "string", description: "ISO 8601 срока" },
        recurrence: { type: "string", enum: ["NONE", "DAILY", "WEEKLY"] },
      },
      required: ["title", "assigneeMemberId", "dueAt"],
    },
  },
};

export const COMPLETE_TASK_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "propose_complete_task",
    description: "Предложить отметить дело сделанным. Не записывает в базу: только черновик. taskId из Facts.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
};

export const MARK_PURCHASE_BOUGHT_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "propose_mark_purchase_bought",
    description:
      "Предложить отметить покупку купленной. Не записывает в базу: только черновик. purchaseId из Facts.",
    parameters: {
      type: "object",
      properties: {
        purchaseId: { type: "string" },
      },
      required: ["purchaseId"],
    },
  },
};

export const CREATE_EXPENSE_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "propose_create_expense",
    description:
      "Предложить записать расход в бюджет семьи. Не записывает в базу: только черновик. categoryId и spentByMemberId — id из Facts.budget. Только для взрослого.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Название расхода" },
        amount: { type: "number", description: "Сумма в рублях, больше 0" },
        categoryId: { type: "string", description: "id категории из Facts.budget.categories" },
        spentByMemberId: { type: "string", description: "id члена семьи, кто потратил, из Facts.members" },
        spentAt: { type: "string", description: "Дата YYYY-MM-DD в поясе семьи; если нет — сегодня" },
      },
      required: ["title", "amount", "categoryId", "spentByMemberId"],
    },
  },
};

export function toolsForPhase(actor: Actor): LlmTool[] {
  const shared = [CREATE_PURCHASE_TOOL, MARK_PURCHASE_BOUGHT_TOOL, COMPLETE_TASK_TOOL];
  if (actor.role === "CHILD") return shared;
  return [...shared, CREATE_EVENT_TOOL, CREATE_TASK_TOOL, CREATE_EXPENSE_TOOL];
}

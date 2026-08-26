import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  decodeTbankCsv,
  mapTbankCategory,
  parseTbankCsv,
  tbankFingerprint,
} from "../src/lib/tbank-csv.js";

const HEADER =
  '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание";"Бонусы (включая кэшбэк)"';

function row(
  opts: {
    opDate?: string;
    payDate?: string;
    card?: string;
    status?: string;
    amount?: string;
    currency?: string;
    category?: string;
    description?: string;
  } = {},
): string {
  const opDate = opts.opDate ?? "24.10.2018 16:29:51";
  const payDate = opts.payDate ?? "24.10.2018";
  const card = opts.card ?? "*1140";
  const status = opts.status ?? "OK";
  const amount = opts.amount ?? "-1053,77";
  const currency = opts.currency ?? "RUB";
  const category = opts.category ?? "Супермаркеты";
  const description = opts.description ?? "Пятерочка";
  return `"${opDate}";"${payDate}";"${card}";"${status}";"${amount}";"${currency}";"${amount}";"${currency}";"";"${category}";"5411";"${description}";"0,00"`;
}

export const TBANK_CSV_FIXTURE = [
  HEADER,
  row(),
  row({
    opDate: "24.10.2018 12:43:25",
    amount: "-350,00",
    category: "Рестораны",
    description: "KAFE DEDUSHKA KHO",
  }),
  row({
    opDate: "21.10.2018 18:33:22",
    payDate: "24.10.2018",
    amount: "-500,00",
    category: "Аптеки",
    description: "Горздрав",
  }),
  row({
    opDate: "20.10.2018 10:00:00",
    payDate: "20.10.2018",
    amount: "-220,00",
    category: "Такси",
    description: "Яндекс Такси",
  }),
  row({
    opDate: "19.10.2018 09:00:00",
    payDate: "19.10.2018",
    amount: "50000,00",
    category: "Пополнения",
    description: "Зарплата",
  }),
  row({
    opDate: "18.10.2018 09:00:00",
    payDate: "18.10.2018",
    status: "AUTHORIZED",
    amount: "-100,00",
    description: "Hold",
  }),
  row({
    opDate: "17.10.2018 09:00:00",
    payDate: "17.10.2018",
    amount: "-10,00",
    currency: "USD",
    description: "Abroad",
  }),
  row({
    opDate: "16.10.2018 09:00:00",
    payDate: "16.10.2018",
    amount: "-99,00",
    category: "Переводы",
    description: "Перевод Маме",
  }),
  row({
    opDate: "32.13.2018 09:00:00",
    payDate: "32.13.2018",
    amount: "-10,00",
    description: "Bad date",
  }),
].join("\r\n");

function encodeWin1251(s: string): Buffer {
  const bytes: number[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code < 128) bytes.push(code);
    else if (code === 0x0401) bytes.push(0xa8);
    else if (code === 0x0451) bytes.push(0xb8);
    else if (code >= 0x0410 && code <= 0x044f) bytes.push(code - 0x0410 + 0xc0);
    else throw new Error(`no windows-1251 for ${ch}`);
  }
  return Buffer.from(bytes);
}

const FAMILY_CATEGORIES = [
  { id: "food", name: "Продукты" },
  { id: "home", name: "Быт" },
  { id: "pharm", name: "Аптека" },
  { id: "ride", name: "Транспорт" },
  { id: "other", name: "Другое" },
];

describe("tbank csv", () => {
  it("decodes windows-1251 statements", () => {
    const text = decodeTbankCsv(encodeWin1251(TBANK_CSV_FIXTURE));
    expect(text).toContain("Дата операции");
    expect(text).toContain("Пятерочка");
  });

  it("imports expenses and skips income, holds, and non-RUB", () => {
    const parsed = parseTbankCsv(TBANK_CSV_FIXTURE);
    expect(parsed.skippedOther).toBe(3);
    expect(parsed.errors).toEqual([{ line: 10, message: "Невалидная дата" }]);
    expect(parsed.expenses.map((row) => row.title)).toEqual([
      "Пятерочка",
      "KAFE DEDUSHKA KHO",
      "Горздрав",
      "Яндекс Такси",
      "Перевод Маме",
    ]);
    expect(parsed.expenses[0].amount).toBe(1053.77);
    expect(parsed.expenses[0].spentAt.toISOString().slice(0, 10)).toBe("2018-10-24");
  });

  it("maps bank categories onto family ones", () => {
    expect(mapTbankCategory("Супермаркеты", FAMILY_CATEGORIES)).toBe("food");
    expect(mapTbankCategory("Рестораны", FAMILY_CATEGORIES)).toBe("food");
    expect(mapTbankCategory("Аптеки", FAMILY_CATEGORIES)).toBe("pharm");
    expect(mapTbankCategory("Такси", FAMILY_CATEGORIES)).toBe("ride");
    expect(mapTbankCategory("ЖКХ", FAMILY_CATEGORIES)).toBe("home");
    expect(mapTbankCategory("Переводы/иб", FAMILY_CATEGORIES)).toBe("other");
    expect(mapTbankCategory("Быт", FAMILY_CATEGORIES)).toBe("home");
    expect(mapTbankCategory("Маркетплейсы", FAMILY_CATEGORIES)).toBe("home");
  });

  it("parses the current T-Bank operations export", () => {
    const csv = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/tbank-operations-2026-07.csv"),
      "utf8",
    );
    const parsed = parseTbankCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.skippedOther).toBe(8);
    expect(parsed.expenses).toHaveLength(8);
    expect(parsed.expenses.map((row) => row.title)).toEqual([
      "Снятие в банкомате ATM 60026492",
      "Ozon",
      "Яндекс Плюс",
      "Яндекс Плюс",
      "Яндекс Плюс",
      "Gurme  Universam",
      "Rostic's",
      "Rostic's",
    ]);
    expect(parsed.expenses[0].amount).toBe(25000);
    expect(parsed.expenses[1].amount).toBe(2273);
    expect(parsed.expenses[1].bankCategory).toBe("Маркетплейсы");
    expect(parsed.expenses[5].bankCategory).toBe("Супермаркеты");
  });

  it("rejects a file that is not a T-Bank statement", () => {
    expect(() => parseTbankCsv("Date,Amount\n1,2")).toThrow("Это не выписка Т-Банка");
    expect(() => decodeTbankCsv(Buffer.from("hello"))).toThrow("Это не выписка Т-Банка");
  });

  it("builds a stable fingerprint from operation fields", () => {
    const a = tbankFingerprint({
      operationDateTime: "24.10.2018 16:29:51",
      paymentAmount: "-1053,77",
      description: "Пятерочка",
      cardMask: "*1140",
    });
    const b = tbankFingerprint({
      operationDateTime: "24.10.2018 16:29:51",
      paymentAmount: "-1053,77",
      description: "Пятерочка",
      cardMask: "*1140",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

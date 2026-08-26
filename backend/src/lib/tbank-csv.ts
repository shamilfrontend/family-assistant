import { createHash } from "node:crypto";
import { validation } from "./errors.js";
import { parseDateOnly } from "./validate.js";

export const TBANK_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const TBANK_CSV_MAX_ROWS = 5000;

const AMOUNT_PAIRS = [
  ["Сумма платежа", "Валюта платежа"],
  ["Сумма в валюте счёта", "Валюта счёта"],
  ["Сумма операции", "Валюта операции"],
] as const;

const CATEGORY_COLUMNS = ["Ваша категория", "Категория по-умолчанию", "Категория"] as const;

const CATEGORY_MAP: Record<string, string> = {
  супермаркеты: "Продукты",
  фастфуд: "Продукты",
  рестораны: "Продукты",
  аптеки: "Аптека",
  аптека: "Аптека",
  транспорт: "Транспорт",
  такси: "Транспорт",
  азс: "Транспорт",
  "ж/д": "Транспорт",
  авиабилеты: "Транспорт",
  жкх: "Быт",
  связь: "Быт",
  "дом и ремонт": "Быт",
  канцтовары: "Быт",
  животные: "Быт",
  маркетплейсы: "Быт",
};

export type TbankParseError = { line: number; message: string };

export type ParsedTbankExpense = {
  title: string;
  amount: number;
  spentAt: Date;
  bankCategory: string;
  fingerprint: string;
};

export type ParsedTbankCsv = {
  expenses: ParsedTbankExpense[];
  skippedOther: number;
  errors: TbankParseError[];
};

export function decodeTbankCsv(buffer: Buffer): string {
  if (buffer.length === 0) throw validation("Пустой файл");
  let utf8Start = 0;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    utf8Start = 3;
  }
  const utf8 = buffer.subarray(utf8Start).toString("utf8");
  if (utf8.includes("Дата операции")) return utf8;
  const win = new TextDecoder("windows-1251").decode(buffer);
  if (win.includes("Дата операции")) return win;
  throw validation("Это не выписка Т-Банка");
}

export function parseTbankCsv(text: string): ParsedTbankCsv {
  const rows = parseDelimited(text);
  if (rows.length === 0) throw validation("Это не выписка Т-Банка");
  const header = rows[0].map((cell) => cell.trim());
  const index = columnIndex(header);
  const dataRows = rows.slice(1);
  if (dataRows.length > TBANK_CSV_MAX_ROWS) {
    throw validation(`Слишком много строк (больше ${TBANK_CSV_MAX_ROWS})`);
  }

  const expenses: ParsedTbankExpense[] = [];
  const errors: TbankParseError[] = [];
  let skippedOther = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const line = i + 2;
    const row = dataRows[i];
    if (row.every((cell) => cell.trim() === "")) continue;
    try {
      const parsed = parseDataRow(row, index);
      if (!parsed) {
        skippedOther += 1;
        continue;
      }
      expenses.push(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Битая строка";
      errors.push({ line, message });
    }
  }

  return { expenses, skippedOther, errors };
}

export function mapTbankCategory(
  bankCategory: string,
  familyCategories: { id: string; name: string }[],
): string {
  if (familyCategories.length === 0) throw validation("Нет категорий бюджета");
  const bankKey = bankCategory.split("/")[0].trim().toLowerCase();
  const exact = familyCategories.find(
    (c) => c.name.toLowerCase() === bankCategory.trim().toLowerCase() || c.name.toLowerCase() === bankKey,
  );
  if (exact) return exact.id;

  let mapped: string | undefined;
  for (const [from, to] of Object.entries(CATEGORY_MAP)) {
    if (bankKey === from || bankKey.startsWith(from)) {
      mapped = to;
      break;
    }
  }
  if (mapped) {
    const found = familyCategories.find((c) => c.name.toLowerCase() === mapped.toLowerCase());
    if (found) return found.id;
  }

  const other = familyCategories.find((c) => c.name.toLowerCase() === "другое");
  return (other ?? familyCategories[familyCategories.length - 1]).id;
}

export function tbankFingerprint(parts: {
  operationDateTime: string;
  paymentAmount: string;
  description: string;
  cardMask: string;
}): string {
  return createHash("sha256")
    .update(
      [parts.operationDateTime, parts.paymentAmount, parts.description, parts.cardMask].join("|"),
      "utf8",
    )
    .digest("hex");
}

function columnIndex(header: string[]): Record<string, number> {
  const map = new Map(header.map((name, i) => [name, i]));
  if (!map.has("Дата операции") || !map.has("Статус") || !map.has("Описание")) {
    throw validation("Это не выписка Т-Банка");
  }
  const hasAmount = AMOUNT_PAIRS.some(([amount]) => map.has(amount));
  const hasCategory = CATEGORY_COLUMNS.some((name) => map.has(name));
  if (!hasAmount || !hasCategory) throw validation("Это не выписка Т-Банка");
  return Object.fromEntries(map);
}

function isCompletedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "ok" || normalized === "ок";
}

function pickAmount(row: string[], index: Record<string, number>): { raw: string; currency: string } | null {
  for (const [amountCol, currencyCol] of AMOUNT_PAIRS) {
    if (index[amountCol] === undefined) continue;
    const raw = cell(row, index[amountCol]);
    if (!raw) continue;
    return { raw, currency: cell(row, index[currencyCol]) };
  }
  return null;
}

function pickCategory(row: string[], index: Record<string, number>): string {
  for (const name of CATEGORY_COLUMNS) {
    const value = cell(row, index[name]);
    if (value) return value;
  }
  return "";
}

function parseDataRow(row: string[], index: Record<string, number>): ParsedTbankExpense | null {
  const operationDateTime = cell(row, index["Дата операции"]);
  const paymentDate = cell(row, index["Дата платежа"]);
  const cardMask = cell(row, index["Номер карты"]);
  const status = cell(row, index["Статус"]);
  const amountFields = pickAmount(row, index);
  const bankCategory = pickCategory(row, index);
  const description = cell(row, index["Описание"]);

  if (!isCompletedStatus(status)) return null;
  if (!amountFields) throw new Error("Невалидная сумма");
  if (amountFields.currency.toUpperCase() !== "RUB") return null;
  const paymentAmountRaw = amountFields.raw;
  const signed = parseMoney(paymentAmountRaw);
  if (signed === null) throw new Error("Невалидная сумма");
  if (signed >= 0) return null;

  const amount = Math.round(Math.abs(signed) * 100) / 100;
  if (amount <= 0 || amount > 99_999_999.99) return null;

  const title = description.trim().slice(0, 80);
  if (!title) return null;

  const dateRaw = paymentDate || operationDateTime;
  const spentAt = parseTbankDate(dateRaw);
  if (!spentAt) throw new Error("Невалидная дата");

  return {
    title,
    amount,
    spentAt,
    bankCategory,
    fingerprint: tbankFingerprint({
      operationDateTime,
      paymentAmount: paymentAmountRaw,
      description,
      cardMask,
    }),
  };
}

function parseTbankDate(raw: string): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(raw.trim());
  if (!match) return null;
  try {
    return parseDateOnly(`${match[3]}-${match[2]}-${match[1]}`, "spentAt");
  } catch {
    return null;
  }
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/\u00a0/g, "").replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function cell(row: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= row.length) return "";
  return row[idx].trim();
}

function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

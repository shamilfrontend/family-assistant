import type { Request } from "express";
import { validation } from "./errors.js";

export type MultipartFile = {
  filename: string;
  buffer: Buffer;
};

export async function readMultipartFile(
  req: Request,
  fieldName: string,
  maxBytes: number,
): Promise<MultipartFile> {
  const contentType = req.headers["content-type"] ?? "";
  const match = /multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) throw validation("Ожидается файл CSV");
  const boundary = (match[1] ?? match[2]).trim();
  if (!boundary) throw validation("Ожидается файл CSV");

  const body = await readRawBody(req, maxBytes + 128 * 1024);
  const parts = splitMultipart(body, boundary);
  for (const part of parts) {
    const parsed = parsePart(part);
    if (!parsed || parsed.name !== fieldName) continue;
    if (parsed.buffer.length === 0) throw validation("Пустой файл");
    if (parsed.buffer.length > maxBytes) throw validation("Файл слишком большой");
    return { filename: parsed.filename, buffer: parsed.buffer };
  }
  throw validation("Ожидается файл CSV");
}

function readRawBody(req: Request, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.unpipe();
        req.resume();
        reject(validation("Файл слишком большой"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = indexOf(body, delim, 0);
  while (start !== -1) {
    start += delim.length;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
    if (body[start] === 0x0d) start += 1;
    if (body[start] === 0x0a) start += 1;
    const end = indexOf(body, delim, start);
    if (end === -1) break;
    let sliceEnd = end;
    if (sliceEnd > 0 && body[sliceEnd - 1] === 0x0a) sliceEnd -= 1;
    if (sliceEnd > 0 && body[sliceEnd - 1] === 0x0d) sliceEnd -= 1;
    parts.push(body.subarray(start, sliceEnd));
    start = end;
  }
  return parts;
}

function parsePart(part: Buffer): { name: string; filename: string; buffer: Buffer } | null {
  const headerEnd = indexOf(part, Buffer.from("\r\n\r\n"), 0);
  const lfHeaderEnd = headerEnd === -1 ? indexOf(part, Buffer.from("\n\n"), 0) : -1;
  let headers: string;
  let bodyStart: number;
  if (headerEnd !== -1) {
    headers = part.subarray(0, headerEnd).toString("utf8");
    bodyStart = headerEnd + 4;
  } else if (lfHeaderEnd !== -1) {
    headers = part.subarray(0, lfHeaderEnd).toString("utf8");
    bodyStart = lfHeaderEnd + 2;
  } else {
    return null;
  }
  const disposition = headers.split(/\r?\n/).find((line) => /^content-disposition:/i.test(line));
  if (!disposition) return null;
  const name = /name="([^"]*)"/i.exec(disposition)?.[1];
  if (!name) return null;
  const filename = /filename="([^"]*)"/i.exec(disposition)?.[1] ?? "";
  return { name, filename, buffer: part.subarray(bodyStart) };
}

function indexOf(haystack: Buffer, needle: Buffer, from: number): number {
  return haystack.indexOf(needle, from);
}

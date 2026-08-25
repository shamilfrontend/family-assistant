import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof SyntaxError) {
    res.status(422).json({
      error: { code: "validation", message: "Невалидное тело" },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({
      error: { code: "conflict", message: "Email уже занят" },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: "internal", message: "Внутренняя ошибка" },
  });
}

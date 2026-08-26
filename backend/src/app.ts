import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { familyRouter } from "./routes/family.js";
import { membersRouter } from "./routes/members.js";
import { invitesRouter } from "./routes/invites.js";
import { eventsRouter } from "./routes/events.js";
import { remindersRouter } from "./routes/reminders.js";
import { purchasesRouter } from "./routes/purchases.js";
import { tasksRouter } from "./routes/tasks.js";
import { documentsRouter } from "./routes/documents.js";
import { healthRecordsRouter } from "./routes/health-records.js";
import { chatsRouter } from "./routes/chats.js";
import { errorHandler } from "./middleware/error.js";
import { AppError } from "./lib/errors.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/family", familyRouter);
  app.use("/api/v1/members", membersRouter);
  app.use("/api/v1/invites", invitesRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/reminders", remindersRouter);
  app.use("/api/v1/purchases", purchasesRouter);
  app.use("/api/v1/tasks", tasksRouter);
  app.use("/api/v1/documents", documentsRouter);
  app.use("/api/v1/health-records", healthRecordsRouter);
  app.use("/api/v1/chats", chatsRouter);

  app.use("/api", (_req, _res, next) => {
    next(new AppError("not_found", "Не найдено"));
  });

  app.use(errorHandler);
  return app;
}

import type { Prisma, Purchase } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createPurchase, serializePurchase } from "../lib/purchases.js";
import { forbidden, notFound, validation } from "../lib/errors.js";
import { requireAdult, requireAuth } from "../middleware/auth.js";
import type { Actor } from "../lib/serialize.js";
import {
  asRecord,
  optionalPurchaseCategory,
  parseBoolean,
  parsePurchaseCategory,
  parseQuantity,
  parseTitle,
} from "../lib/validate.js";

export const purchasesRouter = Router();

async function loadPurchase(familyId: string, id: string): Promise<Purchase> {
  const purchase = await prisma.purchase.findFirst({ where: { id, familyId } });
  if (!purchase) throw notFound();
  return purchase;
}

function isOwn(actor: Actor, purchase: Purchase): boolean {
  return purchase.addedByMemberId === actor.memberId;
}

purchasesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const bought = typeof req.query.bought === "string" ? req.query.bought : "all";
    if (bought !== "all" && bought !== "true" && bought !== "false") {
      throw validation("bought: true, false или all");
    }
    const where: Prisma.PurchaseWhereInput = { familyId: req.actor!.familyId };
    if (bought === "true") where.isBought = true;
    if (bought === "false") where.isBought = false;

    const items = await prisma.purchase.findMany({
      where,
      orderBy: [{ isBought: "asc" }, { createdAt: "desc" }],
    });
    res.json({ items: items.map(serializePurchase) });
  } catch (err) {
    next(err);
  }
});

purchasesRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const body = asRecord(req.body);
    const actor = req.actor!;
    const quantity = body.quantity === undefined ? undefined : parseQuantity(body.quantity);
    const purchase = await createPurchase({
      familyId: actor.familyId,
      addedByMemberId: actor.memberId,
      title: parseTitle(body.title),
      category: optionalPurchaseCategory(body.category) ?? "OTHER",
      quantity,
    });
    res.status(201).json(serializePurchase(purchase));
  } catch (err) {
    next(err);
  }
});

purchasesRouter.post("/clear-bought", requireAuth, requireAdult, async (req, res, next) => {
  try {
    await prisma.purchase.deleteMany({
      where: { familyId: req.actor!.familyId, isBought: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

purchasesRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const body = asRecord(req.body);
    const purchase = await loadPurchase(actor.familyId, req.params.id);
    const data: Prisma.PurchaseUpdateInput = {};

    if (actor.role === "CHILD") {
      if (body.isBought === false) throw forbidden();
      if (body.isBought === true) data.isBought = true;

      const wantsFields =
        body.title !== undefined || body.category !== undefined || body.quantity !== undefined;
      if (wantsFields) {
        if (!isOwn(actor, purchase) || purchase.isBought) throw forbidden();
        if (body.title !== undefined) data.title = parseTitle(body.title);
        if (body.category !== undefined) data.category = parsePurchaseCategory(body.category);
        if (body.quantity !== undefined) data.quantity = parseQuantity(body.quantity);
      }

      if (Object.keys(data).length === 0) throw validation("Нечего менять");
    } else {
      if (body.title !== undefined) data.title = parseTitle(body.title);
      if (body.category !== undefined) data.category = parsePurchaseCategory(body.category);
      if (body.quantity !== undefined) data.quantity = parseQuantity(body.quantity);
      if (body.isBought !== undefined) data.isBought = parseBoolean(body.isBought, "isBought");
      if (Object.keys(data).length === 0) throw validation("Нечего менять");
    }

    const updated = await prisma.purchase.update({
      where: { id: purchase.id },
      data,
    });
    res.json(serializePurchase(updated));
  } catch (err) {
    next(err);
  }
});

purchasesRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = req.actor!;
    const purchase = await loadPurchase(actor.familyId, req.params.id);
    if (actor.role === "CHILD") {
      if (!isOwn(actor, purchase) || purchase.isBought) throw forbidden();
    }
    await prisma.purchase.delete({ where: { id: purchase.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

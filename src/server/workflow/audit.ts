import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb, type Tx } from "../db";

export interface AuditInput {
  actorType: "system" | "student" | "admin" | "provider";
  actorId?: string | null;
  eventType: string;
  entityType: "attempt" | "payment" | "report" | "job" | "admin_session";
  entityId: string;
  correlationId?: string | null;
  /** Keep minimal and free of personal data, answers and provider payloads. */
  metadata?: Prisma.InputJsonValue;
}

export async function recordAudit(input: AuditInput, tx?: Tx): Promise<void> {
  const db = tx ?? getDb();
  await db.auditEvent.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata,
    },
  });
}

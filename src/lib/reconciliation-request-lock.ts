import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Creates a maker request only when the record it concerns has none still
 * awaiting a checker, and returns null when one does.
 *
 * A plain "find pending, then create" lets two near-simultaneous submissions
 * (a double click, two makers on the same row) both see nothing pending and
 * both insert. Holding a Postgres advisory lock keyed on the record for the
 * length of the transaction makes the check and the insert one step: the
 * second submission waits, then sees the first one's request.
 *
 * An advisory lock rather than a partial unique index because the schema is
 * applied with `prisma db push`, which can't express one and would drop it.
 */
export async function createIfNoPendingRequest<T>(
  lockKey: string,
  hasPending: (tx: Prisma.TransactionClient) => Promise<boolean>,
  create: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
    if (await hasPending(tx)) return null
    return create(tx)
  })
}

export const PENDING_REQUEST_EXISTS_ERROR =
  'This transaction already has a request awaiting approval. It must be approved or rejected before another can be submitted.'

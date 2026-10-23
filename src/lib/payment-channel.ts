/**
 * Payment channels as the reconciliation team sees them. NIB Bank payments
 * share paymentMethod BANK, so they are split by source: merchant-initiated
 * push/link, our own QR checkout (ids are always `qr_…`), and EXTERNAL credits
 * core banking reports from the NIB interoperable merchant QR.
 *
 * Shared by the payment and cashback reconciliation tabs and their APIs.
 */

export const CHANNEL_LABELS: Record<string, string> = {
  BANK_PUSH: 'NIB Bank Push',
  BANK_QR: 'Internal QR',
  EXTERNAL: 'Interoperable QR',
  TELEBIRR: 'Telebirr',
  YAGOUT: 'YagoutPay',
  MPGS: 'Card (MPGS)',
}

export type ChannelSource = { id?: string | null; origin?: string | null; paymentMethod?: string | null }

export function channelLabel(tx?: ChannelSource | null) {
  if (!tx) return ''
  if (tx.origin === 'EXTERNAL') return CHANNEL_LABELS.EXTERNAL
  if (tx.paymentMethod === 'BANK') return tx.id?.startsWith('qr_') ? CHANNEL_LABELS.BANK_QR : CHANNEL_LABELS.BANK_PUSH
  return CHANNEL_LABELS[tx.paymentMethod ?? ''] ?? tx.paymentMethod ?? ''
}

/** Prisma `Transaction` filter for each channel. */
export const CHANNEL_WHERE: Record<string, object> = {
  BANK_PUSH: { paymentMethod: 'BANK', origin: 'INTERNAL', NOT: { id: { startsWith: 'qr_' } } },
  BANK_QR: { paymentMethod: 'BANK', origin: 'INTERNAL', id: { startsWith: 'qr_' } },
  EXTERNAL: { origin: 'EXTERNAL' },
  TELEBIRR: { paymentMethod: 'TELEBIRR' },
  YAGOUT: { paymentMethod: 'YAGOUT' },
  MPGS: { paymentMethod: 'MPGS' },
}

/** The payment's FT: our settlement receipt, or core banking's transactionId for an external credit. */
export function paymentFt(tx?: { cbsreference?: string | null; externalReference?: string | null; origin?: string | null } | null) {
  if (!tx) return ''
  return tx.cbsreference || (tx.origin === 'EXTERNAL' ? tx.externalReference : null) || ''
}

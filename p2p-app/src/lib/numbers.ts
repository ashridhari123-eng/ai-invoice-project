import type { TxClient } from "@/lib/db";

export const DOC_ENTITY_VENDOR = "VENDOR";
export const DOC_ENTITY_ITEM = "ITEM";
export const DOC_ENTITY_PR = "PR";
export const DOC_ENTITY_PO = "PO";
export const DOC_ENTITY_INVOICE = "INVOICE";
export const DOC_ENTITY_RFQ = "RFQ";
export const DOC_ENTITY_ADVANCE = "ADVANCE";
export const DOC_ENTITY_GRN = "GRN";

const PREFIXES: Record<string, string> = {
  [DOC_ENTITY_VENDOR]: "VN",
  [DOC_ENTITY_ITEM]: "IT",
  [DOC_ENTITY_PR]: "PR",
  [DOC_ENTITY_PO]: "PO",
  [DOC_ENTITY_INVOICE]: "IN",
  [DOC_ENTITY_RFQ]: "RFQ",
  [DOC_ENTITY_ADVANCE]: "ADV",
  [DOC_ENTITY_GRN]: "GRN",
};

export function formatDocNumber(
  entity: string,
  year: number,
  sequence: number,
): string {
  const prefix = PREFIXES[entity] ?? entity.slice(0, 2).toUpperCase();
  return `${prefix}/${year}/${String(sequence).padStart(5, "0")}`;
}

export async function nextDocNumber(
  tx: TxClient,
  orgId: string,
  entity: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const series = await tx.numberSeries.upsert({
    where: {
      orgId_entity_year: { orgId, entity, year },
    },
    update: { lastNumber: { increment: 1 } },
    create: { orgId, entity, year, lastNumber: 1 },
  });
  return formatDocNumber(entity, year, series.lastNumber);
}

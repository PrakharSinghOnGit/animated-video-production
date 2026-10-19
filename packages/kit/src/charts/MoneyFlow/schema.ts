import { z } from "zod";

export const MoneyFlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtext: z.string().optional(),
  color: z.string().default("#F5B83D"),
});

export const MoneyFlowTransferSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  amountLabel: z.string(),
});

export const MoneyFlowPropsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  nodes: z.array(MoneyFlowNodeSchema).min(2).max(4),
  transfers: z.array(MoneyFlowTransferSchema).min(1),
  flowColor: z.string().default("#F5B83D"),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type MoneyFlowProps = z.infer<typeof MoneyFlowPropsSchema>;
export type MoneyFlowNode = z.infer<typeof MoneyFlowNodeSchema>;
export type MoneyFlowTransfer = z.infer<typeof MoneyFlowTransferSchema>;

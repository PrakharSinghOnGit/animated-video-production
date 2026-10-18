import { z } from "zod";

export const SizeCompareItemSchema = z.object({
  label: z.string(),
  value: z.number(),
  displayValue: z.string().optional(),
  color: z.string().default("#F5B83D"),
  subtext: z.string().optional(),
});

export const SizeComparePropsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  items: z.array(SizeCompareItemSchema).min(2).max(3),
  unitPrefix: z.string().default(""),
  unitSuffix: z.string().default(""),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type SizeCompareProps = z.infer<typeof SizeComparePropsSchema>;
export type SizeCompareItem = z.infer<typeof SizeCompareItemSchema>;

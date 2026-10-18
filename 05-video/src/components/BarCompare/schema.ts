import { z } from "zod";

export const BarCompareItemSchema = z.object({
  label: z.string(),
  value: z.number(),
  formattedValue: z.string().optional(),
  color: z.string().default("#F5B83D"),
  highlight: z.boolean().default(false),
});

export const BarComparePropsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  items: z.array(BarCompareItemSchema).min(2),
  unitSuffix: z.string().default(""),
  unitPrefix: z.string().default(""),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type BarCompareProps = z.infer<typeof BarComparePropsSchema>;
export type BarCompareItem = z.infer<typeof BarCompareItemSchema>;

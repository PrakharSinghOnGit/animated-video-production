import { z } from "zod";

export const LineDataPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number(),
  label: z.string().optional(),
});

export const LineDrawPropsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  data: z.array(LineDataPointSchema).min(3),
  unitPrefix: z.string().default(""),
  unitSuffix: z.string().default(""),
  color: z.string().default("#F5B83D"),
  peakCallout: z.string().optional(),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type LineDrawProps = z.infer<typeof LineDrawPropsSchema>;
export type LineDataPoint = z.infer<typeof LineDataPointSchema>;

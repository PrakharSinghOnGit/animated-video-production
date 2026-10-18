import { z } from "zod";

export const BigNumberPropsSchema = z.object({
  value: z.number().describe("Final target numeric value"),
  startValue: z.number().optional().default(0).describe("Starting numeric value for count-up"),
  prefix: z.string().optional().default("").describe("Prefix symbol e.g. '$'"),
  suffix: z.string().optional().default("").describe("Suffix unit e.g. 'T', 'B', '%'"),
  decimals: z.number().optional().default(1).describe("Number of decimal places"),
  label: z.string().describe("Descriptive label below the metric"),
  sublabel: z.string().optional().describe("Optional secondary context label"),
  accentColor: z.string().optional().default("#F5B83D").describe("Color of the big numeral"),
  countUpDurationFrames: z.number().optional().default(30).describe("Duration of count-up animation in frames"),
  enterAtFrame: z.number().optional().default(0),
  exitAtFrame: z.number().optional(),
  landingFrame: z.number().optional().describe("Specific frame where count-up completes"),
});

export type BigNumberProps = z.input<typeof BigNumberPropsSchema>;

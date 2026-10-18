import { z } from "zod";

export const IconGridPropsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  totalCount: z.number().default(100),
  highlightCount: z.number().default(1),
  highlightLabel: z.string().default("Top 1%"),
  remainingLabel: z.string().default("Remaining 99%"),
  highlightColor: z.string().default("#F5B83D"),
  baseColor: z.string().default("#2A3749"),
  iconType: z.enum(["person", "square", "coin"]).default("person"),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type IconGridProps = z.infer<typeof IconGridPropsSchema>;

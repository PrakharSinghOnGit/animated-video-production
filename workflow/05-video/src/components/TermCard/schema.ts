import { z } from "zod";

export const TermCardPropsSchema = z.object({
  term: z.string().describe("The financial term being defined"),
  definition: z.string().describe("Short 1-2 sentence definition"),
  category: z.string().optional().describe("Category label e.g. 'MARKET ARCHITECTURE'"),
  highlightWord: z.string().optional().describe("Specific word in definition to underline"),
  accentColor: z.string().default("#F5B83D"),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type TermCardProps = z.infer<typeof TermCardPropsSchema>;

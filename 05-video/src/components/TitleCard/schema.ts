import { z } from "zod";

export const TitleCardPropsSchema = z.object({
  title: z.string().describe("Main bold headline"),
  subtitle: z.string().optional().describe("Contextual supporting line"),
  chapterBadge: z.string().optional().describe("Optional chapter tag e.g. 'CHAPTER 01'"),
  accentColor: z.string().default("#F5B83D"),
  enterAtFrame: z.number().default(0),
  exitAtFrame: z.number().optional(),
});

export type TitleCardProps = z.infer<typeof TitleCardPropsSchema>;

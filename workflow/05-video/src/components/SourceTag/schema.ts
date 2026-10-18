import { z } from "zod";

export const SourceTagPropsSchema = z.object({
  text: z.string().describe("Citation source string e.g. 'BIS Triennial Survey 2025'"),
  dataRef: z.string().optional(),
  color: z.string().optional().default("#8A97A6"),
  dotColor: z.string().optional().default("#3DDC97"),
  enterAtFrame: z.number().optional().default(0),
});

export type SourceTagProps = z.input<typeof SourceTagPropsSchema>;

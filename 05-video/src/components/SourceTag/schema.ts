import { z } from "zod";

export const SourceTagPropsSchema = z.object({
  text: z.string().describe("Citation source string e.g. 'BIS Triennial Survey 2025'"),
  dataRef: z.string().optional(),
  color: z.string().default("#8A97A6"),
  dotColor: z.string().default("#3DDC97"),
  enterAtFrame: z.number().default(0),
});

export type SourceTagProps = z.infer<typeof SourceTagPropsSchema>;

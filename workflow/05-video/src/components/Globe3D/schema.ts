import { z } from "zod";

export const Globe3DPropsSchema = z.object({
  title: z.string().optional().default("Global Currency Corridors"),
  subtitle: z.string().optional().default("Interbank Settlement Network (24/7 Continuous Liquidity)"),
  rotationSpeed: z.number().optional().default(0.015),
  glowColor: z.string().optional().default("#F5B83D"),
  nodeColor: z.string().optional().default("#2EC4B6"),
  enterAtFrame: z.number().optional().default(0),
});

export type Globe3DProps = z.input<typeof Globe3DPropsSchema>;

/** Plan step: the director's plan, moving it to a new voice, validation. */
import { B, args, modelOpt, styles, type Action } from "./base";

export const planActions: Record<string, Action> = {
  "plan.run": {
    step: "plan", label: "Plan acts", help: "The director splits the narration into ~10 acts with beats, hits and sourced data.", paid: "~$1.5", long: "~6 min",
    opts: [
      modelOpt("director", "Director model", "--model"),
      { key: "style", label: "House style", type: "select", choices: styles(), def: "briefing", flag: "--style" },
    ],
    build: (ws, o) => [B("direct", "--video", ws, ...args(o, "plan.run"))],
  },
  "plan.replan": { step: "plan", label: "Update plan to the new voice", help: "Free, no model. Moves every act and beat to the current voice by matching its words to the ones the plan was made from (Align runs this itself). Acts whose words didn't change keep their drawing; acts whose narration changed are listed under Acts → Update changed acts. Refuses when more than half the narration changed (plan again then).", long: "seconds",
    build: (ws) => [B("replan", "--video", ws)] },
  "plan.check": { step: "plan", label: "Validate plan", help: "Re-checks acts.json without calling a model.", build: (ws) => [B("direct", "--video", ws, "--check")] },
};

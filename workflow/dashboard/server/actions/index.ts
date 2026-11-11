/** The action registry, filled once in the order the page lists the actions. Everything else imports from here. */
import { ACTIONS } from "./base";
import { scriptActions } from "./script";
import { voiceActions } from "./voice";
import { alignActions } from "./align";
import { planActions } from "./plan";
import { actsActions } from "./acts";
import { soundActions } from "./sound";
import { renderActions } from "./render";
import { publishActions } from "./publish";
import { shortsActions, shortsReviewActions, shortStageActions } from "./shorts";
import { deliverActions } from "./deliver";
import { housekeepingActions } from "./housekeeping";

Object.assign(ACTIONS, scriptActions, voiceActions, alignActions, planActions, actsActions, soundActions, renderActions, publishActions,
  shortsActions, deliverActions, shortsReviewActions, housekeepingActions, shortStageActions);

export { ACTIONS, B, args, commandFor, locksFor, schema, type Action, type Opt } from "./base";

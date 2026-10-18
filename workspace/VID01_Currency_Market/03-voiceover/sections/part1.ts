import type { VOSection } from "../types";

export const part1Sections: VOSection[] = [
  {
    id: "part1_01_shadow_market",
    part: 1,
    partTitle: "PART 1: THE HOOK",
    clips: "CLIP 1 & 2 [0:00–0:06]",
    rawInstruction: "Intense, dramatic, hushed movie-trailer tone",
    // Ported prosody: Hushed, deliberate pacing, lowered pitch for trailer resonance
    pace: 0.88,
    pitch: -0.15,
    loudness: 0.90,
    text: "There is a shadow market out there... that is bigger than the stock market, bigger than the bond market... and makes the entire crypto market look like loose change found under a couch cushion.",
    notes: "Dramatic hook opening; pauses before comparisons give weight to scale."
  },
  {
    id: "part1_02_building_speed",
    part: 1,
    partTitle: "PART 1: THE HOOK",
    clips: "CLIP 3 & 4 [0:06–0:13]",
    rawInstruction: "Building speed and urgency",
    // Ported prosody: Accelerating tempo, heightened urgency and volume
    pace: 1.18,
    pitch: 0.05,
    loudness: 1.15,
    text: "Overnight, this single market can spike the price of oil, vaporize billions of dollars from corporate profits, ruin your summer holiday budget, and make entire nations either filthy rich or dangerously vulnerable!",
    notes: "Rapid escalation of stakes across global, corporate, and individual levels."
  },
  {
    id: "part1_03_7_trillion",
    part: 1,
    partTitle: "PART 1: THE HOOK",
    clips: "CLIP 5 & 6 [0:13–0:20]",
    rawInstruction: "Heavy emphasis on the number",
    // Ported prosody: Decelerated pace for impact, strong loudness gain on the massive figure
    pace: 0.94,
    pitch: 0.00,
    loudness: 1.25,
    text: "It's called the Foreign Exchange market—or FX—the arena where money itself is bought and sold, to the tune of more than 7 trillion dollars every single day!",
    notes: "Heavy landing on the $7 trillion stat."
  },
  {
    id: "part1_04_secret_scoreboard",
    part: 1,
    partTitle: "PART 1: THE HOOK",
    clips: "CLIP 7 [0:20–0:24]",
    rawInstruction: "Conspiratorial, intriguing",
    // Ported prosody: Subdued pitch, intimate intrigue, setting up the trap
    pace: 0.92,
    pitch: -0.12,
    loudness: 0.92,
    text: "Most people have zero clue it even exists... let alone how a secret scoreboard behind it dictates the price of everything you own, and how one single trap inside it destroys nearly every beginner who tries to play the game.",
    notes: "Teaser cliffhanger leading directly into Part 2."
  }
];

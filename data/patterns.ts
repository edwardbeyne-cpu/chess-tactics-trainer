export interface Pattern {
  tier: number;
  tierLabel: string;
  name: string;
  icon: string;
  description: string;
  themes: string[];
}

const patterns: Pattern[] = [
  // ── Tier 1: Basic Tactics ──────────────────────────────────────────────────
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Fork",
    icon: "⚔️",
    description:
      "One piece attacks two or more enemy pieces simultaneously, forcing a material gain.",
    themes: ["FORK"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Pin",
    icon: "📌",
    description:
      "A piece is immobilized because moving it would expose a more valuable piece behind it.",
    themes: ["PIN", "ABSOLUTE PIN", "RELATIVE PIN"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Skewer",
    icon: "🗡️",
    description:
      "The opposite of a pin — a valuable piece is attacked and forced to move, exposing a piece behind it.",
    themes: ["SKEWER"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Discovered Attack",
    icon: "🔍",
    description:
      "Moving one piece reveals an attack by the piece behind it on an undefended target.",
    themes: ["DISCOVERED ATTACK", "DISCOVERED CHECK"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Back Rank Mate",
    icon: "🏰",
    description:
      "The enemy king is trapped on its back rank by its own pawns and mated by a rook or queen.",
    themes: ["BACK RANK MATE", "BACK RANK"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Smothered Mate",
    icon: "🐴",
    description:
      "A knight delivers checkmate to a king surrounded and blocked by its own pieces.",
    themes: ["SMOTHERED MATE"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Double Check",
    icon: "‼️",
    description:
      "Two pieces give check simultaneously — the king must move, no blocking or capturing is possible.",
    themes: ["DOUBLE CHECK"],
  },
  {
    tier: 1,
    tierLabel: "Tier 1 — Basic Tactics",
    name: "Overloading",
    icon: "⚖️",
    description:
      "A defending piece is given more tasks than it can handle, allowing material gain through a forcing sequence.",
    themes: ["OVERLOADING", "OVERLOADED PIECE"],
  },
  // ── Tier 2: Intermediate Tactics ──────────────────────────────────────────
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Greek Gift Sacrifice",
    icon: "🎁",
    description:
      "Bxh7+ (or Bxh2+) followed by a knight invasion and queen attack to force checkmate or win material.",
    themes: ["GREEK GIFT", "GREEK GIFT SACRIFICE"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Zwischenzug",
    icon: "⚡",
    description:
      "An 'in-between' move that disrupts the expected sequence, often a counter-threat before recapturing.",
    themes: ["ZWISCHENZUG", "IN-BETWEEN MOVE"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Deflection",
    icon: "↗️",
    description:
      "A piece is forced away from a key defensive duty, allowing a tactic that was previously impossible.",
    themes: ["DEFLECTION"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Decoy",
    icon: "🪤",
    description:
      "An enemy piece is lured to a specific square where it becomes vulnerable or creates a different weakness.",
    themes: ["DECOY", "LURING"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "X-Ray Attack",
    icon: "🔭",
    description:
      "A piece exerts influence through another piece — for example a rook 'x-raying' through a queen to the king.",
    themes: ["X-RAY", "X-RAY ATTACK"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Removing the Defender",
    icon: "🛡️",
    description:
      "The piece guarding a key square or another piece is captured or driven away.",
    themes: ["REMOVING THE DEFENDER", "UNDERMINING"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Interference",
    icon: "🚧",
    description:
      "A piece is sacrificed to block a line between two defending pieces, cutting off their coordination.",
    themes: ["INTERFERENCE"],
  },
  {
    tier: 2,
    tierLabel: "Tier 2 — Intermediate",
    name: "Perpetual Check",
    icon: "♾️",
    description:
      "A series of checks that the opponent cannot escape, forcing a draw or winning key concessions.",
    themes: ["PERPETUAL CHECK", "PERPETUAL"],
  },
  // ── Tier 3: Advanced Patterns ─────────────────────────────────────────────
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Windmill",
    icon: "🌀",
    description:
      "A rook and bishop (or queen) alternate discovered checks to strip the king of material repeatedly.",
    themes: ["WINDMILL"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Zugzwang",
    icon: "🎯",
    description:
      "The opponent is put in a position where any legal move worsens their position — being forced to move is a disadvantage.",
    themes: ["ZUGZWANG"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Rook Lift",
    icon: "🏗️",
    description:
      "A rook is repositioned via a rank (usually the 3rd) to a file for a powerful attacking entry.",
    themes: ["ROOK LIFT"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Queen Sacrifice",
    icon: "👑",
    description:
      "The queen is willingly given up for a decisive attack, mate, or overwhelming positional compensation.",
    themes: ["QUEEN SACRIFICE"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Positional Sacrifice",
    icon: "♟️",
    description:
      "Material is invested for long-term positional advantages — activity, king safety, or pawn structure — rather than immediate return.",
    themes: ["POSITIONAL SACRIFICE", "POSITIONAL"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Trapped Piece",
    icon: "🕸️",
    description:
      "An enemy piece is maneuvered into a position with no legal escape, winning it for free.",
    themes: ["TRAPPED PIECE", "TRAPPED"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "Fortress",
    icon: "🏯",
    description:
      "A set-up in which the defending side creates an impenetrable structure to hold a draw despite being down material.",
    themes: ["FORTRESS"],
  },
  {
    tier: 3,
    tierLabel: "Tier 3 — Advanced",
    name: "King March",
    icon: "🚶",
    description:
      "The king actively advances up the board to participate in the attack or to escort a passed pawn to promotion.",
    themes: ["KING MARCH", "KING ACTIVITY"],
  },
];

export default patterns;

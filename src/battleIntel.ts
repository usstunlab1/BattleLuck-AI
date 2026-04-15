export const SERVICE_VERSION = "1.1.0";

export type BattleEntityType = "warrior" | "mage" | "archer" | "tank" | "assassin" | "support";
export type BattleType = "quick" | "extended" | "siege";

type ConfidenceLevel = "low" | "medium" | "high";

type BaseStats = { hp: number; attack: number; defense: number; speed: number; magic: number };

export interface BattleStatsResult {
  name: string; type: BattleEntityType; level: number;
  hp: number; attack: number; defense: number; speed: number; magic: number;
  battlePower: number; criticalHitChance: number; abilities: string[];
}

export interface BattleQueryPlayerContext {
  steamId: string; recentEvents: string[];
  conversationSummary?: string; lastActivityUtc?: string;
}

export interface BattleQuerySessionPlayer {
  steamId: string; score: number; teamId?: number | null; isRequester?: boolean;
}

export interface BattleQuerySessionContext {
  sessionId: string; modeId: string; zoneHash: number;
  elapsedSeconds: number; timeLimitSeconds: number; isTimeUp: boolean;
  players: BattleQuerySessionPlayer[]; leaderboard: BattleQuerySessionPlayer[];
  teamScores?: Record<string, number>;
}

export interface BattleQueryEnrichmentRequest {
  query: string;
  player: BattleQueryPlayerContext;
  session?: BattleQuerySessionContext | null;
}

export interface BattleQueryEnrichmentResult {
  summary: string; tacticalFocus: string[]; answerHints: string[];
  confidence: ConfidenceLevel; detectedIntent: string; shouldEscalateToModel: boolean;
}

const BASE_STATS: Record<BattleEntityType, BaseStats> = {
  warrior:  { hp: 120, attack: 85,  defense: 90,  speed: 60,  magic: 30  },
  mage:     { hp: 80,  attack: 50,  defense: 40,  speed: 70,  magic: 120 },
  archer:   { hp: 90,  attack: 95,  defense: 55,  speed: 100, magic: 45  },
  tank:     { hp: 150, attack: 60,  defense: 120, speed: 40,  magic: 35  },
  assassin: { hp: 75,  attack: 110, defense: 45,  speed: 120, magic: 50  },
  support:  { hp: 85,  attack: 45,  defense: 60,  speed: 80,  magic: 100 },
};

const MODE_GUIDANCE: Record<string, string[]> = {
  bloodbath: [
    "Prioritize clean resets after every duel instead of chaining low-health re-engages.",
    "Track the kill leader and avoid getting pinched between active fights.",
    "Use mobility cooldowns to secure exits before committing your burst window.",
  ],
  colosseum: [
    "Play for cooldown trading and punish only after the opponent spends mobility.",
    "Small leads matter more than risky all-ins in 1v1 rounds.",
    "Respect defensive tempo and force predictable escape angles.",
  ],
  gauntlet: [
    "Treat incoming waves as resource checks and preserve defensive cooldowns for elite spikes.",
    "Keep movement efficient so ranged pressure does not split the group.",
    "Bank tempo between waves instead of overextending for one extra kill.",
  ],
  siege: [
    "Anchor one player on the objective while the rest control approach lanes.",
    "Win space first, then commit damage once the flank is covered.",
    "Frontline durability matters more than isolated picks during objective races.",
  ],
  trials: [
    "Route objectives in the fastest safe order and avoid dead time between transitions.",
    "Burst windows should line up with objective checkpoints, not random skirmishes.",
    "Stability beats greed when a timed challenge is already on pace.",
  ],
};

const MODE_KEYWORDS = Object.keys(MODE_GUIDANCE);

function clampLevel(level: number | undefined): number {
  if (!level || Number.isNaN(level)) return 1;
  return Math.max(1, Math.min(100, Math.round(level)));
}

function normalizeEntityType(entityType: string | undefined): BattleEntityType {
  const normalized = (entityType ?? "warrior").trim().toLowerCase();
  switch (normalized) {
    case "mage": case "sorcerer": case "caster": return "mage";
    case "archer": case "ranger": case "hunter": return "archer";
    case "tank": case "guardian": case "bruiser": return "tank";
    case "assassin": case "rogue": case "duelist": return "assassin";
    case "support": case "healer": case "controller": return "support";
    default: return "warrior";
  }
}

function normalizeBattleType(battleType: string | undefined): BattleType {
  const normalized = (battleType ?? "quick").trim().toLowerCase();
  return normalized === "extended" || normalized === "siege" ? normalized : "quick";
}

function normalizeMode(modeId: string | undefined): string {
  return (modeId ?? "unknown").trim().toLowerCase();
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lastItem<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

function uniqueItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function getModeTips(modeId: string): string[] {
  return MODE_GUIDANCE[modeId] ?? [
    "Play for information first and commit only once the win condition is clear.",
    "Use cooldown advantage instead of taking neutral fights.",
  ];
}

function detectModeFromText(text: string): string | undefined {
  const normalized = text.toLowerCase();
  return MODE_KEYWORDS.find((mode) => normalized.includes(mode));
}

function detectIntent(query: string): string {
  const normalized = query.toLowerCase();
  if (/(build|weapon|spell|ability|gear|loadout)/.test(normalized)) return "build";
  if (/(duel|1v1|colosseum|trade|outplay)/.test(normalized)) return "duel";
  if (/(survive|survival|live|defend|reset)/.test(normalized)) return "survival";
  if (/(objective|siege|capture|zone|point)/.test(normalized)) return "objective";
  if (/(command|syntax|how do i use|what does)/.test(normalized)) return "commands";
  return "general";
}

function buildStats(entityName: string, entityType: BattleEntityType, level: number): BattleStatsResult {
  const base = BASE_STATS[entityType];
  const scaledLevel = clampLevel(level);
  const multiplier = 1 + (scaledLevel - 1) * 0.08;
  const hp = Math.floor(base.hp * multiplier);
  const attack = Math.floor(base.attack * multiplier);
  const defense = Math.floor(base.defense * multiplier);
  const speed = Math.floor(base.speed * multiplier);
  const magic = Math.floor(base.magic * multiplier);
  return {
    name: entityName, type: entityType, level: scaledLevel,
    hp, attack, defense, speed, magic,
    battlePower: Math.floor((hp * 0.28) + (attack * 0.24) + (defense * 0.22) + (speed * 0.14) + (magic * 0.12)),
    criticalHitChance: Math.min(95, Math.floor(5 + scaledLevel * 0.3)),
    abilities: [`${capitalize(entityType)} Strike`, "Dodge", "Block"],
  };
}

function computeBattlePower(stats: BattleStatsResult, battleType: BattleType): number {
  const multipliers: Record<BattleType, BaseStats> = {
    quick:    { hp: 0.85, attack: 1.2,  defense: 0.85, speed: 1.15, magic: 1.0  },
    extended: { hp: 1.2,  attack: 1.0,  defense: 1.15, speed: 0.95, magic: 1.05 },
    siege:    { hp: 1.15, attack: 1.05, defense: 1.25, speed: 0.75, magic: 0.95 },
  };
  const weights = multipliers[battleType];
  return Math.round(
    (stats.hp * weights.hp * 0.24) + (stats.attack * weights.attack * 0.26) +
    (stats.defense * weights.defense * 0.22) + (stats.speed * weights.speed * 0.14) +
    (stats.magic * weights.magic * 0.14),
  );
}

function resolveRequester(session: BattleQuerySessionContext | null | undefined, steamId: string): BattleQuerySessionPlayer | undefined {
  if (!session) return undefined;
  return session.players.find((p) => p.isRequester) ?? session.players.find((p) => p.steamId === steamId);
}

function buildRankSummary(session: BattleQuerySessionContext, requester: BattleQuerySessionPlayer | undefined): string {
  const sortedLeaderboard = session.leaderboard.length > 0 ? session.leaderboard : session.players;
  const rank = sortedLeaderboard.findIndex((p) => p.steamId === requester?.steamId) + 1;
  const totalPlayers = session.players.length;
  const score = requester?.score ?? 0;
  if (rank <= 0) return `Current tracked score is ${score} across ${totalPlayers} active players.`;
  const leaderScore = sortedLeaderboard[0]?.score ?? score;
  const gap = Math.max(0, leaderScore - score);
  if (rank === 1) return `They are leading the lobby with ${score} points.`;
  return `They are rank ${rank} of ${totalPlayers} with ${score} points, ${gap} behind the current leader.`;
}

function buildRecentEventHint(recentEvent: string | undefined): string | undefined {
  if (!recentEvent) return undefined;
  const normalized = recentEvent.toLowerCase();
  if (normalized.includes("eliminated")) return "Recent pressure was negative, so emphasize reset timing, safer positioning, and cleaner cooldown trades.";
  if (normalized.includes("scored")) return "They have momentum right now, so emphasize tempo control and snowball denial on the next fight.";
  if (normalized.includes("started")) return "They are still in the opening phase, so focus on route discipline and early cooldown value.";
  return `Recent event context: ${recentEvent}`;
}

function buildTacticalFocus(request: BattleQueryEnrichmentRequest, modeId: string, intent: string): string[] {
  const focus = [...getModeTips(modeId).slice(0, 2)];
  const requester = resolveRequester(request.session, request.player.steamId);
  const recentEvent = lastItem(request.player.recentEvents);
  if (request.session && requester) {
    const sortedLeaderboard = request.session.leaderboard.length > 0 ? request.session.leaderboard : request.session.players;
    const rank = sortedLeaderboard.findIndex((p) => p.steamId === requester.steamId) + 1;
    if (rank === 1) focus.push("Protect the lead by forcing opponents to spend mobility first instead of chasing every fight.");
    else if (rank > 1) focus.push("Look for one efficient swing fight instead of trying to recover the whole gap in a single engage.");
  }
  if (intent === "duel") focus.push("Answer in terms of spacing, cooldown trading, and predictable punish windows.");
  else if (intent === "objective") focus.push("Anchor the answer around map control, timing, and objective pressure rather than raw damage.");
  else if (intent === "build") focus.push("Keep the recommendation tied to reliable execution and mode demands, not generic DPS theory.");
  else if (intent === "commands") focus.push("Prefer direct command or mechanic explanations over tactical theory.");
  const eventHint = buildRecentEventHint(recentEvent);
  if (eventHint) focus.push(eventHint);
  return uniqueItems(focus).slice(0, 4);
}

function buildAnswerHints(request: BattleQueryEnrichmentRequest, modeId: string, intent: string): string[] {
  const hints: string[] = [];
  const session = request.session;
  const requester = resolveRequester(session, request.player.steamId);
  hints.push(`Detected mode: ${modeId}.`);
  hints.push(`Detected intent: ${intent}.`);
  if (session) {
    const remainingSeconds = Math.max(0, Math.round(session.timeLimitSeconds - session.elapsedSeconds));
    hints.push(`Session ${session.sessionId} is active in zone ${session.zoneHash}.`);
    if (session.timeLimitSeconds > 0) hints.push(`${remainingSeconds}s remain before time expires.`);
    if (requester) {
      hints.push(`Requester score: ${requester.score}.`);
      if (requester.teamId !== undefined && requester.teamId !== null && requester.teamId > 0) {
        hints.push(`Requester team: ${requester.teamId}.`);
      }
    }
    const leader = session.leaderboard[0];
    if (leader) hints.push(`Current lobby leader has ${leader.score} points.`);
  } else {
    hints.push("No live session snapshot was attached, so keep advice broadly applicable.");
  }
  const recentEvent = lastItem(request.player.recentEvents);
  if (recentEvent) hints.push(`Most recent tracked event: ${recentEvent}.`);
  return uniqueItems(hints).slice(0, 6);
}

export function analyzeBattleStrategy(args: { scenario: string; playerLevel?: number; enemyType?: string }) {
  const scenario = args.scenario.trim();
  const normalizedScenario = scenario.toLowerCase();
  const playerLevel = clampLevel(args.playerLevel ?? 50);
  const enemyType = args.enemyType?.trim() || "unknown";
  const recommendedStrategy = normalizedScenario.includes("siege") ? "Objective-first siege control"
    : normalizedScenario.includes("flank") || normalizedScenario.includes("ambush") ? "Flanking maneuver"
    : normalizedScenario.includes("defend") || normalizedScenario.includes("hold") ? "Defensive positioning"
    : normalizedScenario.includes("kite") || normalizedScenario.includes("retreat") ? "Hit-and-run tactics"
    : "Cooldown-driven frontal pressure";
  let effectiveness = 48 + Math.round(playerLevel / 4);
  if (recommendedStrategy === "Objective-first siege control") effectiveness += 8;
  if (recommendedStrategy === "Flanking maneuver") effectiveness += 5;
  if (enemyType.toLowerCase().includes("boss")) effectiveness -= 7;
  if (enemyType.toLowerCase().includes("tank")) effectiveness -= 4;
  effectiveness = Math.max(25, Math.min(92, effectiveness));
  const riskLevel = effectiveness >= 75 ? "Low" : effectiveness >= 55 ? "Medium" : "High";
  return {
    scenario, recommendedStrategy, effectiveness: `${effectiveness}%`,
    playerLevel, enemyType, riskLevel,
    additionalNotes: riskLevel === "Low"
      ? "The matchup favors disciplined execution more than hero plays."
      : "Execution quality and timing windows will matter more than raw stat checks.",
  };
}

export function generateBattleStats(args: { entityName: string; entityType: string; level: number }): BattleStatsResult {
  return buildStats(args.entityName, normalizeEntityType(args.entityType), args.level);
}

export function simulateCombat(args: { attacker: { name: string; level: number; type: string }; defender: { name: string; level: number; type: string }; battleType?: string }) {
  const battleType = normalizeBattleType(args.battleType);
  const attackerStats = buildStats(args.attacker.name, normalizeEntityType(args.attacker.type), args.attacker.level);
  const defenderStats = buildStats(args.defender.name, normalizeEntityType(args.defender.type), args.defender.level);
  const attackerPower = computeBattlePower(attackerStats, battleType);
  const defenderPower = computeBattlePower(defenderStats, battleType);
  const winner = attackerPower >= defenderPower ? attackerStats : defenderStats;
  const margin = Math.abs(attackerPower - defenderPower);
  const ratio = margin / Math.max(attackerPower, defenderPower, 1);
  const outcome = ratio >= 0.18 ? "Decisive Victory" : ratio >= 0.08 ? "Close Victory" : "Narrow Victory";
  const durationBase = battleType === "extended" ? 10 : battleType === "siege" ? 12 : 6;
  const battleDuration = `${Math.max(4, Math.round(durationBase + (attackerStats.hp + defenderStats.hp) / 160))} rounds`;
  return {
    battleType,
    attacker: `${attackerStats.name} (Lvl ${attackerStats.level} ${attackerStats.type})`,
    defender: `${defenderStats.name} (Lvl ${defenderStats.level} ${defenderStats.type})`,
    winner: winner.name, outcome, attackerPower, defenderPower, battleDuration,
    experienceGained: Math.max(50, Math.round(60 + margin / 8)),
    recommendedAction: margin >= 140
      ? "Press the advantage while your opponent is still behind on tempo."
      : "Respect counterplay and re-enter only with a clear cooldown edge.",
  };
}

export function enrichDirectQuery(request: BattleQueryEnrichmentRequest): BattleQueryEnrichmentResult {
  const sessionMode = normalizeMode(request.session?.modeId);
  const modeId = sessionMode !== "unknown" ? sessionMode : detectModeFromText(request.query) ?? "unknown";
  const intent = detectIntent(request.query);
  const requester = resolveRequester(request.session, request.player.steamId);
  const recentEvent = lastItem(request.player.recentEvents);
  let summary = "No live BattleLuck session is attached, so the reply should stay general and grounded in recent activity only.";
  if (request.session) {
    const remainingSeconds = Math.max(0, Math.round(request.session.timeLimitSeconds - request.session.elapsedSeconds));
    const rankSummary = buildRankSummary(request.session, requester);
    summary = [
      `Player ${request.player.steamId} is in ${modeId} session ${request.session.sessionId}.`,
      rankSummary,
      request.session.timeLimitSeconds > 0
        ? `${remainingSeconds}s remain on the session timer.`
        : `${Math.round(request.session.elapsedSeconds)}s have elapsed so far.`,
      recentEvent ? `Recent event: ${recentEvent}.` : "No recent combat events were attached.",
    ].join(" ");
  }
  return {
    summary,
    tacticalFocus: buildTacticalFocus(request, modeId, intent),
    answerHints: buildAnswerHints(request, modeId, intent),
    confidence: request.session ? "high" : request.player.recentEvents.length > 0 ? "medium" : "low",
    detectedIntent: intent,
    shouldEscalateToModel: true,
  };
}

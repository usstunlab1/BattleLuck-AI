const MODE_GUIDANCE = {
  bloodbath: ['Prioritize clean resets after every duel instead of chaining low-health re-engages.', 'Track the kill leader and avoid getting pinched between active fights.', 'Use mobility cooldowns to secure exits before committing your burst window.'],
  colosseum: ['Play for cooldown trading and punish only after the opponent spends mobility.', 'Small leads matter more than risky all-ins in 1v1 rounds.', 'Respect defensive tempo and force predictable escape angles.'],
  gauntlet:  ['Treat incoming waves as resource checks and preserve defensive cooldowns for elite spikes.', 'Keep movement efficient so ranged pressure does not split the group.', 'Bank tempo between waves instead of overextending for one extra kill.'],
  siege:     ['Anchor one player on the objective while the rest control approach lanes.', 'Win space first, then commit damage once the flank is covered.', 'Frontline durability matters more than isolated picks during objective races.'],
  trials:    ['Route objectives in the fastest safe order and avoid dead time between transitions.', 'Burst windows should line up with objective checkpoints, not random skirmishes.', 'Stability beats greed when a timed challenge is already on pace.'],
};
const DEFAULT_TIPS = ['Play for information first and commit only once the win condition is clear.', 'Use cooldown advantage instead of taking neutral fights.'];

const getModeTips = (modeId) => MODE_GUIDANCE[modeId] ?? DEFAULT_TIPS;
const detectModeFromText = (text) => Object.keys(MODE_GUIDANCE).find((m) => text.toLowerCase().includes(m));
const detectIntent = (query) => {
  const q = query.toLowerCase();
  if (/(build|weapon|spell|ability|gear|loadout)/.test(q)) return 'build';
  if (/(duel|1v1|colosseum|trade|outplay)/.test(q)) return 'duel';
  if (/(survive|survival|live|defend|reset)/.test(q)) return 'survival';
  if (/(objective|siege|capture|zone|point)/.test(q)) return 'objective';
  if (/(command|syntax|how do i use|what does)/.test(q)) return 'commands';
  return 'general';
};
const uniqueItems = (items) => [...new Set(items.map((i) => i.trim()).filter(Boolean))];
const lastItem = (arr) => arr.length > 0 ? arr[arr.length - 1] : undefined;
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const buildRecentEventHint = (e) => {
  if (!e) return undefined;
  const l = e.toLowerCase();
  if (l.includes('eliminated')) return 'Recent pressure was negative — emphasize reset timing and safer positioning.';
  if (l.includes('scored')) return 'They have momentum — emphasize tempo control and snowball denial.';
  if (l.includes('started')) return 'They are in the opening phase — focus on route discipline and early cooldown value.';
  return `Recent event context: ${e}`;
};
const computeConfidence = (session, recentEvents) =>
  session && recentEvents?.length > 0 ? 'high' : (session || recentEvents?.length > 0) ? 'medium' : 'low';

export async function POST(query, steamId, modeId = '', sessionId = '', playerScore = 0, playerRank = 0, totalPlayers = 0, elapsedSeconds = 0, timeLimitSeconds = 0, recentEvent = '', conversationSummary = '') {
  const resolvedMode = modeId.trim().toLowerCase() || detectModeFromText(query) || 'unknown';
  const intent = detectIntent(query);
  const recentEvents = recentEvent ? [recentEvent] : [];
  const focus = [...getModeTips(resolvedMode).slice(0, 2)];
  if (playerRank === 1 && totalPlayers > 0) focus.push('Protect the lead by forcing opponents to spend mobility first instead of chasing every fight.');
  else if (playerRank > 1 && totalPlayers > 0) focus.push('Look for one efficient swing fight instead of trying to recover the whole gap in a single engage.');
  if (intent === 'duel') focus.push('Answer in terms of spacing, cooldown trading, and predictable punish windows.');
  else if (intent === 'objective') focus.push('Anchor around map control, timing, and objective pressure rather than raw damage.');
  else if (intent === 'build') focus.push('Keep the recommendation tied to reliable execution and mode demands, not generic DPS theory.');
  else if (intent === 'commands') focus.push('Prefer direct command or mechanic explanations over tactical theory.');
  const eventHint = buildRecentEventHint(lastItem(recentEvents));
  if (eventHint) focus.push(eventHint);
  const hints = [`Detected mode: ${resolvedMode}.`, `Detected intent: ${intent}.`];
  if (sessionId) {
    hints.push(`Session ${sessionId} is active.`);
    if (timeLimitSeconds > 0) hints.push(`${Math.max(0, Math.round(timeLimitSeconds - elapsedSeconds))}s remain before time expires.`);
    if (playerScore > 0) hints.push(`Requester score: ${playerScore}.`);
    if (playerRank > 0 && totalPlayers > 0) hints.push(`Ranked ${playerRank} of ${totalPlayers} active players.`);
  } else {
    hints.push('No live session snapshot was attached — keep advice broadly applicable.');
  }
  if (recentEvent) hints.push(`Most recent tracked event: ${recentEvent}.`);
  const hasSession = Boolean(sessionId);
  const summary = hasSession
    ? `${capitalize(resolvedMode)} session context attached — player is ${playerRank > 0 && totalPlayers > 0 ? `rank ${playerRank}/${totalPlayers}` : 'active'} with score ${playerScore}.`
    : `No live session. Intent detected as "${intent}" in ${capitalize(resolvedMode)} context.`;
  return {
    summary,
    tacticalFocus: uniqueItems(focus).slice(0, 4),
    answerHints: uniqueItems(hints).slice(0, 6),
    confidence: computeConfidence(hasSession ? { sessionId, elapsedSeconds, timeLimitSeconds } : null, recentEvents),
    detectedIntent: intent,
    shouldEscalateToModel: intent !== 'commands',
  };
}

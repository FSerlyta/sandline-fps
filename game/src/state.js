// The single state store: everything about the match lives here and nowhere else.
// Player and bot bodies live in their own modules, but the match (phase, score, timer,
// economy, bomb, kill feed) is read and written through this one object, so a round
// always has exactly one source of truth.
export function createState() {
  return {
    time: 0,
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0,
    round: 1,
    roundsToWin: 8,
    score: { falcon: 0, viper: 0 },
    roundTime: 115,
    roundWinner: null,
    roundReason: '',
    lossStreak: 0,
    kills: 0,
    feed: [], // { text, side: 'falcon' | 'viper' | 'info', time }
    bombThreat: false, // a Viper is defusing right now
    matchWinner: null,
  };
}

export function pushFeed(state, text, side = 'info') {
  state.feed.push({ text, side, time: state.time });
  if (state.feed.length > 6) state.feed.shift();
}

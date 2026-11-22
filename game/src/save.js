// save.js — localStorage persistence for a Solmar Heat run.
//
// One slot, plain JSON. Kept deliberately tiny and defensive: a
// corrupt or half-written save must never stop the game booting,
// it just means the Continue button stays hidden.

const KEY = 'solmar-heat-neon-run/v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return {
      // clamp the numbers into the game's own ranges — a hand-edited
      // save should start a sane run, not a broken one
      money: Math.max(0, data.money | 0),
      missionIndex: Math.min(10, Math.max(0, data.missionIndex | 0)),
      storyDone: !!data.storyDone,
      tokens: Array.isArray(data.tokens) ? data.tokens.filter((n) => Number.isInteger(n)) : [],
      earned: data.earned | 0,
      fences: data.fences | 0,
      fares: data.fares | 0,
    };
  } catch {
    return null;
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: state.money | 0,
      missionIndex: state.missionIndex | 0,
      storyDone: !!state.storyDone,
      tokens: [...state.tokens],
      earned: state.earned | 0,
      fences: state.fences | 0,
      fares: state.fares | 0,
    }));
  } catch {
    /* storage full or blocked — the run simply will not persist */
  }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to wipe */ }
}

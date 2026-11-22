// save.js — localStorage persistence for a Solmar Heat run.
//
// One slot, plain JSON. Kept deliberately tiny and defensive: a
// corrupt or half-written save must never stop the game booting,
// it just means the Continue button stays hidden.
//
// sanitize() is the one place that decides what a save may hold:
// every number is clamped into the game's own ranges, so a
// hand-edited or half-migrated save starts a sane run instead of
// a broken one. snapshot() is its mirror — the exact field set a
// live state is written back with, nothing more.

const KEY = 'solmar-heat-neon-run/v1';
const MISSION_COUNT = 10;

function sanitize(data) {
  return {
    money: Math.max(0, data.money | 0),
    missionIndex: Math.min(MISSION_COUNT, Math.max(0, data.missionIndex | 0)),
    storyDone: !!data.storyDone,
    tokens: Array.isArray(data.tokens) ? data.tokens.filter((n) => Number.isInteger(n)) : [],
    earned: data.earned | 0,
    fences: data.fences | 0,
    fares: data.fares | 0,
  };
}

function snapshot(state) {
  return {
    money: state.money | 0,
    missionIndex: state.missionIndex | 0,
    storyDone: !!state.storyDone,
    tokens: [...state.tokens],
    earned: state.earned | 0,
    fences: state.fences | 0,
    fares: state.fares | 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return sanitize(data);
  } catch {
    return null;
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(state)));
  } catch {
    /* storage full or blocked — the run simply will not persist */
  }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to wipe */ }
}

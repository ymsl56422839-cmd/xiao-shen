const KEY = 'xiaoshen_v2';

const D = { deepseekKey: '', geminiKey: '', parentPIN: '1234', log: [] };

export function get() {
  try { const r = localStorage.getItem(KEY); return r ? { ...D, ...JSON.parse(r) } : { ...D }; }
  catch { return { ...D }; }
}

export function set(partial) {
  const cur = get();
  const updated = { ...cur, ...partial };
  try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch {}
  return updated;
}

export function ready() {
  return !!get().deepseekKey;
}

export function checkPin(pin) {
  return pin === get().parentPIN;
}

export function addLog(entry) {
  const s = get();
  s.log.unshift({ time: new Date().toISOString(), ...entry });
  if (s.log.length > 200) s.log.length = 200;
  set({ log: s.log });
}

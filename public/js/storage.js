const STORAGE_KEY = 'xiaoshen';

const DEFAULTS = {
  deepseekKey: '',
  geminiKey: '',
  parentPIN: '1234',
  systemPrompt: '',
  contentFilter: '',
  conversationLog: []
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function addToLog(entry) {
  const settings = getSettings();
  settings.conversationLog.unshift({
    time: new Date().toISOString(),
    ...entry
  });
  if (settings.conversationLog.length > 200) {
    settings.conversationLog = settings.conversationLog.slice(0, 200);
  }
  saveSettings({ conversationLog: settings.conversationLog });
}

export function checkPIN(pin) {
  return pin === getSettings().parentPIN;
}

export function isConfigured() {
  const s = getSettings();
  return !!s.deepseekKey;
}

export function getApiKeys() {
  const s = getSettings();
  return {
    deepseekKey: s.deepseekKey,
    geminiKey: s.geminiKey
  };
}

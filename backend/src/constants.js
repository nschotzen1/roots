export const MOVE_TYPES = ['REPLACE', 'SWAP'];
export const SESSION_MODES = ['journey', 'survival'];

export const normalizeMoveTypes = (types) => {
  if (!Array.isArray(types)) return [...MOVE_TYPES];
  const normalized = types
    .map((type) => String(type || '').toUpperCase())
    .filter((type) => MOVE_TYPES.includes(type));

  return normalized.length > 0 ? [...new Set(normalized)] : [...MOVE_TYPES];
};

export const normalizeSessionMode = (mode) => {
  const normalized = String(mode || 'survival').toLowerCase();
  return SESSION_MODES.includes(normalized) ? normalized : 'survival';
};

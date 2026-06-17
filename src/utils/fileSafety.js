// Utility for sanitizing filenames before concatenating them into
// filesystem paths, to defend against path traversal via user- or
// external-source-supplied names (camera asset.fileName, document
// picker res.name, flow/section names used in exports, etc).

const UNSAFE_CHARS = /[\/\\\x00-\x1f<>:"|?*]/g;
const LEADING_DOTS = /^\.+/;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/;

/**
 * Replace path-traversal and platform-unsafe characters with `_`.
 * Empty / null-ish input returns the provided fallback (default `file`).
 */
export const sanitizeFilename = (name, fallback = 'file') => {
  if (typeof name !== 'string' || name.length === 0) return fallback;
  let cleaned = name
    .replace(UNSAFE_CHARS, '_')
    .replace(LEADING_DOTS, '')
    .replace(TRAILING_DOTS_OR_SPACES, '');
  // Truncate to a reasonable length to avoid OS limits.
  if (cleaned.length > 200) cleaned = cleaned.slice(0, 200);
  return cleaned.length > 0 ? cleaned : fallback;
};

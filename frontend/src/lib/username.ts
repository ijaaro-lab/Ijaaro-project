/** Approved username format: 3–32 chars, starts with a letter, [a-z0-9_]. */
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normalizeUsername(raw));
}

export function validateUsernameInput(
  raw: string,
  takenNormalized?: string[],
): { ok: true; username: string } | { ok: false; error: string } {
  const username = normalizeUsername(raw);
  if (!username) {
    return { ok: false, error: "Enter a username." };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error:
        "Username must be 3–32 characters, start with a letter, and use only lowercase letters, digits, or underscores.",
    };
  }
  if (takenNormalized?.some((t) => normalizeUsername(t) === username)) {
    return { ok: false, error: "That username is already taken." };
  }
  return { ok: true, username };
}

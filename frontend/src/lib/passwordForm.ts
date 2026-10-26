export type PasswordFormValidation =
  | { ok: true; password: string }
  | { ok: false; error: string };

export function validatePasswordPair(
  password: string,
  confirm: string,
  opts?: { minLength?: number; maxLength?: number },
): PasswordFormValidation {
  const min = opts?.minLength ?? 8;
  const max = opts?.maxLength ?? 128;
  if (!password) {
    return { ok: false, error: "Enter a new password." };
  }
  if (password.length < min) {
    return { ok: false, error: `Password must be at least ${min} characters.` };
  }
  if (password.length > max) {
    return { ok: false, error: `Password must be at most ${max} characters.` };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, password };
}

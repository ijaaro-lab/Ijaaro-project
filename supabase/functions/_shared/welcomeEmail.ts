/**
 * Best-effort welcome email via Resend.
 * Never throws — user provisioning must not fail if mail delivery fails.
 */

export type WelcomeEmailInput = {
  to: string;
  fullName?: string | null;
  /** Optional workspace / portal URL for the CTA. */
  workspaceUrl?: string | null;
};

export type WelcomeEmailResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
};

function readEnv(name: string): string | undefined {
  try {
    // Edge runtime; optional when unit-testing the pure content builder.
    return Deno.env.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function siteBaseUrl(): string {
  return (
    readEnv("PUBLIC_SITE_URL") ??
    readEnv("SITE_URL") ??
    "https://ijaaro.online"
  )
    .trim()
    .replace(/\/$/, "");
}

function fromAddress(): string {
  return (
    readEnv("RESEND_FROM") ??
    "IJAARO <onboarding@ijaaro.online>"
  ).trim();
}

export function buildWelcomeEmailContent(input: WelcomeEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const name = (input.fullName ?? "").trim() || "there";
  const base = siteBaseUrl();
  const cta = (input.workspaceUrl ?? base).trim() || base;
  const subject = "Welcome to IJAARO";
  const text = [
    `Hi ${name},`,
    "",
    "Welcome to IJAARO — your secure workspace for property, water, and electricity operations.",
    "",
    `Open your account: ${cta}`,
    "",
    "If you did not create this account, you can ignore this email.",
    "",
    "— The IJAARO team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0b1f3a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background:#0b1f3a;padding:20px 24px;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#f5c400;letter-spacing:0.04em;">IJAARO</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Welcome, ${escapeHtml(name)}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
          Your IJAARO account is ready. Manage property, water, and electricity workspaces with isolated tenant data and role-based access.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(cta)}" style="display:inline-block;background:#2b8cff;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px;">
            Open IJAARO
          </a>
        </p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
          If you did not create this account, you can ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type InviteEmailInput = {
  to: string;
  fullName?: string | null;
  /** Supabase Auth action_link from admin.generateLink (invite). Never return to clients. */
  actionLink: string;
  /** Optional workspace / landlord label for copy. */
  workspaceLabel?: string | null;
};

export function buildInviteEmailContent(input: InviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const name = (input.fullName ?? "").trim() || "there";
  const label = (input.workspaceLabel ?? "").trim() || "an IJAARO workspace";
  const link = input.actionLink.trim();
  const subject = "You're invited to IJAARO — set your password";
  const text = [
    `Hi ${name},`,
    "",
    `You've been invited to join ${label} on IJAARO.`,
    "",
    "Set your password to activate your account:",
    link,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
    "",
    "— The IJAARO team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0b1f3a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background:#0b1f3a;padding:20px 24px;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#f5c400;letter-spacing:0.04em;">IJAARO</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">You're invited, ${escapeHtml(name)}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
          Join <strong>${escapeHtml(label)}</strong> on IJAARO. Set your password to activate your account — then sign in to your workspace.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#2b8cff;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px;">
            Set password &amp; activate
          </a>
        </p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
          If you were not expecting this invitation, you can ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

async function sendResendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  logEvent: string;
}): Promise<WelcomeEmailResult> {
  const to = args.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "invalid recipient" };
  }

  const apiKey = readEnv("RESEND_API_KEY")?.trim();
  if (!apiKey) {
    console.warn(`${args.logEvent}.skipped`, { reason: "RESEND_API_KEY missing" });
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      const error = body.message || body.name || `resend_http_${res.status}`;
      console.error(`${args.logEvent}.failed`, { status: res.status, error });
      return { ok: false, error };
    }

    console.log(`${args.logEvent}.sent`, { id: body.id, to_domain: to.split("@")[1] });
    return { ok: true, id: body.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : "resend_network_error";
    console.error(`${args.logEvent}.exception`, { error });
    return { ok: false, error };
  }
}

/** True when invites can be delivered via Resend (replaces Supabase SMTP invite). */
export function isResendConfigured(): boolean {
  return Boolean(readEnv("RESEND_API_KEY")?.trim());
}

/** Send welcome mail through Resend. Safe to fire-and-forget after user create. */
export async function sendWelcomeEmail(
  input: WelcomeEmailInput,
): Promise<WelcomeEmailResult> {
  const { subject, text, html } = buildWelcomeEmailContent(input);
  return sendResendEmail({
    to: input.to,
    subject,
    text,
    html,
    logEvent: "welcome_email",
  });
}

/**
 * Send invite / set-password mail through Resend (not Supabase Auth SMTP).
 * Callers must fail closed if this returns !ok — do not leave half-provisioned users.
 */
export async function sendInviteEmail(
  input: InviteEmailInput,
): Promise<WelcomeEmailResult> {
  const link = input.actionLink.trim();
  if (!link || !/^https?:\/\//i.test(link)) {
    return { ok: false, error: "invalid_action_link" };
  }
  const { subject, text, html } = buildInviteEmailContent(input);
  return sendResendEmail({
    to: input.to,
    subject,
    text,
    html,
    logEvent: "invite_email",
  });
}

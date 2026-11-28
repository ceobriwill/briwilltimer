import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, randomInt } from "node:crypto";

// 31 characters with no 0/O/1/I/L, so codes are easy to read and type
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

function makeReferralCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Turns whatever the visitor typed into a clean upper-case code
export function cleanInviteCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Returns the referrer's id for a valid invite code, or null if the code
// doesn't exist. THROWS if the database can't be reached, so a database
// problem is never mistaken for a wrong code.
export async function findReferrer(code) {
  if (!CODE_PATTERN.test(code)) return null;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    select id from signups
    where referral_code = ${code} and status = 'active'
    limit 1`;
  return rows[0]?.id || null;
}

// Saves a waitlist signup with its referral code. If referrerId is given,
// it also records a pending referral, in the same statement.
// Never throws: a signup must not fail because of the database.
export async function saveSignup({ name, email, whatsapp, referrerId = null }) {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);

  // Placeholder dashboard key (only its hash is stored). Real dashboard
  // links are issued later, when the dashboard is built.
  const dashboardKeyHash = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");

  for (let attempt = 0; attempt < 5; attempt++) {
    const referralCode = makeReferralCode();
    try {
      const rows = await sql`
        with new_signup as (
          insert into signups
            (name, email, whatsapp, referral_code, dashboard_key_hash,
             referred_by, requires_confirmation)
          values
            (${name}, ${email}, ${whatsapp}, ${referralCode}, ${dashboardKeyHash},
             ${referrerId}::uuid, ${referrerId !== null})
          returning id, referral_code
        ), new_referral as (
          insert into referrals (referrer_id, referred_id)
          select ${referrerId}::uuid, id from new_signup
          where ${referrerId}::uuid is not null
          returning id
        )
        select id, referral_code from new_signup`;
      return rows[0] || null;
    } catch (err) {
      // Rare: the random code already exists, so try a new one
      if (
        err?.code === "23505" &&
        String(err.constraint).includes("referral_code")
      ) {
        continue;
      }
      // Email or number already saved, or any other problem: log it and move on
      if (err?.code !== "23505") console.error("saveSignup error:", err);
      return null;
    }
  }
  return null;
}
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a confirmation link token (7 days). Only its hash is stored.
export async function createConfirmationToken(signupId, channel) {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  const token = randomBytes(32).toString("base64url");
  try {
    // Only one live token per signup and channel
    await sql`
      delete from confirmation_tokens
      where signup_id = ${signupId} and channel = ${channel} and used_at is null`;
    await sql`
      insert into confirmation_tokens (signup_id, channel, token_hash, expires_at)
      values (${signupId}, ${channel}, ${hashToken(token)}, now() + interval '7 days')`;
    return token;
  } catch (err) {
    console.error("createConfirmationToken error:", err);
    return null;
  }
}

// Uses a token once: marks it used and sets the matching confirmed time.
export async function redeemConfirmationToken(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return { ok: false, reason: "invalid" };
  const sql = neon(process.env.DATABASE_URL);
  const hash = hashToken(token);

  const rows = await sql`
    with t as (
      update confirmation_tokens set used_at = now()
      where token_hash = ${hash} and used_at is null and expires_at > now()
      returning signup_id, channel
    ), s as (
      update signups
      set email_confirmed_at = case
            when (select channel from t) = 'email'
            then coalesce(email_confirmed_at, now()) else email_confirmed_at end,
          whatsapp_confirmed_at = case
            when (select channel from t) = 'whatsapp'
            then coalesce(whatsapp_confirmed_at, now()) else whatsapp_confirmed_at end
      where id = (select signup_id from t)
      returning id, email_confirmed_at, whatsapp_confirmed_at
    )
    select t.channel, s.email_confirmed_at, s.whatsapp_confirmed_at
    from t join s on s.id = t.signup_id`;

  if (rows.length === 0) {
    // Already used (for example a double click), expired, or unknown
    const old = await sql`
      select t.channel, t.used_at, s.email_confirmed_at, s.whatsapp_confirmed_at
      from confirmation_tokens t
      join signups s on s.id = t.signup_id
      where t.token_hash = ${hash}`;
    if (old.length && old[0].used_at) {
      return {
        ok: true,
        already: true,
        channel: old[0].channel,
        emailConfirmed: Boolean(old[0].email_confirmed_at),
        whatsappConfirmed: Boolean(old[0].whatsapp_confirmed_at),
      };
    }
    if (old.length) return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }

  const r = rows[0];
  return {
    ok: true,
    channel: r.channel,
    emailConfirmed: Boolean(r.email_confirmed_at),
    whatsappConfirmed: Boolean(r.whatsapp_confirmed_at),
  };
}

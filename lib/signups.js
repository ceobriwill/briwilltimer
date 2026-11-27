import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, randomInt } from "node:crypto";

// 31 characters with no 0/O/1/I/L, so codes are easy to read and type
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function makeReferralCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Saves a waitlist signup with its referral code.
// Never throws: a signup must not fail because of the database.
export async function saveSignup({ name, email, whatsapp }) {
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
        insert into signups (name, email, whatsapp, referral_code, dashboard_key_hash)
        values (${name}, ${email}, ${whatsapp}, ${referralCode}, ${dashboardKeyHash})
        returning id, referral_code`;
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

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { redeemConfirmationToken } from "../lib/signups.js";

const redis = Redis.fromEnv();
const confirmLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "rl:confirm",
});

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { success } = await confirmLimiter.limit(getClientIp(req));
    if (!success) {
      return res.status(429).json({
        status: "error",
        message: "Too many attempts. Please try again later.",
      });
    }
  } catch (err) {
    console.error("Rate limit error:", err);
  }

  try {
    const result = await redeemConfirmationToken(String(req.body?.token || ""));
    if (result.ok) {
      return res.status(200).json({
        status: "success",
        channel: result.channel,
        already: Boolean(result.already),
        bothConfirmed: Boolean(result.bothConfirmed),
      });
    }
    if (result.reason === "expired") {
      return res
        .status(410)
        .json({ status: "error", message: "This link has expired." });
    }
    return res
      .status(400)
      .json({ status: "error", message: "This link isn’t valid." });
  } catch (err) {
    console.error("Confirm error:", err);
    return res.status(503).json({
      status: "error",
      message: "We couldn’t confirm right now. Please try again.",
    });
  }
}

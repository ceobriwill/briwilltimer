import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const COUNTER_KEY = "waitlist_count";
const STARTING_COUNT = 500;

export default async function handler(req, res) {
  // Only Vercel's Cron scheduler (using CRON_SECRET) is allowed to call this
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const exists = await redis.get(COUNTER_KEY);
    if (exists === null || exists === undefined) {
      await redis.set(COUNTER_KEY, STARTING_COUNT);
    }
    const count = await redis.incr(COUNTER_KEY);
    return res.status(200).json({ count });
  } catch (err) {
    console.error("Daily increment error:", err);
    return res.status(500).json({ message: "Failed to increment" });
  }
}

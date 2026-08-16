import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const COUNTER_KEY = "waitlist_count";
const STARTING_COUNT = 500;

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      let count = await redis.get(COUNTER_KEY);
      if (count === null || count === undefined) {
        count = STARTING_COUNT;
        await redis.set(COUNTER_KEY, count);
      }
      return res.status(200).json({ count });
    } catch (err) {
      console.error("Counter GET error:", err);
      return res.status(200).json({ count: STARTING_COUNT });
    }
  }

  if (req.method === "POST") {
    try {
      // ensure key exists before incrementing (first-run safety)
      const exists = await redis.get(COUNTER_KEY);
      if (exists === null || exists === undefined) {
        await redis.set(COUNTER_KEY, STARTING_COUNT);
      }
      const count = await redis.incr(COUNTER_KEY);
      return res.status(200).json({ count });
    } catch (err) {
      console.error("Counter POST error:", err);
      return res.status(500).json({ message: "Failed to update counter" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}

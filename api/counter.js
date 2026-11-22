import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const COUNTER_KEY = "waitlist_count";
const STARTING_COUNT = 500;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

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

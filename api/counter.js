import fs from 'fs';
import path from 'path';

const counterFile = path.join(process.cwd(), 'counter.json');

export default function handler(req, res) {
  if (req.method === "GET") {
    // read current count
    let count = 500; // start from 500
    try {
      const data = fs.readFileSync(counterFile, 'utf8');
      count = JSON.parse(data).count || 500;
    } catch (err) {
      count = 500;
    }
    return res.status(200).json({ count });
  }

  if (req.method === "POST") {
    // increment count
    let count = 500; // default starting point
    try {
      const data = fs.readFileSync(counterFile, 'utf8');
      count = JSON.parse(data).count || 500;
    } catch (err) {
      count = 500;
    }

    count++; // add 1 for new signup
    fs.writeFileSync(counterFile, JSON.stringify({ count }));
    return res.status(200).json({ count });
  }

  res.status(405).json({ message: "Method not allowed" });
}
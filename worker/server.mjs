// Frame worker: reads only the needed slice with yt-dlp + ffmpeg and returns JPEG frames, their timestamps and the duration.
// Needs a real server (Docker on Railway/Render/Fly), not Vercel. Only process videos you're allowed to.
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const run = promisify(execFile);

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/health") return res.writeHead(200).end("ok");
  if (req.headers.authorization !== `Bearer ${process.env.WORKER_SECRET}`) return res.writeHead(401).end();
  const q = u.searchParams;
  const url = q.get("url"), start = +q.get("start") || 0, n = Math.min(+q.get("n") || 6, 40);
  let dir;
  try {
    const src = (await run("yt-dlp", ["-g", "-f", "best[height<=480]/best", url])).stdout.trim().split("\n")[0];
    const total = +(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src])).stdout || 30;
    const dur = +q.get("dur") || Math.max(1, total - start);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "f-"));
    // Long videos: decode keyframes only, which is much faster
    const fast = dur > 90 ? ["-skip_frame", "nokey"] : [];
    await run("ffmpeg", ["-ss", String(start), ...fast, "-i", src, "-t", String(dur), "-vf", `fps=${n}/${dur},scale=640:-2`,
      "-frames:v", String(n), path.join(dir, "f%02d.jpg")], { timeout: 50000 });
    const files = (await fs.readdir(dir)).sort();
    const frames = await Promise.all(files.map(async (f) => (await fs.readFile(path.join(dir, f))).toString("base64")));
    const times = files.map((_, i) => start + (dur / n) * (i + 0.5));
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ frames, times, duration: start ? start + dur : dur }));
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ error: String(e.message).slice(0, 200) }));
  } finally { if (dir) fs.rm(dir, { recursive: true, force: true }); }
}).listen(process.env.PORT || 8080);

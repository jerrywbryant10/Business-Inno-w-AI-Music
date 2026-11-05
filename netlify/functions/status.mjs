import { guard, suno, json } from "./_lib/suno.mjs";

export default async (req) => {
  const blocked = guard(req, "GET");
  if (blocked) return blocked;

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  const type = url.searchParams.get("type") === "lyrics" ? "lyrics" : "music";
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json({ error: "Missing or invalid taskId" }, 400);

  const path = type === "lyrics" ? "/lyrics/record-info" : "/generate/record-info";
  return suno(path, { query: { taskId } });
};

export const config = { path: "/api/status" };

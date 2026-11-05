import { guard, suno, json, callbackUrl } from "./_lib/suno.mjs";

export default async (req) => {
  const blocked = guard(req, "POST");
  if (blocked) return blocked;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) return json({ error: "Describe what the lyrics should be about." }, 400);
  if (prompt.length > 200) return json({ error: "Lyrics prompt must be 200 characters or fewer." }, 400);

  return suno("/lyrics", { method: "POST", body: { prompt, callBackUrl: callbackUrl(req) } });
};

export const config = { path: "/api/lyrics" };

import { guard, suno, json, callbackUrl } from "./_lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];
const clampNum = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
};
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export default async (req) => {
  const blocked = guard(req, "POST");
  if (blocked) return blocked;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };

  if (!customMode) {
    // Simple mode: prompt is the core idea, lyrics auto-written.
    body.prompt = str(input.prompt, 3000);
    const style = str(input.style, 1000);
    if (style) body.style = style;
    if (!body.prompt && !style) {
      return json({ error: "Describe the song you want (or add a style)." }, 400);
    }
  } else {
    const title = str(input.title, 80);
    const style = str(input.style, 1000);
    const lyrics = instrumental ? undefined : str(input.lyrics, 5000);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return json({ error: "Custom mode needs at least a style, lyrics, or excluded styles." }, 400);
    }
    Object.assign(body, { title, style, lyrics, negativeTags });
    if (input.vocalGender === "m" || input.vocalGender === "f") body.vocalGender = input.vocalGender;
    const styleWeight = clampNum(input.styleWeight, 0, 1);
    const weirdness = clampNum(input.weirdnessConstraint, 0, 1);
    const audioWeight = clampNum(input.audioWeight, 0, 1);
    if (styleWeight !== undefined) body.styleWeight = styleWeight;
    if (weirdness !== undefined) body.weirdnessConstraint = weirdness;
    if (audioWeight !== undefined && !instrumental) body.audioWeight = audioWeight;
    if (input.variety !== undefined && input.variety !== "") {
      body.variety = Math.round(clampNum(input.variety, 0, 4) ?? 1);
    }
    if (input.duration) body.duration = Math.round(clampNum(input.duration, 10, 360));
  }

  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];

  return suno("/generate", { method: "POST", body });
};

export const config = { path: "/api/generate" };

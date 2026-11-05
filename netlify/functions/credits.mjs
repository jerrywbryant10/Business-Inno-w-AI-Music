import { guard, suno } from "./_lib/suno.mjs";

export default async (req) => {
  const blocked = guard(req, "GET");
  if (blocked) return blocked;
  return suno("/generate/credit");
};

export const config = { path: "/api/credits" };

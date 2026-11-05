const BASE_URL = "https://api.sunoapi.org/api/v1";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Returns a Response if the request is not allowed, otherwise null. */
export function guard(req, method) {
  if (req.method !== method) return json({ error: "Method not allowed" }, 405);
  if (!process.env.SUNO_API_KEY) {
    return json({ error: "Server is missing SUNO_API_KEY. Add it in Netlify environment variables." }, 500);
  }
  const password = process.env.APP_PASSWORD;
  if (password && req.headers.get("x-app-password") !== password) {
    return json({ error: "Invalid or missing access password.", needsPassword: true }, 401);
  }
  return null;
}

export function callbackUrl(req) {
  const origin = process.env.URL || new URL(req.url).origin;
  return `${origin}/api/callback`;
}

const CODE_MESSAGES = {
  400: "Invalid parameters",
  401: "Unauthorized - check your SunoAPI key",
  404: "Invalid request method or path",
  405: "Rate limit exceeded",
  413: "Theme or prompt too long",
  429: "Insufficient credits",
  430: "Call frequency too high, please try again later",
  455: "Suno API is under maintenance",
  500: "Suno API server error",
};

export async function suno(path, { method = "GET", body, query } = {}) {
  const url = new URL(BASE_URL + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return json({ error: `Could not reach Suno API: ${err.message}` }, 502);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return json({ error: `Suno API returned a non-JSON response (HTTP ${res.status})` }, 502);
  }

  if (payload.code !== 200) {
    const message = payload.msg || CODE_MESSAGES[payload.code] || "Unknown Suno API error";
    const status = payload.code >= 400 && payload.code < 600 ? payload.code : 502;
    return json({ error: message, code: payload.code }, status === 200 ? 502 : status);
  }
  return json({ data: payload.data });
}

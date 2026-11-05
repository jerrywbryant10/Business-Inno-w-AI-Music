// SunoAPI requires a callBackUrl on every task. The app polls for status
// instead, so this endpoint simply acknowledges the webhook.
export default async () =>
  new Response(JSON.stringify({ status: "received" }), {
    headers: { "Content-Type": "application/json" },
  });

export const config = { path: "/api/callback" };

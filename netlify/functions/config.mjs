// Tells the frontend whether an access password is required.
export default async () =>
  new Response(JSON.stringify({ passwordRequired: Boolean(process.env.APP_PASSWORD) }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const config = { path: "/api/config" };

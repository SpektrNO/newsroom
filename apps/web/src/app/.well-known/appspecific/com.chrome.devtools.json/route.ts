/**
 * Override Next.js's built-in Chrome DevTools automatic-workspace endpoint.
 *
 * On WSL + Windows Chrome, Next serves a Linux path that Chrome cannot mount,
 * which surfaces as: "Unable to add filesystem: <illegal path>".
 * Returning 404 disables that toast without affecting the app.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 404 });
}

import type { APIRoute } from 'astro';

/**
 * WebSocket endpoint for real-time leaderboard updates
 * Proxies to the Durable Object for the requested event
 */
export const GET: APIRoute = async ({ request, locals, url }) => {
  // Check for WebSocket upgrade
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const { runtime } = locals;
  const { LEADERBOARD } = runtime.env;

  if (!LEADERBOARD) {
    return new Response('Leaderboard service not configured', { status: 503 });
  }

  // Get event ID from query param
  const eventId = url.searchParams.get('event_id');
  if (!eventId) {
    return new Response('event_id query parameter required', { status: 400 });
  }

  // Forward to the Durable Object
  const doId = LEADERBOARD.idFromName(eventId);
  const stub = LEADERBOARD.get(doId);

  // Pass the WebSocket upgrade request to the DO
  return stub.fetch(request);
};

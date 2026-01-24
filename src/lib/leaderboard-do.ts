/**
 * Durable Object for Real-time Leaderboard Updates
 * Each event gets its own DO instance for WebSocket connections
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

interface Standing {
  user_id: string;
  user_name: string;
  wins: number;
  losses: number;
  points: number;
  rank: number;
}

interface WebSocketMessage {
  type: 'subscribe' | 'ping';
  event_id?: string;
}

interface BroadcastMessage {
  type: 'standings_update' | 'pong' | 'error';
  event_id?: string;
  standings?: Standing[];
  message?: string;
}

export class LeaderboardDO {
  private state: DurableObjectState;
  private sessions: Map<WebSocket, { eventId: string }>;
  private standings: Map<string, Standing[]>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();
    this.standings = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // HTTP endpoints for updating standings
    if (url.pathname === '/update' && request.method === 'POST') {
      return this.handleStandingsUpdate(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket
    this.state.acceptWebSocket(server);

    // Store session (eventId will be set on subscribe)
    this.sessions.set(server, { eventId: '' });

    // Handle messages
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string) as WebSocketMessage;

        switch (data.type) {
          case 'subscribe':
            if (data.event_id) {
              const session = this.sessions.get(server);
              if (session) {
                session.eventId = data.event_id;
              }

              // Send current standings if we have them
              const currentStandings = this.standings.get(data.event_id);
              if (currentStandings) {
                this.send(server, {
                  type: 'standings_update',
                  event_id: data.event_id,
                  standings: currentStandings,
                });
              }
            }
            break;

          case 'ping':
            this.send(server, { type: 'pong' });
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        this.send(server, { type: 'error', message: 'Invalid message format' });
      }
    });

    // Handle close
    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });

    server.addEventListener('error', () => {
      this.sessions.delete(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleStandingsUpdate(request: Request): Promise<Response> {
    try {
      const { event_id, standings } = (await request.json()) as {
        event_id: string;
        standings: Standing[];
      };

      if (!event_id || !standings) {
        return new Response(JSON.stringify({ error: 'event_id and standings required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Store standings
      this.standings.set(event_id, standings);

      // Broadcast to all subscribed clients
      this.broadcast(event_id, {
        type: 'standings_update',
        event_id,
        standings,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Standings update error:', error);
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private send(ws: WebSocket, message: BroadcastMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Connection closed, remove from sessions
      this.sessions.delete(ws);
    }
  }

  private broadcast(eventId: string, message: BroadcastMessage): void {
    for (const [ws, session] of this.sessions) {
      if (session.eventId === eventId) {
        this.send(ws, message);
      }
    }
  }

  // Called by Cloudflare when DO needs to hibernate
  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }
}

export default LeaderboardDO;

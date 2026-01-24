/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type D1Database = import('@cloudflare/workers-types').D1Database;
type KVNamespace = import('@cloudflare/workers-types').KVNamespace;
type DurableObjectNamespace = import('@cloudflare/workers-types').DurableObjectNamespace;
type Queue = import('@cloudflare/workers-types').Queue;

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  LEADERBOARD: DurableObjectNamespace;
  QUEUE: Queue;
  THE_RUNDOWN_API_KEY?: string;
  RESEND_API_KEY?: string;
  SITE_URL: string;
  JWT_SECRET?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

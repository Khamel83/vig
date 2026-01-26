/**
 * Templates API endpoint
 * GET /api/templates - List public templates
 */

import { poolTemplates } from '@/lib/pools';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;

    // Get public templates
    const templates = await poolTemplates.getPublic(DB);

    return new Response(JSON.stringify({
      success: true,
      templates,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Templates API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch templates' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

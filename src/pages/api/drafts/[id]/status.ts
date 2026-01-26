/**
 * Draft status endpoint
 * GET /api/drafts/:id/status
 * Returns current draft state including current picker, available options, and picks
 */

import { drafts, draftPicks, draftTimers, draftHelpers, draftSettings } from '@/lib/drafts';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { DB } = locals.runtime.env;
    const { id } = params;

    // Get draft
    const draft = await drafts.getById(DB, id);
    if (!draft) {
      return new Response(JSON.stringify({ error: 'Draft not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get current picker
    const currentPicker = await drafts.getCurrentPicker(DB, draft);

    // Get available options (not yet picked)
    const pickedOptions = await DB.prepare(
      'SELECT DISTINCT option_id FROM draft_picks WHERE draft_id = ? AND option_id != ?'
    ).bind(id, 'skipped').all();

    const pickedOptionIds = pickedOptions.results.map((r: any) => r.option_id);

    let availableOptions: any[] = [];
    if (pickedOptionIds.length > 0) {
      const placeholders = pickedOptionIds.map(() => '?').join(',');
      const optionsStmt = await DB.prepare(`
        SELECT id, name, abbreviation FROM options
        WHERE event_id = ? AND id NOT IN (${placeholders})
      `).bind(draft.event_id, ...pickedOptionIds);
      const optionsResult = await optionsStmt.all();
      availableOptions = optionsResult.results;
    } else {
      const optionsStmt = await DB.prepare(`
        SELECT id, name, abbreviation FROM options WHERE event_id = ?
      `).bind(draft.event_id);
      const optionsResult = await optionsStmt.all();
      availableOptions = optionsResult.results;
    }

    // Get picks
    const picks = await draftPicks.getByDraft(DB, id);

    // Get timer
    const timer = await draftTimers.getById(DB, id);

    // Get settings
    const settings = await draftSettings.getByEvent(DB, draft.event_id);

    // Get user details for picks
    const picksWithUsers = await Promise.all(
      picks.map(async (pick) => {
        const userStmt = await DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(pick.user_id);
        const user = await userStmt.first();

        const optionStmt = await DB.prepare('SELECT id, name, abbreviation FROM options WHERE id = ?').bind(pick.option_id);
        const option = await optionStmt.first();

        return {
          ...pick,
          user: user ? { id: user.id, name: user.name } : null,
          option: option ? { id: option.id, name: option.name, abbreviation: option.abbreviation } : null,
        };
      })
    );

    // Calculate remaining time
    const remainingTime = timer?.current_pick_deadline
      ? Math.max(0, timer.current_pick_deadline - Date.now() / 1000)
      : 0;

    return new Response(JSON.stringify({
      success: true,
      draft: {
        ...draft,
        current_picker: currentPicker,
        remaining_time: remainingTime,
        is_timed_out: remainingTime <= 0,
      },
      available_options: availableOptions,
      picks: picksWithUsers,
      timer,
      settings,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Draft status error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get draft status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

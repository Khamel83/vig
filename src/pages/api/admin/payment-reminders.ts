/**
 * Payment reminders - Admin endpoint to send automated reminders
 */

import type { Context } from 'astro';
import { payments, paymentSettings } from '@/lib/payments';
import { validateToken } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export async function POST(context: Context): Promise<Response> {
  const token = context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user || !user.is_admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized - Admin required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { type, event_id, user_id } = await context.locals.request.json();

    // Get all pending payments that need reminders
    let pendingPayments = await payments.getByUser(context.locals.runtime.env.DB, user_id);

    // Filter by event if specified
    if (event_id) {
      pendingPayments = pendingPayments.filter(p => p.event_id === event_id);
    }

    // Filter for pending payments
    pendingPayments = pendingPayments.filter(p => p.status === 'pending');

    const sentReminders = [];

    for (const payment of pendingPayments) {
      // Get event details for the email
      const eventStmt = await context.locals.runtime.env.DB.prepare('SELECT name FROM events WHERE id = ?').bind(payment.event_id);
      const event = await eventStmt.first();

      if (!event) continue;

      // Get payment settings
      const settings = await paymentSettings.getByEvent(context.locals.runtime.env.DB, payment.event_id);

      // Determine reminder type based on due date
      let reminderType = 'general';
      let daysUntilDeadline = 3; // Default

      if (settings && settings.payment_deadline) {
        const now = Math.floor(Date.now() / 1000);
        const hoursUntilDeadline = Math.max(0, settings.payment_deadline - now) / 3600;

        if (hoursUntilDeadline <= 24) {
          reminderType = 'urgent';
          daysUntilDeadline = 1;
        } else if (hoursUntilDeadline <= 72) {
          reminderType = 'soon';
          daysUntilDeadline = 3;
        }
      }

      // Get user details
      const userStmt = await context.locals.runtime.env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(payment.user_id);
      const userRecord = await userStmt.first();

      if (!userRecord) continue;

      // Send email reminder
      await sendEmail({
        to: userRecord.email,
        subject: `Payment Reminder - ${event.name}`,
        html: `
          <h2>Payment Reminder - ${event.name}</h2>

          <p>Hi ${userRecord.name},</p>

          <p>This is a reminder that your entry fee for <strong>${event.name}</strong> is still pending.</p>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Amount:</strong> $${(payment.amount_cents / 100).toFixed(2)}</p>
            ${settings?.payment_deadline ? `<p><strong>Due:</strong> ${new Date(settings.payment_deadline * 1000).toLocaleDateString()}</p>` : ''}
            <p><strong>Payment methods:</strong> ${settings?.payment_methods?.join(', ') || 'Venmo, CashApp'}</p>
            ${settings?.payment_instructions ? `<p><strong>Instructions:</strong> ${settings.payment_instructions}</p>` : ''}
          </div>

          <p>Please submit your payment screenshot or transaction ID to confirm your participation.</p>

          <p>You have ${daysUntilDeadline} day${daysUntilDeadline !== 1 ? 's' : ''} remaining to submit your payment before the deadline.</p>

          <a href="${context.locals.runtime.env.SITE_URL}/dashboard" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Submit Payment</a>

          <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
            If you have already submitted your payment, please disregard this email.
          </p>
        `,
      });

      sentReminders.push({
        payment_id: payment.id,
        event_name: event.name,
        reminder_type: reminderType,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      sent_reminders: sentReminders,
      count: sentReminders.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending payment reminders:', error);
    return new Response(JSON.stringify({ error: 'Failed to send payment reminders' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Automated reminder check (can be called from a cron job)
export async function GET(context: Context): Promise<Response> {
  const token = context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user || !user.is_admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized - Admin required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get all events with payment deadlines
    const eventsStmt = await context.locals.runtime.env.DB.prepare(`
      SELECT e.id, e.name, ps.payment_deadline, ps.entry_fee_cents
      FROM events e
      LEFT JOIN payment_settings ps ON e.id = ps.event_id
      WHERE ps.payment_deadline IS NOT NULL
      AND ps.payment_deadline > strftime('%s', 'now')
      ORDER BY ps.payment_deadline
    `);
    const eventsResults = await eventsStmt.all();

    const now = Math.floor(Date.now() / 1000);
    const upcomingReminders = [];

    for (const event of eventsResults.results) {
      const deadline = event.payment_deadline;
      const hoursUntilDeadline = (deadline - now) / 3600;

      // Send reminders at specific intervals before deadline
      if (hoursUntilDeadline <= 24 || hoursUntilDeadline <= 72) {
        // Get users who haven't paid
        const paymentsStmt = await context.locals.runtime.env.DB.prepare(`
          SELECT DISTINCT u.id, u.name, u.email
          FROM users u
          WHERE u.id NOT IN (
            SELECT DISTINCT user_id FROM payments
            WHERE event_id = ? AND status = 'confirmed'
          )
        `).bind(event.id);
        const usersResult = await paymentsStmt.all();

        upcomingReminders.push({
          event_name: event.name,
          hours_until_deadline: Math.round(hoursUntilDeadline),
          users_to_remind: usersResult.results.length,
          entry_fee_cents: event.entry_fee_cents,
        });
      }
    }

    return new Response(JSON.stringify({
      upcoming_reminders: upcomingReminders,
      total_events: eventsResults.results.length,
      urgent_events: upcomingReminders.filter(r => r.hours_until_deadline <= 24).length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error checking automated reminders:', error);
    return new Response(JSON.stringify({ error: 'Failed to check reminders' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
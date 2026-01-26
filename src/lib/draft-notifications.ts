/**
 * Draft notification system
 * Handles email notifications for draft turns
 */

import type { D1Database } from '@cloudflare/workers-types';

// Notification types
export interface DraftNotification {
  draft_id: string;
  user_id: string;
  type: 'your_turn' | 'reminder' | 'pick_made' | 'draft_started' | 'draft_completed';
  data?: Record<string, any>;
}

// Send notification to user that it's their turn
export async function notifyNextPicker(
  db: D1Database,
  draftId: string,
  userId: string,
  deadline: number,
  eventName: string
): Promise<void> {
  // Get user details
  const userStmt = await db.prepare('SELECT email, name FROM users WHERE id = ?').bind(userId);
  const user = await userStmt.first();

  if (!user) {
    console.error('User not found for notification:', userId);
    return;
  }

  // TODO: Send email via Resend
  // const email = await resend.emails.send({
  //   from: 'The Vig <noreply@khamel.com>',
  //   to: user.email,
  //   subject: `It's your turn to pick! - ${eventName}`,
  //   html: draftTurnEmailTemplate(eventName, deadline),
  // });

  console.log(`Would send email to ${user.email}: It's your turn to pick in ${eventName}`);
}

// Send reminder notification
export async function sendReminder(
  db: D1Database,
  draftId: string,
  userId: string,
  deadline: number,
  eventName: string
): Promise<void> {
  const userStmt = await db.prepare('SELECT email, name FROM users WHERE id = ?').bind(userId);
  const user = await userStmt.first();

  if (!user) {
    console.error('User not found for reminder:', userId);
    return;
  }

  const remainingHours = Math.floor((deadline - Date.now() / 1000) / 3600);

  // TODO: Send email via Resend
  console.log(`Would send reminder email to ${user.email}: ${remainingHours}h left to pick in ${eventName}`);
}

// Email template for draft turn
function draftTurnEmailTemplate(eventName: string, deadline: number): string {
  const deadlineDate = new Date(deadline * 1000);
  const formattedDate = deadlineDate.toLocaleString();

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>It's Your Turn!</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>It's your turn to make a pick in the <strong>${eventName}</strong> draft!</p>
            <p>Please make your selection before the deadline:</p>
            <p style="font-size: 18px; font-weight: bold; color: #dc2626;">${formattedDate}</p>
            <a href="https://khamel.com/drafts/${eventName}" class="button">Go to Draft Room</a>
            <p>If you don't pick in time, your pick will be automatically skipped.</p>
            <p>Good luck!</p>
          </div>
          <div class="footer">
            <p>The Vig - Fantasy Sports Pools</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Email template for reminder
function draftReminderEmailTemplate(eventName: string, remainingHours: number): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Reminder: Your Pick is Due Soon!</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>You have <strong>${remainingHours} hours</strong> left to make your pick in the <strong>${eventName}</strong> draft.</p>
            <p>Don't forget to make your selection or you'll be auto-skipped!</p>
            <a href="https://khamel.com/drafts/${eventName}" class="button">Go to Draft Room</a>
          </div>
        </div>
      </body>
    </html>
  `;
}

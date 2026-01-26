/**
 * Email utilities using Resend API
 */

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  from?: string;
};

// Send email using Resend
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ADMIN_EMAIL || 'noreply@khamel.com';

  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from || `The Vig <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', error);
      return { success: false, error: `Failed to send email: ${error}` };
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);

    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Email templates
export const emailTemplates = {
  // Payment confirmation email
  paymentConfirmed: (eventName: string, amount: string, confirmedBy: string) => `
    <h2>Payment Confirmed - ${eventName}</h2>
    <p>Great news! Your payment for <strong>${eventName}</strong> has been confirmed.</p>
    <p><strong>Amount:</strong> ${amount}<br>
    <strong>Confirmed by:</strong> ${confirmedBy}</p>
    <p>You're all set to participate in the pool!</p>
  `,

  // Payment rejection email
  paymentRejected: (eventName: string, reason: string) => `
    <h2>Payment Rejected - ${eventName}</h2>
    <p>We're sorry, but your payment for <strong>${eventName}</strong> has been rejected.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>Please resubmit your payment or contact the pool admin if you have any questions.</p>
  `,

  // Dispute opened
  disputeOpened: (paymentDetails: string) => `
    <h2>Payment Dispute - New Message</h2>
    <p>A dispute has been opened for the following payment:</p>
    <p><strong>Details:</strong> ${paymentDetails}</p>
    <p>Please review the dispute message and resolve it at your earliest convenience.</p>
  `,

  // Dispute resolved
  disputeResolved: (resolution: string, amount?: string) => `
    <h2>Dispute Resolved</h2>
    <p>The payment dispute has been resolved with the following outcome:</p>
    <p><strong>Resolution:</strong> ${resolution}</p>
    ${amount ? `<p><strong>Amount:</strong> ${amount}</p>` : ''}
    <p>Thank you for your prompt attention to this matter.</p>
  `,

  // Draft notification
  draftTurn: (eventName: string, round: number, pickNumber: number, draftLink: string) => `
    <h2>It's Your Turn to Pick!</h2>
    <p>Hi there,</p>
    <p>It's your turn to make your pick in the <strong>${eventName}</strong> draft.</p>
    <p><strong>Round:</strong> ${round}<br>
    <strong>Your pick:</strong> #${pickNumber}</p>
    <p>You have 24 hours to make your pick before it's automatically skipped.</p>
    <a href="${draftLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Make Your Pick</a>
    <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
      The Vig
    </p>
  `,

  // Draft reminder
  draftReminder: (eventName: string, round: number, pickNumber: number, draftLink: string) => `
    <h2>Draft Reminder - ${eventName}</h2>
    <p>This is a reminder that you have 12 hours left to make your pick in <strong>${eventName}</strong>.</p>
    <p><strong>Round:</strong> ${round}<br>
    <strong>Your pick:</strong> #${pickNumber}</p>
    <p>Please make your selection soon to avoid being auto-skipped.</p>
    <a href="${draftLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Make Your Pick</a>
    <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
      The Vig
    </p>
  `,

  // User invited to pool
  poolInvite: (eventName: string, inviteLink: string, inviterName: string) => `
    <h2>You've Been Invited to Join a Pool!</h2>
    <p>${inviterName} has invited you to join <strong>${eventName}</strong>.</p>
    <p>Click the link below to join the pool:</p>
    <a href="${inviteLink}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Join Pool</a>
    <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
      This invitation was sent by ${inviterName} via The Vig. If you didn't expect this invitation, you can safely ignore this email.
    </p>
  `,

  // Pool completed
  poolCompleted: (eventName: string, finalStandings: string) => `
    <h2>${eventName} - Final Results</h2>
    <p>The ${eventName} pool has concluded! Here are the final standings:</p>
    <pre style="background: #f3f4f6; padding: 16px; border-radius: 8px; font-family: monospace;">${finalStandings}</pre>
    <p>Congratulations to all participants!</p>
    <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
      Thanks for playing with The Vig!
    </p>
  `,
};
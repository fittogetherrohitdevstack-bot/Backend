const { Resend } = require("resend");
const config = require("../Config/env");

/**
 * Initialize Resend client dynamically using process.env.RESEND_API_KEY
 */
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.trim() : "";
  if (!apiKey) return null;
  return new Resend(apiKey);
};

/**
 * Dispatch password reset email with 6-digit verification code & direct link
 */
const sendPasswordResetEmail = async ({
  toEmail,
  userName = "Athlete",
  resetCode,
  resetToken,
}) => {
  const client = getResendClient();
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || "FitTogether <onboarding@resend.dev>";
  const resetUrl = `${config.CLIENT_URL}/reset-password/${resetToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your FitTogether Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F6FB; margin: 0; padding: 24px; color: #1E293B; }
        .card { max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
        .header { background: #0F172A; padding: 28px 24px; text-align: center; }
        .header h1 { color: #FFFFFF; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { color: #94A3B8; margin: 6px 0 0; font-size: 13px; font-weight: 500; }
        .body { padding: 32px 28px; }
        .greeting { font-size: 15px; font-weight: 600; color: #334155; margin-bottom: 12px; }
        .text { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
        .code-box { background: #F8FAFC; border: 2px dashed #84CC16; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 24px; }
        .code-label { font-size: 11px; font-weight: 800; color: #65A30D; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .code-val { font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #0F172A; }
        .btn { display: block; width: 100%; box-sizing: border-box; text-align: center; background: linear-gradient(135deg, #65A30D 0%, #10B981 100%); color: #FFFFFF !important; font-weight: 800; font-size: 14px; text-decoration: none; padding: 14px 24px; border-radius: 14px; margin-bottom: 24px; }
        .footer { border-top: 1px solid #F1F5F9; padding-top: 20px; font-size: 12px; color: #94A3B8; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>FitTogether</h1>
          <p>Account Security & Recovery</p>
        </div>
        <div class="body">
          <div class="greeting">Hi ${userName},</div>
          <div class="text">
            We received a request to reset your password. Use the 6-digit verification code below to restore access to your FitTogether squad:
          </div>

          <div class="code-box">
            <div class="code-label">Your Verification Code</div>
            <div class="code-val">${resetCode}</div>
          </div>

          <a href="${resetUrl}" class="btn" style="color: #ffffff !important;">Reset Password Directly &rarr;</a>

          <div class="footer">
            <p><strong>Security Notice:</strong> This code and link will expire in <strong>15 minutes</strong>.</p>
            <p>If you did not make this request, you can safely ignore this email. Your current password remains secure.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  if (!client) {
    console.warn(
      `[EmailService] RESEND_API_KEY not configured in .env. Real email not dispatched to ${toEmail}.`
    );
    console.log(`[EmailService] Simulation/Dev Code for ${toEmail}: ${resetCode}`);
    return { sent: false, reason: "NO_RESEND_API_KEY", code: resetCode };
  }

  try {
    const data = await client.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: "FitTogether - Password Reset Code",
      html: htmlContent,
    });
    console.log(
      `[EmailService] Real password reset email dispatched via Resend to ${toEmail}:`,
      data
    );
    return { sent: true, data };
  } catch (error) {
    console.error(
      `[EmailService] Failed to dispatch email via Resend to ${toEmail}:`,
      error.message
    );
    return { sent: false, error: error.message, code: resetCode };
  }
};

module.exports = {
  sendPasswordResetEmail,
};

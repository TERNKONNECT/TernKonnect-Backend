import express from "express";
import { Resend } from "resend";
import TrialSignup from "../models/TrialSignup.js";

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

function generateAccountCode(email, id) {
  const raw = `${email}-${id}`;
  return Buffer.from(raw).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
}

function buildTrialEmail(name, email, website, accountCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>TernKonnect – Trial Activated</title>
</head>
<body style="margin:0;padding:0;background-color:#f0effe;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0effe;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(99,102,241,0.10);">

        <!-- ── HEADER ── -->
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 40px 32px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="width:56px;height:56px;background:rgba(255,255,255,0.18);border-radius:50%;text-align:center;vertical-align:middle;">
                        <span style="font-size:22px;font-weight:900;color:#fff;line-height:56px;display:block;">T</span>
                      </td>
                    </tr>
                  </table>
                  <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:3px;margin-top:12px;">TERNKONNECT</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px;letter-spacing:1px;">Accessibility Solution</div>
                  <!-- Badge -->
                  <div style="display:inline-block;background:#22c55e;color:#ffffff;font-size:13px;font-weight:700;padding:7px 20px;border-radius:100px;margin-top:20px;letter-spacing:0.3px;">
                    &#9989; 7-Day Free Trial Activated
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="background:#ffffff;padding:40px 40px 32px;">

            <!-- Greeting -->
            <p style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 10px;">Hi ${name},</p>
            <p style="font-size:14px;color:#555;line-height:1.75;margin:0 0 8px;">
              Welcome and thank you for choosing the <strong style="color:#1a1a2e;">TernKonnect Accessibility Solution!</strong>
              Your commitment to digital accessibility is invaluable!
            </p>
            <p style="font-size:14px;color:#555;line-height:1.75;margin:0 0 28px;">
              Here's a quick guide to get started:
            </p>

            <!-- STEP 1 -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7ff;border-radius:10px;margin-bottom:16px;">
              <tr>
                <td style="padding:24px 24px 20px;">
                  <div style="font-size:11px;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">STEP 1 &mdash; INSTALL THE WIDGET</div>
                  <p style="font-size:14px;color:#555;line-height:1.75;margin:0 0 14px;">
                    Place the following embed code as the <strong>first entry</strong> in your site's
                    <code style="background:#e8e5ff;color:#4f46e5;padding:2px 6px;border-radius:4px;font-size:12px;">&lt;head&gt;</code>
                    tag, and enjoy a seamless, performance-friendly integration.
                  </p>
                  <!-- Code block -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1e1e2e;border-radius:8px;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <code style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#a6e3a1;word-break:break-all;white-space:pre-wrap;">&lt;script src="https://widget.ternkonnect.com/widget.js" data-account="${accountCode}"&gt;&lt;/script&gt;</code>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size:13px;color:#888;margin:12px 0 0;line-height:1.6;">
                    &#128161; <em>Note: Once you upgrade to Pro, there's no need to replace this code &mdash; it updates automatically!</em>
                  </p>
                </td>
              </tr>
            </table>

            <!-- STEP 2 -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7ff;border-radius:10px;margin-bottom:16px;">
              <tr>
                <td style="padding:24px 24px 20px;">
                  <div style="font-size:11px;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">STEP 2 &mdash; VERIFY INSTALLATION</div>
                  <p style="font-size:14px;color:#555;line-height:1.75;margin:0;">
                    Visit your website
                    <a href="${website}" style="color:#6366f1;font-weight:600;text-decoration:none;">${website}</a>
                    and look for the accessibility button in the bottom-right corner.
                    If you see it, the widget is installed correctly! &#127881;
                  </p>
                </td>
              </tr>
            </table>

            <!-- STEP 3 -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7ff;border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:24px 24px 20px;">
                  <div style="font-size:11px;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">STEP 3 &mdash; UPGRADE TO PREMIUM</div>
                  <p style="font-size:14px;color:#555;line-height:1.75;margin:0 0 18px;">
                    Your 7-day free trial gives you full access. After 7 days, upgrade to Premium to maintain compliance and unlock all features.
                  </p>
                  <a href="https://ternkonnect.com/upgrade" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                    Upgrade to Premium &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- Warning -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1.5px solid #fbbf24;border-radius:10px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:8px;">&#9888;&#65039; Important</div>
                  <p style="font-size:13px;color:#78350f;line-height:1.75;margin:0;">
                    Subscribing to TernKonnect Premium Widget is crucial for compliance. By default, installing the code gives you the free Widget, which only addresses basic usability but not compliance. Only the Pro version offers 24/7 automatic code fixes, powered-up legal protection, and mitigated legal risk.
                    <a href="https://ternkonnect.com/upgrade" style="color:#d97706;font-weight:700;text-decoration:none;">Upgrade easily via this link &rarr;</a>
                  </p>
                </td>
              </tr>
            </table>

            <p style="font-size:13px;color:#888;margin:0;line-height:1.7;">
              Questions? Reply to this email or contact us at
              <a href="mailto:ternkonnect@gmail.com" style="color:#6366f1;font-weight:600;text-decoration:none;">ternkonnect@gmail.com</a>
            </p>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td align="center" style="background:#f0effe;padding:24px 40px;border-top:1px solid #e5e2ff;">
            <p style="font-size:12px;color:#999;margin:0 0 4px;">&copy; 2026 TERNKONNECT. All rights reserved.</p>
            <a href="https://ternkonnect.com" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:600;">ternkonnect.com</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

router.post("/", async (req, res) => {
  try {
    const { name, email, website, plan } = req.body;
    if (!name || !email || !website || !plan)
      return res.status(400).json({ error: "All fields are required" });

    const signup = await TrialSignup.create({ name, email, website, plan });

    if (plan === "trial") {
      const accountCode = generateAccountCode(email, signup.id);
      await resend.emails.send({
        from: "TernKonnect <onboarding@resend.dev>",
        to: email,
        subject: "✅ Your 7-Day Free Trial is Now Active!",
        html: buildTrialEmail(name, email, website, accountCode),
      });
    }

    res.status(201).json({ success: true, id: signup.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

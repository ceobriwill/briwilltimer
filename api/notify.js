import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();
// Escape user input before putting it into HTML emails
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normalize Nigerian numbers to E.164 format (+234...) for Brevo/WhatsApp Cloud API
function normalizeWhatsApp(number) {
  if (!number) return "";
  const digits = String(number).replace(/\D/g, ""); // strip spaces, dashes, etc.
  if (!digits) return "";
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return `+234${digits}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { name: rawName, subject, message, whatsapp } = req.body || {};
  const name = String(rawName || "").trim();
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (!name || !email) {
    return res
      .status(400)
      .json({ status: "error", message: "Name and email are required." });
  }

  if (
    name.length > 100 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      status: "error",
      message: "Please enter a valid name and email address.",
    });
  }

  if (message && String(message).length > 5000) {
    return res.status(400).json({
      status: "error",
      message: "Your message is too long. Please shorten it and try again.",
    });
  }

  const formattedWhatsapp = normalizeWhatsApp(whatsapp);
  const isContactForm = Boolean(message);
  // Waitlist signups must have a valid Nigerian mobile number
  if (!isContactForm) {
    const cleanNumber = String(whatsapp || "").replace(/[\s-]/g, "");
    if (!/^(\+234|0)[789][01]\d{8}$/.test(cleanNumber)) {
      return res.status(400).json({
        status: "error",
        message:
          "Please enter a valid Nigerian WhatsApp number, e.g. 08012345678.",
      });
    }
  }

  const safeName = escapeHtml(name);
  const safeSubject = escapeHtml(subject || "");
  const safeMessage = escapeHtml(message || "").replace(/\n/g, "<br>");

  const HOME_LIST_ID = 3; // Home form subscribers (waitlist)
  const CONTACT_LIST_ID = 4; // Contact form messages
  const TEAM_EMAIL = process.env.NOTIFY_EMAIL || "hello@briwill.co";

  try {
    const listId = isContactForm ? CONTACT_LIST_ID : HOME_LIST_ID;

    // Stop repeat waitlist signups: no second email, WhatsApp or counter bump
    if (!isContactForm && process.env.ALLOW_DUPLICATE_SIGNUPS !== "true") {
      const existingResponse = await fetch(
        `https://api.sendinblue.com/v3/contacts/${encodeURIComponent(email.trim().toLowerCase())}`,
        { headers: { "api-key": process.env.SENDINBLUE_API_KEY } },
      );
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        if (existing.listIds?.includes(HOME_LIST_ID)) {
          return res.status(400).json({
            status: "error",
            message: "This email is already on the waitlist.",
          });
        }
      }
    }
    // Only send attributes we actually have, so a contact-form message
    // never wipes a waitlist member's saved WhatsApp number or name.
    const attributes = { FIRSTNAME: name };
    if (formattedWhatsapp) attributes.WHATSAPP = formattedWhatsapp;
    if (isContactForm) {
      attributes.SUBJECT = subject || "";
      attributes.MESSAGE = message;
    }

    // 1️⃣ Add contact to Brevo list
    const contactResponse = await fetch(
      "https://api.sendinblue.com/v3/contacts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.SENDINBLUE_API_KEY,
        },
        body: JSON.stringify({
          email: email,
          attributes,
          listIds: [listId],
          updateEnabled: true,
        }),
      },
    );

    if (!contactResponse.ok) {
      const errorText = await contactResponse.text();
      console.error("Contact error:", errorText);

      let userMessage = "Something went wrong. Please try again.";

      try {
        const parsedError = JSON.parse(errorText);
        const duplicateFields = parsedError?.metadata?.duplicate_identifiers;

        if (
          parsedError?.code === "duplicate_parameter" &&
          duplicateFields?.includes("WHATSAPP")
        ) {
          userMessage =
            "This WhatsApp number is already registered with another email. Please use a different number.";
        } else if (
          parsedError?.code === "duplicate_parameter" &&
          duplicateFields?.includes("EMAIL")
        ) {
          userMessage = "This email is already on the waitlist.";
        }
      } catch (parseErr) {
        // errorText wasn't valid JSON — fall back to generic message
      }

      return res.status(400).json({
        status: "error",
        message: userMessage,
      });
    }

    // 2️⃣ Build auto-reply email
    const contactReply = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Thanks for contacting Briwill</title>
<!--[if mso]><style>td,a,p{font-family:Arial,sans-serif !important;}</style><![endif]-->
<style>
  body{margin:0;padding:0;background:#EEF1F6;}
  a{text-decoration:none;}
  @media (max-width:620px){
    .container{width:100% !important;}
    .px{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:30px !important;line-height:36px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#EEF1F6;">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
  We received your message and will get back to you shortly.
  &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF1F6;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <tr>
      <td align="left" class="px" style="padding:0 8px 20px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding:0;">
              <img src="https://briwill.co/image/briwilllogo7.png" alt="Briwill" height="44" style="display:block;height:44px;border:0;">
            </td>
            <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:700;letter-spacing:4px;color:#12306B;padding:0;">
              <span style="display:inline-block;margin-left:-8px;">RIWILL</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

          <tr>
            <td class="px" style="background:#12306B;padding:44px 40px 40px 40px;">
              <p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#F7B089;">
                Hello ${safeName},
              </p>
              <h1 class="h1" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:44px;font-weight:700;color:#ffffff;">
                Thanks for contacting Briwill.
              </h1>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                <tr><td style="width:56px;height:4px;background:#E8641B;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:36px 40px 8px 40px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1F2937;">
                We received your message and our team will get back to you shortly.
              </p>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:24px 40px 36px 40px;">
              <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;color:#12306B;">
                Your message
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F5F7FB;border-left:4px solid #E8641B;border-radius:6px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#374151;">
                    ${safeMessage}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>

    <tr>
      <td align="center" class="px" style="padding:28px 24px 8px 24px;">
        <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4B5563;">
          Briwill Limited &middot; RC 8937142
        </p>
        <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4B5563;">
          Need to add something? Reply to this email or write to
          <a href="mailto:hello@briwill.co" style="color:#12306B;font-weight:700;">hello@briwill.co</a>
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9CA3AF;">
          &copy; 2026 Briwill. All rights reserved.
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

    const waitlistReply = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>You're on the Briwill waitlist</title>
<!--[if mso]><style>td,a,p{font-family:Arial,sans-serif !important;}</style><![endif]-->
<style>
  body{margin:0;padding:0;background:#EEF1F6;}
  a{text-decoration:none;}
  @media (max-width:620px){
    .container{width:100% !important;}
    .px{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:30px !important;line-height:36px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#EEF1F6;">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
  You're officially on the waitlist. You'll be among the first to be notified.
  &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF1F6;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <tr>
      <td align="left" class="px" style="padding:0 8px 20px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding:0;">
              <img src="https://briwill.co/image/briwilllogo7.png" alt="Briwill" height="44" style="display:block;height:44px;border:0;">
            </td>
            <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:700;letter-spacing:4px;color:#12306B;padding:0;">
              <span style="display:inline-block;margin-left:-8px;">RIWILL</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

          <tr>
            <td class="px" style="background:#12306B;padding:44px 40px 40px 40px;">
              <p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#F7B089;">
                Hi ${safeName},
              </p>
              <h1 class="h1" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:44px;font-weight:700;color:#ffffff;">
                You're on the Briwill waitlist.
              </h1>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                <tr><td style="width:56px;height:4px;background:#E8641B;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1F2937;">
                You're officially on the waitlist 🎊.
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1F2937;">
                When we kick off, you'll be among the first to be notified. Thanks for joining <strong>Briwill</strong>.
              </p>
            </td>
          </tr>

          <tr>
            <td class="px" align="left" style="padding:28px 40px 36px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://briwill.co" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="16%" stroke="f" fillcolor="#E8641B">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Visit Briwill</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="https://briwill.co" style="display:inline-block;background:#E8641B;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:50px;height:50px;padding:0 32px;border-radius:8px;">Visit Briwill</a>
              <!--<![endif]-->
            </td>
          </tr>

          <tr><td class="px" style="padding:0 40px;"><div style="height:1px;background:#E5E7EB;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>

          <tr>
            <td class="px" style="padding:28px 40px 36px 40px;">
              <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;font-weight:700;color:#12306B;">
                Want updates before launch?
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#4B5563;">
                We post progress on TikTok at
                <a href="https://www.tiktok.com/@princewil.l" style="color:#E8641B;font-weight:700;">@princewil.l</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>

    <tr>
      <td align="center" class="px" style="padding:28px 24px 8px 24px;">
        <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4B5563;">
          Briwill Limited &middot; RC 8937142
        </p>
        <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4B5563;">
          Questions? Reply to this email or write to
          <a href="mailto:hello@briwill.co" style="color:#12306B;font-weight:700;">hello@briwill.co</a>
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9CA3AF;">
          &copy; 2026 Briwill. All rights reserved. You received this because you joined the waitlist at briwill.co.
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

    const emailContent = isContactForm ? contactReply : waitlistReply;

    const emailResponse = await fetch(
      "https://api.sendinblue.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.SENDINBLUE_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: "Briwill", email: "hello@briwill.co" },
          to: [{ email: email, name: name }],
          subject: isContactForm
            ? "Thanks for contacting Briwill!"
            : "Welcome to Briwill Waitlist 🎊",
          htmlContent: emailContent,
        }),
      },
    );
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Email error:", errorText);

      return res.status(500).json({
        status: "error",
        message: "Email failed to send",
      });
    }

    // 2b️⃣ Notify the Briwill team of new contact-form messages.
    // Reply-To is the customer, so hitting Reply goes straight to them.
    if (isContactForm) {
      try {
        const teamResponse = await fetch(
          "https://api.sendinblue.com/v3/smtp/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": process.env.SENDINBLUE_API_KEY,
            },
            body: JSON.stringify({
              sender: { name: "Briwill Website", email: "hello@briwill.co" },
              to: [{ email: TEAM_EMAIL }],
              replyTo: { email: email, name: name },
              subject: `New contact message: ${subject || "No subject"}`.slice(
                0,
                150,
              ),
              htmlContent: `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1F2937;max-width:600px;">
  <h2 style="margin:0 0 16px 0;color:#12306B;">New contact message</h2>
  <p style="margin:0 0 4px 0;"><strong>From:</strong> ${safeName}</p>
  <p style="margin:0 0 4px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
  <p style="margin:0 0 16px 0;"><strong>Subject:</strong> ${safeSubject || "None"}</p>
  <div style="background:#F5F7FB;border-left:4px solid #E8641B;border-radius:6px;padding:16px 18px;">
    ${safeMessage}
  </div>
  <p style="margin:16px 0 0 0;color:#6B7280;font-size:13px;">Hit Reply to respond directly to the customer.</p>
</div>`,
            }),
          },
        );

        if (!teamResponse.ok) {
          console.error("Team notification error:", await teamResponse.text());
          // Don't fail the request — the customer's email already went out
        }
      } catch (err) {
        console.error("Team notification exception:", err);
      }
    }

    // 3️⃣ Send WhatsApp confirmation (waitlist signups only, not contact form)
    if (!isContactForm && formattedWhatsapp) {
      try {
        const whatsappResponse = await fetch(
          `https://graph.facebook.com/v26.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: formattedWhatsapp.replace("+", ""),
              type: "template",
              template: {
                name: "waitlist_welcome",
                language: { code: "en" }, // must match the language shown in Manage templates
                components: [
                  {
                    type: "body",
                    parameters: [
                      {
                        type: "text",
                        parameter_name: "customer_name",
                        text: name,
                      },
                    ],
                  },
                ],
              },
            }),
          },
        );

        const whatsappResult = await whatsappResponse.text();
        console.log(
          "WhatsApp response:",
          whatsappResponse.status,
          whatsappResult,
        );

        if (!whatsappResponse.ok) {
          console.error("WhatsApp send error:", whatsappResult);
          // Don't fail the whole request — email already succeeded
        }
      } catch (err) {
        console.error("WhatsApp send exception:", err);
        // Don't fail the whole request — email already succeeded
      }
    }

    // increment live waitlist
    // increment live waitlist
    if (!isContactForm) {
      try {
        await redis.set("waitlist_count", 500, { nx: true });
        await redis.incr("waitlist_count");
      } catch (err) {
        console.error("Failed to update waitlist counter:", err);
      }
    }

    return res.status(200).json({ status: "success" });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ status: "error", message: err.message || "Email failed" });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { name, email, subject, message, whatsapp } = req.body;

  // Normalize Nigerian numbers to E.164 format (+234...) for Brevo/WhatsApp Cloud API
  function normalizeWhatsApp(number) {
    if (!number) return "";
    const digits = number.replace(/\D/g, ""); // strip spaces, dashes, etc.
    if (digits.startsWith("234")) return `+${digits}`;
    if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
    return `+234${digits}`;
  }

  const formattedWhatsapp = normalizeWhatsApp(whatsapp);

  if (!name || !email) {
    return res
      .status(400)
      .json({ status: "error", message: "Name and email are required." });
  }

  try {
    // Determine which Sendinblue list to add to
    // Replace these IDs with your actual Sendinblue list IDs
    const HOME_LIST_ID = 3; // Home form subscribers
    const CONTACT_LIST_ID = 4; // Contact form messages

    const listId = message ? CONTACT_LIST_ID : HOME_LIST_ID;

    // 1️⃣ Add contact to Sendinblue list
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
          attributes: {
            FIRSTNAME: name,
            WHATSAPP: formattedWhatsapp,
            SUBJECT: subject || "",
            MESSAGE: message || "",
          },
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

    // 2️⃣ Send auto-reply email
    const emailContent = message
      ? `
<div style="font-family: Arial; padding-left: 30px; padding-right: 30px">
      <div style="margin: 20px 0; display: flex">
        <img
          src="https://briwill.co/image/briwilllogo7.png"
          style="width: 60px"
        />
        <h2 style="letter-spacing: 4px">BRIWILL</h2>
      </div>

      <h4>Thanks for contacting Briwill ✨</h4>
      <p>Hello ${name},</p>

      <p>We received your message and our team will get back to you shortly.</p>

      <p><strong>Your message:</strong></p>

      <p>${message}</p>

      <hr />

      <div
        style="
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          text-align: center;
          margin-top: 20px;
          letter-spacing: 2px;
        "
      >
        <p style="margin: 0">Best regards</p>
        <h3 style="margin: 0; letter-spacing: 1px">Briwill LTD</h3>
        <p style="margin: 0">✉️ hello@briwill.co</p>
        <p style="font-size: 12px; color: #888; margin: 0">
          © 2026 Briwill. All rights reserved
        </p>
      </div>
    </div>
`
      : `
 <body>
    <div
      style="
        font-family: Arial, sans-serif;
        background: #ffffff;
        padding: 30px;
        max-width: 600px;
        margin: auto;
        text-align: center;
      "
    >
      <div style="margin: 20px 0; display: flex">
        <img
          src="https://briwill.co/image/briwilllogo7.png"
          style="width: 60px"
        />
        <h2 style="letter-spacing: 4px">BRIWILL</h2>
      </div>

      <h1>Welcome to Briwill, ${name || "there"} ✨</h1>

      <p style="font-size: 16px; color: #444; line-height: 1.6">
        You're officially on the waitlist 🎊.<br /><br />
        When we kick off, you'll be among the first to be notified. Thanks for
        joining <strong>Briwill</strong>.
      </p>

      <a
        href="https://briwill.co"
        style="
          display: inline-block;
          margin-top: 25px;
          padding: 12px 25px;
          background: blue;
          color: #fff;
          text-decoration: none;
          border-radius: 6px;
          font-weight: bold;
        "
      >
        Visit Briwill
      </a>

      <hr style="margin: 40px 0; border: none; border-top: 1px solid #eee" />

      <div style="text-align: center; font-size: 13px; letter-spacing: 2px">
        <p>Best regards</p>
        <h3 style="letter-spacing: 1px">Briwill LTD</h3>
        <p>✉️ hello@briwill.co</p>
        <p style="font-size: 12px; color: #888">
          © 2026 Briwill. All rights reserved
        </p>
      </div>
    </div>
`;

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
          subject: message
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

    // 3️⃣ Send WhatsApp confirmation (waitlist signups only, not contact form)
    if (!message && formattedWhatsapp) {
      try {
        const whatsappResponse = await fetch(
          `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
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
                language: { code: "en" },
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

        if (!whatsappResponse.ok) {
          const whatsappError = await whatsappResponse.text();
          console.error("WhatsApp send error:", whatsappError);
          // Don't fail the whole request — email already succeeded
        }
      } catch (err) {
        console.error("WhatsApp send exception:", err);
        // Don't fail the whole request — email already succeeded
      }
    }

    // increment live waitlist
    if (!message) {
      try {
        await fetch(`${process.env.Base_URL}/api/counter`, { method: "POST" });
      } catch (err) {
        console.error("Failed to update waitlist counter");
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

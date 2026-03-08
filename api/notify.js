export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { name, email, subject, message } = req.body;

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

      return res.status(500).json({
        status: "error",
        message: "Failedd to save contact",
      });
    }

    // 2️⃣ Send auto-reply email
    const emailContent = message
      ? `
<div style="font-family: Arial; padding-left: 30px; padding-right: 30px">
      <h3>Thanks for contacting Briwill ✨</h3>
      <p>Hello ${name},</p>

      <p>We received your message and our team will get back to you shortly.</p>

      <p><strong>Your message:</strong></p>

      <p>${message}</p>

      <hr />

      <div
        style="
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: center;
        "
      >
        <p style="margin: 0">Best regards</p>
        <h3 style="margin: 0">Briwill LTD</h3>
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

    return res.status(200).json({ status: "success" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}

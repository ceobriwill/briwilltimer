import fetch from "node-fetch";

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
    await fetch("https://api.sendinblue.com/v3/contacts", {
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
    });

    // 2️⃣ Send auto-reply email
    const emailContent = message
      ? `<p>Hi ${name},</p>
         <p>Thanks for reaching out! We’ve received your message and will reply soon.</p>
         <p>Your message: ${message}</p>
         <p>— The Briwill Team</p>`
      : `<p>Hi ${name},</p>
         <p>Thanks for signing up! We’ll notify you as soon as Briwill launches 🚀</p>
         <p>— The Briwill Team</p>`;

    await fetch("https://api.sendinblue.com/v3/smtp/email", {
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
          : "Thanks for signing up to Briwill!",
        htmlContent: emailContent,
      }),
    });

    return res.status(200).json({ status: "success" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}

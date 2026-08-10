// Vercel serverless function — POST /api/appointments
// Validates the request, sends a notification email via Microsoft Graph
// (client-credentials flow), creates a calendar event on info@ateliersareno.com,
// and sends the customer an acknowledgment email.
//
// Required Vercel env vars (names — confirm against your actual project settings):
//   MS_CLIENT_ID
//   MS_TENANT_ID
//   MS_CLIENT_SECRET
//   MS_MAILBOX            (defaults to info@ateliersareno.com if unset)
//
// Required Microsoft Graph application permissions (admin consent granted):
//   Mail.Send                — already granted, used for both emails
//   Calendars.ReadWrite       — NOT confirmed granted. Required to create the
//                               calendar event step. If you have not granted
//                               this permission yet, the calendar step below
//                               will fail with a 403 from Graph; the request
//                               and email will still succeed. See note at
//                               bottom of file.

const STUDIO_ADDRESS = "734 Walt Whitman Road, Melville, NY 11747";
const MAILBOX = process.env.MS_MAILBOX || "info@ateliersareno.com";

function isValidEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function validate(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Invalid request body."];
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) errors.push("Name is required.");
  if (!isValidEmail(body.email)) errors.push("A valid email is required.");
  if (!body.phone || String(body.phone).replace(/\D/g, "").length < 7) errors.push("A valid phone number is required.");
  if (!body.service || typeof body.service !== "string") errors.push("Service is required.");
  if (!body.start || isNaN(Date.parse(body.start))) errors.push("A valid start time is required.");
  if (!body.end || isNaN(Date.parse(body.end))) errors.push("A valid end time is required.");
  if (body.start && body.end && Date.parse(body.end) <= Date.parse(body.start)) errors.push("End time must be after start time.");
  return errors;
}

async function getGraphToken() {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are not configured.");
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Graph token error:", data.error, data.error_description);
    throw new Error("Failed to authenticate with Microsoft Graph.");
  }
  return data.access_token;
}

function locationText(place) {
  return place === "Atelier" ? STUDIO_ADDRESS : (place || "");
}

async function sendNotificationEmail(token, appt) {
  const lines = [
    `Name: ${appt.name}`,
    `Email: ${appt.email}`,
    `Phone: ${appt.phone}`,
    `Service: ${appt.service}`,
    `Location: ${locationText(appt.place)}`,
    `Requested date/time: ${new Date(appt.start).toLocaleString("en-US", { timeZone: "America/New_York" })} (ET)`,
    appt.notes ? `Notes: ${appt.notes}` : null
  ].filter(Boolean);

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: `New appointment request — ${appt.name} (${appt.service})`,
        body: { contentType: "Text", content: lines.join("\n") },
        toRecipients: [{ emailAddress: { address: MAILBOX } }],
        replyTo: [{ emailAddress: { address: appt.email, name: appt.name } }]
      },
      saveToSentItems: true
    })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("Graph sendMail (notify) error:", errBody.error);
    throw new Error("Failed to send notification email.");
  }
}

async function sendAcknowledgmentEmail(token, appt) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: "Atelier Sareno — we received your appointment request",
        body: {
          contentType: "Text",
          content: `Hi ${appt.name},\n\nThank you for your appointment request for ${appt.service}. ` +
            `This is a request, not yet a confirmed booking — Atelier Sareno will be in touch within one business day to confirm.\n\n` +
            `Requested: ${new Date(appt.start).toLocaleString("en-US", { timeZone: "America/New_York" })} (ET)\n` +
            `Location: ${locationText(appt.place)}\n\n` +
            `Atelier Sareno\n${STUDIO_ADDRESS}`
        },
        toRecipients: [{ emailAddress: { address: appt.email } }]
      },
      saveToSentItems: false
    })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("Graph sendMail (ack) error:", errBody.error);
    // Non-fatal — the request still succeeded.
  }
}

async function createCalendarEvent(token, appt) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: `${appt.name} — ${appt.service}`,
      body: {
        contentType: "Text",
        content: [
          `Email: ${appt.email}`,
          `Phone: ${appt.phone}`,
          `Service: ${appt.service}`,
          `Location: ${locationText(appt.place)}`,
          appt.notes ? `Notes: ${appt.notes}` : null
        ].filter(Boolean).join("\n")
      },
      start: { dateTime: appt.start, timeZone: "UTC" },
      end: { dateTime: appt.end, timeZone: "UTC" },
      location: { displayName: locationText(appt.place) || "Atelier Sareno" }
    })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("Graph create event error:", errBody.error);
    throw new Error("CALENDAR_PERMISSION_OR_API_ERROR");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  const errors = validate(body);
  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors.join(" ") });
  }

  const appt = {
    name: String(body.name).trim(),
    email: String(body.email).trim(),
    phone: String(body.phone).trim(),
    service: String(body.service).trim(),
    place: String(body.place || "").trim(),
    notes: String(body.notes || "").trim(),
    start: body.start,
    end: body.end
  };

  try {
    const token = await getGraphToken();

    await sendNotificationEmail(token, appt);

    let calendarWarning = null;
    try {
      await createCalendarEvent(token, appt);
    } catch (calErr) {
      // Email already sent — don't fail the whole request over the calendar step.
      calendarWarning = "calendar_not_created";
      console.error("Calendar step failed (likely missing Calendars.ReadWrite permission):", calErr.message);
    }

    await sendAcknowledgmentEmail(token, appt);
const supabaseRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/appointments`, {
  method: "POST",
  headers: {
    apikey: process.env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  },
  body: JSON.stringify({
    name: appt.name,
    email: appt.email,
    phone: appt.phone,
    service: appt.service,
    place: appt.place,
    notes: appt.notes,
    start: appt.start,
    end: appt.end
  })
});

if (!supabaseRes.ok) {
  console.error("Supabase save failed:", await supabaseRes.text());
}
    return res.status(200).json({
      ok: true,
      message: "Appointment request received.",
      calendarWarning
    });
  } catch (err) {
    console.error("Appointment submission failed:", err.message);
    return res.status(502).json({ ok: false, error: "We couldn't send your request right now. Please try again shortly or call us directly." });
  }
};

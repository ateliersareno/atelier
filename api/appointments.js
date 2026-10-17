const { createApproval, escape } = require('../lib/approval');
// Vercel serverless function — POST /api/appointments
// Validates the request, sends a notification email via Microsoft Graph
// (client-credentials flow), creates a private owner review link,
// and sends the customer an acknowledgment email. Calendar creation happens
// only after owner approval via /api/appointment-approval.
//
// Required Vercel env vars (names — confirm against your actual project settings):
//   MS_CLIENT_ID
//   MS_TENANT_ID
//   MS_CLIENT_SECRET
//   MS_MAILBOX            (defaults to info@ateliersareno.com if unset)
//   RESEND_API_KEY         (used only for customer acknowledgment emails)
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

async function sendNotificationEmail(token, appt, approvalUrl) {
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
        body: { contentType: "HTML", content: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>New appointment request</h2><p>${lines.map(escape).join("<br>")}</p><p><a href="${escape(approvalUrl)}" style="display:inline-block;padding:14px 22px;background:#293e36;color:white;text-decoration:none">Review &amp; confirm appointment</a></p><p>Review or adjust the date, time and address before sending the client a confirmation. This private link expires in 14 days. Do not forward it.</p></div>` },
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

async function sendAcknowledgmentEmail(appt) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("RESEND_API_KEY is not configured; skipping customer acknowledgment.");
    return;
  }

  const requested = new Date(appt.start).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.6;max-width:640px;margin:0 auto;">
      <p>Dear ${escape(appt.name)},</p>
      <p>Thank you for your appointment request with Atelier Sareno.</p>
      <p>
        <strong>Service:</strong> ${escape(appt.service)}<br>
        <strong>Requested:</strong> ${requested} ET<br>
        <strong>Location:</strong> ${escape(locationText(appt.place))}
      </p>
      <p>This is a request, not yet a confirmed booking. We will contact you within one business day to confirm your appointment.</p>
      <p>If you have any questions, simply reply to this email.</p>
      <p style="margin-top:28px;">Respectfully,<br><strong>Atelier Sareno</strong><br>${STUDIO_ADDRESS}</p>
    </div>`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Atelier Sareno <info@ateliersareno.com>",
      to: [appt.email],
      subject: "Atelier Sareno — we received your appointment request",
      html,
      reply_to: MAILBOX
    })
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.text().catch(() => "");
    console.error("Resend acknowledgment error:", resendRes.status, errBody);
    // Non-fatal — the appointment request is already saved.
  }
}


module.exports = async function handler(req, res) {
 if (req.method === "GET") {
  res.setHeader("Cache-Control", "no-store");
  const supabaseRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/Appointments?select=start&or=(status.is.null,status.neq.cancelled)`,
    {
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`
      }
    }
  );

  if (!supabaseRes.ok) {
    return res.status(500).json({ ok: false, error: "Could not load availability." });
  }

  const rows = await supabaseRes.json();

  return res.status(200).json({
    ok: true,
    booked: rows.map(function (row) {
      return row.start;
    })
  });
}

if (req.method !== "POST") {
  res.setHeader("Allow", "GET, POST");
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
const supabaseRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/Appointments`, {
  method: "POST",
  headers: {
    apikey: process.env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
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
  const errorText = await supabaseRes.text();

  if (supabaseRes.status === 409) {
    return res.status(409).json({
      ok: false,
      error: "That appointment time is no longer available."
    });
  }

  console.error("Supabase save failed:", errorText);
  throw new Error("Could not save appointment");
}
 
    const saved = await supabaseRes.json();
    const approvalUrl = await createApproval(saved[0].id);
    await sendNotificationEmail(token, appt, approvalUrl);

    await sendAcknowledgmentEmail(appt);

    return res.status(200).json({
      ok: true,
      message: "Appointment request received."
    });
  } catch (err) {
    console.error("Appointment submission failed:", err.message);
    return res.status(502).json({ ok: false, error: "We couldn't send your request right now. Please try again shortly or call us directly." });
  }
};

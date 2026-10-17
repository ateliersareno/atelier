const { location: locationText } = require("./approval");
const MAILBOX = process.env.MS_MAILBOX || "info@ateliersareno.com";
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

async function createCalendarEvent(token, appt, transactionId) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionId,
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
      start: { dateTime: appt.start.replace(/Z$/, ""), timeZone: "UTC" },
      end: { dateTime: appt.end.replace(/Z$/, ""), timeZone: "UTC" },
      location: { displayName: locationText(appt.place) || "Atelier Sareno" }
    })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("Graph create event error:", errBody.error);
    throw new Error("CALENDAR_PERMISSION_OR_API_ERROR");
  }
}

module.exports={getGraphToken,createCalendarEvent};

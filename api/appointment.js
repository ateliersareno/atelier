export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(500).json({
        success: false,
        error: "N8N_WEBHOOK_URL is not configured",
      });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "Unable to send appointment request",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment request received",
    });
  } catch (error) {
    console.error("Appointment webhook error:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
}

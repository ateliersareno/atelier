const VERSION = '2026-10-16-v1';
// Only a checked optional checkbox grants consent. Client timestamps are ignored.
function consentRecord(body) {
  const granted = body?.sms_consent === true;
  return {
    sms_consent: granted,
    sms_consent_at: granted ? new Date().toISOString() : null,
    sms_consent_source: granted ? 'appointment_web_form' : null,
    sms_consent_version: granted ? VERSION : null
  };
}
module.exports = { consentRecord };

alter table public."Appointments"
  add column sms_consent boolean not null default false,
  add column sms_consent_at timestamptz,
  add column sms_consent_source text,
  add column sms_consent_version text;
comment on column public."Appointments".sms_consent is 'Consent recorded per request; never overrides a later STOP or opt-out. Existing requests default to no consent.';

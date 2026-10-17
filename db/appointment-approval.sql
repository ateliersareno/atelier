-- Private owner approval links. Only the existing server service role can access.
create table public.appointment_approvals (
  id uuid primary key default gen_random_uuid(),
  appointment_id bigint not null unique references public."Appointments"(id),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  state text not null default 'pending' check (state in ('pending','sending','sent')),
  sending_at timestamptz,
  sent_at timestamptz,
  email_id text
);
alter table public.appointment_approvals enable row level security;
revoke all on public.appointment_approvals from public, anon, authenticated;
grant select, insert, update on public.appointment_approvals to service_role;

create or replace function public.claim_appointment_approval(p_hash text, p_start timestamptz, p_place text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  approval public.appointment_approvals%rowtype;
  appt public."Appointments"%rowtype;
begin
  -- Serialize approval decisions so overlapping confirmations cannot both win.
  perform pg_advisory_xact_lock(728194621);
  select * into approval from public.appointment_approvals where token_hash = p_hash for update;
  if not found then raise exception 'INVALID_LINK'; end if;
  if approval.expires_at < now() then raise exception 'EXPIRED_LINK'; end if;
  select * into appt from public."Appointments" where id = approval.appointment_id for update;
  if approval.state = 'sent' then
    return jsonb_build_object('approval',to_jsonb(approval),'appointment',to_jsonb(appt));
  end if;
  if approval.state = 'sending' then
    if approval.sending_at < now() - interval '23 hours' then raise exception 'REVIEW_REQUIRED'; end if;
    if appt.start is distinct from p_start or appt.place is distinct from p_place then raise exception 'RETRY_SAME_DETAILS'; end if;
    return jsonb_build_object('approval',to_jsonb(approval),'appointment',to_jsonb(appt));
  end if;
  if coalesce(appt.status,'pending') <> 'pending' then raise exception 'NOT_PENDING'; end if;
  if p_start < now() then raise exception 'PAST_APPOINTMENT'; end if;
  if length(trim(p_place)) < 3 or length(p_place)>300 then raise exception 'INVALID_LOCATION'; end if;
  if exists(select 1 from public."Appointments" a where a.id<>appt.id
    and a.status in ('confirmed','confirming') and a.start < p_start + interval '90 minutes' and a."end" > p_start)
    then raise exception 'TIME_CONFLICT'; end if;
  update public."Appointments" set start=p_start, "end"=p_start+interval '90 minutes', place=p_place, status='confirming'
    where id=appt.id returning * into appt;
  update public.appointment_approvals set state='sending',sending_at=now() where id=approval.id returning * into approval;
  return jsonb_build_object('approval',to_jsonb(approval),'appointment',to_jsonb(appt));
end $$;
revoke all on function public.claim_appointment_approval(text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.claim_appointment_approval(text,timestamptz,text) to service_role;

create or replace function public.finish_appointment_approval(p_hash text,p_email_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare approval public.appointment_approvals%rowtype;
begin
  select * into approval from public.appointment_approvals where token_hash=p_hash for update;
  if not found or approval.state not in ('sending','sent') then raise exception 'INVALID_STATE'; end if;
  update public."Appointments" set status='confirmed' where id=approval.appointment_id;
  update public.appointment_approvals set state='sent',sent_at=coalesce(sent_at,now()),email_id=p_email_id where id=approval.id;
end $$;
revoke all on function public.finish_appointment_approval(text,text) from public,anon,authenticated;
grant execute on function public.finish_appointment_approval(text,text) to service_role;

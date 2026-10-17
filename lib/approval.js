const { randomBytes, createHash } = require('node:crypto');
const STUDIO = '734 Walt Whitman Road, Melville, NY 11747';
const MAILBOX = process.env.MS_MAILBOX || 'info@ateliersareno.com';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = token => createHash('sha256').update(token).digest('hex');
const format = iso => new Date(iso).toLocaleString('en-US', { timeZone:'America/New_York',dateStyle:'full',timeStyle:'short' });
function location(place) { return place === 'Atelier' ? STUDIO : place === 'At Your Location' ? '' : place; }
async function db(path, options={}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options, headers:{apikey:process.env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      'Content-Type':'application/json',...options.headers}, signal:AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(()=>null);
  if (!response.ok) { const error=new Error('Database request failed'); error.detail=data?.message; throw error; }
  return data;
}
async function createApproval(appointmentId) {
  const token=randomBytes(32).toString('hex');
  await db('appointment_approvals',{method:'POST',body:JSON.stringify({appointment_id:appointmentId,token_hash:hash(token)})});
  return `https://ateliersareno.com/confirm-appointment.html#${token}`;
}
// Interpret wall clock input in the atelier's timezone, regardless of device timezone.
function newYorkTime(date,time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !/^\d{2}:\d{2}$/.test(time||'')) throw new Error('INVALID_TIME');
  const wall=Date.parse(`${date}T${time}:00Z`);
  let stamp=wall;
  const parts = value => Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));
  for(let i=0;i<3;i++) { const p=parts(stamp); const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); stamp+=wall-represented; }
  const p=parts(stamp);
  if(`${p.year}-${p.month}-${p.day}`!==date || `${p.hour}:${p.minute}`!==time) throw new Error('INVALID_TIME');
  return new Date(stamp).toISOString();
}
function confirmationEmail(appt) {
  const text=`Dear ${appt.name},\n\nYour appointment with Atelier Sareno is confirmed.\n\nService: ${appt.service}\nDate and time: ${format(appt.start)} (New York time)\nLocation: ${location(appt.place)}\n\nWe look forward to welcoming you. If you need to change or cancel your appointment, reply to this email or call +1 (631) 223-8775.\n\nRespectfully,\nAtelier Sareno\n${STUDIO}`;
  return {from:'Atelier Sareno <info@ateliersareno.com>',to:[appt.email],reply_to:MAILBOX,
    subject:'Atelier Sareno — your appointment is confirmed',text,
    html:`<div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.7;max-width:640px;margin:auto"><h2 style="font-family:Georgia,serif">Your appointment is confirmed</h2><p>Dear ${escape(appt.name)},</p><p>We are pleased to confirm your appointment with Atelier Sareno.</p><p><strong>Service:</strong> ${escape(appt.service)}<br><strong>Date and time:</strong> ${escape(format(appt.start))} (New York time)<br><strong>Location:</strong> ${escape(location(appt.place))}</p><p>We look forward to welcoming you. To change or cancel your appointment, reply to this email or call +1 (631) 223-8775.</p><p>Respectfully,<br><strong>Atelier Sareno</strong><br>${STUDIO}</p></div>`};
}
module.exports={db,hash,createApproval,escape,location,format,newYorkTime,confirmationEmail};

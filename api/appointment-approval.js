const {getGraphToken,createCalendarEvent}=require('../lib/calendar');
const {db,hash,location,newYorkTime,confirmationEmail}=require('../lib/approval');
module.exports=async function(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed.'});}
  // Owner-only bearer link: never accept customer-provided identifiers as authority.
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({error:'Open the private review link in your appointment notification email.'});
  const tokenHash=hash(token);
  try {
    const approvals=await db(`appointment_approvals?token_hash=eq.${tokenHash}&select=*`);
    const approval=approvals?.[0];
    if(!approval) return res.status(404).json({error:'This review link is invalid.'});
    if(Date.parse(approval.expires_at)<Date.now()) return res.status(410).json({error:'This review link has expired. Contact the client directly to confirm.'});
    if(req.method==='GET') {
      const rows=await db(`Appointments?id=eq.${approval.appointment_id}&select=name,email,phone,service,place,notes,start,end,status`);
      if(!rows?.[0]) return res.status(404).json({error:'Appointment not found.'});
      return res.status(200).json({appointment:{...rows[0],place:location(rows[0].place)},state:approval.state});
    }
    if(req.headers.origin!=='https://ateliersareno.com') return res.status(403).json({error:'Please confirm from the Atelier Sareno review page.'});
    if(approval.state==='sent') return res.status(200).json({ok:true,alreadySent:true});
    if(!process.env.RESEND_API_KEY) return res.status(503).json({error:'Email is not configured. Contact the atelier administrator.'});
    let body=req.body;
    try {if(typeof body==='string') body=JSON.parse(body);}catch{return res.status(400).json({error:'Invalid request.'});}
    let start;
    try {start=newYorkTime(body?.date,body?.time);}catch{return res.status(400).json({error:'Choose a valid date and time in New York time.'});}
    const place=String(body?.place||'').trim();
    if(place.length<3||place.length>300) return res.status(400).json({error:'Enter the full meeting address (3–300 characters).'});
    const claimed=await db('rpc/claim_appointment_approval',{method:'POST',body:JSON.stringify({p_hash:tokenHash,p_start:start,p_place:place})});
    if(claimed.approval.state==='sent')return res.status(200).json({ok:true,alreadySent:true});
    const email=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','User-Agent':'AtelierSareno/1.0','Idempotency-Key':`appointment-confirmation/${claimed.approval.id}`},body:JSON.stringify(confirmationEmail(claimed.appointment)),signal:AbortSignal.timeout(15000)});
    const sent=await email.json().catch(()=>({}));
    if(!email.ok||!sent.id) return res.status(502).json({error:'Email delivery could not be confirmed. Keep the same details and retry; duplicate emails are prevented.'});
    let calendarWarning=false;
    try { await createCalendarEvent(await getGraphToken(),claimed.appointment,claimed.approval.id); } catch { calendarWarning=true; }
    await db('rpc/finish_appointment_approval',{method:'POST',body:JSON.stringify({p_hash:tokenHash,p_email_id:sent.id})});
    return res.status(200).json({ok:true,calendarWarning});
  }catch(error){
    const messages={TIME_CONFLICT:'That time overlaps another confirmed appointment. Choose another time.',PAST_APPOINTMENT:'Choose a future date and time.',RETRY_SAME_DETAILS:'A confirmation is already being sent. Reload and retry with the saved details.',REVIEW_REQUIRED:'An earlier email attempt needs manual review. Do not resend; contact the atelier administrator.',NOT_PENDING:'This appointment is no longer pending.',EXPIRED_LINK:'This review link has expired.'};
    // Never log bearer links, client data, provider responses, or credentials.
    return res.status(messages[error.detail]?409:502).json({error:messages[error.detail]||'We could not complete confirmation. Reload and retry with the same details.'});
  }
};

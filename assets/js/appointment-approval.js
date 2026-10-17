(function(){
  'use strict';
  var token=location.hash.slice(1);
  // Keep the capability out of network URLs, referrers, and copied page addresses.
  history.replaceState(null,'',location.pathname);
  var message=document.getElementById('message'),details=document.getElementById('details');
  var form=document.getElementById('approval-form'),button=document.getElementById('send');
  var date=document.getElementById('date'),time=document.getElementById('time'),place=document.getElementById('place');
  var appointment;
  function status(text,error){message.textContent=text;message.className=error?'error':'';}
  function preview(){document.getElementById('preview').textContent='EMAIL TO CLIENT\n\nDear '+appointment.name+',\n\nYour appointment with Atelier Sareno is confirmed.\n\nService: '+appointment.service+'\nDate: '+date.value+'\nTime: '+time.value+' (New York time)\nLocation: '+place.value+'\n\nWe look forward to welcoming you. To change or cancel, reply to this email or call +1 (631) 223-8775.\n\nRespectfully,\nAtelier Sareno';}
  async function request(method,body){
    var response=await fetch('/api/appointment-approval',{method:method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    var data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not load this appointment.');
    return data;
  }
  function done(){status('Appointment confirmed. The confirmation email has been accepted for delivery to '+appointment.email+'.');form.hidden=true;}
  if(!/^[a-f0-9]{64}$/.test(token)){status('Open the private “Review & confirm appointment” link in your Atelier Sareno notification email.',true);return;}
  request('GET').then(function(data){
    appointment=data.appointment;
    [['Client',appointment.name],['Email',appointment.email],['Phone',appointment.phone],['Service',appointment.service],['Notes',appointment.notes||'None']].forEach(function(row){var dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row[0];dd.textContent=row[1];document.getElementById('summary').append(dt,dd);});
    var parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(appointment.start)).map(function(p){return[p.type,p.value];}));
    date.value=parts.year+'-'+parts.month+'-'+parts.day;time.value=parts.hour+':'+parts.minute;place.value=appointment.place||'';
    details.hidden=false;
    if(data.state==='sent'){done();return;}
    if(data.state==='sending'){date.readOnly=time.readOnly=place.readOnly=true;status('An email attempt is pending. Retry the saved details to finish; duplicate emails are prevented.');}
    else status('Review the details below. No confirmation email has been sent yet.');
    preview();
  }).catch(function(error){status(error.message,true);});
  form.addEventListener('input',preview);
  form.addEventListener('submit',async function(event){
    event.preventDefault();button.disabled=true;button.textContent='Sending confirmation…';
    try{var result=await request('POST',{date:date.value,time:time.value,place:place.value});done();if(result.calendarWarning)status(message.textContent+' The calendar could not be updated automatically; add this appointment to your calendar manually.');}
    catch(error){status(error.message+' Reopen the original email link before changing any details.',true);date.readOnly=time.readOnly=place.readOnly=true;}
    finally{button.disabled=false;button.textContent='Confirm appointment & send email';}
  });
}());

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newYorkTime,confirmationEmail,hash}=require('../lib/approval');
const handler=require('../api/appointment-approval');
const token='a'.repeat(64);
process.env.RESEND_API_KEY='test-only';
process.env.SUPABASE_URL='https://database.test';
process.env.SUPABASE_SECRET_KEY='test-only';
const appt={name:'<script>name</script>',email:'test@example.test',service:'Suit',place:'Atelier',phone:'5550100',start:'2030-07-02T14:00:00Z',end:'2030-07-02T15:30:00Z',status:'pending'};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};}
function mockFetch({state='pending',emailFails=false,detail}={}){
  const calls=[];
  global.fetch=async(url,options={})=>{
    calls.push({url,options});
    let data;
    if(url.includes('appointment_approvals?'))data=[{id:'approval-id',appointment_id:7,state,expires_at:'2031-01-01'}];
    else if(url.includes('Appointments?'))data=[appt];
    else if(url.includes('claim_appointment_approval')){
      if(detail)return {ok:false,json:async()=>({message:detail})};
      data={approval:{id:'approval-id',state:'sending'},appointment:appt};
    }else if(url==='https://api.resend.com/emails')return{ok:!emailFails,json:async()=>emailFails?{}:{id:'email-id'}};
    else if(url.includes('login.microsoftonline'))return {ok:false,json:async()=>({error:'mock-calendar-unavailable'})};
    else if(url.includes('finish_appointment_approval'))data=null;
    else throw new Error('Unexpected fetch '+url);
    return {ok:true,json:async()=>data};
  };
  return calls;
}
const req=(method='GET',body)=>({method,headers:{authorization:'Bearer '+token,origin:'https://ateliersareno.com'},body});
const body={date:'2030-07-02',time:'10:00',place:'734 Walt Whitman Road, Melville, NY 11747'};
test('New York summer/winter conversion and nonexistent DST time',()=>{
  assert.equal(newYorkTime('2030-07-02','10:00'),'2030-07-02T14:00:00.000Z');
  assert.equal(newYorkTime('2030-01-02','10:00'),'2030-01-02T15:00:00.000Z');
  assert.throws(()=>newYorkTime('2030-03-10','02:30'));
  assert.throws(()=>newYorkTime('2030-02-30','10:00'));
});
test('HTML escaping and recipient comes from saved appointment',()=>{const email=confirmationEmail(appt);assert.deepEqual(email.to,['test@example.test']);assert(!email.html.includes('<script>'));assert(email.html.includes('&lt;script&gt;'));assert.equal(hash(token).length,64);});
test('invalid token does not access database',async()=>{const calls=mockFetch();const r=response();await handler({method:'GET',headers:{}},r);assert.equal(r.statusCode,401);assert.equal(calls.length,0);});
test('GET only reads and never sends/changes state',async()=>{const calls=mockFetch();const r=response();await handler(req(),r);assert.equal(r.statusCode,200);assert(calls.every(c=>!c.options.method));assert.equal(r.headers['Cache-Control'],'no-store');});
test('POST success sends fixed saved recipient with stable idempotency key and finalizes',async()=>{const calls=mockFetch();const r=response();await handler(req('POST',body),r);assert.equal(r.statusCode,200);assert(r.data.ok);const mail=calls.find(c=>c.url==='https://api.resend.com/emails');assert.equal(mail.options.headers['Idempotency-Key'],'appointment-confirmation/approval-id');assert.deepEqual(JSON.parse(mail.options.body).to,[appt.email]);assert(calls.some(c=>c.url.includes('finish_appointment_approval')));});
test('already sent does not send a second email',async()=>{const calls=mockFetch({state:'sent'});const r=response();await handler(req('POST',body),r);assert(r.data.alreadySent);assert.equal(calls.length,1);});
test('email failure never marks appointment confirmed',async()=>{const calls=mockFetch({emailFails:true});const r=response();await handler(req('POST',body),r);assert.equal(r.statusCode,502);assert(!calls.some(c=>c.url.includes('finish_appointment_approval')));});
test('time collision is reported without sending email',async()=>{const calls=mockFetch({detail:'TIME_CONFLICT'});const r=response();await handler(req('POST',body),r);assert.equal(r.statusCode,409);assert(!calls.some(c=>c.url==='https://api.resend.com/emails'));});
test('untrusted origin cannot submit',async()=>{const calls=mockFetch();const r=response();const q=req('POST',body);q.headers.origin='https://other.test';await handler(q,r);assert.equal(r.statusCode,403);assert.equal(calls.length,1);});

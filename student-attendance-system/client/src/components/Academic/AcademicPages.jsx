import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import api from '../../services/api';
import FaceAttendance from '../Attendance/FaceAttendance';
import PhotoUpload from '../Attendance/PhotoUpload';
import DownloadAttendance from '../Attendance/DownloadAttendance';
const base = '/academic';
const fieldClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-zinc-100';
const campus = value => new Date(value).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short' });
const dateToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const toISO = value => new Date(value + ':00+05:30').toISOString();
const offeringName = o => [o.courseId?.code, o.courseId?.name, o.classGroupId?.label, o.classGroupId?.section, o.termId?.name].filter(Boolean).join(' · ');
const message = e => e.response?.data?.message || 'Request failed. Please try again.';
function Notice({ error, success, busy }) { return <>{busy && <p role="status" className="text-zinc-400">Loading…</p>}{error && <p role="alert" className="rounded-xl bg-red-950/40 p-3 text-red-300">{error}</p>}{success && <p role="status" className="rounded-xl bg-emerald-950/40 p-3 text-emerald-300">{success}</p>}</>; }
function Select({label,items,value,onChange,describe,required=true}) {
    const [search,setSearch] = useState('');
    return <div><label className="block text-sm text-zinc-300 mb-1">{label}</label><input aria-label={'Search '+label} placeholder={'Search '+label} className={fieldClass+' mb-2'} value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label={label} required={required} className={fieldClass} value={value||''} onChange={e=>onChange(e.target.value)}>
            <option value="">Select {label.toLowerCase()}</option>{items.filter(i=>i._id===value || describe(i).toLowerCase().includes(search.toLowerCase())).map(i=><option key={i._id} value={i._id}>{describe(i)}</option>)}</select></div>;
}
function Input({label,value,onChange,type='text',required=true}) { return <label className="block text-sm text-zinc-300">{label}<input aria-label={label} required={required} className={fieldClass+' mt-1'} type={type} value={value||''} onChange={e=>onChange(e.target.value)}/></label>; }
function Shell({title,children}) { const {role}=useAuth(); return <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
    <nav className="flex flex-wrap gap-4 text-sm text-zinc-300"><Link to={role==='admin'?'/admin':role==='teacher'?'/dashboard':'/my-attendance'}>Dashboard</Link><Link to="/academic">Courses/classes</Link><Link to="/legacy-attendance">Legacy attendance</Link>{role!=='student'&&<Link to="/students">Student profiles</Link>}</nav>
    <h1 className="text-2xl font-semibold">{title}</h1>{children}</div>; }
export function AcademicHome() {
    const {role}=useAuth();
    const [query,setQuery]=useSearchParams();
    const [tab,setTab]=useState('offerings'), [data,setData]=useState({terms:[],classes:[],courses:[],offerings:[]});
    const [error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[form,setForm]=useState({}),[editing,setEditing]=useState('');
    const lock=useRef(false);
    useEffect(()=>{const selected=query.get('tab');if(role==='admin'&&['terms','classes','courses','offerings'].includes(selected)){setTab(selected);setForm({});setEditing('');}},[query.toString(),role]);
    async function load() { setBusy(true); try {
        const kinds=role==='admin'?['terms','classes','courses','offerings']:['offerings'];
        const results=await Promise.all(kinds.map(k=>api.get(base+(k==='offerings'?'/offerings':'/structures/'+k))));
        setData(d=>({...d,...Object.fromEntries(kinds.map((k,i)=>[k,results[i].data.items]))}));
    } catch(e) {setError(message(e));} finally {setBusy(false);} }
    useEffect(()=>{load();},[role]);
    const change=(key,value)=>setForm(f=>({...f,[key]:value}));
    async function save(e) {e.preventDefault(); if(lock.current)return; lock.current=true;setSaving(true);setError('');setSuccess('');
        try {const path=base+(tab==='offerings'?'/offerings':'/structures/'+tab)+(editing?'/'+editing:''); await api[editing?'patch':'post'](path,form); setForm({});setEditing('');setSuccess('Academic record saved.');await load();} catch(e){setError(message(e));} finally{lock.current=false;setSaving(false);} }
    async function archive(item) {if(lock.current)return;lock.current=true;setSaving(true);setError('');try {await api.patch(base+(tab==='offerings'?'/offerings':'/structures/'+tab)+'/'+item._id,{state:item.state==='active'?'archived':'active'});setSuccess('Lifecycle updated. Historical attendance remains readable.');await load();}catch(e){setError(message(e));}finally{lock.current=false;setSaving(false);}}
    return <Shell title={role==='admin'?'Academic management':role==='teacher'?'My courses/classes':'My course enrolments'}>
        <p className="text-zinc-400">A course offering links a course, term and class group. A student profile does not automatically create an enrolment or activate an account.</p>
        {role==='admin'&&<div className="flex flex-wrap gap-2">{['terms','classes','courses','offerings'].map(k=><button disabled={saving} key={k} className={tab===k?'btn-primary':'btn-secondary'} onClick={()=>{setTab(k);setQuery({tab:k});setForm({});setEditing('');setError('');setSuccess('');}}>{k==='classes'?'Class groups':k[0].toUpperCase()+k.slice(1)}</button>)}</div>}
        <Notice error={error} success={success} busy={busy}/>
        {role==='admin'&&<form onSubmit={save} className="card p-5 space-y-4"><h2 className="font-medium">{editing?'Update':'Create'} {tab}</h2><div className="grid gap-4 md:grid-cols-2">
            {tab==='terms'&&<><Input label="Term name" value={form.name} onChange={v=>change('name',v)}/><Input label="Future attendance minimum (%)" type="number" value={form.minimumAttendancePercent ?? 75} onChange={v=>change("minimumAttendancePercent",v)}/><Input label="Start date" type="date" value={form.startDate} onChange={v=>change('startDate',v)}/><Input label="End date" type="date" value={form.endDate} onChange={v=>change('endDate',v)}/></>}
            {tab==='classes'&&<><Input label="Class/year label" value={form.label} onChange={v=>change('label',v)}/><Input label="Section" required={false} value={form.section} onChange={v=>change('section',v)}/></>}
            {tab==='courses'&&<><Input label="Course code" value={form.code} onChange={v=>change('code',v)}/><Input label="Course name" value={form.name} onChange={v=>change('name',v)}/></>}
            {tab==='offerings'&&<><Select label="Course" items={data.courses.filter(i=>i.state==='active')} value={form.courseId} onChange={v=>change('courseId',v)} describe={i=>i.code+' · '+i.name}/><Select label="Term" items={data.terms.filter(i=>i.state==='active')} value={form.termId} onChange={v=>change('termId',v)} describe={i=>i.name+' ('+i.startDate+' – '+i.endDate+')'}/><Select label="Class group" items={data.classes.filter(i=>i.state==='active')} value={form.classGroupId} onChange={v=>change('classGroupId',v)} describe={i=>i.label+' '+i.section}/></>}
        </div><button disabled={saving} className="btn-primary">{saving?'Saving…':editing?'Save changes':'Create record'}</button>{editing&&<button type="button" className="btn-secondary ml-2" onClick={()=>{setEditing('');setForm({});}}>Cancel edit</button>}
            <p className="text-sm text-zinc-400">Archive stops new teaching/attendance through this structure. Existing sessions and marks remain readable. Referenced term dates cannot be rewritten.</p></form>}
        <div className="space-y-3">{!(data[tab]||[]).length&&!busy&&<p>No records yet. {role==='admin'?'Create the academic records above.':'Ask the Admin to assign or enrol your profile.'}</p>}
            {(data[tab]||[]).map(item=><div className="card p-4 flex flex-wrap gap-3 items-center justify-between" key={item._id}><div><p className="font-medium">{tab==='offerings'?offeringName(item):tab==='courses'?item.code+' · '+item.name:tab==='classes'?item.label+' '+item.section:item.name}</p><p className="text-sm text-zinc-400">{item.state}{tab==='terms'?' · '+item.startDate+' – '+item.endDate:''}</p></div><div className="flex gap-2">
                {tab==='offerings'&&<Link className="btn-primary" to={'/academic/offerings/'+item._id}>Open offering</Link>}
                {role==='admin'&&<>{tab!=='offerings'&&<button disabled={saving} className="btn-secondary" onClick={()=>{setEditing(item._id);setForm(item);}}>Edit</button>}<button disabled={saving} className="btn-secondary" onClick={()=>archive(item)}>{item.state==='active'?'Archive':'Restore'}</button></>}
            </div></div>)}</div>
    </Shell>;
}
function Withdrawal({row,kind,offeringId,onSaved,onError}) {
    const [end,setEnd]=useState(row.endDate),[busy,setBusy]=useState(false);
    return <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{await api.patch(base+'/offerings/'+offeringId+'/'+kind+'/'+row._id,{endDate:end});await onSaved();}catch(e){onError(message(e));}finally{setBusy(false);}}} className="flex flex-wrap gap-2 items-end">
        <Input label="Last eligible date" type="date" value={end} onChange={setEnd}/><button disabled={busy} className="btn-secondary">End {kind==='assignments'?'assignment':'enrolment'}</button></form>;
}
export function OfferingDetail() {
    const {id}=useParams(),{role}=useAuth();
    const [item,setItem]=useState(null),[roster,setRoster]=useState([]),[sessions,setSessions]=useState([]),[profiles,setProfiles]=useState({teachers:[],students:[]});
    const [date,setDate]=useState(dateToday()),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
    const [link,setLink]=useState({kind:'assignments'}),[session,setSession]=useState({}),lock=useRef(false);
    async function load() {
        setBusy(true); const result=await Promise.allSettled([api.get(base+'/offerings/'+id+'?date='+date),api.get(base+'/sessions?offeringId='+id),...(role==='admin'?[api.get(base+'/profiles')]:[])]);
        if(result[0].status==='fulfilled'){setItem(result[0].value.data.item);setRoster(result[0].value.data.roster);}else{setError(message(result[0].reason));setRoster([]);}
        if(result[1].status==='fulfilled')setSessions(result[1].value.data.items);else setError(message(result[1].reason));
        if(result[2]?.status==='fulfilled')setProfiles(result[2].value.data);setBusy(false);
    }
    useEffect(()=>{load();},[id,date]);
    async function submit(e,kind) {e.preventDefault();if(lock.current)return;lock.current=true;setSaving(true);setError('');setSuccess('');try{
        if(kind==='link'){await api.post(base+'/offerings/'+id+'/'+link.kind,{[link.kind==='assignments'?'teacherId':'studentId']:link.profileId,startDate:link.startDate,endDate:link.endDate});setLink({kind:link.kind});setSuccess('Effective link saved. No account or password was changed.');}
        else{await api.post(base+'/sessions',{offeringId:id,teacherId:session.teacherId,scheduledStart:toISO(session.start),scheduledEnd:toISO(session.end)});setSession({});setSuccess('Lecture session created. Select it before marking attendance.');}
        await load();
    }catch(e){setError(message(e));}finally{lock.current=false;setSaving(false);}}
    return <Shell title={item?offeringName(item):'Course offering'}>
        <Notice error={error} success={success} busy={busy}/>
        {role==='admin'&&item&&<section className="card p-5 space-y-4"><h2 className="font-semibold">Teacher assignments / Student enrolments</h2><p className="text-sm text-zinc-400">Select existing academic profiles. Dates are inclusive in Asia/Kolkata. Ending a link preserves past session rosters.</p>
            <form onSubmit={e=>submit(e,'link')} className="space-y-3"><select aria-label="Link type" className={fieldClass} value={link.kind} onChange={e=>setLink({kind:e.target.value})}><option value="assignments">Teacher assignment</option><option value="enrolments">Student enrolment</option></select>
                <div className="grid md:grid-cols-3 gap-3"><Select label={link.kind==='assignments'?'Teacher profile':'Student profile'} items={link.kind==='assignments'?profiles.teachers:profiles.students} value={link.profileId} onChange={v=>setLink(f=>({...f,profileId:v}))} describe={p=>p.name+' · '+(p.studentId||p.email||'No email')}/>
                <Input label="Effective start" type="date" value={link.startDate} onChange={v=>setLink(f=>({...f,startDate:v}))}/><Input label="Effective end" type="date" value={link.endDate} onChange={v=>setLink(f=>({...f,endDate:v}))}/></div><button disabled={saving} className="btn-primary">Save effective link</button></form>
            {['assignments','enrolments'].map(k=><div key={k}><h3 className="font-medium capitalize">{k}</h3>{!item[k]?.length&&<p className="text-zinc-400">No {k} yet.</p>}{item[k]?.map(r=><div className="border-t border-zinc-800 py-3" key={r._id}><p>{(r.teacherId||r.studentId)?.name||'Missing profile'} · {r.startDate} – {r.endDate} · {r.state}</p><Withdrawal row={r} kind={k} offeringId={id} onSaved={load} onError={setError}/></div>)}</div>)}
        </section>}
        <section className="card p-5 space-y-3"><h2 className="font-semibold">{role==='student'?'My eligibility':'Effective roster'}</h2><Input label="Roster date (Asia/Kolkata)" type="date" value={date} onChange={v=>{setError('');setDate(v);}}/>
            {!roster.length?<p className="text-zinc-400">No eligible students for this date, or roster access is unavailable.</p>:<ul>{roster.map(s=><li className="py-1" key={s.studentId}>{s.rollNo} · {s.name}</li>)}</ul>}</section>
        {role!=='student'&&<form onSubmit={e=>submit(e,'session')} className="card p-5 space-y-3"><h2 className="font-semibold">Create lecture session</h2><p className="text-sm text-zinc-400">Enter campus time in Asia/Kolkata. Separate time ranges create separate lectures on the same date.</p>
            {role==='admin'&&<Select label="Teaching Teacher" items={profiles.teachers} value={session.teacherId} onChange={v=>setSession(f=>({...f,teacherId:v}))} describe={p=>p.name+' · '+p.email}/>}
            <div className="grid sm:grid-cols-2 gap-3"><Input label="Lecture start" type="datetime-local" value={session.start} onChange={v=>setSession(f=>({...f,start:v}))}/><Input label="Lecture end" type="datetime-local" value={session.end} onChange={v=>setSession(f=>({...f,end:v}))}/></div>
            <button className="btn-primary" disabled={saving}>Create session</button></form>}
        <section className="space-y-3"><h2 className="font-semibold">Lecture sessions</h2>{!sessions.length&&!busy&&<p>No permitted sessions yet.</p>}
            {sessions.map(s=><Link className="card p-4 block hover:border-zinc-600" to={'/academic/sessions/'+s._id} key={s._id}><p>{campus(s.scheduledStart)} – {campus(s.scheduledEnd)}</p><p className="text-sm text-zinc-400">{s.teacher?.name} · {s.state} · {s.finalised?'Finalised':'Unfinalised'}</p></Link>)}</section>
    </Shell>;
}
export function SessionAttendance() {
    const {id}=useParams(),{role}=useAuth();
    const [item,setItem]=useState(null),[marks,setMarks]=useState({}),[tab,setTab]=useState('manual'),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[reason,setReason]=useState(''),[schedule,setSchedule]=useState({}),lock=useRef(false);
    async function load(){setBusy(true);try{const {data}=await api.get(base+'/sessions/'+id);setItem(data.item);setMarks(Object.fromEntries(data.item.records.map(r=>[r.studentId,r.status])));}catch(e){setError(message(e));}finally{setBusy(false);}}
    useEffect(()=>{load();},[id]);
    async function action(kind,body){if(lock.current)return;lock.current=true;setSaving(true);setError('');setSuccess('');try{
        if(kind==='export'){const {data}=await api.get(base+'/sessions/'+id+'/export',{responseType:'blob'});const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download='session-'+id+'.csv';a.click();URL.revokeObjectURL(url);setSuccess('Session CSV downloaded.');}
        else{const path=base+'/sessions/'+id+(kind==='manage'?'':kind==='reset'?'/attendance':'/'+kind);await api[kind==='manage'?'patch':kind==='reset'?'delete':'post'](path,body);setSuccess(kind==='finalise'?'Attendance finalised. Unmarked eligible students are absent.':'Session saved.');await load();}
    }catch(e){setError(message(e));}finally{lock.current=false;setSaving(false);}}
    const editable=role==='teacher'&&item?.canMark;
    return <Shell title="Attendance Management"><Notice error={error} success={success} busy={busy}/>{item&&<>
        <div className="card p-5 space-y-2"><Link className="text-blue-300" to={'/academic/offerings/'+item.offeringId}>Back to offering</Link><Link className="text-blue-300 block underline" to={"/attendance?session="+id}>Open Attendance: Live Video / Photo Upload / Manual / Today / Download</Link><p className="font-semibold">{item.offering?.course?.code} · {item.offering?.course?.name}</p><p>{item.offering?.classGroup?.label} / {item.offering?.classGroup?.section||'No section'} · {item.offering?.term?.name}</p>
        <p>{campus(item.scheduledStart)} – {campus(item.scheduledEnd)} (Asia/Kolkata)</p><p>Teacher: {item.teacher?.name||'Missing profile'} · {item.state} · {item.finalised?'Finalised':'Unfinalised'}</p><p className="text-sm text-zinc-400">{item.attendanceStarted?'Roster captured; later enrolment changes do not change this lecture.':'Roster will be captured when attendance first starts. Unmarked is not absent.'}</p>{item.cancellationReason&&<p>Cancellation reason: {item.cancellationReason}</p>}</div>
        {editable&&<div className="flex flex-wrap gap-2">{['camera','photo','manual'].map(t=><button className={tab===t?'btn-primary':'btn-secondary'} onClick={()=>setTab(t)} key={t}>{{camera:'Live Video',photo:'Photo Upload',manual:'Manual'}[t]}</button>)}</div>}
        <section className="card p-5 space-y-4"><h2 className="font-semibold">{role==='student'?'My attendance':'Session roster and marks'}</h2>{!item.roster.length&&<p>No eligible students. Attendance cannot start with an empty roster.</p>}
        {(!editable||tab==='manual')&&<><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left py-2">Student</th><th className="text-left">Status</th></tr></thead><tbody>{item.roster.map(s=><tr className="border-t border-zinc-800" key={s.studentId}><td className="py-3">{s.rollNo} · {s.name}</td><td>{editable?<select aria-label={'Status '+s.rollNo} className={fieldClass} value={marks[s.studentId]||''} onChange={e=>setMarks(m=>({...m,[s.studentId]:e.target.value}))}><option value="">Not marked</option>{['present','absent','late'].map(v=><option key={v}>{v}</option>)}</select>:item.records.find(r=>r.studentId===s.studentId)?.status||'not marked'}</td></tr>)}</tbody></table></div>
        {editable&&<button disabled={saving||!item.roster.length} className="btn-primary" onClick={()=>action('attendance',{records:Object.entries(marks).filter(([,status])=>status).map(([studentId,status])=>({studentId,status}))})}>Save manual marks</button>}</>}
        {editable&&tab==='camera'&&<FaceAttendance sessionId={id} onAttendanceMarked={load}/>}
        {editable&&tab==='photo'&&<PhotoUpload sessionId={id} onAttendanceMarked={load}/>}
        </section>
        <div className="card p-5 space-y-3">{role!=='student'&&<button disabled={saving} className="btn-secondary" onClick={()=>action('export')}>Export this session CSV</button>}
            {editable&&<><p className="text-sm text-zinc-400">Review marks before finalising. Finalisation completes the taught lecture and turns every remaining unmarked eligible student into absent. This cannot be silently reopened.</p><button disabled={saving||!item.roster.length} className="btn-primary" onClick={()=>action('finalise')}>Finalise reviewed attendance</button><button disabled={saving} className="btn-secondary ml-2" onClick={()=>action('reset')}>Reset unfinalised marks</button></>}
            {(role==='admin'&&item.state!=='cancelled'||editable)&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();action('manage',{state:'cancelled',cancellationReason:reason});}}><p className="text-sm text-zinc-400">Cancellation records a reason, preserves every mark and excludes the lecture from completed-session percentages.</p><Input label="Cancellation reason" value={reason} onChange={setReason}/><button disabled={saving} className="btn-secondary">Cancel lecture with reason</button></form>}
            {(role==='admin'||editable)&&item.state==='scheduled'&&!item.attendanceStarted&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();action('manage',{scheduledStart:toISO(schedule.start),scheduledEnd:toISO(schedule.end)});}}><h3>Reschedule unstarted lecture (Asia/Kolkata)</h3><Input label="New lecture start" type="datetime-local" value={schedule.start} onChange={v=>setSchedule(s=>({...s,start:v}))}/><Input label="New lecture end" type="datetime-local" value={schedule.end} onChange={v=>setSchedule(s=>({...s,end:v}))}/><button disabled={saving} className="btn-secondary">Save new times</button></form>}
        </div></>}</Shell>;
}
export function LegacyAttendance() {
    const {role}=useAuth(),[items,setItems]=useState([]),[offerings,setOfferings]=useState([]),[form,setForm]=useState({}),[preview,setPreview]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),lock=useRef(false);
    async function load(){setBusy(true);try{const res=await api.get(base+'/legacy');setItems(res.data.items);if(role==='admin')setOfferings((await api.get(base+'/offerings')).data.items);}catch(e){setError(message(e));}finally{setBusy(false);}}
    useEffect(()=>{load();},[role]);
    async function map(action){if(lock.current)return;lock.current=true;setSaving(true);setError('');setSuccess('');try{const {data}=await api.post(base+'/legacy/'+form.legacyId+'/'+action,{offeringId:form.offeringId,scheduledStart:toISO(form.start),scheduledEnd:toISO(form.end)});if(action==='preview')setPreview(data.preview||data.item);else{setSuccess('Mapped without changing the original. Imported marks remain unfinalised.');setPreview(null);await load();}}catch(e){setError(message(e));}finally{lock.current=false;setSaving(false);}}
    return <Shell title="Legacy attendance"><p className="text-zinc-400">Historical Teacher/date records remain unchanged. Unmapped records are excluded from course percentages. Select an explicit offering and lecture times; no name-based inference or same-day merging occurs.</p><Notice error={error} success={success} busy={busy}/>
        {role==='admin'&&<div className="card p-5 space-y-3"><h2 className="font-semibold">Preview explicit historical mapping</h2><Select label="Legacy record" items={items} value={form.legacyId} onChange={v=>{setForm(f=>({...f,legacyId:v}));setPreview(null);}} describe={i=>campus(i.date)+' · '+(i.subject||'No subject')+' · '+(i.class||'No class')+' · '+i.records.length+' marks · reference '+i._id.slice(-6)+(i.mapped?' · mapped':'')}/>
            <Select label="Target offering" items={offerings} value={form.offeringId} onChange={v=>{setForm(f=>({...f,offeringId:v}));setPreview(null);}} describe={offeringName}/>
            <Input label="Historical lecture start" type="datetime-local" value={form.start} onChange={v=>{setForm(f=>({...f,start:v}));setPreview(null);}}/><Input label="Historical lecture end" type="datetime-local" value={form.end} onChange={v=>{setForm(f=>({...f,end:v}));setPreview(null);}}/>
            <button disabled={saving||!form.legacyId||!form.offeringId||!form.start||!form.end} className="btn-secondary" onClick={()=>map('preview')}>Preview / dry-run</button>
            {preview&&<div><p>{preview.roster.length} eligible students, {preview.records.length} imported marks. Missing marks stay “not marked”. Source IDs and face data are unchanged. Back up the database before production conversion (see UPGRADE2.md).</p><button disabled={saving} className="btn-primary mt-3" onClick={()=>map('convert')}>Convert reviewed mapping</button></div>}
        </div>}
        {role!=='student'&&<div className="card p-5"><h2 className="font-semibold mb-3">Legacy CSV export (Teacher/date format)</h2><DownloadAttendance/></div>}
        {!items.length&&!busy&&<p>No legacy records found.</p>}
        {items.map(i=><div className="card p-4" key={i._id}><h2>{campus(i.date)} · {i.subject||'No subject'} · {i.class} {i.section} · Legacy attendance {i.mapped?'(mapped copy available)':''}</h2><ul className="text-sm text-zinc-400">{i.records.map((r,n)=><li key={n}>{r.studentRollNo} · {r.studentName} · {r.status}</li>)}</ul></div>)}
    </Shell>;
}

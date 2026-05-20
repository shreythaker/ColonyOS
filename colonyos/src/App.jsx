import { useState, useMemo, useEffect, useCallback, createContext, useContext, useRef } from "react";
import {
  Download, Plus, X, Users, DollarSign, Settings, Baby, Search,
  Edit2, RefreshCw, AlertCircle, CheckCircle2, FlaskConical,
  Bell, Activity, Zap, BarChart2, GitBranch, Dna,
  Scissors, ArrowUpDown, History, Heart, TrendingDown,
  Sun, Moon
} from "lucide-react";
import * as XLSX from "xlsx";

/* ═══════════════════════════ CONSTANTS ═══════════════════════════ */
const TODAY    = new Date();
const _p2      = n => String(n).padStart(2,"0");
const todayStr = `${TODAY.getFullYear()}-${_p2(TODAY.getMonth()+1)}-${_p2(TODAY.getDate())}`;
const STORAGE_KEY = "colonyos_v2";

const STRAIN_META = {
  A:  { label:"Apcfl/fl",          color:"#60a5fa", bg:"rgba(59,130,246,0.13)",  border:"rgba(59,130,246,0.35)" },
  B:  { label:"Cdx2Cre",           color:"#fb923c", bg:"rgba(249,115,22,0.13)",  border:"rgba(249,115,22,0.35)" },
  AB: { label:"Apcfl/fl/Cdx2Cre",  color:"#c084fc", bg:"rgba(168,85,247,0.13)",  border:"rgba(168,85,247,0.35)" },
};
const STATUS_META = {
  active:     { label:"Active",     col:"#4ade80" },
  mating:     { label:"Mating",     col:"#facc15" },
  pregnant:   { label:"Pregnant",   col:"#f472b6" },
  weaning:    { label:"Weaning",    col:"#a78bfa" },
  retired:    { label:"Retired",    col:"#6b7280" },
  euthanized: { label:"Euthanized", col:"#ef4444" },
};
const DARK_C = {
  bg:"#0d1117", surf:"#161b22", surf2:"#1c2330",
  bdr:"#21262d", bdr2:"#30363d",
  txt:"#e6edf3", muted:"#8b949e",
  accent:"#1f6feb", success:"#3fb950",
  warn:"#d29922", danger:"#f85149", pink:"#f472b6",
};
const LIGHT_C = {
  bg:"#f6f8fa", surf:"#ffffff", surf2:"#eef0f3",
  bdr:"#d0d7de", bdr2:"#c6cdd5",
  txt:"#1f2328", muted:"#656d76",
  accent:"#0969da", success:"#1a7f37",
  warn:"#9a6700", danger:"#cf222e", pink:"#bf4b8a",
};
const ThemeCtx = createContext(DARK_C);
const useC = () => useContext(ThemeCtx);
/* fallback module-level C for utilities that run outside render */
let C = DARK_C;

/* ═══════════════════════════ UTILITIES ════════════════════════════ */
const weeksOld  = dob => Math.floor((TODAY - new Date(dob)) / 6048e5);
const addDays   = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r.toISOString().split("T")[0]; };
const fmt       = d => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
const fmtSh     = d => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—";
const daysUntil = d => d ? Math.round((new Date(d)-TODAY)/864e5) : null;
const uid       = pfx => `${pfx}${Date.now().toString(36).toUpperCase()}`;
const cageLabel = (c, extra="") => {
  const id = c.dlarId ? `${c.dlarId} (${c.id})` : c.id;
  return `${id} | ${STRAIN_META[c.strain]?.label||c.strain}${extra}`;
};
const nextSeqId = (items, prefix) => {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const nums = items.map(x=>{ const m=x.id.match(re); return m?parseInt(m[1],10):0; }).filter(n=>n>0);
  return `${prefix}${String(nums.length?Math.max(...nums)+1:1).padStart(3,"0")}`;
};
const areSibs   = (a,b) => !!(a.parentLitterId && b.parentLitterId && a.parentLitterId===b.parentLitterId);

/* ── Relatedness coefficient (recursive ancestor walk) ── */
function getAncestors(cageId, cages, litters, depth=0, max=5, acc=new Map()) {
  if (depth > max) return acc;
  const cage = cages.find(c => c.id === cageId);
  if (!cage) return acc;
  acc.set(cageId, Math.pow(0.5, depth));
  if (cage.parentLitterId) {
    const lit = litters.find(l => l.id === cage.parentLitterId);
    if (lit) {
      getAncestors(lit.fatherCageId, cages, litters, depth+1, max, acc);
      getAncestors(lit.motherCageId, cages, litters, depth+1, max, acc);
    }
  }
  return acc;
}
function computeRelatedness(id1, id2, cages, litters) {
  if (id1 === id2) return { r:1, label:"Same cage", warn:true };
  const a1 = getAncestors(id1, cages, litters);
  const a2 = getAncestors(id2, cages, litters);
  if (a1.has(id2)) return { r:0.5, label:"Parent–offspring", warn:true };
  if (a2.has(id1)) return { r:0.5, label:"Parent–offspring", warn:true };
  let r = 0; const shared = [];
  a1.forEach((c1, id) => {
    if (id !== id1 && id !== id2 && a2.has(id)) { r += c1 * a2.get(id); shared.push(id); }
  });
  if (r >= 0.48) return { r, label:"Full siblings",               warn:true,  shared };
  if (r >= 0.23) return { r, label:"Half-siblings or closer",     warn:true,  shared };
  if (r >= 0.10) return { r, label:"Related (cousins or closer)", warn:true,  shared };
  if (r >  0)    return { r, label:"Distantly related",           warn:false, shared };
  return { r:0, label:"Unrelated", warn:false };
}

/* ═══════════════════════════ INITIAL DATA ══════════════════════════ */
const INIT_CAGES = [
  { id:"C001",strain:"A", sex:"M",mouseCount:2,dob:"2025-10-01",status:"active",  hasBreed:false,litterHistory:[],parentLitterId:null,notes:"Founder stock",createdAt:"2025-10-01",activationDate:"2025-10-01",deactivationDate:null,experimentId:null },
  { id:"C002",strain:"A", sex:"M",mouseCount:1,dob:"2026-01-15",status:"mating",  hasBreed:true, litterHistory:[],parentLitterId:null,notes:"In MP001",     createdAt:"2026-01-15",activationDate:"2026-01-15",deactivationDate:null,experimentId:null },
  { id:"C003",strain:"A", sex:"F",mouseCount:3,dob:"2025-10-01",status:"active",  hasBreed:true, litterHistory:[{litterId:"L001",birthDate:"2026-03-10",numPups:7}],parentLitterId:null,notes:"Founder stock",createdAt:"2025-10-01",activationDate:"2025-10-01",deactivationDate:null,experimentId:null },
  { id:"C004",strain:"A", sex:"F",mouseCount:2,dob:"2026-01-15",status:"mating",  hasBreed:true, litterHistory:[{litterId:"L002",birthDate:"2026-05-05",numPups:7}],parentLitterId:null,notes:"In MP001",    createdAt:"2026-01-15",activationDate:"2026-01-15",deactivationDate:null,experimentId:null },
  { id:"C005",strain:"B", sex:"M",mouseCount:1,dob:"2025-11-01",status:"mating",  hasBreed:true, litterHistory:[],parentLitterId:null,notes:"In MP003",     createdAt:"2025-11-01",activationDate:"2025-11-01",deactivationDate:null,experimentId:null },
  { id:"C006",strain:"B", sex:"M",mouseCount:2,dob:"2026-02-01",status:"mating",  hasBreed:false,litterHistory:[],parentLitterId:null,notes:"In MP002",     createdAt:"2026-02-01",activationDate:"2026-02-01",deactivationDate:null,experimentId:null },
  { id:"C007",strain:"B", sex:"F",mouseCount:3,dob:"2025-11-01",status:"active",  hasBreed:false,litterHistory:[],parentLitterId:null,notes:"Founder stock",createdAt:"2025-11-01",activationDate:"2025-11-01",deactivationDate:null,experimentId:null },
  { id:"C008",strain:"B", sex:"F",mouseCount:2,dob:"2026-03-01",status:"mating",  hasBreed:false,litterHistory:[],parentLitterId:null,notes:"In MP002",     createdAt:"2026-03-01",activationDate:"2026-03-01",deactivationDate:null,experimentId:null },
  { id:"C009",strain:"A", sex:"F",mouseCount:2,dob:"2026-03-01",status:"mating",  hasBreed:false,litterHistory:[],parentLitterId:null,notes:"In MP003",     createdAt:"2026-03-01",activationDate:"2026-03-01",deactivationDate:null,experimentId:null },
  { id:"C010",strain:"AB",sex:"M",mouseCount:3,dob:"2026-03-10",status:"active",  hasBreed:false,litterHistory:[],parentLitterId:"L001",notes:"Exp. cohort 1",createdAt:"2026-04-01",activationDate:"2026-04-01",deactivationDate:null,experimentId:"EXP001" },
  { id:"C011",strain:"AB",sex:"F",mouseCount:4,dob:"2026-03-10",status:"active",  hasBreed:false,litterHistory:[],parentLitterId:"L001",notes:"Exp. cohort 1",createdAt:"2026-04-01",activationDate:"2026-04-01",deactivationDate:null,experimentId:"EXP001" },
  { id:"C012",strain:"A", sex:"M",mouseCount:3,dob:"2026-05-05",status:"weaning", hasBreed:false,litterHistory:[],parentLitterId:"L002",notes:"Wean: May 26", createdAt:"2026-05-05",activationDate:"2026-05-05",deactivationDate:null,experimentId:null },
  { id:"C013",strain:"A", sex:"F",mouseCount:4,dob:"2026-05-05",status:"weaning", hasBreed:false,litterHistory:[],parentLitterId:"L002",notes:"Wean: May 26", createdAt:"2026-05-05",activationDate:"2026-05-05",deactivationDate:null,experimentId:null },
];
const INIT_LITTERS = [
  { id:"L001",strain:"AB",motherCageId:"C003",fatherCageId:"C005",matingPairId:"MP_HIST",birthDate:"2026-03-10",weanDate:"2026-04-01",expectedBirthDate:"2026-03-10",numPups:7,numMales:3,numFemales:4,status:"weaned",offspringCageIds:["C010","C011"],notes:"First AB cross" },
  { id:"L002",strain:"A", motherCageId:"C004",fatherCageId:"C002",matingPairId:"MP001",  birthDate:"2026-05-05",weanDate:"2026-05-26",expectedBirthDate:"2026-05-05",numPups:7,numMales:3,numFemales:4,status:"born",  offspringCageIds:["C012","C013"],notes:"Colony maintenance" },
  { id:"L003",strain:"B", motherCageId:"C008",fatherCageId:"C006",matingPairId:"MP002",  birthDate:null,weanDate:null,expectedBirthDate:"2026-05-17",numPups:null,numMales:null,numFemales:null,status:"gestating",offspringCageIds:[],notes:"B maintenance" },
  { id:"L004",strain:"AB",motherCageId:"C009",fatherCageId:"C005",matingPairId:"MP003",  birthDate:null,weanDate:null,expectedBirthDate:"2026-05-30",numPups:null,numMales:null,numFemales:null,status:"gestating",offspringCageIds:[],notes:"Experimental AB cross" },
];
const INIT_PAIRS = [
  { id:"MP001",type:"pair", strain:"A", maleCageId:"C002",femaleCageIds:["C004"],setupDate:"2026-03-20",status:"birthed", lastStatusUpdate:"2026-05-05",litterIds:["L002"] },
  { id:"MP002",type:"pair", strain:"B", maleCageId:"C006",femaleCageIds:["C008"],setupDate:"2026-04-01",status:"pregnant",lastStatusUpdate:"2026-04-25",litterIds:["L003"] },
  { id:"MP003",type:"pair", strain:"AB",maleCageId:"C005",femaleCageIds:["C009"],setupDate:"2026-04-15",status:"pregnant",lastStatusUpdate:"2026-05-01",litterIds:["L004"] },
];
const INIT_EXPERIMENTS = [
  { id:"EXP001",name:"Pilot Cohort — Disease Onset",description:"First disease characterisation cohort",strain:"AB",targetN:12,enrolledCageIds:["C010","C011"],startDate:"2026-04-01",endDate:null,status:"active",notes:"Monitoring for phenotype onset wk 4–10" },
];
const INIT_SETTINGS = {
  email:"",weanAlertDays:7,ageOutWeeks:35,
  minMales:2,minFemales:2,
  notifyWeaning:true,notifyAgeOut:true,notifyLowColony:true,notifyCost:false,
};

/* ═══════════════════════════ STORAGE ══════════════════════════════ */
const saveState = (s) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
};
const loadState = () => {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
};

/* ═══════════════════════════ SHARED UI ════════════════════════════ */
const btn = (extra={}) => ({
  display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,
  border:"none",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit",transition:"all .15s",...extra
});
const Badge = ({label,color,bg}) => (
  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
    color,background:bg||color+"22",border:`1px solid ${color}44`,letterSpacing:.5,whiteSpace:"nowrap"}}>
    {label}
  </span>
);
const StrainName = ({strain}) => {
  if (strain==="A")  return <><i>Apc</i><sup>fl/fl</sup></>;
  if (strain==="B")  return <><i>Cdx2</i><sup>Cre</sup></>;
  if (strain==="AB") return <><i>Apc</i><sup>fl/fl</sup><span>/</span><i>Cdx2</i><sup>Cre</sup></>;
  return <>{strain}</>;
};
const StrainBadge = ({strain}) => {
  const m = STRAIN_META[strain] || {};
  return (
    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
      color:m.color,background:m.bg||m.color+"22",border:`1px solid ${m.color}44`,
      letterSpacing:.3,whiteSpace:"nowrap",fontStyle:"italic"}}>
      <StrainName strain={strain}/>
    </span>
  );
};
const StatusBadge = ({status}) => {
  const m = STATUS_META[status] || {label:status,col:"#6b7280"};
  return <Badge label={m.label} color={m.col}/>;
};
function LitterCountCell({litterHistory=[]}) {
  const C = useC();
  const [tip, setTip] = useState(null);
  const spanRef = useRef(null);
  const count = litterHistory.length;
  const handleEnter = () => {
    if(!spanRef.current || count === 0) return;
    const r = spanRef.current.getBoundingClientRect();
    setTip({top: r.bottom + 6, left: r.left});
  };
  return (
    <>
      <span ref={spanRef}
        onMouseEnter={handleEnter} onMouseLeave={()=>setTip(null)}
        style={{fontSize:12,color:count>0?C.accent:C.muted,
          cursor:count>0?"default":"auto",
          textDecoration:count>0?"underline dotted":"none",
          textUnderlineOffset:3}}>
        {count} litter{count!==1?"s":""}
      </span>
      {tip&&count>0&&(
        <div onMouseLeave={()=>setTip(null)}
          style={{position:"fixed",top:tip.top,left:tip.left,zIndex:9999,
            background:"#1c2128",border:"1px solid #444c56",borderRadius:8,
            padding:"10px 14px",minWidth:200,maxWidth:280,
            boxShadow:"0 6px 20px rgba(0,0,0,.5)",pointerEvents:"none"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6,letterSpacing:.5,textTransform:"uppercase"}}>
            Litter History
          </div>
          {litterHistory.map((h,i)=>(
            <div key={h.litterId||i} style={{display:"flex",justifyContent:"space-between",gap:16,
              padding:"4px 0",borderBottom:i<litterHistory.length-1?"1px solid #2d333b":"none",
              fontSize:12}}>
              <span style={{fontFamily:"monospace",color:"#79c0ff"}}>{h.litterId||"—"}</span>
              <span style={{color:"#cdd9e5"}}>{h.birthDate?fmt(h.birthDate):"no date"}</span>
              <span style={{color:h.numPups!=null?"#3fb950":"#8b949e"}}>
                {h.numPups!=null?`${h.numPups} pups`:"? pups"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
const Card  = ({children,style={}}) => {
  const C = useC();
  return <div style={{background:C.surf,border:`1px solid ${C.bdr}`,borderRadius:12,padding:20,...style}}>{children}</div>;
};
const Th = ({children,style={}}) => {
  const C = useC();
  return (
    <th style={{padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:C.muted,
      letterSpacing:.8,textTransform:"uppercase",borderBottom:`1px solid ${C.bdr}`,whiteSpace:"nowrap",...style}}>
      {children}
    </th>
  );
};
const Td = ({children,style={}}) => {
  const C = useC();
  return <td style={{padding:"10px 12px",fontSize:13,color:C.txt,borderBottom:`1px solid ${C.bdr}22`,...style}}>{children}</td>;
};
const Input = ({style={},...p}) => {
  const C = useC();
  return <input {...p} style={{background:C.surf2,border:`1px solid ${C.bdr2}`,borderRadius:8,
    color:C.txt,padding:"7px 11px",fontSize:13,fontFamily:"inherit",outline:"none",...style}}/>;
};
const Select = ({style={},children,...p}) => {
  const C = useC();
  return (
    <select {...p} style={{background:C.surf2,border:`1px solid ${C.bdr2}`,borderRadius:8,
      color:C.txt,padding:"7px 11px",fontSize:13,fontFamily:"inherit",outline:"none",...style}}>
      {children}
    </select>
  );
};
const Label = ({children}) => {
  const C = useC();
  return <div style={{fontSize:12,color:C.muted,marginBottom:4,fontWeight:600}}>{children}</div>;
};
const TextArea = ({style={},...p}) => {
  const C = useC();
  return <textarea {...p} style={{background:C.surf2,border:`1px solid ${C.bdr2}`,borderRadius:8,
    color:C.txt,padding:"8px 11px",fontSize:13,fontFamily:"inherit",outline:"none",resize:"vertical",...style}}/>;
};
const Modal = ({title,onClose,children,width=480}) => {
  const C = useC();
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.surf,border:`1px solid ${C.bdr2}`,borderRadius:14,width,maxWidth:"94vw",maxHeight:"88vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 22px",borderBottom:`1px solid ${C.bdr}`}}>
          <span style={{fontWeight:700,fontSize:16,color:C.txt}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}><X size={18}/></button>
        </div>
        <div style={{padding:22}}>{children}</div>
      </div>
    </div>
  );
};
const SubTabs = ({tabs, active, onChange}) => {
  const C = useC();
  return (
    <div style={{display:"flex",background:C.surf,border:`1px solid ${C.bdr}`,borderRadius:10,width:"fit-content",marginBottom:16}}>
      {tabs.map(([k,l]) => (
        <button key={k} onClick={()=>onChange(k)} style={{
          padding:"7px 20px",background:active===k?C.accent:"transparent",
          color:active===k?"#fff":C.muted,border:"none",cursor:"pointer",
          borderRadius:9,fontFamily:"inherit",fontWeight:600,fontSize:13,transition:"all .15s"}}>
          {l}
        </button>
      ))}
    </div>
  );
};

/* ═══════════════════════════ MODALS ═══════════════════════════════ */

function AddCageModal({onClose, onAdd, litters, cages=[]}) {
  const C = useC();
  const [form,setForm] = useState({dlarId:"",strain:"A",sex:"M",mouseCount:1,dob:"",activationDate:"",parentLitterId:"",notes:""});
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  return (
    <Modal title="Add New Cage" onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{gridColumn:"1/-1"}}><Label>DLAR Cage ID</Label>
          <Input value={form.dlarId} onChange={set("dlarId")} style={{width:"100%"}} placeholder="Animal facility cage ID (optional)"/></div>
        <div><Label>Strain</Label>
          <Select value={form.strain} onChange={set("strain")} style={{width:"100%"}}>
            <option value="A">Apcfl/fl</option><option value="B">Cdx2Cre</option><option value="AB">Apcfl/fl / Cdx2Cre</option>
          </Select></div>
        <div><Label>Sex</Label>
          <Select value={form.sex} onChange={set("sex")} style={{width:"100%"}}>
            <option value="M">Male</option><option value="F">Female</option>
          </Select></div>
        <div><Label>Count (1–4)</Label>
          <Input type="number" min={1} max={4} value={form.mouseCount} onChange={set("mouseCount")} style={{width:"100%"}}/></div>
        <div><Label>Date of Birth</Label>
          <Input type="date" value={form.dob} onChange={set("dob")} style={{width:"100%"}}/></div>
        <div><Label>Activation Date</Label>
          <Input type="date" value={form.activationDate} onChange={set("activationDate")} style={{width:"100%"}}
            placeholder="Defaults to today"/></div>
        <div style={{gridColumn:"1/-1"}}>
          <Label>Parent Litter (for lineage)</Label>
          <Select value={form.parentLitterId} onChange={set("parentLitterId")} style={{width:"100%"}}>
            <option value="">— Founder / Unknown —</option>
            {litters.map(l=><option key={l.id} value={l.id}>{l.id} | {l.strain} | {fmt(l.birthDate||l.expectedBirthDate)}</option>)}
          </Select></div>
        <div style={{gridColumn:"1/-1"}}>
          <Label>Notes</Label>
          <Input value={form.notes} onChange={set("notes")} style={{width:"100%"}} placeholder="Optional"/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          if(!form.dob){alert("DOB required");return;}
          onAdd({...form,id:nextSeqId(cages,"C"),mouseCount:+form.mouseCount,status:"active",hasBreed:false,
            dlarId:form.dlarId||null,litterHistory:[],parentLitterId:form.parentLitterId||null,
            createdAt:todayStr,activationDate:form.activationDate||todayStr,deactivationDate:null,experimentId:null});
          onClose();
        }} style={btn({background:C.accent,color:"#fff"})}><Plus size={14}/>Add Cage</button>
      </div>
    </Modal>
  );
}

function SplitCageModal({cage, onClose, onSplit, addLog, allCages=[]}) {
  const C = useC();
  const max = cage.mouseCount - 1;
  const [count,setCount] = useState(1);
  return (
    <Modal title={`Split Cage ${cage.id}`} onClose={onClose} width={440}>
      <div style={{padding:"10px 14px",background:C.surf2,borderRadius:8,marginBottom:14,fontSize:13,color:C.muted}}>
        Source: <strong style={{color:C.txt,fontFamily:"monospace"}}>{cage.id}</strong> — {cage.mouseCount} {cage.sex==="M"?"males":"females"}, {STRAIN_META[cage.strain]?.label||cage.strain}, {weeksOld(cage.dob)}wk
      </div>
      <div style={{marginBottom:14}}>
        <Label>Mice to split off (1–{max})</Label>
        <Input type="number" min={1} max={max} value={count} onChange={e=>setCount(+e.target.value)} style={{width:"100%"}}/>
      </div>
      {cage.sex==="M" && (
        <div style={{padding:"10px 14px",background:"rgba(248,81,73,.1)",border:`1px solid ${C.danger}44`,borderRadius:8,fontSize:12,color:C.danger,marginBottom:14}}>
          ⚠️ Split males cannot be co-housed again. The new cage will be permanently solo.
        </div>
      )}
      <div style={{padding:"10px 14px",background:C.surf2,borderRadius:8,fontSize:12,color:C.muted,marginBottom:14}}>
        Result: <strong style={{color:C.txt}}>{cage.id}</strong> keeps {cage.mouseCount-count} · New cage gets {count}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          if(count<1||count>max){alert(`Split count must be 1–${max}`);return;}
          const newId = nextSeqId(allCages,"C");
          onSplit(cage.id, count, newId);
          addLog("cage_split",`Split ${count} mouse(es) from ${cage.id} → new cage ${newId}`,[cage.id,newId]);
          onClose();
        }} style={btn({background:C.warn,color:"#000"})}><Scissors size={14}/>Split</button>
      </div>
    </Modal>
  );
}

function MergeCageModal({sourceCage, cages, onClose, onMerge, addLog}) {
  const C = useC();
  const [targetId,setTargetId] = useState("");
  const eligible = cages.filter(c =>
    c.id !== sourceCage.id &&
    c.strain === sourceCage.strain &&
    c.sex === "F" &&
    c.status === "active" &&
    c.mouseCount + sourceCage.mouseCount <= 4
  );
  const target = cages.find(c=>c.id===targetId);
  return (
    <Modal title={`Merge Cage ${sourceCage.id}`} onClose={onClose} width={500}>
      <div style={{padding:"10px 14px",background:C.surf2,borderRadius:8,marginBottom:14,fontSize:12,color:C.muted}}>
        Merge is only available for <strong style={{color:C.txt}}>female cages</strong> of the same strain with a combined count ≤ 4. The source cage is retired after merge.
      </div>
      <div style={{marginBottom:14}}>
        <Label>Target cage (absorbs mice from {sourceCage.id})</Label>
        <Select value={targetId} onChange={e=>setTargetId(e.target.value)} style={{width:"100%"}}>
          <option value="">— Select target cage —</option>
          {eligible.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${c.mouseCount}F | ${weeksOld(c.dob)}wk`)}</option>)}
        </Select>
        {eligible.length===0 && <div style={{color:C.warn,fontSize:12,marginTop:6}}>No eligible female cages found. Requirements: same strain, active, combined count ≤ 4.</div>}
      </div>
      {target && sourceCage.parentLitterId && target.parentLitterId && sourceCage.parentLitterId !== target.parentLitterId && (
        <div style={{padding:"8px 12px",background:"rgba(210,153,34,.1)",border:`1px solid ${C.warn}44`,borderRadius:8,fontSize:12,color:C.warn,marginBottom:14}}>
          ⚠️ Different parent litters. Mice will be indistinguishable post-merge.
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button disabled={!targetId} onClick={()=>{
          onMerge(sourceCage.id, targetId);
          addLog("cage_merged",`Merged cage ${sourceCage.id} (${sourceCage.mouseCount}F) into ${targetId}`,[sourceCage.id,targetId]);
          onClose();
        }} style={btn({background:targetId?C.success:"#333",color:targetId?"#000":C.muted})}>
          <ArrowUpDown size={14}/>Merge
        </button>
      </div>
    </Modal>
  );
}

function AddMatingPairModal({cages, litters, matingPairs=[], onClose, onAdd}) {
  const C = useC();
  const [form,setForm] = useState({type:"pair",strain:"A",maleCageId:"",femaleCageIds:[""],notes:""});
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const males   = cages.filter(c=>c.sex==="M"&&["active","mating"].includes(c.status));
  const females = cages.filter(c=>c.sex==="F"&&["active","mating"].includes(c.status));
  const selMale = cages.find(c=>c.id===form.maleCageId);
  const maleMultiWarn = selMale && selMale.mouseCount > 1
    ? `Cage ${selMale.id} contains ${selMale.mouseCount} males. The male used for mating must be split into its own cage first — males cannot be re-housed after separation.`
    : null;
  const femMultiInfos = form.femaleCageIds.filter(Boolean)
    .map(id=>cages.find(c=>c.id===id)).filter(c=>c&&c.mouseCount>1)
    .map(c=>`Cage ${c.id} contains ${c.mouseCount} females — this pair will be set up as a harem. You can split a pregnant female out later from the Colony page.`);
  const sibWarn = useMemo(()=>{
    if(!form.maleCageId||!form.femaleCageIds[0]) return null;
    const m=cages.find(c=>c.id===form.maleCageId), f=cages.find(c=>c.id===form.femaleCageIds[0]);
    return (m&&f&&areSibs(m,f)) ? "⚠️ Same parent litter — sibling pairing not recommended." : null;
  },[form.maleCageId,form.femaleCageIds,cages]);
  const setFem = (i,v) => setForm(f=>({...f,femaleCageIds:f.femaleCageIds.map((x,j)=>j===i?v:x)}));
  const addFem = () => { if(form.femaleCageIds.length<3) setForm(f=>({...f,femaleCageIds:[...f.femaleCageIds,""]})); };
  const remFem = i => setForm(f=>({...f,femaleCageIds:f.femaleCageIds.filter((_,j)=>j!==i)}));
  const anyFemMulti = form.femaleCageIds.filter(Boolean).some(id=>{ const c=cages.find(x=>x.id===id); return c&&c.mouseCount>1; });
  const isHarem = form.femaleCageIds.length > 1 || anyFemMulti;
  const genotypeValid = useMemo(()=>{
    const mCage = cages.find(c=>c.id===form.maleCageId);
    const fCages = form.femaleCageIds.filter(Boolean).map(id=>cages.find(c=>c.id===id)).filter(Boolean);
    if(!mCage||!fCages.length) return null;
    const ms=mCage.strain, fs=fCages.map(c=>c.strain);
    if(form.strain==="A")  return ms==="A"&&fs.every(s=>s==="A");
    if(form.strain==="B")  return ms==="B"&&fs.every(s=>s==="B");
    if(form.strain==="AB") return (ms==="A"&&fs.every(s=>s==="B"))||(ms==="B"&&fs.every(s=>s==="A"));
    return false;
  },[form.strain,form.maleCageId,form.femaleCageIds,cages]);
  return (
    <Modal title="Set Up Mating Pair / Harem" onClose={onClose} width={540}>
      <div style={{display:"grid",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><Label>Output Strain</Label>
            <Select value={form.strain} onChange={set("strain")} style={{width:"100%"}}>
              <option value="A">Apcfl/fl × Apcfl/fl</option>
              <option value="B">Cdx2Cre × Cdx2Cre</option>
              <option value="AB">Apcfl/fl × Cdx2Cre → Apcfl/fl/Cdx2Cre</option>
            </Select></div>
          <div><Label>Male Cage</Label>
            <Select value={form.maleCageId} onChange={set("maleCageId")} style={{width:"100%"}}>
              <option value="">— Select —</option>
              {males.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${weeksOld(c.dob)}wk${c.hasBreed?" ✓":""}`)}</option>)}
            </Select></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <Label>Female Cage(s)</Label>
            {form.femaleCageIds.length<3 && (
              <button onClick={addFem} style={btn({background:C.surf2,color:C.muted,padding:"3px 10px",fontSize:12})}><Plus size={12}/>Add</button>
            )}
          </div>
          {form.femaleCageIds.map((v,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
              <Select value={v} onChange={e=>setFem(i,e.target.value)} style={{flex:1}}>
                <option value="">— Select —</option>
                {females.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${weeksOld(c.dob)}wk | ${c.mouseCount}F`)}</option>)}
              </Select>
              {form.femaleCageIds.length>1 && (
                <button onClick={()=>remFem(i)} style={btn({background:"none",color:C.danger,padding:"4px 8px"})}><X size={14}/></button>
              )}
            </div>
          ))}
          {isHarem && (
            <div style={{color:C.accent,fontSize:12,marginTop:4}}>ℹ️ This will be set up as a harem.</div>
          )}
          {isHarem && !selMale?.hasBreed && (
            <div style={{color:C.warn,fontSize:12,marginTop:2}}>⚠️ Harem works best with a proven male.</div>
          )}
        </div>
        {maleMultiWarn && (
          <div style={{background:"rgba(210,153,34,.15)",border:`1px solid ${C.warn}55`,borderRadius:8,padding:10,fontSize:12,color:C.warn}}>
            ⚠️ {maleMultiWarn}
          </div>
        )}
        {femMultiInfos.map((w,i)=>(
          <div key={i} style={{background:"rgba(56,139,253,.1)",border:"1px solid rgba(56,139,253,.3)",borderRadius:8,padding:10,fontSize:12,color:C.accent}}>
            ℹ️ {w}
          </div>
        ))}
        {genotypeValid===false && (
          <div style={{background:"rgba(248,81,73,.12)",border:"1px solid rgba(248,81,73,.35)",borderRadius:8,padding:10,fontSize:12,color:C.danger}}>
            ✗ Parent genotypes do not match the expected output strain. Check your selections.
          </div>
        )}
        {genotypeValid===true && (
          <div style={{background:"rgba(63,185,80,.1)",border:"1px solid rgba(63,185,80,.3)",borderRadius:8,padding:10,fontSize:12,color:C.success}}>
            ✓ Genotype combination is correct for the output strain.
          </div>
        )}
        {sibWarn && (
          <div style={{background:"rgba(210,153,34,.15)",border:`1px solid ${C.warn}55`,borderRadius:8,padding:10,fontSize:12,color:C.warn}}>{sibWarn}</div>
        )}
        <div><Label>Notes</Label><Input value={form.notes} onChange={set("notes")} style={{width:"100%"}} placeholder="Optional"/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button disabled={genotypeValid===false} onClick={()=>{
          if(!form.maleCageId||!form.femaleCageIds[0]){alert("Select male and female cage(s)");return;}
          const id=nextSeqId(matingPairs,"MP"), lid=nextSeqId(litters,"L");
          onAdd({
            pair:{id,type:isHarem?"harem":"pair",strain:form.strain,maleCageId:form.maleCageId,
              femaleCageIds:form.femaleCageIds.filter(Boolean),setupDate:todayStr,
              status:"waiting",lastStatusUpdate:todayStr,litterIds:[lid]},
            litter:{id:lid,strain:form.strain,motherCageId:form.femaleCageIds[0],fatherCageId:form.maleCageId,
              matingPairId:id,birthDate:null,weanDate:null,expectedBirthDate:addDays(todayStr,35),
              numPups:null,numMales:null,numFemales:null,status:"gestating",offspringCageIds:[],notes:form.notes},
          });
          onClose();
        }} style={btn({background:genotypeValid===false?C.surf2:C.pink,color:genotypeValid===false?C.muted:"#fff",
          opacity:genotypeValid===false?.5:1,cursor:genotypeValid===false?"not-allowed":"pointer"})}><Heart size={14}/>Set Up</button>
      </div>
    </Modal>
  );
}

function EditPairModal({pair, cages, onClose, onSave}) {
  const C = useC();
  const [form,setForm] = useState({
    type:pair.type, strain:pair.strain,
    maleCageId:pair.maleCageId, femaleCageIds:[...pair.femaleCageIds],
    setupDate:pair.setupDate, status:pair.status,
  });
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const males   = cages.filter(c=>c.sex==="M"&&c.status!=="euthanized");
  const females = cages.filter(c=>c.sex==="F"&&c.status!=="euthanized");
  const setFem  = (i,v) => setForm(f=>({...f,femaleCageIds:f.femaleCageIds.map((x,j)=>j===i?v:x)}));
  const addFem  = () => { if(form.femaleCageIds.length<3) setForm(f=>({...f,femaleCageIds:[...f.femaleCageIds,""]})); };
  const remFem  = i => setForm(f=>({...f,femaleCageIds:f.femaleCageIds.filter((_,j)=>j!==i)}));
  return (
    <Modal title={`Edit Pair ${pair.id}`} onClose={onClose} width={540}>
      <div style={{display:"grid",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
          <div><Label>Type</Label>
            <Select value={form.type} onChange={set("type")} style={{width:"100%"}}>
              <option value="pair">Pair</option>
              <option value="harem">Harem</option>
            </Select></div>
          <div><Label>Output Strain</Label>
            <Select value={form.strain} onChange={set("strain")} style={{width:"100%"}}>
              <option value="A">Apcfl/fl</option>
              <option value="B">Cdx2Cre</option>
              <option value="AB">Apcfl/fl/Cdx2Cre</option>
            </Select></div>
          <div><Label>Status</Label>
            <Select value={form.status} onChange={set("status")} style={{width:"100%"}}>
              <option value="waiting">Waiting</option>
              <option value="pregnant">Pregnant</option>
              <option value="birthed">Birthed</option>
              <option value="retired">Retired</option>
            </Select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><Label>Male Cage</Label>
            <Select value={form.maleCageId} onChange={set("maleCageId")} style={{width:"100%"}}>
              <option value="">— Select —</option>
              {males.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${weeksOld(c.dob)}wk`)}</option>)}
            </Select></div>
          <div><Label>Setup Date</Label>
            <Input type="date" value={form.setupDate} onChange={set("setupDate")} style={{width:"100%"}}/></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <Label>Female Cage(s)</Label>
            {form.femaleCageIds.length<3 && (
              <button onClick={addFem} style={btn({background:C.surf2,color:C.muted,padding:"3px 10px",fontSize:12})}><Plus size={12}/>Add</button>
            )}
          </div>
          {form.femaleCageIds.map((v,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
              <Select value={v} onChange={e=>setFem(i,e.target.value)} style={{flex:1}}>
                <option value="">— Select —</option>
                {females.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${weeksOld(c.dob)}wk`)}</option>)}
              </Select>
              {form.femaleCageIds.length>1 && (
                <button onClick={()=>remFem(i)} style={btn({background:"none",color:C.danger,padding:"4px 8px"})}><X size={14}/></button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          onSave({...pair,...form,femaleCageIds:form.femaleCageIds.filter(Boolean)});
          onClose();
        }} style={btn({background:C.accent,color:"#fff"})}><Edit2 size={14}/>Save Changes</button>
      </div>
    </Modal>
  );
}

function UpdateLitterModal({litter, cages, onClose, onUpdate}) {
  const C = useC();
  const [form,setForm] = useState({
    status:litter.status, birthDate:litter.birthDate||"",
    numPups:litter.numPups||"", numMales:litter.numMales||"", numFemales:litter.numFemales||"",
    motherCageId:litter.motherCageId||"", fatherCageId:litter.fatherCageId||"",
  });
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const femCages = cages.filter(c=>c.sex==="F"&&c.status!=="euthanized");
  const malCages = cages.filter(c=>c.sex==="M"&&c.status!=="euthanized");
  const wDate = form.birthDate ? addDays(form.birthDate,21) : null;
  const isWeaned = form.status==="weaned";
  return (
    <Modal title={`Update Litter ${litter.id}`} onClose={onClose} width={520}>
      <div style={{display:"grid",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><Label>Mother Cage</Label>
            <Select value={form.motherCageId} onChange={set("motherCageId")} style={{width:"100%"}}>
              <option value="">— Select —</option>
              {femCages.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${weeksOld(c.dob)}wk`)}</option>)}
            </Select></div>
          <div><Label>Father Cage</Label>
            <Select value={form.fatherCageId} onChange={set("fatherCageId")} style={{width:"100%"}}>
              <option value="">— Select —</option>
              {malCages.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${weeksOld(c.dob)}wk`)}</option>)}
            </Select></div>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onChange={set("status")} style={{width:"100%"}}>
            <option value="gestating">Gestating</option>
            <option value="born">Born</option>
            <option value="weaned">Weaned</option>
          </Select></div>
        {form.status!=="gestating" && <>
          <div><Label>Birth Date</Label>
            <Input type="date" value={form.birthDate} onChange={set("birthDate")} style={{width:"100%"}}/></div>
          {wDate && (
            <div style={{padding:"10px 14px",background:C.surf2,borderRadius:8,fontSize:13,color:C.muted}}>
              📅 Wean date: <strong style={{color:C.txt}}>{fmt(wDate)}</strong>
            </div>
          )}
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <div><Label>Total Pups</Label>
                <Input type="number" value={form.numPups} onChange={set("numPups")} style={{width:"100%"}}/></div>
              <div><Label>Males</Label>
                <Input type="number" value={form.numMales} onChange={set("numMales")} style={{width:"100%"}}
                  disabled={!isWeaned} placeholder={!isWeaned?"at weaning":""}/></div>
              <div><Label>Females</Label>
                <Input type="number" value={form.numFemales} onChange={set("numFemales")} style={{width:"100%"}}
                  disabled={!isWeaned} placeholder={!isWeaned?"at weaning":""}/></div>
            </div>
            {!isWeaned && <div style={{fontSize:11,color:C.muted,marginTop:6}}>Sex breakdown recorded at weaning.</div>}
          </div>
        </>}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          const bd=form.birthDate||null;
          onUpdate({...litter,
            motherCageId:form.motherCageId||litter.motherCageId,
            fatherCageId:form.fatherCageId||litter.fatherCageId,
            status:form.status, birthDate:bd,
            weanDate:bd?addDays(bd,21):litter.weanDate||null,
            numPups:+form.numPups||null,
            numMales:isWeaned?(+form.numMales||null):null,
            numFemales:isWeaned?(+form.numFemales||null):null,
          });
          onClose();
        }} style={btn({background:C.success,color:"#000"})}><CheckCircle2 size={14}/>Save</button>
      </div>
    </Modal>
  );
}

function AddLitterModal({cages, litters=[], onClose, onAdd}) {
  const C = useC();
  const [form,setForm] = useState({
    strain:"A", motherCageId:"", fatherCageId:"",
    status:"gestating", expectedBirthDate:"", birthDate:"", weanDate:"",
    numPups:"", numMales:"", numFemales:"",
  });
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const isWeaned = form.status==="weaned";
  // For weaned (historical) litters allow any non-deleted cage regardless of status
  const femCages = isWeaned
    ? cages.filter(c=>!c.isDeleted&&c.sex==="F")
    : cages.filter(c=>c.sex==="F"&&["active","mating"].includes(c.status)&&c.strain===form.strain);
  const malCages = isWeaned
    ? cages.filter(c=>!c.isDeleted&&c.sex==="M")
    : cages.filter(c=>c.sex==="M"&&["active","mating"].includes(c.status)&&c.strain===form.strain);
  const autoWean = form.status==="born"&&form.birthDate ? addDays(form.birthDate,21) : null;
  return (
    <Modal title="Add Litter" onClose={onClose} width={500}>
      <div style={{display:"grid",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><Label>Strain</Label>
            <Select value={form.strain} onChange={e=>setForm(f=>({...f,strain:e.target.value,motherCageId:"",fatherCageId:""}))} style={{width:"100%"}}>
              <option value="A">Apcfl/fl</option>
              <option value="B">Cdx2Cre</option>
              <option value="AB">Apcfl/fl/Cdx2Cre</option>
            </Select></div>
          <div><Label>Status</Label>
            <Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value,motherCageId:"",fatherCageId:""}))} style={{width:"100%"}}>
              <option value="gestating">Gestating</option>
              <option value="born">Born</option>
              <option value="weaned">Weaned (historical)</option>
            </Select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><Label>Mother Cage</Label>
            <Select value={form.motherCageId} onChange={set("motherCageId")} style={{width:"100%"}}>
              <option value="">— Select —</option>
              <option value="__unknown__">Unknown mother</option>
              {femCages.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${c.status}`)}</option>)}
            </Select></div>
          <div><Label>Father Cage</Label>
            <Select value={form.fatherCageId} onChange={set("fatherCageId")} style={{width:"100%"}}>
              <option value="">— Select —</option>
              <option value="__unknown__">Unknown father</option>
              {malCages.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${c.status}`)}</option>)}
            </Select></div>
        </div>
        {form.status==="gestating" && (
          <div><Label>Expected Birth Date</Label>
            <Input type="date" value={form.expectedBirthDate} onChange={set("expectedBirthDate")} style={{width:"100%"}}/></div>
        )}
        {form.status==="born" && (<>
          <div><Label>Birth Date</Label>
            <Input type="date" value={form.birthDate} onChange={set("birthDate")} style={{width:"100%"}}/></div>
          {autoWean && (
            <div style={{padding:"10px 14px",background:C.surf2,borderRadius:8,fontSize:13,color:C.muted}}>
              📅 Wean date: <strong style={{color:C.txt}}>{fmt(autoWean)}</strong>
            </div>
          )}
          <div><Label>Number of Pups</Label>
            <Input type="number" value={form.numPups} onChange={set("numPups")} style={{width:"100%"}} placeholder="Sex determined at weaning"/></div>
        </>)}
        {isWeaned && (<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><Label>Birth Date</Label>
              <Input type="date" value={form.birthDate} onChange={set("birthDate")} style={{width:"100%"}}/></div>
            <div><Label>Wean Date</Label>
              <Input type="date" value={form.weanDate} onChange={set("weanDate")} style={{width:"100%"}}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            <div><Label>Total Pups</Label>
              <Input type="number" min={0} value={form.numPups} onChange={set("numPups")} style={{width:"100%"}}/></div>
            <div><Label>Males</Label>
              <Input type="number" min={0} value={form.numMales} onChange={set("numMales")} style={{width:"100%"}}/></div>
            <div><Label>Females</Label>
              <Input type="number" min={0} value={form.numFemales} onChange={set("numFemales")} style={{width:"100%"}}/></div>
          </div>
        </>)}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          if(!form.motherCageId||!form.fatherCageId){alert("Select mother and father cages (or choose Unknown)");return;}
          if(form.status==="gestating"&&!form.expectedBirthDate){alert("Enter expected birth date");return;}
          if(form.status==="born"&&!form.birthDate){alert("Enter birth date");return;}
          if(isWeaned&&!form.birthDate){alert("Enter birth date");return;}
          const bd = (form.status==="born"||isWeaned) ? form.birthDate : null;
          const wd = isWeaned ? (form.weanDate||null) : (bd?addDays(bd,21):null);
          const toId = v => (v===""||v==="__unknown__") ? null : v;
          onAdd({
            id:nextSeqId(litters,"L"), strain:form.strain,
            motherCageId:toId(form.motherCageId), fatherCageId:toId(form.fatherCageId),
            matingPairId:null, birthDate:bd, weanDate:wd,
            expectedBirthDate:form.status==="gestating"?form.expectedBirthDate:(bd||null),
            numPups:form.numPups?+form.numPups:null,
            numMales:isWeaned&&form.numMales?+form.numMales:null,
            numFemales:isWeaned&&form.numFemales?+form.numFemales:null,
            status:form.status, offspringCageIds:[], notes:"",
          });
          onClose();
        }} style={btn({background:C.pink,color:"#fff"})}><Baby size={14}/>Add Litter</button>
      </div>
    </Modal>
  );
}

function AddExperimentModal({onClose, onAdd, experiments=[]}) {
  const C = useC();
  const [form,setForm] = useState({name:"",description:"",targetN:12,startDate:todayStr,notes:""});
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  return (
    <Modal title="New Experiment Cohort" onClose={onClose} width={500}>
      <div style={{display:"grid",gap:14}}>
        <div><Label>Experiment Name</Label>
          <Input value={form.name} onChange={set("name")} style={{width:"100%"}} placeholder="e.g. Disease onset cohort 2"/></div>
        <div><Label>Description</Label>
          <TextArea value={form.description} onChange={set("description")} rows={2} style={{width:"100%"}} placeholder="What phenotype / timepoint?"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><Label>Target n (AB mice)</Label>
            <Input type="number" value={form.targetN} onChange={set("targetN")} style={{width:"100%"}}/></div>
          <div><Label>Start Date</Label>
            <Input type="date" value={form.startDate} onChange={set("startDate")} style={{width:"100%"}}/></div>
        </div>
        <div><Label>Notes</Label>
          <TextArea value={form.notes} onChange={set("notes")} rows={2} style={{width:"100%"}}/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          if(!form.name){alert("Name required");return;}
          onAdd({...form,id:nextSeqId(experiments,"EXP"),strain:"AB",targetN:+form.targetN,enrolledCageIds:[],endDate:null,status:"active"});
          onClose();
        }} style={btn({background:STRAIN_META.AB.color,color:"#fff"})}><FlaskConical size={14}/>Create</button>
      </div>
    </Modal>
  );
}

function EnrollCagesModal({experiment, cages, onClose, onEnroll}) {
  const C = useC();
  const abCages = cages.filter(c=>c.strain==="AB"&&!["euthanized","retired"].includes(c.status));
  const [sel,setSel] = useState(new Set(experiment.enrolledCageIds));
  const toggle = id => setSel(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const enrolled = abCages.filter(c=>sel.has(c.id)).reduce((s,c)=>s+c.mouseCount,0);
  return (
    <Modal title={`Enroll Cages — ${experiment.name}`} onClose={onClose} width={520}>
      <div style={{fontSize:12,color:C.muted,marginBottom:14}}>
        Enrolled mice: <strong style={{color:STRAIN_META.AB.color}}>{enrolled}</strong> / target {experiment.targetN}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {abCages.length===0 && <div style={{color:C.muted,fontSize:13}}>No AB cages available.</div>}
        {abCages.map(c=>{
          const age=weeksOld(c.dob), inW=age>=4&&age<=10;
          return (
            <label key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
              background:sel.has(c.id)?STRAIN_META.AB.bg:C.surf2,
              border:`1px solid ${sel.has(c.id)?STRAIN_META.AB.border:C.bdr}`,borderRadius:8,cursor:"pointer"}}>
              <input type="checkbox" checked={sel.has(c.id)} onChange={()=>toggle(c.id)} style={{accentColor:STRAIN_META.AB.color}}/>
              <div style={{flex:1}}>
                <span style={{fontFamily:"monospace",fontWeight:700,color:STRAIN_META.AB.color}}>
                  {c.dlarId||c.id}{c.dlarId&&<span style={{fontWeight:400,color:C.muted}}> ({c.id})</span>}
                </span>
                <span style={{fontSize:12,color:C.muted,marginLeft:10}}>{c.mouseCount} mice · {c.sex==="M"?"♂":"♀"} · {age}wk</span>
                {inW  && <span style={{marginLeft:8}}><Badge label="In Window 🔬" color={STRAIN_META.AB.color}/></span>}
                {age>10 && <span style={{marginLeft:8}}><Badge label="Past Window" color={C.danger}/></span>}
                {c.experimentId && c.experimentId!==experiment.id && (
                  <span style={{fontSize:11,color:C.warn,marginLeft:8}}>⚠️ Already in {c.experimentId}</span>
                )}
              </div>
              <span style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{c.parentLitterId||"Founder"}</span>
            </label>
          );
        })}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{onEnroll(experiment.id,[...sel]);onClose();}} style={btn({background:STRAIN_META.AB.color,color:"#fff"})}>
          <CheckCircle2 size={14}/>Save Enrollment
        </button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════ LINEAGE SVG ═══════════════════════════ */
const SVG_W=900, SVG_H=340, ROW_H=110, NW=152, NH=60, MAX_GEN=2;
const nPos = (lv,idx) => ({ x:(idx+0.5)*(SVG_W/Math.pow(2,lv)), y:SVG_H-NH-(lv*ROW_H)-20 });

function buildTree(cageId, cages, litters, lv=0, idx=0) {
  const cage = cages.find(c=>c.id===cageId);
  if(!cage) return [{missing:true, id:cageId, lv, idx}];
  const nodes = [{cage, lv, idx}];
  if(lv < MAX_GEN && cage.parentLitterId) {
    const lit = litters.find(l=>l.id===cage.parentLitterId);
    if(lit) {
      nodes.push(...buildTree(lit.fatherCageId, cages, litters, lv+1, idx*2));
      nodes.push(...buildTree(lit.motherCageId, cages, litters, lv+1, idx*2+1));
    }
  }
  return nodes;
}

function LineageSVG({cageId, cages, litters}) {
  const C = useC();
  const nodes = useMemo(()=>buildTree(cageId,cages,litters),[cageId,cages,litters]);
  const edges = useMemo(()=>{
    const es=[];
    nodes.filter(n=>!n.missing&&n.lv<MAX_GEN).forEach(n=>{
      if(!n.cage.parentLitterId) return;
      const lit=litters.find(l=>l.id===n.cage.parentLitterId); if(!lit) return;
      const cp=nPos(n.lv,n.idx);
      [lit.fatherCageId,lit.motherCageId].forEach((pid,pi)=>{
        const pn=nodes.find(nn=>nn.cage?.id===pid&&nn.lv===n.lv+1); if(!pn) return;
        const pp=nPos(n.lv+1,n.idx*2+pi);
        es.push({x1:cp.x,y1:cp.y,x2:pp.x,y2:pp.y+NH});
      });
    });
    return es;
  },[nodes,litters]);

  return (
    <div style={{overflowX:"auto",background:C.surf2,borderRadius:10,padding:10}}>
      <svg width={SVG_W} height={SVG_H} style={{display:"block",fontFamily:"inherit"}}>
        <defs>
          <marker id="arr" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={C.bdr2}/>
          </marker>
        </defs>
        {edges.map((e,i)=>(
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={C.bdr2} strokeWidth={1.5} markerEnd="url(#arr)"/>
        ))}
        {nodes.map(n=>{
          const key=`${n.cage?.id||n.id}-${n.lv}-${n.idx}`;
          const p=nPos(n.lv,n.idx);
          if(n.missing) return (
            <g key={key}>
              <rect x={p.x-NW/2} y={p.y} width={NW} height={NH} rx={8}
                fill={C.surf} stroke={C.bdr} strokeDasharray="5,3"/>
              <text x={p.x} y={p.y+24} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily="monospace">{n.id||"?"}</text>
              <text x={p.x} y={p.y+42} textAnchor="middle" fill={C.muted} fontSize={10}>Unknown</text>
            </g>
          );
          const m=STRAIN_META[n.cage.strain]||{};
          const isRoot=n.lv===0, age=weeksOld(n.cage.dob), inW=n.cage.strain==="AB"&&age>=4&&age<=10;
          const hasDeeper=n.lv===MAX_GEN&&n.cage.parentLitterId;
          return (
            <g key={key}>
              <rect x={p.x-NW/2} y={p.y} width={NW} height={NH} rx={8}
                fill={m.bg} stroke={isRoot?m.color:m.border} strokeWidth={isRoot?2.5:1.5}/>
              {isRoot && <rect x={p.x-NW/2} y={p.y} width={NW} height={5} rx={4} fill={m.color}/>}
              <text x={p.x} y={p.y+22} textAnchor="middle" fill={m.color} fontSize={12.5}
                fontWeight={700} fontFamily="'IBM Plex Mono',monospace">{n.cage.id}</text>
              <text x={p.x} y={p.y+38} textAnchor="middle" fill={C.txt} fontSize={11}>
                {n.cage.sex==="M"?"♂":"♀"} {m.label||n.cage.strain} · {age}wk{age>=35?" ⚠":""}
              </text>
              <text x={p.x} y={p.y+53} textAnchor="middle"
                fill={n.cage.parentLitterId?C.muted:C.success} fontSize={9.5}
                fontStyle={n.cage.parentLitterId?"normal":"italic"}>
                {hasDeeper?"▲ ancestry continues…":n.cage.parentLitterId?`from ${n.cage.parentLitterId}`:"Founder"}
              </text>
              {inW && <circle cx={p.x+NW/2-9} cy={p.y+11} r={5} fill={STRAIN_META.AB.color} opacity={0.9}/>}
            </g>
          );
        })}
        <text x={10} y={SVG_H-4} fill={C.muted} fontSize={10} fontFamily="inherit">
          Oldest ancestors at top · Selected cage at bottom · ● = in phenotype window (4–10wk)
        </text>
      </svg>
    </div>
  );
}

/* ═══════════════════════════ LINEAGE VIEW ══════════════════════════ */
function LineageView({cages, litters}) {
  const C = useC();
  const active = cages.filter(c=>!["euthanized","retired"].includes(c.status));
  const [selCage,setSelCage] = useState(active[0]?.id||"");
  const [r1,setR1] = useState(""); const [r2,setR2] = useState("");
  const relResult = useMemo(()=>{
    if(!r1||!r2||r1===r2) return null;
    return computeRelatedness(r1,r2,cages,litters);
  },[r1,r2,cages,litters]);

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:20}}>
      {/* Pedigree tree */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <span style={{fontWeight:700,fontSize:14,color:C.txt,display:"flex",alignItems:"center",gap:8}}>
            <GitBranch size={15}/>Pedigree Tree
          </span>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,color:C.muted}}>View cage:</span>
            <Select value={selCage} onChange={e=>setSelCage(e.target.value)}>
              {active.map(c=>(
                <option key={c.id} value={c.id}>
                  {cageLabel(c,` | ${c.sex==="M"?"♂":"♀"} | ${weeksOld(c.dob)}wk`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {selCage && <LineageSVG cageId={selCage} cages={cages} litters={litters}/>}
        <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:12}}>
          {Object.entries(STRAIN_META).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:C.muted}}>
              <div style={{width:12,height:12,borderRadius:3,background:v.bg,border:`2px solid ${v.color}`}}/>
              <span>{v.label}</span>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:C.muted}}>
            <div style={{width:12,height:12,border:`2px dashed ${C.bdr2}`,borderRadius:3}}/>
            <span>Unknown / missing cage</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:C.muted}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:STRAIN_META.AB.color}}/>
            <span>In phenotype window (4–10wk)</span>
          </div>
        </div>
      </Card>

      {/* Relatedness check */}
      <Card>
        <div style={{fontWeight:700,fontSize:14,color:C.txt,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <ArrowUpDown size={15}/>Relatedness Check
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div><Label>Cage 1</Label>
            <Select value={r1} onChange={e=>setR1(e.target.value)} style={{width:"100%"}}>
              <option value="">— Select —</option>
              {active.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${c.sex==="M"?"♂":"♀"}`)}</option>)}
            </Select></div>
          <div><Label>Cage 2</Label>
            <Select value={r2} onChange={e=>setR2(e.target.value)} style={{width:"100%"}}>
              <option value="">— Select —</option>
              {active.map(c=><option key={c.id} value={c.id}>{cageLabel(c,` | ${c.sex==="M"?"♂":"♀"}`)}</option>)}
            </Select></div>
        </div>
        {(!r1||!r2) && <div style={{color:C.muted,fontSize:13}}>Select two cages above to compute relatedness.</div>}
        {r1&&r2&&r1===r2 && <div style={{color:C.warn,fontSize:13}}>Select two different cages.</div>}
        {relResult && (
          <div style={{padding:"14px 18px",
            background:relResult.warn?"rgba(248,81,73,.1)":"rgba(63,185,80,.08)",
            border:`1px solid ${relResult.warn?C.danger:C.success}44`,borderRadius:10}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              {relResult.warn
                ? <AlertCircle size={18} style={{color:C.danger,flexShrink:0}}/>
                : <CheckCircle2 size={18} style={{color:C.success,flexShrink:0}}/>}
              <div>
                <div style={{fontWeight:700,color:relResult.warn?C.danger:C.success,fontSize:14}}>{relResult.label}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                  Coefficient of relatedness: <strong style={{color:C.txt,fontFamily:"monospace"}}>r ≈ {relResult.r.toFixed(3)}</strong>
                </div>
                {relResult.warn && <div style={{fontSize:12,color:C.warn,marginTop:4}}>⚠️ Do not pair — select mice from unrelated litters.</div>}
                {relResult.shared?.length>0 && <div style={{fontSize:11,color:C.muted,marginTop:4}}>Shared ancestors: {relResult.shared.join(", ")}</div>}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════ COLONY VIEW ═══════════════════════════ */
function ActionsMenu({items}) {
  const C = useC();
  const [open,setOpen] = useState(false);
  const [pos,setPos]   = useState({top:0,right:0,flipUp:false});
  const btnRef  = useRef(null);
  const menuRef = useRef(null);

  const handleToggle = () => {
    if(!open && btnRef.current){
      const r = btnRef.current.getBoundingClientRect();
      const flipUp = r.bottom + 200 > window.innerHeight;
      setPos({top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right, flipUp});
    }
    setOpen(o=>!o);
  };

  useEffect(()=>{
    if(!open) return;
    const close  = e=>{ if(!btnRef.current?.contains(e.target)&&!menuRef.current?.contains(e.target)) setOpen(false); };
    const scroll = ()=>setOpen(false);
    document.addEventListener("mousedown",close);
    window.addEventListener("scroll",scroll,true);
    return ()=>{ document.removeEventListener("mousedown",close); window.removeEventListener("scroll",scroll,true); };
  },[open]);

  if(!items.length) return null;
  return (
    <>
      <button ref={btnRef} onClick={handleToggle}
        style={btn({background:C.surf2,color:C.txt,border:`1px solid ${C.bdr2}`,padding:"3px 10px",fontSize:11,gap:4})}>
        Actions <span style={{fontSize:9,opacity:.7}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div ref={menuRef} style={{position:"fixed",...(pos.flipUp?{bottom:pos.bottom}:{top:pos.top}),right:pos.right,
          background:C.surf,border:`1px solid ${C.bdr2}`,borderRadius:8,zIndex:9999,minWidth:155,
          boxShadow:"0 6px 20px rgba(0,0,0,.3)",overflow:"hidden"}}>
          {items.map(({label,onClick,color,icon},i)=>(
            <button key={i} onClick={()=>{onClick();setOpen(false);}}
              style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 14px",
                background:"transparent",border:"none",borderBottom:`1px solid ${C.bdr}22`,
                color:color||C.txt,fontSize:12,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>
              {icon&&<span style={{opacity:.8}}>{icon}</span>}{label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function EditCageModal({cage, litters, onClose, onSave}) {
  const C = useC();
  const [form,setForm] = useState({
    dlarId:          cage.dlarId          || "",
    strain:          cage.strain,
    sex:             cage.sex,
    mouseCount:      cage.mouseCount,
    dob:             cage.dob,
    status:          cage.status,
    hasBreed:        cage.hasBreed,
    activationDate:  cage.activationDate  || cage.createdAt || cage.dob || "",
    deactivationDate:cage.deactivationDate|| "",
    parentLitterId:  cage.parentLitterId  || "",
    experimentId:    cage.experimentId    || "",
    notes:           cage.notes           || "",
  });
  const set  = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const setB = k => e => setForm(f=>({...f,[k]:e.target.checked}));
  return (
    <Modal title={`Edit Cage ${cage.id}`} onClose={onClose} width={540}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div><Label>ColonyOS Cage ID</Label>
          <Input value={cage.id} disabled style={{width:"100%",opacity:.55,cursor:"not-allowed"}}/></div>
        <div><Label>DLAR Cage ID</Label>
          <Input value={form.dlarId} onChange={set("dlarId")} style={{width:"100%"}} placeholder="Animal facility ID"/></div>
        <div><Label>Strain</Label>
          <Select value={form.strain} onChange={set("strain")} style={{width:"100%"}}>
            <option value="A">Apcfl/fl</option><option value="B">Cdx2Cre</option><option value="AB">Apcfl/fl / Cdx2Cre</option>
          </Select></div>
        <div><Label>Sex</Label>
          <Select value={form.sex} onChange={set("sex")} style={{width:"100%"}}>
            <option value="M">Male</option><option value="F">Female</option>
          </Select></div>
        <div><Label>Count (1–4)</Label>
          <Input type="number" min={1} max={4} value={form.mouseCount} onChange={set("mouseCount")} style={{width:"100%"}}/></div>
        <div><Label>Date of Birth</Label>
          <Input type="date" value={form.dob} onChange={set("dob")} style={{width:"100%"}}/></div>
        <div><Label>Status</Label>
          <Select value={form.status} onChange={set("status")} style={{width:"100%"}}>
            {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </Select></div>
        <div style={{display:"flex",alignItems:"center",gap:10,paddingTop:20}}>
          {form.sex==="M" ? (
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:C.txt}}>
              <input type="checkbox" checked={form.hasBreed} onChange={setB("hasBreed")}
                style={{width:15,height:15,accentColor:C.success}}/>
              Proven breeder
            </label>
          ) : (
            <span style={{fontSize:12,color:C.muted}}>
              {cage.litterHistory.length} litter{cage.litterHistory.length!==1?"s":""} recorded
            </span>
          )}
        </div>
        <div><Label>Activation Date</Label>
          <Input type="date" value={form.activationDate} onChange={set("activationDate")} style={{width:"100%"}}/></div>
        <div><Label>Deactivation Date</Label>
          <Input type="date" value={form.deactivationDate} onChange={set("deactivationDate")} style={{width:"100%"}}
            placeholder="Leave blank if still active"/></div>
        <div style={{gridColumn:"1/-1"}}><Label>Parent Litter (lineage)</Label>
          <Select value={form.parentLitterId} onChange={set("parentLitterId")} style={{width:"100%"}}>
            <option value="">— Founder / Unknown —</option>
            {litters.map(l=><option key={l.id} value={l.id}>{l.id} | {l.strain} | {fmt(l.birthDate||l.expectedBirthDate)}</option>)}
          </Select></div>
        <div style={{gridColumn:"1/-1"}}><Label>Experiment ID</Label>
          <Input value={form.experimentId} onChange={set("experimentId")} style={{width:"100%"}} placeholder="e.g. EXP001 (or leave blank)"/></div>
        <div style={{gridColumn:"1/-1"}}><Label>Notes</Label>
          <TextArea value={form.notes} onChange={set("notes")} rows={3} style={{width:"100%"}} placeholder="Optional"/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
        <button onClick={()=>{
          onSave(cage.id,{
            ...form,
            mouseCount:+form.mouseCount,
            dlarId:          form.dlarId||null,
            activationDate:  form.activationDate||null,
            deactivationDate:form.deactivationDate||null,
            parentLitterId:  form.parentLitterId||null,
            experimentId:    form.experimentId||null,
          });
          onClose();
        }} style={btn({background:C.accent,color:"#fff"})}><CheckCircle2 size={14}/>Save Changes</button>
      </div>
    </Modal>
  );
}

function DeleteCageModal({cage, onClose, onDelete}) {
  const C = useC();
  const [note,setNote] = useState("");
  const ok = note.trim().length > 0;
  return (
    <Modal title={`Delete Cage ${cage.id}`} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{padding:12,background:C.danger+"15",border:`1px solid ${C.danger}33`,borderRadius:8,fontSize:13,color:C.txt}}>
          This will move <strong style={{fontFamily:"monospace"}}>{cage.id}</strong> to Deleted Cages. Lineage links are preserved and the cage can be restored at any time.
        </div>
        <div>
          <Label>Reason for deletion (required)</Label>
          <TextArea value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{width:"100%"}}
            placeholder="e.g. Aged out, experiment complete, accidental duplicate…"/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
          <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
          <button onClick={()=>{if(ok){onDelete(cage.id,note.trim());onClose();}}}
            style={btn({background:C.danger,color:"#fff",opacity:ok?1:.45,cursor:ok?"pointer":"not-allowed"})}>
            Delete Cage
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HaremSplitConfirmModal({newCage, haremPair, onClose, onConfirm}) {
  const C = useC();
  return (
    <Modal title="Harem Split — Pregnant Female?" onClose={onClose} width={480}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:13,color:C.txt,lineHeight:1.6}}>
          Cage <strong style={{fontFamily:"monospace",color:C.accent}}>{newCage.id}</strong> was split from a female
          in harem <strong style={{fontFamily:"monospace",color:C.pink}}>{haremPair.id}</strong> (male:{" "}
          <strong style={{fontFamily:"monospace"}}>{haremPair.maleCageId}</strong>).
        </div>
        <div style={{fontSize:13,color:C.txt,lineHeight:1.6}}>
          Is this female pregnant? If yes, a new <strong>pregnant</strong> mating pair and a{" "}
          <strong>gestating</strong> litter will be created automatically with the same male.
          The remaining females in the original harem will stay at <strong>waiting</strong>.
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
          <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>No — regular split</button>
          <button onClick={()=>{onConfirm();onClose();}} style={btn({background:C.pink,color:"#fff"})}>
            <Heart size={14}/>Yes — mark pregnant
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BatchDeleteModal({cageIds, onClose, onDelete}) {
  const C = useC();
  const [note,setNote] = useState("");
  const ok = note.trim().length > 0;
  return (
    <Modal title={`Delete ${cageIds.length} Cage${cageIds.length!==1?"s":""}`} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{padding:12,background:C.danger+"15",border:`1px solid ${C.danger}33`,borderRadius:8,fontSize:13,color:C.txt}}>
          This will move <strong>{cageIds.length} cage{cageIds.length!==1?"s":""}</strong> to Deleted:&nbsp;
          <span style={{fontFamily:"monospace"}}>{cageIds.join(", ")}</span>. Lineage links are preserved and cages can be restored.
        </div>
        <div>
          <Label>Reason for deletion (required)</Label>
          <TextArea value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{width:"100%"}}
            placeholder="e.g. Experiment complete, aged out…"/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
          <button onClick={onClose} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
          <button onClick={()=>{if(ok){onDelete(note.trim());onClose();}}}
            style={btn({background:C.danger,color:"#fff",opacity:ok?1:.45,cursor:ok?"pointer":"not-allowed"})}>
            Delete {cageIds.length} Cage{cageIds.length!==1?"s":""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Colony({cages, setCages, litters, setLitters, matingPairs, setMatingPairs, auditLog, setAuditLog, archivedLogs, setArchivedLogs, addLog}) {
  const C = useC();
  const [sub,setSub]               = useState("cages");
  const [search,setSearch]         = useState("");
  const [fStr,setFStr]             = useState("All");
  const [fSex,setFSex]             = useState("All");
  const [showAdd,setShowAdd]       = useState(false);
  const [splitFor,setSplitFor]     = useState(null);
  const [mergeFor,setMergeFor]     = useState(null);
  const [deleteFor,setDeleteFor]   = useState(null);
  const [editFor,setEditFor]       = useState(null);
  const [collapsed,setCollapsed]   = useState(new Set());
  const [selected,setSelected]     = useState(new Set());
  const [showBatchAct,setShowBatchAct] = useState(false);
  const [batchDel,setBatchDel]     = useState(false);
  const [auditView,setAuditView]   = useState("current");
  const [expandedArchives,setExpandedArchives] = useState(new Set());
  const [haremSplit,setHaremSplit] = useState(null); // {newCage, haremPair}

  const toggleGroup = s => setCollapsed(prev=>{
    const n = new Set(prev); n.has(s)?n.delete(s):n.add(s); return n;
  });

  const currentCages = cages.filter(c=>!c.isDeleted);
  const deletedCages  = cages.filter(c=> c.isDeleted);

  const filtered = currentCages.filter(c=>{
    if(fStr!=="All"&&c.strain!==fStr) return false;
    if(fSex!=="All"&&c.sex!==fSex)   return false;
    if(search){
      const q=search.toLowerCase();
      if(!c.id.toLowerCase().includes(q)&&!(c.notes||"").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sortGroup = arr => [...arr].sort((a,b)=>{
    if(a.sex!==b.sex) return a.sex==="F"?-1:1;         // females first
    return new Date(a.dob)-new Date(b.dob);             // then oldest first within sex
  });
  const STATUS_ORDER = ["active","mating","pregnant","weaning","retired","euthanized"];
  const groups = STATUS_ORDER
    .map(s=>({status:s, cages:sortGroup(filtered.filter(c=>c.status===s))}))
    .filter(g=>g.cages.length>0);

  const updateCage = (id,updates) => {
    const old = cages.find(c=>c.id===id);
    const FIELD_LABELS = {
      dlarId:"DLAR ID",strain:"Strain",sex:"Sex",mouseCount:"Count",dob:"DOB",
      status:"Status",hasBreed:"Proven Breeder",activationDate:"Activation Date",
      deactivationDate:"Deactivation Date",parentLitterId:"Parent Litter",
      experimentId:"Experiment",notes:"Notes",
    };
    const fmtVal = (k,v) => {
      if(v==null||v==="") return "—";
      if(k==="hasBreed") return v?"Yes":"No";
      if(k==="sex") return v==="M"?"Male":"Female";
      if(k==="strain") return STRAIN_META[v]?.label??v;
      if(k==="status") return STATUS_META[v]?.label??v;
      return String(v);
    };
    const changed = Object.entries(updates)
      .filter(([k])=>FIELD_LABELS[k])
      .filter(([k,v])=>String(old?.[k]??"")!==String(v??""))
      .map(([k,v])=>`${FIELD_LABELS[k]}: "${fmtVal(k,old?.[k])}" → "${fmtVal(k,v)}"`);
    setCages(cs=>cs.map(c=>c.id===id?{...c,...updates}:c));
    addLog("cage_edited",
      changed.length?`Edited cage ${id} — ${changed.join(" | ")}`: `Edited cage ${id} (no changes)`,
      [id]);
  };
  const retire    = id => { setCages(cs=>cs.map(c=>c.id===id?{...c,status:"euthanized",mouseCount:0}:c)); addLog("cage_retired",`Retired/euthanized cage ${id}`,[id]); };
  const unretire  = id => { setCages(cs=>cs.map(c=>c.id===id?{...c,status:"active",mouseCount:Math.max(c.mouseCount,1)}:c)); addLog("cage_unretired",`Unretired cage ${id}`,[id]); };
  const deleteCage  = (id,note) => { setCages(cs=>cs.map(c=>c.id===id?{...c,isDeleted:true,deletedNote:note,deletedAt:todayStr}:c)); addLog("cage_deleted",`Deleted cage ${id}: ${note}`,[id]); };
  const restoreCage = id => { setCages(cs=>cs.map(c=>c.id===id?{...c,isDeleted:false,deletedNote:null,deletedAt:null}:c)); addLog("cage_restored",`Restored cage ${id}`,[id]); };

  const doSplit = (srcId,count,newId) => {
    const ld=()=>{const n=new Date();return `${n.getFullYear()}-${_p2(n.getMonth()+1)}-${_p2(n.getDate())}`};
    const src = cages.find(c=>c.id===srcId);
    const newCage = {...src,id:newId,mouseCount:count,createdAt:ld(),activationDate:ld(),
      deactivationDate:null,notes:`Split from ${srcId}`,status:"active",hasBreed:false,litterHistory:[]};
    setCages(cs=>[...cs.map(c=>c.id===srcId?{...c,mouseCount:c.mouseCount-count}:c),newCage]);
    // Check if source cage is a female in an active harem pair
    if(src && src.sex==="F") {
      const haremPair = matingPairs.find(p=>
        (p.type==="harem" || p.femaleCageIds.length > 1 ||
         cages.find(c=>c.id===srcId)?.mouseCount > 1) &&
        p.femaleCageIds.includes(srcId) &&
        ["waiting","pregnant"].includes(p.status)
      );
      if(haremPair) setHaremSplit({newCage, haremPair, srcId});
    }
  };
  const confirmHaremSplit = ({newCage, haremPair}) => {
    const ld=()=>{const n=new Date();return `${n.getFullYear()}-${_p2(n.getMonth()+1)}-${_p2(n.getDate())}`};
    const today=ld();
    const newPairId = nextSeqId(matingPairs,"MP");
    const newLitterId = nextSeqId(litters,"L");
    // New pair: same male + split-off female, status=pregnant
    const newPair = {
      id:newPairId, type:"pair", strain:haremPair.strain,
      maleCageId:haremPair.maleCageId, femaleCageIds:[newCage.id],
      setupDate:today, status:"pregnant", lastStatusUpdate:today,
      litterIds:[newLitterId],
    };
    // New gestating litter
    const newLitter = {
      id:newLitterId, strain:haremPair.strain,
      motherCageId:newCage.id, fatherCageId:haremPair.maleCageId,
      matingPairId:newPairId, birthDate:null, weanDate:null,
      expectedBirthDate:addDays(today,21),
      numPups:null, numMales:null, numFemales:null,
      status:"gestating", offspringCageIds:[], notes:"Auto-created from harem split",
    };
    // Update original harem pair: keep original female cage(s), reset to waiting
    setMatingPairs(ps=>ps.map(p=>
      p.id===haremPair.id
        ? {...p, status:"waiting", lastStatusUpdate:today}
        : p
    ).concat([newPair]));
    setLitters(ls=>[...ls, newLitter]);
    // Mark new female cage as mating
    setCages(cs=>cs.map(c=>c.id===newCage.id?{...c,status:"mating"}:c));
    addLog("pair_created",
      `Harem split: new pregnant pair ${newPairId} (${newCage.id} + ${haremPair.maleCageId}) from harem ${haremPair.id}`,
      [newCage.id, haremPair.maleCageId]);
  };

  const doMerge = (srcId,tgtId) => {
    setCages(cs=>{
      const src=cs.find(c=>c.id===srcId);
      return cs.map(c=>{
        if(c.id===tgtId) return {...c,mouseCount:c.mouseCount+src.mouseCount};
        if(c.id===srcId) return {...c,status:"retired",mouseCount:0};
        return c;
      });
    });
  };

  const toggleSel = id => setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleGrpSel = ids => setSelected(p=>{
    const allOn=ids.every(id=>p.has(id));
    const n=new Set(p);
    allOn?ids.forEach(id=>n.delete(id)):ids.forEach(id=>n.add(id));
    return n;
  });
  const batchRetire = () => {
    const ids=[...selected];
    setCages(cs=>cs.map(c=>selected.has(c.id)?{...c,status:"euthanized",mouseCount:0}:c));
    addLog("batch_retire",`Batch retired ${ids.length} cage(s): ${ids.join(", ")}`,ids);
    setSelected(new Set()); setShowBatchAct(false);
  };
  const batchUnretire = () => {
    const ids=[...selected];
    setCages(cs=>cs.map(c=>selected.has(c.id)?{...c,status:"active"}:c));
    addLog("cage_unretired",`Batch unretired ${ids.length} cage(s): ${ids.join(", ")}`,ids);
    setSelected(new Set()); setShowBatchAct(false);
  };
  const doBatchDelete = note => {
    const ids=[...selected];
    const n=new Date(), ld=`${n.getFullYear()}-${_p2(n.getMonth()+1)}-${_p2(n.getDate())}`;
    setCages(cs=>cs.map(c=>selected.has(c.id)?{...c,isDeleted:true,deletedNote:note,deletedAt:ld}:c));
    addLog("batch_delete",`Batch deleted ${ids.length} cage(s): ${ids.join(", ")} — ${note}`,ids);
    setSelected(new Set());
  };

  const refreshBreedingStatus = () => {
    // Build lookup: motherCageId → litter history entries
    const motherHistory = {};
    const fatherProven  = new Set();
    litters.forEach(l => {
      if(l.motherCageId) {
        if(!motherHistory[l.motherCageId]) motherHistory[l.motherCageId] = [];
        motherHistory[l.motherCageId].push({
          litterId:  l.id,
          birthDate: l.birthDate || null,
          numPups:   l.numPups   || null,
        });
      }
      if(l.fatherCageId) fatherProven.add(l.fatherCageId);
    });

    const updatedIds = [];
    setCages(cs => cs.map(c => {
      if(c.isDeleted) return c;
      let changed = false;
      let next = {...c};
      if(c.sex === "F") {
        const hist = motherHistory[c.id] || [];
        const histStr = JSON.stringify(hist.map(h=>h.litterId).sort());
        const curStr  = JSON.stringify((c.litterHistory||[]).map(h=>h.litterId).sort());
        if(histStr !== curStr) { next.litterHistory = hist; changed = true; }
      }
      if(c.sex === "M" && fatherProven.has(c.id) && !c.hasBreed) {
        next.hasBreed = true; changed = true;
      }
      if(changed) updatedIds.push(c.id);
      return changed ? next : c;
    }));

    if(updatedIds.length > 0) {
      addLog("breeding_refresh",
        `Refreshed breeding status for ${updatedIds.length} cage(s): ${updatedIds.join(", ")}`,
        updatedIds);
    }
  };

  const renderRow = c => {
    const age=weeksOld(c.dob), ageOut=age>=35, inW=c.strain==="AB"&&age>=4&&age<=10;
    const isRetiredOrEuth = c.status==="euthanized"||c.status==="retired";
    return (
      <tr key={c.id} style={{background:selected.has(c.id)?C.accent+"12":ageOut?C.danger+"08":"transparent"}}>
        <Td style={{textAlign:"center",width:36}}>
          <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSel(c.id)}
            style={{cursor:"pointer",accentColor:C.accent}}/>
        </Td>
        <Td><span style={{fontFamily:"monospace",fontWeight:700,color:C.txt}}>{c.id}</span></Td>
        <Td><span style={{fontFamily:"monospace",fontSize:12,color:c.dlarId?C.txt:C.muted}}>{c.dlarId||"—"}</span></Td>
        <Td><StrainBadge strain={c.strain}/></Td>
        <Td><span style={{color:c.sex==="M"?C.accent:C.pink,fontWeight:600}}>{c.sex==="M"?"♂ M":"♀ F"}</span></Td>
        <Td style={{textAlign:"center"}}>{c.mouseCount}</Td>
        <Td style={{fontFamily:"monospace",fontSize:12}}>{c.dob}</Td>
        <Td><span style={{color:ageOut?C.danger:inW?STRAIN_META.AB.color:C.txt,fontWeight:ageOut||inW?700:400}}>{age}wk{ageOut?" ⚠":""}{inW?" 🔬":""}</span></Td>
        <Td><StatusBadge status={c.status}/></Td>
        <Td>
          {c.sex==="M"
            ?<Badge label={c.hasBreed?"Proven":"Virgin"} color={c.hasBreed?C.success:C.muted}/>
            :<LitterCountCell litterHistory={c.litterHistory||[]}/>}
        </Td>
        <Td><span style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{c.parentLitterId||"—"}</span></Td>
        <Td><span style={{fontFamily:"monospace",fontSize:11,color:c.experimentId?STRAIN_META.AB.color:C.muted}}>{c.experimentId||"—"}</span></Td>
        <Td style={{maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12,color:C.muted}}>{c.notes||"—"}</Td>
        <Td>
          {(()=>{
            const items=[];
            items.push({label:"Edit Cage",onClick:()=>setEditFor(c),color:C.accent,icon:<Edit2 size={11}/>});
            if(!isRetiredOrEuth){
              if(c.mouseCount>1) items.push({label:"Split Cage",onClick:()=>setSplitFor(c),color:C.warn,icon:<Scissors size={11}/>});
              if(c.sex==="F"&&c.status==="active") items.push({label:"Merge Into",onClick:()=>setMergeFor(c),color:C.accent,icon:<ArrowUpDown size={11}/>});
              items.push({label:"Retire",onClick:()=>retire(c.id),color:C.danger});
            } else {
              items.push({label:"Unretire",onClick:()=>unretire(c.id),color:C.success});
            }
            items.push({label:"Delete Cage",onClick:()=>setDeleteFor(c),color:C.danger});
            return <ActionsMenu items={items}/>;
          })()}
        </Td>
      </tr>
    );
  };

  const CageTableHead = ({cageIds=[]}) => {
    const allSel = cageIds.length>0 && cageIds.every(id=>selected.has(id));
    const someSel = !allSel && cageIds.some(id=>selected.has(id));
    return (
      <thead><tr>
        <Th style={{width:36,textAlign:"center"}}>
          <input type="checkbox" checked={allSel} ref={el=>{if(el)el.indeterminate=someSel;}}
            onChange={()=>toggleGrpSel(cageIds)}
            style={{cursor:"pointer",accentColor:C.accent}}/>
        </Th>
        <Th>Colony ID</Th><Th>DLAR ID</Th><Th>Strain</Th><Th>Sex</Th><Th>Count</Th>
        <Th>DOB</Th><Th>Age</Th><Th>Status</Th><Th>Bred</Th>
        <Th>Parent Litter</Th><Th>Exp.</Th><Th>Notes</Th><Th>Actions</Th>
      </tr></thead>
    );
  };

  const LOG_ICONS = {
    cage_added:"➕",cage_split:"✂️",cage_merged:"🔗",cage_retired:"🏁",
    cage_unretired:"♻️",cage_deleted:"🗑️",cage_restored:"🔄",
    pair_created:"❤️",pair_updated:"🔄",litter_updated:"🐣",
    experiment_created:"🧪",experiment_enrollment:"📋",experiment_complete:"✅",
    system_reset:"🔁",default:"📝",
  };

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:14}}>
      <SubTabs tabs={[["cages","Current Cages"],["deleted","Deleted Cages"],["audit","Audit Log"]]} active={sub} onChange={setSub}/>

      {sub==="cages" && <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <div style={{position:"relative"}}>
              <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}/>
              <Input placeholder="Search cage ID / notes…" value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:32,width:200}}/>
            </div>
            <Select value={fStr} onChange={e=>setFStr(e.target.value)}>
              <option value="All">All Strains</option><option value="A">Apcfl/fl</option>
              <option value="B">Cdx2Cre</option><option value="AB">Apcfl/fl / Cdx2Cre</option>
            </Select>
            <Select value={fSex} onChange={e=>setFSex(e.target.value)}>
              <option value="All">All Sexes</option><option value="M">Male</option><option value="F">Female</option>
            </Select>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexDirection:"column",alignItems:"flex-end"}}>
            {selected.size>0&&(()=>{
              const selArr=[...selected].map(id=>cages.find(c=>c.id===id)).filter(Boolean);
              const hasRetired=selArr.some(c=>c.status==="euthanized"||c.status==="retired");
              const hasActive=selArr.some(c=>c.status!=="euthanized"&&c.status!=="retired");
              if(hasRetired&&hasActive) return (
                <div style={{fontSize:11,color:C.warn,background:C.warn+"15",border:`1px solid ${C.warn}40`,borderRadius:6,padding:"5px 10px",maxWidth:340,lineHeight:1.4}}>
                  ⚠ Your selection includes both current and retired cages — verify you've selected the correct cages before applying a batch action.
                </div>
              );
              return null;
            })()}
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={refreshBreedingStatus}
                style={btn({background:C.success+"22",color:C.success,border:`1px solid ${C.success}44`,fontSize:12,padding:"6px 12px"})}>
                ↺ Refresh Breeding Status
              </button>
              <div style={{position:"relative"}}>
                <button
                  disabled={selected.size===0}
                  onClick={()=>setShowBatchAct(p=>!p)}
                  style={btn({background:selected.size>0?C.warn:C.bdr,color:selected.size>0?C.bg:C.muted,cursor:selected.size===0?"not-allowed":"pointer",opacity:selected.size===0?.5:1})}>
                  Batch Actions ({selected.size}) ▾
                </button>
                {showBatchAct&&selected.size>0&&(()=>{
                  const selArr=[...selected].map(id=>cages.find(c=>c.id===id)).filter(Boolean);
                  const hasRetired=selArr.some(c=>c.status==="euthanized"||c.status==="retired");
                  const hasActive=selArr.some(c=>c.status!=="euthanized"&&c.status!=="retired");
                  const menuBtn = (label,onClick,color) => (
                    <button onClick={onClick}
                      style={{display:"block",width:"100%",textAlign:"left",padding:"8px 14px",background:"none",border:"none",color,cursor:"pointer",fontSize:13,borderRadius:5,fontFamily:"inherit"}}>
                      {label}
                    </button>
                  );
                  return (
                    <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:C.surf,border:`1px solid ${C.bdr}`,borderRadius:8,boxShadow:"0 4px 12px #0006",zIndex:200,minWidth:175,padding:4}}>
                      {hasActive  && menuBtn("Retire Selected",  ()=>{setShowBatchAct(false);batchRetire();},   C.warn)}
                      {hasRetired && menuBtn("Unretire Selected", ()=>{setShowBatchAct(false);batchUnretire();}, C.success)}
                      {menuBtn("Delete Selected", ()=>{setShowBatchAct(false);setBatchDel(true);}, C.danger)}
                    </div>
                  );
                })()}
              </div>
              <button onClick={()=>setShowAdd(true)} style={btn({background:C.accent,color:"#fff"})}><Plus size={14}/>New Cage</button>
            </div>
          </div>
        </div>

        {groups.length===0&&<div style={{padding:30,textAlign:"center",color:C.muted}}>No cages match filters.</div>}

        {groups.map(({status,cages:grp})=>{
          const meta=STATUS_META[status]||{label:status,col:C.muted};
          const open=!collapsed.has(status);
          const totalMiceInGroup=grp.reduce((s,c)=>s+c.mouseCount,0);
          return (
            <div key={status}>
              <button onClick={()=>toggleGroup(status)} style={{
                display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",
                background:meta.col+"18",border:`1px solid ${meta.col}40`,
                borderRadius:open?"8px 8px 0 0":8,
                borderBottom:open?`1px solid ${meta.col}20`:undefined,
                padding:"9px 16px",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                <span style={{fontSize:12,color:meta.col,transition:"transform .15s",display:"inline-block",transform:open?"rotate(0)":"rotate(-90deg)"}}>▼</span>
                <span style={{fontSize:13,fontWeight:700,color:meta.col,letterSpacing:.3}}>{meta.label}</span>
                <span style={{fontSize:12,color:meta.col,opacity:.7,fontWeight:500}}>
                  {grp.length} cage{grp.length!==1?"s":""} · {totalMiceInGroup} mice
                </span>
              </button>
              {open&&(
                <div style={{border:`1px solid ${meta.col}30`,borderTop:"none",borderRadius:"0 0 8px 8px",overflowX:"auto",background:C.surf}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <CageTableHead cageIds={grp.map(c=>c.id)}/>
                    <tbody>{grp.map(c=>renderRow(c))}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </>}

      {sub==="deleted"&&(
        <Card style={{padding:0,overflowX:"auto"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.bdr}`,fontSize:13,fontWeight:700,color:C.txt,display:"flex",alignItems:"center",gap:8}}>
            Deleted Cages
            <span style={{fontWeight:400,color:C.muted,fontSize:12}}>({deletedCages.length})</span>
          </div>
          {deletedCages.length===0
            ?<div style={{padding:30,textAlign:"center",color:C.muted}}>No deleted cages.</div>
            :<table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                <Th>Colony ID</Th><Th>DLAR ID</Th><Th>Strain</Th><Th>Sex</Th><Th>Count</Th>
                <Th>DOB</Th><Th>Age</Th><Th>Status</Th><Th>Bred</Th>
                <Th>Parent Litter</Th><Th>Deleted On</Th><Th>Reason</Th><Th>Actions</Th>
              </tr></thead>
              <tbody>
                {deletedCages.map(c=>{
                  const age=weeksOld(c.dob);
                  return (
                    <tr key={c.id} style={{opacity:.72}}>
                      <Td><span style={{fontFamily:"monospace",fontWeight:700,color:C.muted}}>{c.id}</span></Td>
                      <Td><span style={{fontFamily:"monospace",fontSize:12,color:C.muted}}>{c.dlarId||"—"}</span></Td>
                      <Td><StrainBadge strain={c.strain}/></Td>
                      <Td><span style={{color:c.sex==="M"?C.accent:C.pink,fontWeight:600}}>{c.sex==="M"?"♂ M":"♀ F"}</span></Td>
                      <Td style={{textAlign:"center"}}>{c.mouseCount}</Td>
                      <Td style={{fontFamily:"monospace",fontSize:12}}>{c.dob}</Td>
                      <Td><span style={{color:C.muted}}>{age}wk</span></Td>
                      <Td><StatusBadge status={c.status}/></Td>
                      <Td>
                        {c.sex==="M"
                          ?<Badge label={c.hasBreed?"Proven":"Virgin"} color={c.hasBreed?C.success:C.muted}/>
                          :<LitterCountCell litterHistory={c.litterHistory||[]}/>}
                      </Td>
                      <Td><span style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{c.parentLitterId||"—"}</span></Td>
                      <Td><span style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{c.deletedAt||"—"}</span></Td>
                      <Td style={{maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12,color:C.muted}}>{c.deletedNote||"—"}</Td>
                      <Td>
                        <button onClick={()=>restoreCage(c.id)} style={btn({background:C.success+"18",color:C.success,padding:"3px 8px",fontSize:11})}>Restore</button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}
        </Card>
      )}

      {sub==="audit"&&(()=>{
        const logEntryRow = (e,i) => (
          <div key={e.id||i} style={{display:"flex",gap:14,padding:"11px 18px",borderBottom:`1px solid ${C.bdr}22`,alignItems:"flex-start"}}>
            <span style={{fontSize:16,flexShrink:0}}>{LOG_ICONS[e.type]||LOG_ICONS.default}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:C.txt}}>{e.description}</div>
              {e.cageIds?.length>0&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>Cages: {e.cageIds.join(", ")}</div>}
            </div>
            <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",flexShrink:0}}>{new Date(e.timestamp).toLocaleString()}</div>
          </div>
        );
        const doArchive = () => {
          if(auditLog.length===0) return;
          const timestamps = auditLog.map(e=>e.timestamp).sort();
          const start = new Date(timestamps[timestamps.length-1]).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
          const end   = new Date(timestamps[0]).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
          const label = start===end ? start : `${start} – ${end}`;
          setArchivedLogs(prev=>[{id:uid("ARC"),label,archivedAt:new Date().toISOString(),entries:auditLog},...prev]);
          setAuditLog([]);
        };
        const toggleArchive = id => setExpandedArchives(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
        return (
          <Card style={{padding:0}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <History size={14}/>
              <span style={{fontSize:13,fontWeight:700,color:C.txt}}>Audit Log</span>
              <div style={{display:"flex",gap:1,marginLeft:4,background:C.bg,borderRadius:6,padding:2,border:`1px solid ${C.bdr}`}}>
                {[["current","Current"],["archives","Archives"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setAuditView(v)}
                    style={{padding:"3px 12px",borderRadius:5,border:"none",cursor:"pointer",fontSize:12,fontFamily:"inherit",
                      background:auditView===v?C.surf2:"transparent",color:auditView===v?C.txt:C.muted,fontWeight:auditView===v?600:400,transition:"all .15s"}}>
                    {l}{v==="archives"&&archivedLogs.length>0&&<span style={{marginLeft:4,fontSize:10,background:C.accent+"33",color:C.accent,borderRadius:8,padding:"1px 5px"}}>{archivedLogs.length}</span>}
                  </button>
                ))}
              </div>
              <span style={{fontWeight:400,color:C.muted,fontSize:12,marginLeft:2}}>
                {auditView==="current"?`(${auditLog.length} entries)`:`(${archivedLogs.length} archive${archivedLogs.length!==1?"s":""})`}
              </span>
              <div style={{marginLeft:"auto"}}>
                {auditView==="current"&&(
                  <button onClick={doArchive} disabled={auditLog.length===0}
                    style={btn({background:C.muted+"22",color:C.muted,border:`1px solid ${C.bdr}`,fontSize:11,padding:"4px 10px",opacity:auditLog.length===0?.45:1,cursor:auditLog.length===0?"not-allowed":"pointer"})}>
                    Archive Log
                  </button>
                )}
              </div>
            </div>

            {auditView==="current"&&(
              <>
                {auditLog.length===0&&<div style={{padding:30,textAlign:"center",color:C.muted}}>No entries yet. Actions performed in the app will appear here.</div>}
                <div style={{maxHeight:520,overflowY:"auto"}}>
                  {auditLog.map(logEntryRow)}
                </div>
              </>
            )}

            {auditView==="archives"&&(
              <div style={{maxHeight:560,overflowY:"auto"}}>
                {archivedLogs.length===0&&<div style={{padding:30,textAlign:"center",color:C.muted}}>No archived logs yet. Use "Archive Log" to snapshot and clear the current log.</div>}
                {archivedLogs.map(arc=>{
                  const isOpen = expandedArchives.has(arc.id);
                  return (
                    <div key={arc.id} style={{borderBottom:`1px solid ${C.bdr}22`}}>
                      <button onClick={()=>toggleArchive(arc.id)} style={{
                        display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 18px",
                        background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        <span style={{fontSize:11,color:C.muted,transition:"transform .15s",display:"inline-block",transform:isOpen?"rotate(0)":"rotate(-90deg)"}}>▼</span>
                        <span style={{fontSize:13,fontWeight:600,color:C.txt,flex:1}}>{arc.label}</span>
                        <span style={{fontSize:11,color:C.muted}}>{arc.entries.length} entries</span>
                        <span style={{fontSize:10,color:C.muted,fontFamily:"monospace",marginLeft:8}}>archived {new Date(arc.archivedAt).toLocaleDateString()}</span>
                      </button>
                      {isOpen&&(
                        <div style={{borderTop:`1px solid ${C.bdr}22`,background:C.bg+"60"}}>
                          {arc.entries.map(logEntryRow)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })()}

      {showAdd&&<AddCageModal litters={litters} cages={cages} onClose={()=>setShowAdd(false)} onAdd={c=>{
        setCages(cs=>[...cs,c]);
        addLog("cage_added",`Added cage ${c.id} (${STRAIN_META[c.strain]?.label}, ${c.sex==="M"?"Male":"Female"}, ${c.mouseCount} mice)`,[c.id]);
      }}/>}
      {splitFor&&<SplitCageModal cage={splitFor} allCages={cages} onClose={()=>setSplitFor(null)} onSplit={doSplit} addLog={addLog}/>}
      {mergeFor&&<MergeCageModal sourceCage={mergeFor} cages={cages} onClose={()=>setMergeFor(null)} onMerge={doMerge} addLog={addLog}/>}
      {deleteFor&&<DeleteCageModal cage={deleteFor} onClose={()=>setDeleteFor(null)} onDelete={deleteCage}/>}
      {editFor&&<EditCageModal cage={editFor} litters={litters} onClose={()=>setEditFor(null)} onSave={updateCage}/>}
      {batchDel&&<BatchDeleteModal cageIds={[...selected]} onClose={()=>setBatchDel(false)} onDelete={doBatchDelete}/>}
      {haremSplit&&<HaremSplitConfirmModal newCage={haremSplit.newCage} haremPair={haremSplit.haremPair}
        onClose={()=>setHaremSplit(null)} onConfirm={()=>confirmHaremSplit(haremSplit)}/>}
    </div>
  );
}

/* ═══════════════════════════ DASHBOARD ════════════════════════════ */
function Dashboard({cages, litters, matingPairs, settings}) {
  const C = useC();
  const isActive = c => !["euthanized","retired"].includes(c.status);
  const totalMice   = cages.filter(isActive).reduce((s,c)=>s+c.mouseCount,0);
  const activeCages = cages.filter(isActive).length;
  const abInW = cages.filter(c=>c.strain==="AB"&&isActive(c))
    .filter(c=>{const w=weeksOld(c.dob);return w>=4&&w<=10;})
    .reduce((s,c)=>s+c.mouseCount,0);

  const alerts = [];
  litters.filter(l=>l.weanDate).forEach(l=>{
    const d=daysUntil(l.weanDate);
    if(d!==null&&d>=0&&d<=settings.weanAlertDays)
      alerts.push({type:"warn",msg:`Litter ${l.id} (${STRAIN_META[l.strain]?.label}) weans ${fmt(l.weanDate)} — ${d}d`,tag:"Weaning",days:d});
  });
  cages.filter(isActive).forEach(c=>{
    const w=weeksOld(c.dob);
    if(w>=settings.ageOutWeeks)
      alerts.push({type:"danger",msg:`Cage ${c.id} (${STRAIN_META[c.strain]?.label} ${c.sex}) is ${w}wk — retirement threshold`,tag:"Age-Out"});
    else if(w>=settings.ageOutWeeks-3)
      alerts.push({type:"warn",msg:`Cage ${c.id} is ${w}wk — approaching retirement`,tag:"Soon"});
  });
  ["A","B"].forEach(s=>{
    const sm=cages.filter(c=>c.strain===s&&c.sex==="M"&&c.status==="active").length;
    const sf=cages.filter(c=>c.strain===s&&c.sex==="F"&&c.status==="active").length;
    if(sm<settings.minMales)   alerts.push({type:"danger",msg:`${STRAIN_META[s].label}: ${sm} active male cage(s) — below minimum ${settings.minMales}`,tag:"Low Colony"});
    if(sf<settings.minFemales) alerts.push({type:"danger",msg:`${STRAIN_META[s].label}: ${sf} active female cage(s) — below minimum ${settings.minFemales}`,tag:"Low Colony"});
  });

  const statCard = (icon,label,val,sub,color=C.accent) => (
    <Card style={{flex:1,minWidth:165}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:6}}>{label}</div>
          <div style={{fontSize:28,fontWeight:800,color:C.txt,fontFamily:"'IBM Plex Mono',monospace"}}>{val}</div>
          {sub && <div style={{fontSize:12,color:C.muted,marginTop:4}}>{sub}</div>}
        </div>
        <div style={{color,opacity:.8}}>{icon}</div>
      </div>
    </Card>
  );

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:14}}>
        {statCard(<Activity size={22}/>,"Total Mice",totalMice,`${activeCages} cages`)}
        {statCard(<DollarSign size={22}/>,"Est. Monthly",`$${activeCages*30}`,`$${activeCages}/day`,C.warn)}
        {statCard(<FlaskConical size={22}/>,"AB In Window",abInW,"4–10 wks",STRAIN_META.AB.color)}
        {statCard(<Baby size={22}/>,"Active Litters",litters.filter(l=>l.status!=="weaned").length,"gestating + born",C.pink)}
      </div>

      {alerts.length>0 && (
        <div>
          <div style={{fontSize:13,fontWeight:700,color:C.txt,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <Bell size={15} style={{color:C.warn}}/>{alerts.length} Active Alert{alerts.length!==1?"s":""}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[...alerts].sort((a,b)=>(a.days??999)-(b.days??999)).map((a,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 16px",borderRadius:10,
                background:a.type==="danger"?"rgba(248,81,73,.1)":"rgba(210,153,34,.1)",
                border:`1px solid ${a.type==="danger"?"rgba(248,81,73,.3)":"rgba(210,153,34,.3)"}`}}>
                <AlertCircle size={15} style={{color:a.type==="danger"?C.danger:C.warn,marginTop:1,flexShrink:0}}/>
                <div style={{flex:1,fontSize:13,color:C.txt}}>{a.msg}</div>
                <Badge label={a.tag} color={a.type==="danger"?C.danger:C.warn}/>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.txt,marginBottom:14}}>Colony Overview</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr><Th>Strain</Th><Th>♂ Males</Th><Th>♀ Females</Th><Th>Pairs</Th></tr></thead>
            <tbody>
              {["A","B","AB"].map(s=>{
                const mc=cages.filter(c=>c.strain===s&&c.sex==="M"&&isActive(c));
                const fc=cages.filter(c=>c.strain===s&&c.sex==="F"&&isActive(c));
                return (
                  <tr key={s}>
                    <Td><span style={{color:STRAIN_META[s].color,fontWeight:700,fontStyle:"italic"}}><StrainName strain={s}/></span></Td>
                    <Td>{mc.length} cage{mc.length!==1?"s":""} ({mc.reduce((a,c)=>a+c.mouseCount,0)})</Td>
                    <Td>{fc.length} cage{fc.length!==1?"s":""} ({fc.reduce((a,c)=>a+c.mouseCount,0)})</Td>
                    <Td>{matingPairs.filter(p=>p.strain===s&&p.status!=="retired").length} active</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.txt,marginBottom:14}}>Upcoming Events</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {litters.filter(l=>l.status!=="weaned")
              .sort((a,b)=>new Date(a.status==="born"?a.weanDate:a.expectedBirthDate)-new Date(b.status==="born"?b.weanDate:b.expectedBirthDate))
              .map(l=>{
                const d=l.status==="born"?daysUntil(l.weanDate):daysUntil(l.expectedBirthDate);
                return (
                  <div key={l.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.surf2,borderRadius:8}}>
                    <div style={{flex:1}}>
                      <span style={{fontSize:12,fontFamily:"monospace",color:C.muted}}>{l.id}</span>
                      <span style={{fontSize:13,color:C.txt,marginLeft:8}}>
                        {l.status==="born"?"Wean":"Birth"} — <StrainBadge strain={l.strain}/>
                      </span>
                    </div>
                    <span style={{fontSize:12,color:d!==null&&d<=3?C.danger:C.muted,fontWeight:600}}>
                      {d!==null?`in ${d}d`:"—"}
                    </span>
                  </div>
                );
              })}
            {litters.filter(l=>l.status!=="weaned").length===0 && (
              <div style={{color:C.muted,fontSize:13}}>No upcoming events.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════ BREEDING VIEW ════════════════════════ */
function Breeding({cages, litters, matingPairs, setLitters, setMatingPairs, setCages, addLog}) {
  const C = useC();
  const [sub,setSub]           = useState("pairs");
  const [showAdd,setShowAdd]   = useState(false);
  const [showAddLit,setShowAddLit] = useState(false);
  const [updLit,setUpdLit]     = useState(null);
  const [editPair,setEditPair] = useState(null);
  const [pairOpen,setPairOpen] = useState({A:true,B:true,AB:true});
  const [litOpen,setLitOpen]   = useState({A:true,B:true,AB:true});
  const [litSub,setLitSub]     = useState("active");
  const [pairSub,setPairSub]   = useState("active");
  const liveDate = () => { const n=new Date(); return `${n.getFullYear()}-${_p2(n.getMonth()+1)}-${_p2(n.getDate())}`; };

  const addPair = ({pair,litter}) => {
    setMatingPairs(ps=>[...ps,pair]);
    setLitters(ls=>[...ls,litter]);
    setCages(cs=>cs.map(c=>{
      if(c.id===pair.maleCageId)            return {...c,status:"mating",hasBreed:true};
      if(pair.femaleCageIds.includes(c.id)) return {...c,status:"mating"};
      return c;
    }));
    addLog("pair_created",`Set up ${pair.type} ${pair.id} (${STRAIN_META[pair.strain]?.label})`,[pair.maleCageId,...pair.femaleCageIds]);
  };

  const addLitter = litter => {
    setLitters(ls=>[...ls,litter]);
    addLog("litter_added",`Added litter ${litter.id} (${STRAIN_META[litter.strain]?.label})`,[litter.motherCageId,litter.fatherCageId].filter(Boolean));
  };

  const updPairStatus = (id,status) => {
    const old = matingPairs.find(p=>p.id===id);
    setMatingPairs(ps=>ps.map(p=>p.id===id?{...p,status,lastStatusUpdate:liveDate()}:p));
    addLog("pair_updated",`Pair ${id} status: "${old?.status??'—'}" → "${status}"`);
  };

  const checkPairToday = id => {
    setMatingPairs(ps=>ps.map(p=>p.id===id?{...p,lastStatusUpdate:liveDate()}:p));
    addLog("pair_checked",`Pair ${id} checked today`);
  };

  const savePair = updated => {
    const old = matingPairs.find(p=>p.id===updated.id);
    const PAIR_LABELS = {type:"Type",strain:"Strain",maleCageId:"Male Cage",femaleCageIds:"Female Cage(s)",setupDate:"Setup Date",status:"Status"};
    const fmtP = (k,v) => {
      if(v==null||v==="") return "—";
      if(k==="strain") return STRAIN_META[v]?.label??v;
      if(k==="type") return v==="harem"?"Harem":"Pair";
      if(k==="femaleCageIds") return Array.isArray(v)?v.join(", "):String(v);
      return String(v);
    };
    const changed = Object.keys(PAIR_LABELS).filter(k=>{
      const ov=k==="femaleCageIds"?(old?.[k]||[]).join(","):String(old?.[k]??"");
      const nv=k==="femaleCageIds"?(updated[k]||[]).join(","):String(updated[k]??"");
      return ov!==nv;
    }).map(k=>`${PAIR_LABELS[k]}: "${fmtP(k,old?.[k])}" → "${fmtP(k,updated[k])}"`);
    setMatingPairs(ps=>ps.map(p=>p.id===updated.id?updated:p));
    addLog("pair_edited",
      changed.length?`Edited pair ${updated.id} — ${changed.join(" | ")}`:`Edited pair ${updated.id} (no changes)`,
      [updated.maleCageId,...updated.femaleCageIds]);
  };

  const saveLitter = updated => {
    const old = litters.find(l=>l.id===updated.id);
    const LIT_LABELS = {
      motherCageId:"Mother",fatherCageId:"Father",status:"Status",
      birthDate:"Birth Date",weanDate:"Wean Date",expectedBirthDate:"Expected Birth",
      numPups:"Pups",numMales:"Males",numFemales:"Females",
    };
    const changed = Object.keys(LIT_LABELS)
      .filter(k=>String(old?.[k]??"")!==String(updated[k]??""))
      .map(k=>`${LIT_LABELS[k]}: "${old?.[k]??'—'}" → "${updated[k]??'—'}"`);
    setLitters(ls=>ls.map(l=>l.id===updated.id?updated:l));
    if(updated.status==="born"){
      setMatingPairs(ps=>ps.map(p=>p.litterIds?.includes(updated.id)?{...p,status:"birthed",lastStatusUpdate:liveDate()}:p));
      const pair = matingPairs.find(p=>p.litterIds?.includes(updated.id));
      if(pair) setCages(cs=>cs.map(c=>pair.femaleCageIds.includes(c.id)?{...c,hasBreed:true,
        litterHistory:[...c.litterHistory,{litterId:updated.id,birthDate:updated.birthDate,numPups:updated.numPups}]}:c));
    }
    addLog("litter_updated",
      changed.length?`Updated litter ${updated.id} — ${changed.join(" | ")}`:`Updated litter ${updated.id} (no changes)`,
      [updated.motherCageId,updated.fatherCageId]);
  };

  const pCol = s => ({waiting:C.muted,pregnant:C.pink,birthed:C.success,retired:C.muted})[s]||C.muted;
  const getCage = id => cages.find(c=>c.id===id);
  const STRAINS = ["A","B","AB"];
  const PAIR_STATUSES = pairSub==="retired" ? ["retired"] : ["waiting","pregnant","birthed"];

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:14}}>
      <SubTabs tabs={[["pairs","Mating Pairs"],["litters","Litters"]]} active={sub} onChange={setSub}/>

      {sub==="pairs" && <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <SubTabs tabs={[["active","Active"],["retired","Retired"]]} active={pairSub} onChange={setPairSub}/>
          <button onClick={()=>setShowAdd(true)} style={btn({background:C.pink,color:"#fff"})}><Plus size={14}/>New Pair</button>
        </div>
        {STRAINS.map(s=>{
          const sp = matingPairs.filter(p=>p.strain===s && (pairSub==="retired" ? p.status==="retired" : p.status!=="retired"));
          const open = pairOpen[s]!==false;
          return (
            <div key={s} style={{border:`1px solid ${C.bdr2}`,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setPairOpen(o=>({...o,[s]:!open}))}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                  background:C.surf,cursor:"pointer",userSelect:"none"}}>
                <span style={{fontSize:11,color:C.muted,marginRight:2}}>{open?"▼":"▶"}</span>
                <StrainBadge strain={s}/>
                <span style={{fontSize:12,color:C.muted,marginLeft:4}}>{sp.length} pair{sp.length!==1?"s":""}</span>
              </div>
              {open && (
                <div style={{paddingBottom:12}}>
                  {sp.length===0 ? (
                    <div style={{padding:"14px 20px",color:C.muted,fontSize:13}}>No {pairSub==="retired"?"retired":"active"} mating pairs.</div>
                  ) : (
                    PAIR_STATUSES.map(st=>{
                      const grp = sp.filter(p=>p.status===st);
                      if(!grp.length) return null;
                      return (
                        <div key={st} style={{marginTop:10}}>
                          <div style={{padding:"3px 16px 5px",fontSize:11,fontWeight:700,color:pCol(st),
                            letterSpacing:.8,textTransform:"uppercase",display:"flex",alignItems:"center",gap:7}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:pCol(st),flexShrink:0,display:"inline-block"}}/>
                            {st} ({grp.length})
                          </div>
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
                              <colgroup>
                                <col style={{width:"14%"}}/><col style={{width:"8%"}}/><col style={{width:"13%"}}/>
                                <col style={{width:"22%"}}/><col style={{width:"11%"}}/><col style={{width:"13%"}}/>
                                <col style={{width:"19%"}}/>
                              </colgroup>
                              <thead><tr>
                                <Th>Pair ID</Th><Th>Type</Th><Th>Male</Th><Th>Female(s)</Th>
                                <Th>Set Up</Th><Th>Last Updated</Th><Th>Actions</Th>
                              </tr></thead>
                              <tbody>
                                {grp.map(p=>{
                                  const m=getCage(p.maleCageId);
                                  const cageId = c => c ? (c.dlarId||c.id) : "—";
                                  const cageIdSub = c => c?.dlarId ? <span style={{fontSize:10,color:C.muted,marginLeft:4}}>({c.id})</span> : null;
                                  return (
                                    <tr key={p.id}>
                                      <Td><span style={{fontFamily:"monospace",fontWeight:700}}>{p.id}</span></Td>
                                      <Td><Badge label={p.type==="harem"?"Harem":"Pair"} color={p.type==="harem"?C.warn:C.muted}/></Td>
                                      <Td>
                                        <span style={{fontFamily:"monospace",color:C.accent}}>{cageId(m)}</span>
                                        {cageIdSub(m)}
                                        <span style={{fontSize:11,color:C.muted,marginLeft:6}}>{m?`${weeksOld(m.dob)}wk`:""}</span>
                                      </Td>
                                      <Td>
                                        {p.femaleCageIds.map(id=>{
                                          const fc=getCage(id);
                                          return (
                                            <span key={id} style={{display:"inline-flex",alignItems:"baseline",gap:3,marginRight:8,whiteSpace:"nowrap"}}>
                                              <span style={{fontFamily:"monospace",color:C.pink}}>{cageId(fc)}</span>
                                              {cageIdSub(fc)}
                                              {p.type==="harem"&&fc&&<span style={{fontSize:11,color:C.muted}}>({fc.mouseCount}F)</span>}
                                            </span>
                                          );
                                        })}
                                      </Td>
                                      <Td style={{fontFamily:"monospace",fontSize:12}}>{fmtSh(p.setupDate)}</Td>
                                      <Td style={{fontFamily:"monospace",fontSize:12,color:C.muted}}>{fmtSh(p.lastStatusUpdate)}</Td>
                                      <Td>
                                        <ActionsMenu items={[
                                          ...(p.status==="waiting"  ? [{label:"Mark Pregnant",onClick:()=>updPairStatus(p.id,"pregnant"),color:C.pink}] : []),
                                          ...(p.status==="pregnant" ? [{label:"Mark Birthed", onClick:()=>updPairStatus(p.id,"birthed"), color:C.success}] : []),
                                          ...(p.status==="birthed"  ? [{label:"Retire Pair",  onClick:()=>updPairStatus(p.id,"retired"), color:C.muted},
                                                                       {label:"Undo Birthed", onClick:()=>updPairStatus(p.id,"pregnant"),color:C.muted}] : []),
                                          ...(p.status==="retired"  ? [{label:"Undo Retire",  onClick:()=>updPairStatus(p.id,"birthed"), color:C.muted}] : []),
                                          {label:"Edit Pair",     onClick:()=>setEditPair(p),      color:C.accent},
                                          {label:"Checked Today", onClick:()=>checkPairToday(p.id),color:C.muted},
                                        ]}/>
                                      </Td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </>}

      {sub==="litters" && <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <SubTabs tabs={[["active","Active"],["weaned","Weaned (Historical)"]]} active={litSub} onChange={setLitSub}/>
          <button onClick={()=>setShowAddLit(true)} style={btn({background:C.pink,color:"#fff"})}><Plus size={14}/>Add Litter</button>
        </div>
        {STRAINS.map(s=>{
          const sl = litters.filter(l=>l.strain===s && (litSub==="weaned" ? l.status==="weaned" : l.status!=="weaned"));
          const open = litOpen[s]!==false;
          return (
            <div key={s} style={{border:`1px solid ${C.bdr2}`,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setLitOpen(o=>({...o,[s]:!open}))}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                  background:C.surf,cursor:"pointer",userSelect:"none"}}>
                <span style={{fontSize:11,color:C.muted,marginRight:2}}>{open?"▼":"▶"}</span>
                <StrainBadge strain={s}/>
                <span style={{fontSize:12,color:C.muted,marginLeft:4}}>{sl.length} litter{sl.length!==1?"s":""}</span>
              </div>
              {open && (
                sl.length===0 ? (
                  <div style={{padding:"14px 20px",color:C.muted,fontSize:13}}>No litters recorded.</div>
                ) : (
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
                      <colgroup>
                        <col style={{width:"12%"}}/><col style={{width:"9%"}}/><col style={{width:"9%"}}/>
                        <col style={{width:"16%"}}/><col style={{width:"15%"}}/><col style={{width:"12%"}}/>
                        <col style={{width:"11%"}}/><col style={{width:"16%"}}/>
                      </colgroup>
                      <thead><tr>
                        <Th>Litter ID</Th><Th>Mother</Th><Th>Father</Th>
                        <Th>Expected / Born</Th><Th>Wean Date</Th><Th>Pups</Th><Th>Status</Th><Th>Actions</Th>
                      </tr></thead>
                      <tbody>
                        {sl.map(l=>{
                          const du=l.weanDate?daysUntil(l.weanDate):l.expectedBirthDate?daysUntil(l.expectedBirthDate):null;
                          const pair = l.matingPairId ? matingPairs.find(p=>p.id===l.matingPairId) : null;
                          const dispStatus = (l.status==="gestating" && pair?.status==="waiting") ? "waiting" : l.status;
                          const statusColor = dispStatus==="weaned"?C.success:dispStatus==="born"?C.accent:dispStatus==="waiting"?C.muted:C.pink;
                          return (
                            <tr key={l.id}>
                              <Td><span style={{fontFamily:"monospace",fontWeight:700}}>{l.id}</span></Td>
                              <Td>{(()=>{const c=getCage(l.motherCageId);return c?<><span style={{fontFamily:"monospace",color:C.pink}}>{c.dlarId||c.id}</span>{c.dlarId&&<span style={{fontSize:10,color:C.muted,marginLeft:3}}>({c.id})</span>}</>:<span style={{fontFamily:"monospace",color:C.muted}}>{l.motherCageId||"—"}</span>;})()}</Td>
                              <Td>{(()=>{const c=getCage(l.fatherCageId);return c?<><span style={{fontFamily:"monospace",color:C.accent}}>{c.dlarId||c.id}</span>{c.dlarId&&<span style={{fontSize:10,color:C.muted,marginLeft:3}}>({c.id})</span>}</>:<span style={{fontFamily:"monospace",color:C.muted}}>{l.fatherCageId||"—"}</span>;})()}</Td>
                              <Td style={{fontFamily:"monospace",fontSize:12}}>
                                {l.birthDate
                                  ? <span style={{color:C.success}}>{fmt(l.birthDate)}</span>
                                  : <span style={{color:C.muted}}>{fmt(l.expectedBirthDate)} (est.)</span>}
                              </Td>
                              <Td style={{fontFamily:"monospace",fontSize:12}}>
                                {l.weanDate
                                  ? <span style={{color:du!==null&&du<=7?C.warn:C.txt}}>{fmt(l.weanDate)}{du!==null&&du>=0?` (${du}d)`:""}</span>
                                  : <span style={{color:C.muted}}>—</span>}
                              </Td>
                              <Td>
                                {l.status==="weaned"
                                  ? (l.numPups!=null?<span>{l.numPups} ({l.numMales}M/{l.numFemales}F)</span>:<span style={{color:C.muted}}>—</span>)
                                  : (l.numPups!=null?<span style={{color:C.muted}}>{l.numPups} pups</span>:<span style={{color:C.muted}}>—</span>)}
                              </Td>
                              <Td><Badge label={dispStatus} color={statusColor}/></Td>
                              <Td>
                                <button onClick={()=>setUpdLit(l)} style={btn({background:C.surf2,color:C.muted,fontSize:12,padding:"4px 10px"})}>
                                  <Edit2 size={12}/>Update
                                </button>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          );
        })}
      </>}

      {showAdd    && <AddMatingPairModal cages={cages} litters={litters} matingPairs={matingPairs} onClose={()=>setShowAdd(false)} onAdd={addPair}/>}
      {showAddLit && <AddLitterModal cages={cages} litters={litters} onClose={()=>setShowAddLit(false)} onAdd={addLitter}/>}
      {updLit     && <UpdateLitterModal litter={updLit} cages={cages} onClose={()=>setUpdLit(null)} onUpdate={saveLitter}/>}
      {editPair   && <EditPairModal pair={editPair} cages={cages} onClose={()=>setEditPair(null)} onSave={savePair}/>}
    </div>
  );
}

/* ═══════════════════════════ EXPERIMENTS VIEW ══════════════════════ */
function ExperimentsView({experiments, cages, setExperiments, setCages, addLog}) {
  const C = useC();
  const [showAdd,setShowAdd]   = useState(false);
  const [enrollFor,setEnrollFor] = useState(null);

  const addExp = exp => {
    setExperiments(es=>[...es,exp]);
    addLog("experiment_created",`Created experiment "${exp.name}" targeting ${exp.targetN} AB mice`);
  };

  const enroll = (expId, cageIds) => {
    setExperiments(es=>es.map(e=>e.id===expId?{...e,enrolledCageIds:cageIds}:e));
    setCages(cs=>cs.map(c=>{
      if(cageIds.includes(c.id))                              return {...c,experimentId:expId};
      if(c.experimentId===expId&&!cageIds.includes(c.id))     return {...c,experimentId:null};
      return c;
    }));
    addLog("experiment_enrollment",`Updated enrollment for ${expId}: ${cageIds.length} cage(s)`);
  };

  const complete = id => {
    setExperiments(es=>es.map(e=>e.id===id?{...e,status:"completed",endDate:todayStr}:e));
    addLog("experiment_complete",`Completed experiment ${id}`);
  };

  const EXP_STATUS_COL = {planned:C.muted, active:C.warn, completed:C.success};

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <FlaskConical size={18} style={{color:STRAIN_META.AB.color}}/>
          <span style={{fontWeight:700,fontSize:15,color:C.txt}}>Experiment Cohort Tracker</span>
        </div>
        <button onClick={()=>setShowAdd(true)} style={btn({background:STRAIN_META.AB.color+"cc",color:"#fff"})}>
          <Plus size={14}/>New Experiment
        </button>
      </div>

      {experiments.map(exp=>{
        const ec      = cages.filter(c=>exp.enrolledCageIds.includes(c.id));
        const total   = ec.reduce((s,c)=>s+c.mouseCount,0);
        const inW     = ec.filter(c=>{const a=weeksOld(c.dob);return a>=4&&a<=10;}).reduce((s,c)=>s+c.mouseCount,0);
        const pct     = Math.min(100,Math.round((total/exp.targetN)*100));
        const statCol = EXP_STATUS_COL[exp.status]||C.muted;
        return (
          <Card key={exp.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontFamily:"monospace",fontSize:12,color:C.muted}}>{exp.id}</span>
                  <span style={{fontWeight:700,fontSize:15,color:C.txt}}>{exp.name}</span>
                  <Badge label={exp.status} color={statCol}/>
                  <StrainBadge strain="AB"/>
                </div>
                {exp.description && <div style={{fontSize:12,color:C.muted}}>{exp.description}</div>}
              </div>
              {exp.status==="active" && (
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEnrollFor(exp)}
                    style={btn({background:STRAIN_META.AB.bg,color:STRAIN_META.AB.color,border:`1px solid ${STRAIN_META.AB.border}`,padding:"5px 12px",fontSize:12})}>
                    <Users size={12}/>Enroll Cages
                  </button>
                  <button onClick={()=>complete(exp.id)}
                    style={btn({background:C.surf2,color:C.muted,padding:"5px 12px",fontSize:12})}>
                    <CheckCircle2 size={12}/>Complete
                  </button>
                </div>
              )}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:14}}>
              {[["Target n",exp.targetN,STRAIN_META.AB.color],["Enrolled",total,pct>=100?C.success:C.warn],["In Window 🔬",inW,inW>0?STRAIN_META.AB.color:C.muted],["Cages",exp.enrolledCageIds.length,C.muted]].map(([l,v,col])=>(
                <div key={l} style={{background:C.surf2,borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:22,fontWeight:800,color:col,fontFamily:"monospace"}}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
                <span>Enrollment progress</span><span>{total}/{exp.targetN} ({pct}%)</span>
              </div>
              <div style={{height:8,background:C.surf2,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:pct>=100?C.success:STRAIN_META.AB.color,borderRadius:4,transition:"width .4s"}}/>
              </div>
            </div>

            {ec.length>0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8,letterSpacing:.8,textTransform:"uppercase"}}>Enrolled Cages</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {ec.map(c=>{
                    const age=weeksOld(c.dob), inW=age>=4&&age<=10, past=age>10;
                    return (
                      <div key={c.id} style={{padding:"6px 12px",background:STRAIN_META.AB.bg,
                        border:`1px solid ${STRAIN_META.AB.border}`,borderRadius:8,
                        display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:STRAIN_META.AB.color,fontSize:12}}>{c.id}</span>
                        <span style={{fontSize:11,color:C.muted}}>{c.mouseCount}×{c.sex==="M"?"♂":"♀"} · {age}wk</span>
                        {inW  && <span style={{fontSize:10,color:STRAIN_META.AB.color}}>🔬</span>}
                        {past && <span style={{fontSize:10,color:C.danger}}>⚠️</span>}
                        <span style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{c.parentLitterId||"Fndr"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{marginTop:12,fontSize:11,color:C.muted}}>
              Started: {fmt(exp.startDate)}{exp.endDate?` · Ended: ${fmt(exp.endDate)}`:""}{exp.notes?` · ${exp.notes}`:""}
            </div>
          </Card>
        );
      })}

      {experiments.length===0 && (
        <div style={{textAlign:"center",color:C.muted,padding:40,fontSize:14}}>
          No experiments yet. Create one to start tracking cohorts.
        </div>
      )}

      {showAdd    && <AddExperimentModal onClose={()=>setShowAdd(false)} onAdd={addExp} experiments={experiments}/>}
      {enrollFor  && <EnrollCagesModal experiment={enrollFor} cages={cages} onClose={()=>setEnrollFor(null)} onEnroll={enroll}/>}
    </div>
  );
}

/* ═══════════════════════════ PLANNER VIEW ════════════════════════ */
function Planner({cages, matingPairs}) {
  const C = useC();
  const [form,setForm]   = useState({numAB:12,targetDate:"2026-08-01",notes:""});
  const [result,setResult] = useState(null);
  const [loading,setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const aM = cages.filter(c=>c.strain==="A"&&c.sex==="M"&&["active","mating"].includes(c.status));
  const aF = cages.filter(c=>c.strain==="A"&&c.sex==="F"&&["active","mating"].includes(c.status));
  const bM = cages.filter(c=>c.strain==="B"&&c.sex==="M"&&["active","mating"].includes(c.status));
  const bF = cages.filter(c=>c.strain==="B"&&c.sex==="F"&&["active","mating"].includes(c.status));
  const abW = cages.filter(c=>c.strain==="AB"&&c.status==="active")
    .filter(c=>{const w=weeksOld(c.dob);return w>=4&&w<=10;}).reduce((s,c)=>s+c.mouseCount,0);

  const run = () => {
    setLoading(true); setResult(null);
    setTimeout(() => {
      const numAB    = Math.max(1, parseInt(form.numAB) || 12);
      const target   = new Date(form.targetDate);
      const today    = new Date(todayStr);
      const daysLeft = Math.round((target - today) / 86400000);
      const wksLeft  = daysLeft / 7;
      const WK_AB    = 11.5;  // pairing → phenotype window
      const WK_P2    = 15.5;  // parent wean(7.5wk) + fertility(8wk)
      const P2_MAX_AGE = 35 - WK_P2; // 19.5wk — still fertile when Phase 2 starts

      const addW = (base, wks) => { const d=new Date(base); d.setDate(d.getDate()+Math.round(wks*7)); return d.toISOString().split("T")[0]; };
      const fD   = s => new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
      const cid  = c => c.dlarId||c.id;
      const cage = (c,role) => `${cid(c)} (${role}, ${weeksOld(c.dob)}wk${c.hasBreed?" — proven":""})`;

      const gap           = Math.max(0, numAB - abW);
      const littersNeeded = gap > 0 ? Math.ceil(gap / 6) : 0;

      const aF_f = aF.filter(c=>{const w=weeksOld(c.dob);return w>=8&&w<35;});
      const bM_f = bM.filter(c=>{const w=weeksOld(c.dob);return w>=8&&w<35;});
      const aM_f = aM.filter(c=>{const w=weeksOld(c.dob);return w>=8&&w<35;});
      const bF_f = bF.filter(c=>{const w=weeksOld(c.dob);return w>=8&&w<35;});
      const maxDirectPairs = Math.min(aF_f.length + aM_f.length, bM_f.length + bF_f.length);
      const needParentBreed = littersNeeded > 0 && maxDirectPairs < littersNeeded;

      const lines = [];

      // ── Gap Analysis ────────────────────────────────────────────────
      lines.push("### Gap Analysis");
      lines.push(`- Target: ${numAB} AB mice in the 4–10 week window by ${fD(form.targetDate)}`);
      lines.push(`- Currently in window: ${abW} mice`);
      lines.push(`- Gap to fill: ${gap} mice`);
      lines.push(`- Litters needed: ${littersNeeded} (at 6–8 pups/litter)`);
      if(needParentBreed) {
        lines.push(`- Parent strain breeding required — AB cross postponed to Phase 2 (~Week 16)`);
        const p2Open = addW(addW(addW(todayStr, WK_P2), 4.5), 7);
        lines.push(`- Earliest AB mice in window: ~${fD(addW(p2Open, 4))} (${Math.round(WK_P2 + WK_AB)} weeks from today)`);
      } else {
        const feasible = wksLeft >= WK_AB;
        lines.push(`- Time available: ${daysLeft} days (${wksLeft.toFixed(1)} weeks) — minimum needed: ${WK_AB} weeks`);
        if(feasible) lines.push(`- Status: FEASIBLE — ${(wksLeft - WK_AB).toFixed(1)} week buffer`);
        else         lines.push(`- Status: NOT FEASIBLE — ${Math.ceil(WK_AB - wksLeft)} week(s) short; start immediately or adjust target date`);
      }

      if(!needParentBreed) {
        // ── DIRECT PLAN: enough stock for immediate AB cross ────────────
        const useAF = aF_f.slice(0, littersNeeded);
        const useBM = bM_f.slice(0, littersNeeded);
        const useAM = aM_f.slice(0, Math.max(0, littersNeeded - useAF.length));
        const useBF = bF_f.slice(0, Math.max(0, littersNeeded - useAF.length));
        let suggested = 0;

        const birthDate  = addW(todayStr, 4.5);
        const weanDate   = addW(birthDate, 3);
        const windowOpen = addW(weanDate, 4);
        const windowClose= addW(weanDate, 10);
        const feasible   = wksLeft >= WK_AB;

        lines.push("");
        lines.push("### Recommended AB Cross Pairings");
        if(gap <= 0) {
          lines.push(`- No new pairings needed — ${abW} mice already in window meets target`);
        } else {
          useAF.forEach((c,i) => { if(useBM[i]) { lines.push(`- Pair ${cage(c,"Apcfl/fl F")} × ${cage(useBM[i],"Cdx2Cre M")}`); suggested++; } });
          useAM.forEach((c,i) => { if(useBF[i]) { lines.push(`- Pair ${cage(c,"Apcfl/fl M")} × ${cage(useBF[i],"Cdx2Cre F")}`); suggested++; } });
          const provenBM = bM_f.filter(c=>c.hasBreed);
          if(littersNeeded >= 3 && provenBM.length) lines.push(`- Tip: Harem with proven Cdx2Cre male(s) ${provenBM.map(cid).join(", ")} reduces cage count`);
        }

        lines.push("");
        lines.push("### Timeline (week-by-week)");
        lines.push(`- Today (${fD(todayStr)}): Set up ${suggested} AB cross pair(s)`);
        lines.push(`- ~Week 1–2 (${fD(addW(todayStr,1.5))}): Expected conception`);
        lines.push(`- ~Week 4–5 (${fD(birthDate)}): Expected births — record litter sizes`);
        lines.push(`- ~Week 7–8 (${fD(weanDate)}): Wean pups — sex and cage AB offspring`);
        lines.push(`- ~Week 11–12 (${fD(windowOpen)}): AB mice enter 4-week phenotype window`);
        lines.push(`- Window closes ~${fD(windowClose)} (10 weeks of age)`);
        if(!feasible) lines.push(`- NOTE: AB mice will be in window from ${fD(windowOpen)}${Math.ceil((new Date(windowOpen)-target)/86400000)>0?` — ${Math.ceil((new Date(windowOpen)-target)/86400000)} days after target`:" — on schedule"}`);

        const pupCages  = Math.ceil((littersNeeded * 7) / 4);
        const breedCost = suggested * Math.max(daysLeft, 0);
        const pupCost   = pupCages * 70;
        lines.push("");
        lines.push("### Cost Estimate");
        lines.push(`- Breeding cages: ${suggested} × ${Math.max(daysLeft,0)} days = $${breedCost}`);
        lines.push(`- Offspring cages: ~${pupCages} cage(s) × 70 days = $${pupCost}`);
        lines.push(`- Estimated total: ~$${breedCost + pupCost}`);

        lines.push("");
        lines.push("### Risks & Recommendations");
        const agingAF = aF.filter(c=>weeksOld(c.dob)>=32);
        const agingBM = bM.filter(c=>weeksOld(c.dob)>=32);
        if(!feasible)      lines.push(`- CRITICAL: Target date is too soon — start immediately, plan delivery ${fD(windowOpen)}`);
        if(agingAF.length) lines.push(`- ${agingAF.length} Apcfl/fl female(s) aging out soon (32+ wk): ${agingAF.map(cid).join(", ")}`);
        if(agingBM.length) lines.push(`- ${agingBM.length} Cdx2Cre male(s) aging out soon (32+ wk): ${agingBM.map(cid).join(", ")}`);
        lines.push("- Monitor litters at birth; supplement or replace if litter size < 4");
        lines.push("- Update wean dates in the app promptly so weaning alerts fire on time");
        lines.push("- Avoid pairing siblings from the same litter — check the Lineage tab");
        if(form.notes) lines.push(`- Note: ${form.notes}`);

      } else {
        // ── TWO-PHASE PLAN: parent strain first, AB cross in Phase 2 ────
        // Animals still fertile when Phase 2 starts (young enough to hold in reserve)
        const p2_aF = aF_f.filter(c => weeksOld(c.dob) <= P2_MAX_AGE);
        const p2_aM = aM_f.filter(c => weeksOld(c.dob) <= P2_MAX_AGE);
        const p2_bM = bM_f.filter(c => weeksOld(c.dob) <= P2_MAX_AGE);
        const p2_bF = bF_f.filter(c => weeksOld(c.dob) <= P2_MAX_AGE);
        // Animals too old for Phase 2 — use them for Phase 1 parent breeding
        const old_aF = aF_f.filter(c => weeksOld(c.dob) > P2_MAX_AGE);
        const old_aM = aM_f.filter(c => weeksOld(c.dob) > P2_MAX_AGE);
        const old_bM = bM_f.filter(c => weeksOld(c.dob) > P2_MAX_AGE);
        const old_bF = bF_f.filter(c => weeksOld(c.dob) > P2_MAX_AGE);

        // How many new A/B animals must Phase 1 produce for Phase 2 to have enough
        const needNewA = Math.max(0, littersNeeded - (p2_aF.length + p2_aM.length));
        const needNewB = Math.max(0, littersNeeded - (p2_bM.length + p2_bF.length));
        const aaLitters = needNewA > 0 ? Math.ceil(needNewA / 3) : 0;
        const bbLitters = needNewB > 0 ? Math.ceil(needNewB / 3) : 0;

        // Phase 1 pairs: prefer "old" animals (too old for Phase 2), supplement with young if needed
        const aaAF_use = [...old_aF, ...p2_aF].slice(0, aaLitters);
        const aaAM_use = [...old_aM, ...p2_aM].slice(0, aaLitters);
        const bbBM_use = [...old_bM, ...p2_bM].slice(0, bbLitters);
        const bbBF_use = [...old_bF, ...p2_bF].slice(0, bbLitters);

        // Phase 2 pool: young animals NOT consumed by Phase 1
        const p1_AF = new Set(aaAF_use.map(c=>c.id));
        const p1_AM = new Set(aaAM_use.map(c=>c.id));
        const p1_BM = new Set(bbBM_use.map(c=>c.id));
        const p1_BF = new Set(bbBF_use.map(c=>c.id));
        const p2_avail_aF = p2_aF.filter(c=>!p1_AF.has(c.id));
        const p2_avail_aM = p2_aM.filter(c=>!p1_AM.has(c.id));
        const p2_avail_bM = p2_bM.filter(c=>!p1_BM.has(c.id));
        const p2_avail_bF = p2_bF.filter(c=>!p1_BF.has(c.id));

        // Phase 2 date calculations
        const p2Start      = addW(todayStr, WK_P2);
        const p2Birth      = addW(p2Start,  4.5);
        const p2Wean       = addW(p2Birth,  3);
        const p2WindowOpen = addW(p2Wean,   4);
        const p2WindowClose= addW(p2Wean,   10);
        const p2DaysLeft   = Math.round((target - new Date(p2Start)) / 86400000);
        const p2Feasible   = p2DaysLeft / 7 >= WK_AB;

        // ── Phase 1: Parent Strain Breeding Plan ──
        lines.push("");
        lines.push("### Phase 1 — Parent Strain Breeding Plan");
        lines.push(`- Insufficient stock for all ${littersNeeded} AB cross pairs — breed up parent strain(s) first`);
        lines.push(`- All ${littersNeeded} AB cross pairs will start together in Phase 2 (~${fD(p2Start)}) for simultaneous cohort delivery`);

        if(aaLitters > 0) {
          lines.push(`- Apcfl/fl × Apcfl/fl — need ${needNewA} new A breeder(s); set up ${aaLitters} intra-strain pair(s):`);
          const aaP = Math.min(aaAF_use.length, aaAM_use.length);
          for(let i=0;i<aaP;i++) lines.push(`  - ${cage(aaAM_use[i],"Apcfl/fl M")} × ${cage(aaAF_use[i],"Apcfl/fl F")}`);
          if(aaP < aaLitters) lines.push(`  - WARNING: Only ${aaP} Apcfl/fl pair(s) available; need ${aaLitters} — acquire additional Apcfl/fl stock`);
          const provenA = aaAM_use.filter(c=>c.hasBreed);
          if(aaLitters >= 3 && provenA.length) lines.push(`  - Tip: Harem with proven Apcfl/fl male(s) ${provenA.map(cid).join(", ")} reduces cages`);
        } else {
          lines.push(`- Apcfl/fl: ${p2_avail_aF.length + p2_avail_aM.length} animal(s) reserved for Phase 2 (sufficient)`);
        }

        if(bbLitters > 0) {
          lines.push(`- Cdx2Cre × Cdx2Cre — need ${needNewB} new B breeder(s); set up ${bbLitters} intra-strain pair(s):`);
          const bbP = Math.min(bbBM_use.length, bbBF_use.length);
          for(let i=0;i<bbP;i++) lines.push(`  - ${cage(bbBM_use[i],"Cdx2Cre M")} × ${cage(bbBF_use[i],"Cdx2Cre F")}`);
          if(bbP < bbLitters) lines.push(`  - WARNING: Only ${bbP} Cdx2Cre pair(s) available; need ${bbLitters} — acquire additional Cdx2Cre stock`);
          const provenB = bbBM_use.filter(c=>c.hasBreed);
          if(bbLitters >= 3 && provenB.length) lines.push(`  - Tip: Harem with proven Cdx2Cre male(s) ${provenB.map(cid).join(", ")} reduces cages`);
        } else {
          lines.push(`- Cdx2Cre: ${p2_avail_bM.length + p2_avail_bF.length} animal(s) reserved for Phase 2 (sufficient)`);
        }

        // ── Phase 2: AB Cross Plan ──
        lines.push("");
        lines.push(`### Phase 2 — AB Cross Pairings (starting ~${fD(p2Start)})`);
        lines.push(`- Set up all ${littersNeeded} AB cross pair(s) simultaneously once new breeders reach fertility`);
        // Suggest specific Phase 2 pairs from reserved young animals (new breeders fill remainder)
        const p2_useAF = p2_avail_aF.slice(0, littersNeeded);
        const p2_useBM = p2_avail_bM.slice(0, littersNeeded);
        const p2_useAM = p2_avail_aM.slice(0, Math.max(0, littersNeeded - p2_useAF.length));
        const p2_useBF = p2_avail_bF.slice(0, Math.max(0, littersNeeded - p2_useAF.length));
        let p2Suggested = 0;
        p2_useAF.forEach((c,i) => { if(p2_useBM[i]) { lines.push(`- Pair ${cage(c,"Apcfl/fl F")} × ${cage(p2_useBM[i],"Cdx2Cre M")} [reserved from current stock]`); p2Suggested++; } });
        p2_useAM.forEach((c,i) => { if(p2_useBF[i]) { lines.push(`- Pair ${cage(c,"Apcfl/fl M")} × ${cage(p2_useBF[i],"Cdx2Cre F")} [reserved from current stock]`); p2Suggested++; } });
        const newBreedersNeeded = littersNeeded - p2Suggested;
        if(newBreedersNeeded > 0) lines.push(`- ${newBreedersNeeded} additional pair(s) to be formed from new Phase 1 offspring (select at weaning)`);
        const provenP2BM = p2_avail_bM.filter(c=>c.hasBreed);
        if(littersNeeded >= 3 && provenP2BM.length) lines.push(`- Tip: Harem with proven Cdx2Cre male(s) ${provenP2BM.map(cid).join(", ")} reduces Phase 2 cage count`);
        if(!p2Feasible) lines.push(`- NOTE: Phase 2 AB mice will enter window ~${fD(p2WindowOpen)} — ${Math.ceil((new Date(p2WindowOpen)-target)/86400000)} days after original target`);

        // ── Two-Phase Timeline ──
        lines.push("");
        lines.push("### Two-Phase Timeline");
        lines.push(`Phase 1 — Parent strain breeding`);
        lines.push(`- Today (${fD(todayStr)}): Set up ${aaLitters} Apcfl/fl pair(s) + ${bbLitters} Cdx2Cre pair(s)`);
        lines.push(`- ~Week 4–5 (${fD(addW(todayStr,4.5))}): Parent strain pups born`);
        lines.push(`- ~Week 7–8 (${fD(addW(todayStr,7.5))}): Parent pups weaned — sex and identify future AB breeders`);
        lines.push(`- ~Week 15–16 (${fD(p2Start)}): New breeders reach 8-week fertility`);
        lines.push(`Phase 2 — AB cross (all ${littersNeeded} pairs set up simultaneously)`);
        lines.push(`- ~Week 17 (${fD(addW(p2Start,1.5))}): Expected AB conception`);
        lines.push(`- ~Week 20 (${fD(p2Birth)}): Expected AB births — record litter sizes`);
        lines.push(`- ~Week 23 (${fD(p2Wean)}): AB pups weaned`);
        lines.push(`- ~Week 27 (${fD(p2WindowOpen)}): AB mice enter 4–10 week phenotype window`);
        lines.push(`- Window closes ~${fD(p2WindowClose)} — total lead time ~${Math.round(WK_P2 + WK_AB)} weeks from today`);

        // ── Cost Estimate ──
        const p1CageDays = (aaLitters + bbLitters) * Math.round(WK_P2 * 7);
        const p2BreedDays= littersNeeded * Math.round(WK_AB * 7);
        const pupCages   = Math.ceil((littersNeeded * 7) / 4);
        const pupCost    = pupCages * 70;
        lines.push("");
        lines.push("### Cost Estimate");
        lines.push(`- Phase 1 parent cages: ${aaLitters + bbLitters} × ${Math.round(WK_P2*7)} days = $${p1CageDays}`);
        lines.push(`- Phase 2 breeding cages: ${littersNeeded} × ${Math.round(WK_AB*7)} days = $${p2BreedDays}`);
        lines.push(`- Offspring cages: ~${pupCages} cage(s) × 70 days = $${pupCost}`);
        lines.push(`- Estimated total: ~$${p1CageDays + p2BreedDays + pupCost}`);

        // ── Risks ──
        lines.push("");
        lines.push("### Risks & Recommendations");
        const agingAF2 = aF.filter(c=>weeksOld(c.dob)>=32);
        const agingBM2 = bM.filter(c=>weeksOld(c.dob)>=32);
        if(!p2Feasible) lines.push(`- AB cohort will arrive after target date — adjust experiment schedule to ~${fD(p2WindowOpen)}`);
        if(agingAF2.length) lines.push(`- ${agingAF2.length} Apcfl/fl female(s) aging out soon (32+ wk): ${agingAF2.map(cid).join(", ")} — use for Phase 1 A×A`);
        if(agingBM2.length) lines.push(`- ${agingBM2.length} Cdx2Cre male(s) aging out soon (32+ wk): ${agingBM2.map(cid).join(", ")} — use for Phase 1 B×B`);
        lines.push("- Reserve young animals (≤19 wk) for Phase 2 — do not re-pair them before then");
        lines.push("- Monitor Phase 1 litters; track sex ratio to confirm enough breeders of each sex");
        lines.push("- Avoid pairing siblings from the same litter — check the Lineage tab");
        if(form.notes) lines.push(`- Note: ${form.notes}`);
      }

      setResult(lines.join("\n"));
      setLoading(false);
    }, 50);
  };

  const renderMd = txt => txt.split("\n").map((line,i)=>{
    if(line.startsWith("###")) return <div key={i} style={{fontWeight:700,fontSize:14,color:STRAIN_META.AB.color,marginTop:18,marginBottom:6,borderBottom:`1px solid ${C.bdr}`,paddingBottom:4}}>{line.replace("###","").trim()}</div>;
    if(!line.trim()) return <div key={i} style={{height:5}}/>;
    if(line.trim().startsWith("-")) return <div key={i} style={{paddingLeft:14,display:"flex",gap:8,fontSize:13,lineHeight:1.7}}><span style={{color:C.muted}}>•</span><span>{line.trim().slice(1).trim()}</span></div>;
    return <div key={i} style={{fontSize:13,lineHeight:1.7}}>{line}</div>;
  });

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.txt,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <FlaskConical size={15} style={{color:STRAIN_META.AB.color}}/>Experiment Parameters
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div><Label>AB mice needed (n =)</Label>
              <Input type="number" min={1} value={form.numAB} onChange={set("numAB")} style={{width:"100%"}}/></div>
            <div><Label>Target date (in-window by)</Label>
              <Input type="date" value={form.targetDate} onChange={set("targetDate")} style={{width:"100%"}}/></div>
            <div><Label>Notes</Label>
              <TextArea value={form.notes} onChange={set("notes")} rows={3} style={{width:"100%"}} placeholder="Sex ratio, cohort requirements, etc."/></div>
            <button onClick={run} disabled={loading} style={btn({background:loading?C.surf2:STRAIN_META.AB.color+"cc",color:"#fff",justifyContent:"center",padding:"10px 18px"})}>
              {loading ? <><RefreshCw size={14} style={{animation:"spin 1s linear infinite"}}/>Analyzing…</> : <><Zap size={14}/>Generate Plan</>}
            </button>
          </div>
        </Card>
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.txt,marginBottom:12}}>Colony Snapshot</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
            {[[`${STRAIN_META.A.label} males`,aM.length,STRAIN_META.A.color],[`${STRAIN_META.A.label} females`,aF.length,STRAIN_META.A.color],
              [`${STRAIN_META.B.label} males`,bM.length,STRAIN_META.B.color],[`${STRAIN_META.B.label} females`,bF.length,STRAIN_META.B.color],
              ["AB crosses active",matingPairs.filter(p=>p.strain==="AB"&&p.status!=="retired").length,STRAIN_META.AB.color],
              ["AB in window now",`${abW} mice`,STRAIN_META.AB.color]].map(([l,v,col])=>(
              <div key={l} style={{padding:"8px 12px",background:C.surf2,borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                <span style={{color:C.muted}}>{l}</span><span style={{color:col,fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {result && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <CheckCircle2 size={14} style={{color:C.success}}/>Breeding Plan
          </div>
          <div>{renderMd(result)}</div>
        </Card>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ═══════════════════════════ COSTS VIEW ═══════════════════════════ */
function Costs({cages}) {
  const C = useC();
  const months = useMemo(()=>{
    const now=new Date();
    const result=[];
    for(let m=0;m<6;m++){
      const d=new Date(now.getFullYear(),now.getMonth()-m,1);
      const yr=d.getFullYear(), mo=d.getMonth();
      const first=new Date(yr,mo,1), last=new Date(yr,mo+1,0);
      let total=0; const bk={A:0,B:0,AB:0};
      cages.forEach(c=>{
        const s=new Date(c.activationDate||c.createdAt||c.dob);
        const e=c.deactivationDate?new Date(c.deactivationDate):now;
        const lo=Math.max(s,first), hi=Math.min(e,last);
        if(lo<=hi){const days=Math.round((hi-lo)/864e5)+1;total+=days;bk[c.strain]=(bk[c.strain]||0)+days;}
      });
      result.push({label:d.toLocaleDateString("en-US",{month:"short",year:"numeric"}),total,bk});
    }
    return result.reverse();
  },[cages]);
  const mx = Math.max(...months.map(m=>m.total));

  const tips = useMemo(()=>{
    const t=[];
    const past=cages.filter(c=>c.strain==="AB"&&c.status==="active"&&weeksOld(c.dob)>10);
    if(past.length) t.push({warn:true,msg:`${past.length} Apcfl/fl/Cdx2Cre cage(s) are past the 10-week window. Retiring saves ~$${past.length*7}/week.`,save:past.length*7});
    const old=cages.filter(c=>weeksOld(c.dob)>=35&&!["euthanized","retired"].includes(c.status));
    if(old.length) t.push({warn:true,msg:`${old.length} cage(s) ≥35 weeks old — consider scheduling euthanasia.`,save:old.length*30});
    if(!t.length) t.push({warn:false,msg:"Colony looks cost-efficient — no immediate savings identified.",save:0});
    return t;
  },[cages]);

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
        <Card>
          <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:14}}>Monthly Cage-Day Costs</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <Th>Month</Th><Th><i>Apc</i><sup>fl/fl</sup></Th><Th><i>Cdx2</i><sup>Cre</sup></Th><Th><i>Apc</i><sup>fl/fl</sup>/<i>Cdx2</i><sup>Cre</sup></Th><Th>Total (cage-days)</Th><Th>Cost</Th>
            </tr></thead>
            <tbody>
              {months.map(m=>(
                <tr key={m.label}>
                  <Td style={{fontWeight:600}}>{m.label}</Td>
                  <Td><span style={{color:STRAIN_META.A.color}}>{m.bk.A||0}</span></Td>
                  <Td><span style={{color:STRAIN_META.B.color}}>{m.bk.B||0}</span></Td>
                  <Td><span style={{color:STRAIN_META.AB.color}}>{m.bk.AB||0}</span></Td>
                  <Td>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{height:8,borderRadius:4,background:C.success,width:`${Math.round((m.total/mx)*110)}px`,minWidth:4}}/>
                      <span style={{fontFamily:"monospace",fontWeight:700}}>{m.total}</span>
                    </div>
                  </Td>
                  <Td><span style={{fontFamily:"monospace",fontWeight:700,color:C.success}}>${m.total}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <Zap size={14} style={{color:C.warn}}/>Optimization Suggestions
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {tips.map((t,i)=>(
              <div key={i} style={{padding:"10px 14px",
                background:t.warn?"rgba(210,153,34,.1)":"rgba(63,185,80,.08)",
                border:`1px solid ${t.warn?"rgba(210,153,34,.3)":"rgba(63,185,80,.2)"}`,borderRadius:8}}>
                <div style={{fontSize:12,color:C.txt,lineHeight:1.6}}>{t.msg}</div>
                {t.save>0 && <div style={{fontSize:11,color:C.success,marginTop:6,fontWeight:700}}>~${t.save}/month savings</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════ SETTINGS VIEW ════════════════════════ */
function SettingsPanel({settings, setSettings, litters,
  cages, setCages, matingPairs, setMatingPairs, experiments, setExperiments,
  auditLog, setAuditLog, archivedLogs, setArchivedLogs, setLitters}) {
  const C = useC();
  const [sub,setSub]         = useState("general");
  const [pwInput,setPwInput] = useState("");
  const [unlocked,setUnlocked] = useState(false);
  const [confirmReset,setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  const set = k => e => setSettings(s=>({...s,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));
  const upcoming = litters.filter(l=>l.weanDate&&daysUntil(l.weanDate)>=0&&daysUntil(l.weanDate)<=settings.weanAlertDays);

  const handleBackup = () => doBackupExport(cages, litters, matingPairs, experiments, auditLog, archivedLogs, settings);
  const handleImport = e => {
    const file = e.target.files[0];
    if(!file) return;
    doImport(file, {setCages,setLitters,setMatingPairs,setExperiments,setSettings,setAuditLog,setArchivedLogs});
    e.target.value="";
  };
  const handleHardReset = () => {
    handleBackup();
    setTimeout(()=>{
      setCages([]); setLitters([]); setMatingPairs([]); setExperiments([]);
      setAuditLog([]); setArchivedLogs([]);
      setSettings(INIT_SETTINGS);
      setConfirmReset(false);
    }, 400);
  };

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:20,maxWidth:640}}>
      <SubTabs tabs={[["general","General"],["advanced","Advanced Settings"]]} active={sub} onChange={v=>{setSub(v);setPwInput("");setUnlocked(false);setConfirmReset(false);}}/>

      {sub==="general"&&<>
        <Card>
          <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <Bell size={14}/>Email Notifications
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div><Label>Notification Email Address</Label>
              <Input type="email" value={settings.email} onChange={set("email")} style={{width:"100%"}} placeholder="lab@university.edu"/></div>
            <div style={{fontSize:12,color:C.muted,background:C.surf2,padding:"10px 14px",borderRadius:8}}>
              ℹ️ Email delivery requires a backend SMTP integration. Alert triggers are computed here and ready to consume.
            </div>
            {[["notifyWeaning","Weaning alerts"],["notifyAgeOut","Age-out warnings"],
              ["notifyLowColony","Low colony alerts"],["notifyCost","Monthly cost digest"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                <input type="checkbox" checked={settings[k]} onChange={set(k)} style={{width:16,height:16,accentColor:C.accent}}/>
                <span style={{fontSize:13,color:C.txt}}>{l}</span>
              </label>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:14}}>Alert Thresholds</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><Label>Weaning alert (days before)</Label><Input type="number" value={settings.weanAlertDays} onChange={set("weanAlertDays")} style={{width:"100%"}}/></div>
            <div><Label>Age-out threshold (weeks)</Label><Input type="number" value={settings.ageOutWeeks} onChange={set("ageOutWeeks")} style={{width:"100%"}}/></div>
            <div><Label>Min male cages per strain</Label><Input type="number" value={settings.minMales} onChange={set("minMales")} style={{width:"100%"}}/></div>
            <div><Label>Min female cages per strain</Label><Input type="number" value={settings.minFemales} onChange={set("minFemales")} style={{width:"100%"}}/></div>
          </div>
        </Card>
        {upcoming.length>0 && (
          <Card>
            <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
              <Baby size={13} style={{color:C.warn}}/>Upcoming Weanings — Notifications Queued
            </div>
            {upcoming.map(l=>(
              <div key={l.id} style={{padding:"8px 12px",background:C.surf2,borderRadius:8,marginBottom:6,display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span><span style={{fontFamily:"monospace",color:C.muted}}>{l.id}</span> — <StrainBadge strain={l.strain}/></span>
                <span style={{color:C.warn,fontWeight:600}}>{fmt(l.weanDate)} ({daysUntil(l.weanDate)}d)</span>
              </div>
            ))}
          </Card>
        )}
      </>}

      {sub==="advanced"&&!unlocked&&(
        <Card>
          <div style={{fontWeight:700,fontSize:15,color:C.txt,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
            🔒 Advanced Settings
          </div>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            This area contains destructive operations. Enter the lab password to continue.
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <Input type="password" value={pwInput} onChange={e=>setPwInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"){ if(pwInput==="SDT") setUnlocked(true); else{ setPwInput(""); alert("Incorrect password."); } } }}
              placeholder="Password" style={{width:200}}/>
            <button onClick={()=>{ if(pwInput==="SDT") setUnlocked(true); else{ setPwInput(""); alert("Incorrect password."); } }}
              style={btn({background:C.accent,color:"#fff"})}>Unlock</button>
          </div>
        </Card>
      )}

      {sub==="advanced"&&unlocked&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
              📦 Export Full Backup
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14,lineHeight:1.6}}>
              Downloads a complete Excel workbook with all colony, litter, breeding, experiment, audit, and settings data. Each data type is a separate sheet. This file can be used to restore the app via Import.
            </div>
            <button onClick={handleBackup} style={btn({background:C.success+"22",color:C.success,border:`1px solid ${C.success}44`})}>
              ⬇ Download Backup
            </button>
          </Card>

          <Card>
            <div style={{fontWeight:700,fontSize:13,color:C.txt,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
              📂 Import Database
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14,lineHeight:1.6}}>
              Restore all data from a ColonyOS v2 backup Excel file. <strong style={{color:C.warn}}>This will overwrite all current data.</strong> A backup is recommended before importing.
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{display:"none"}} onChange={handleImport}/>
            <button onClick={()=>fileRef.current?.click()} style={btn({background:C.accent+"22",color:C.accent,border:`1px solid ${C.accent}44`})}>
              ⬆ Choose .xlsx File to Import
            </button>
          </Card>

          <Card style={{border:`1px solid ${C.danger}44`}}>
            <div style={{fontWeight:700,fontSize:13,color:C.danger,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
              ⚠ Hard Reset
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14,lineHeight:1.6}}>
              Permanently deletes <strong style={{color:C.txt}}>all cages, litters, mating pairs, experiments, and audit logs</strong>. The cage ID counter resets to C001. A full backup will be automatically downloaded before the reset executes.
            </div>
            {!confirmReset
              ? <button onClick={()=>setConfirmReset(true)} style={btn({background:C.danger+"22",color:C.danger,border:`1px solid ${C.danger}44`})}>
                  Hard Reset Colony
                </button>
              : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.danger,background:C.danger+"18",border:`1px solid ${C.danger}44`,borderRadius:8,padding:"10px 14px"}}>
                    Are you absolutely sure? This cannot be undone. A backup will download automatically.
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setConfirmReset(false)} style={btn({background:C.surf2,color:C.muted})}>Cancel</button>
                    <button onClick={handleHardReset} style={btn({background:C.danger,color:"#fff",fontWeight:700})}>
                      Yes, Reset Everything
                    </button>
                  </div>
                </div>
            }
          </Card>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ EXPORT / IMPORT ══════════════════════ */
const STRAIN_DISPLAY = {A:"Apcfl/fl", B:"Cdx2Cre", AB:"Apcfl/fl-Cdx2Cre"};
const STRAIN_CODE    = {"Apcfl/fl":"A","Cdx2Cre":"B","Apcfl/fl-Cdx2Cre":"AB",A:"A",B:"B",AB:"AB"};
const strainDisp = s => STRAIN_DISPLAY[s] || s;
const strainCode = s => STRAIN_CODE[s] || s;

function doBackupExport(cages, litters, matingPairs, experiments, auditLog, archivedLogs, settings) {
  const wb = XLSX.utils.book_new();
  const now = new Date();
  const stamp = `${now.getFullYear()}-${_p2(now.getMonth()+1)}-${_p2(now.getDate())}`;

  /* _Metadata */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    {Key:"ExportDate",    Value:stamp},
    {Key:"AppVersion",    Value:"ColonyOS v2"},
    {Key:"SchemaVersion", Value:"2"},
    {Key:"TotalCages",    Value:cages.length},
    {Key:"TotalLitters",  Value:litters.length},
    {Key:"TotalPairs",    Value:matingPairs.length},
    {Key:"TotalExperiments",Value:experiments.length},
    {Key:"TotalAuditEntries",Value:auditLog.length},
    {Key:"TotalArchivedLogs",Value:archivedLogs.length},
  ]), "_Metadata");

  /* Colony — all fields, all cages including deleted */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cages.map(c=>({
    id:c.id, strain:strainDisp(c.strain), sex:c.sex,
    mouseCount:c.mouseCount, dob:c.dob||"", status:c.status,
    hasBreed:c.hasBreed?1:0, dlarId:c.dlarId||"",
    litterHistory_json:JSON.stringify(c.litterHistory||[]),
    parentLitterId:c.parentLitterId||"", notes:c.notes||"",
    createdAt:c.createdAt||"", activationDate:c.activationDate||"",
    deactivationDate:c.deactivationDate||"", experimentId:c.experimentId||"",
    isDeleted:c.isDeleted?1:0, deletedNote:c.deletedNote||"", deletedAt:c.deletedAt||"",
  }))), "Colony");

  /* Litters */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(litters.map(l=>({
    id:l.id, strain:strainDisp(l.strain), motherCageId:l.motherCageId||"", fatherCageId:l.fatherCageId||"",
    matingPairId:l.matingPairId||"", birthDate:l.birthDate||"", weanDate:l.weanDate||"",
    expectedBirthDate:l.expectedBirthDate||"", numPups:l.numPups!=null?l.numPups:"",
    numMales:l.numMales!=null?l.numMales:"", numFemales:l.numFemales!=null?l.numFemales:"",
    status:l.status, offspringCageIds:(l.offspringCageIds||[]).join(","),
    notes:l.notes||"",
  }))), "Litters");

  /* MatingPairs */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matingPairs.map(p=>({
    id:p.id, type:p.type, strain:strainDisp(p.strain), maleCageId:p.maleCageId||"",
    femaleCageIds:(p.femaleCageIds||[]).join(","), setupDate:p.setupDate||"",
    status:p.status, lastStatusUpdate:p.lastStatusUpdate||"",
    litterIds:(p.litterIds||[]).join(","),
  }))), "MatingPairs");

  /* Experiments */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(experiments.map(e=>({
    id:e.id, name:e.name, description:e.description||"", strain:strainDisp(e.strain),
    targetN:e.targetN, enrolledCageIds:(e.enrolledCageIds||[]).join(","),
    startDate:e.startDate||"", endDate:e.endDate||"",
    status:e.status, notes:e.notes||"",
  }))), "Experiments");

  /* Settings */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    Object.entries(settings).map(([key,value])=>({key,value:String(value)}))
  ), "Settings");

  /* AuditLog_Current */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    auditLog.length ? auditLog.map(e=>({
      id:e.id||"", timestamp:e.timestamp, type:e.type,
      description:e.description, cageIds:(e.cageIds||[]).join(","),
    })) : [{id:"",timestamp:"",type:"",description:"(empty)",cageIds:""}]
  ), "AuditLog_Current");

  /* AuditLog_Archives */
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    archivedLogs.length ? archivedLogs.map(a=>({
      id:a.id, label:a.label, archivedAt:a.archivedAt,
      entryCount:a.entries.length, entries_json:JSON.stringify(a.entries),
    })) : [{id:"",label:"",archivedAt:"",entryCount:0,entries_json:"[]"}]
  ), "AuditLog_Archives");

  XLSX.writeFile(wb, `ColonyOS_Backup_${stamp}.xlsx`);
}

function doImport(file, setters) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:"array"});
      const ws = n => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n]) : [];
      const splitArr = v => v ? String(v).split(",").map(s=>s.trim()).filter(Boolean) : [];
      const nullEmpty = v => (v==null||v==="")?null:v;
      const numOrNull = v => (v==null||v==="")?null:Number(v);
      const boolNum   = v => v===1||v==="1"||v===true;

      const meta = ws("_Metadata");
      const schemaVer = meta.find(r=>r.Key==="SchemaVersion")?.Value;
      if(schemaVer!=="2"&&schemaVer!==2){
        alert("Unrecognised backup schema version. Only ColonyOS v2 backups can be imported.");
        return;
      }

      const cages = ws("Colony").map(r=>({
        id:String(r.id), strain:strainCode(String(r.strain)), sex:String(r.sex),
        mouseCount:Number(r.mouseCount)||0, dob:nullEmpty(r.dob), status:String(r.status),
        hasBreed:boolNum(r.hasBreed), dlarId:nullEmpty(r.dlarId),
        litterHistory: (()=>{try{return JSON.parse(r.litterHistory_json||"[]");}catch{return [];}})(),
        parentLitterId:nullEmpty(r.parentLitterId), notes:r.notes||"",
        createdAt:r.createdAt||"", activationDate:r.activationDate||"",
        deactivationDate:nullEmpty(r.deactivationDate), experimentId:nullEmpty(r.experimentId),
        isDeleted:boolNum(r.isDeleted), deletedNote:r.deletedNote||"",
        deletedAt:nullEmpty(r.deletedAt),
      }));

      const litters = ws("Litters").map(r=>({
        id:String(r.id), strain:strainCode(String(r.strain)),
        motherCageId:nullEmpty(r.motherCageId), fatherCageId:nullEmpty(r.fatherCageId),
        matingPairId:nullEmpty(r.matingPairId), birthDate:nullEmpty(r.birthDate),
        weanDate:nullEmpty(r.weanDate), expectedBirthDate:nullEmpty(r.expectedBirthDate),
        numPups:numOrNull(r.numPups), numMales:numOrNull(r.numMales), numFemales:numOrNull(r.numFemales),
        status:String(r.status), offspringCageIds:splitArr(r.offspringCageIds), notes:r.notes||"",
      }));

      const matingPairs = ws("MatingPairs").map(r=>({
        id:String(r.id), type:String(r.type), strain:strainCode(String(r.strain)),
        maleCageId:nullEmpty(r.maleCageId), femaleCageIds:splitArr(r.femaleCageIds),
        setupDate:nullEmpty(r.setupDate), status:String(r.status),
        lastStatusUpdate:nullEmpty(r.lastStatusUpdate), litterIds:splitArr(r.litterIds),
      }));

      const experiments = ws("Experiments").map(r=>({
        id:String(r.id), name:r.name||"", description:r.description||"", strain:strainCode(String(r.strain)),
        targetN:Number(r.targetN)||0, enrolledCageIds:splitArr(r.enrolledCageIds),
        startDate:nullEmpty(r.startDate), endDate:nullEmpty(r.endDate),
        status:String(r.status), notes:r.notes||"",
      }));

      const settingsRows = ws("Settings");
      const settings = {};
      settingsRows.forEach(r=>{
        const k=r.key, v=r.value;
        if(["weanAlertDays","ageOutWeeks","minMales","minFemales"].includes(k)) settings[k]=Number(v);
        else if(["notifyWeaning","notifyAgeOut","notifyLowColony","notifyCost"].includes(k)) settings[k]=v==="true"||v===true;
        else settings[k]=v;
      });

      const auditLog = ws("AuditLog_Current").filter(r=>r.type).map(r=>({
        id:r.id||uid("LOG"), timestamp:r.timestamp, type:r.type,
        description:r.description, cageIds:splitArr(r.cageIds),
      }));

      const archivedLogs = ws("AuditLog_Archives").filter(r=>r.id).map(r=>({
        id:String(r.id), label:r.label||"",archivedAt:r.archivedAt||"",
        entries:(()=>{try{return JSON.parse(r.entries_json||"[]");}catch{return [];}})(),
      }));

      setters.setCages(cages);
      setters.setLitters(litters);
      setters.setMatingPairs(matingPairs);
      setters.setExperiments(experiments);
      setters.setSettings(s=>({...s,...settings}));
      setters.setAuditLog(auditLog);
      setters.setArchivedLogs(archivedLogs);
      alert(`Import successful!\n${cages.length} cages · ${litters.length} litters · ${matingPairs.length} pairs · ${experiments.length} experiments`);
    } catch(err) {
      alert("Import failed: "+err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ═══════════════════════════ MAIN APP ═════════════════════════════ */
const MouseIcon = ({size=18,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
    stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="50" cy="50" r="44"/>
    <circle cx="65" cy="22" r="6"/>
    <circle cx="59" cy="33" r="11"/>
    <path d="M 52 43 C 74 50 76 70 60 80 C 46 88 28 82 22 64 C 14 78 24 88 38 82"/>
    <circle cx="63" cy="30" r="2.5" fill={color} stroke="none"/>
  </svg>
);

export default function App() {
  const [tab,setTab]                   = useState("dashboard");
  const [darkMode,setDarkMode]         = useState(true);
  const [cages,setCages]               = useState(INIT_CAGES);
  const [litters,setLitters]           = useState(INIT_LITTERS);
  const [matingPairs,setMatingPairs]   = useState(INIT_PAIRS);
  const [experiments,setExperiments]   = useState(INIT_EXPERIMENTS);
  const [auditLog,setAuditLog]         = useState([]);
  const [archivedLogs,setArchivedLogs] = useState([]);
  const [settings,setSettings]         = useState(INIT_SETTINGS);
  const [loaded,setLoaded]             = useState(false);
  const [storageOk,setStorageOk]       = useState(false);
  const C = darkMode ? DARK_C : LIGHT_C;
  const _now = new Date();
  const liveToday = `${_now.getFullYear()}-${_p2(_now.getMonth()+1)}-${_p2(_now.getDate())}`;

  /* ── Load from storage on mount ── */
  useEffect(()=>{
    try {
      const saved = loadState();
      if(saved){
        if(saved.cages)       setCages(saved.cages);
        if(saved.litters)     setLitters(saved.litters);
        if(saved.pairs)       setMatingPairs(saved.pairs);
        if(saved.experiments) setExperiments(saved.experiments);
        if(saved.auditLog)      setAuditLog(saved.auditLog);
        if(saved.archivedLogs)  setArchivedLogs(saved.archivedLogs);
        if(saved.settings)      setSettings(saved.settings);
        setStorageOk(true);
      }
    } catch {}
    setLoaded(true);
  },[]);

  /* ── Persist on every state change after initial load ── */
  useEffect(()=>{
    if(!loaded) return;
    try {
      saveState({cages,litters,pairs:matingPairs,experiments,auditLog,archivedLogs,settings});
      setStorageOk(true);
    } catch {}
  },[loaded,cages,litters,matingPairs,experiments,auditLog,archivedLogs,settings]);

  /* ── Audit log helper ── */
  const addLog = useCallback((type, description, cageIds=[])=>{
    setAuditLog(log=>[
      {id:uid("LOG"),timestamp:new Date().toISOString(),type,description,cageIds},
      ...log,
    ].slice(0,500));
  },[]);

  const totalMice   = cages.filter(c=>!["euthanized","retired"].includes(c.status)).reduce((s,c)=>s+c.mouseCount,0);
  const activeCages = cages.filter(c=>!["euthanized","retired"].includes(c.status)).length;

  const TABS = [
    {id:"dashboard",  label:"Dashboard",   icon:<Activity size={14}/>},
    {id:"colony",     label:"Colony",      icon:<Users size={14}/>},
    {id:"breeding",   label:"Breeding",    icon:<Heart size={14}/>},
    {id:"lineage",    label:"Lineage",     icon:<GitBranch size={14}/>},
    {id:"experiments",label:"Experiments", icon:<FlaskConical size={14}/>},
    {id:"planner",    label:"Planner",     icon:<Zap size={14}/>},
    {id:"costs",      label:"Costs",       icon:<BarChart2 size={14}/>},
    {id:"settings",   label:"Settings",    icon:<Settings size={14}/>},
  ];

  return (
    <ThemeCtx.Provider value={C}>
    <div style={{minHeight:"100vh",background:C.bg,color:C.txt,fontFamily:"'Outfit','Segoe UI',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;} body{margin:0;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.bdr2};border-radius:3px;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:${darkMode?"invert(.5)":"none"};}
        select option{background:${C.surf2};} textarea{box-sizing:border-box;}
      `}</style>

      {/* Header */}
      <div style={{background:C.surf,borderBottom:`1px solid ${C.bdr}`,padding:"0 22px",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:54}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <MouseIcon size={20} color={C.txt}/>
            <span style={{fontWeight:800,fontSize:14,color:C.txt,letterSpacing:-.5}}>ColonyOS</span>
            <span style={{fontSize:10,color:C.muted,background:C.surf2,padding:"2px 7px",borderRadius:20,border:`1px solid ${C.bdr2}`}}>v2.0 local</span>
            {loaded && (
              <span style={{fontSize:10,color:storageOk?C.success:C.muted,marginLeft:2}}>
                {storageOk?"● Saved":"● Local only"}
              </span>
            )}
          </div>
          <nav style={{display:"flex",gap:1,alignItems:"center"}}>
            <button onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Switch to light mode":"Switch to dark mode"}
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,
                background:"transparent",border:`1px solid ${C.bdr2}`,borderRadius:7,
                color:C.muted,cursor:"pointer",transition:"all .15s",marginRight:6}}>
              {darkMode ? <Sun size={14}/> : <Moon size={14}/>}
            </button>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                display:"flex",alignItems:"center",gap:5,padding:"5px 12px",
                background:tab===t.id?C.surf2:"transparent",
                color:tab===t.id?C.txt:C.muted,
                border:`1px solid ${tab===t.id?C.bdr2:"transparent"}`,
                borderRadius:7,cursor:"pointer",fontSize:12.5,
                fontWeight:tab===t.id?600:400,fontFamily:"inherit",transition:"all .15s"}}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{totalMice}m · {activeCages}c · ${activeCages}/d</span>
            <button onClick={()=>doBackupExport(cages,litters,matingPairs,experiments,auditLog,archivedLogs,settings)}
              style={btn({background:C.success+"22",color:C.success,border:`1px solid ${C.success}44`,padding:"5px 12px",fontSize:12})}>
              <Download size={13}/>Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{background:C.surf2,borderBottom:`1px solid ${C.bdr}`,padding:"5px 22px",fontSize:11,color:C.muted,display:"flex",gap:16,flexWrap:"wrap"}}>
        <span>📅 <strong style={{color:C.txt}}>{_now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</strong></span>
        {["A","B","AB"].map(s=>(
          <span key={s}>
            <strong style={{color:STRAIN_META[s].color,fontStyle:"italic"}}><StrainName strain={s}/></strong>:&nbsp;
            {cages.filter(c=>c.strain===s&&!["euthanized","retired"].includes(c.status)).reduce((a,c)=>a+c.mouseCount,0)} mice
          </span>
        ))}
        <span>Active crosses: <strong style={{color:C.pink}}>{matingPairs.filter(p=>p.status!=="retired").length}</strong></span>
        <span>Audit log: <strong style={{color:C.muted}}>{auditLog.length} entries</strong></span>
      </div>

      {/* Main content */}
      <div style={{maxWidth:1240,margin:"0 auto"}}>
        {tab==="dashboard"   && <Dashboard   cages={cages} litters={litters} matingPairs={matingPairs} settings={settings}/>}
        {tab==="colony"      && <Colony      cages={cages} setCages={setCages} litters={litters} setLitters={setLitters} matingPairs={matingPairs} setMatingPairs={setMatingPairs} auditLog={auditLog} setAuditLog={setAuditLog} archivedLogs={archivedLogs} setArchivedLogs={setArchivedLogs} addLog={addLog}/>}
        {tab==="breeding"    && <Breeding    cages={cages} litters={litters} matingPairs={matingPairs} setLitters={setLitters} setMatingPairs={setMatingPairs} setCages={setCages} addLog={addLog}/>}
        {tab==="lineage"     && <LineageView cages={cages} litters={litters}/>}
        {tab==="experiments" && <ExperimentsView experiments={experiments} cages={cages} setExperiments={setExperiments} setCages={setCages} addLog={addLog}/>}
        {tab==="planner"     && <Planner     cages={cages} matingPairs={matingPairs}/>}
        {tab==="costs"       && <Costs       cages={cages}/>}
        {tab==="settings"    && <SettingsPanel
            settings={settings} setSettings={setSettings} litters={litters} setLitters={setLitters}
            cages={cages} setCages={setCages} matingPairs={matingPairs} setMatingPairs={setMatingPairs}
            experiments={experiments} setExperiments={setExperiments}
            auditLog={auditLog} setAuditLog={setAuditLog}
            archivedLogs={archivedLogs} setArchivedLogs={setArchivedLogs}/>}
      </div>
    </div>
    </ThemeCtx.Provider>
  );
}

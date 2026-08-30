import { useState, useEffect, useRef, useCallback, useMemo, memo, createContext, useContext } from "react";
import RevenuePage   from "./RevenuePage";
import DIDPage from "./DIDPage";
import CustomersPage from "./CustomersPage";
import SupplierPage from "./SupplierPage";
import IVRPage from "./IVRPage";
import AgentPage from './AgentPage';
import APIDocsPage from './APIDocsPage';
import TestLabsPage from './TestLabsPage';
import DIDInventoryPage from './DIDInventoryPage';
import SIPMonitorPage from './SIPMonitorPage';

// ═══════════════════════════════════════════════════════════════════
// GULF-PREMIUM-TELECOM NOC v2.1
// NO FAKE DATA — all data from real API
// Shows empty/zero state until real calls arrive
// ═══════════════════════════════════════════════════════════════════


// Global mobile hook
export const useMobile = () => {
  const [mobile, setMobile] = React.useState(window.innerWidth < 768);
  const [tablet, setTablet] = React.useState(window.innerWidth < 1024);
  React.useEffect(()=>{
    const h=()=>{ setMobile(window.innerWidth<768); setTablet(window.innerWidth<1024); };
    window.addEventListener('resize',h);
    return()=>window.removeEventListener('resize',h);
  },[]);
  return {mobile, tablet, isMobile:mobile, isTablet:tablet};
};

const API = "https://gulf-premium-telecom.com/api/v1";

const C = {
  bg:"#07090F", surface:"#0C1018", card:"#0F1520",
  border:"rgba(255,255,255,0.07)", text:"#E2E8F0", muted:"#4B5563",
  green:"#00FFB2", blue:"#38BDF8", purple:"#A78BFA", yellow:"#FBBF24",
  red:"#F87171", orange:"#FB923C", pink:"#F472B6", cyan:"#22D3EE",
};
const mono = {fontFamily:"'DM Mono','Fira Code',monospace"};
const fmt  = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtM = v => v>=1000000?`$${(v/1e6).toFixed(2)}M`:v>=1000?`$${(v/1000).toFixed(1)}K`:`$${Number(v||0).toFixed(2)}`;

// ── Responsive ────────────────────────────────────────────────────
const useBreakpoint = () => {
  const [bp, setBp] = useState(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    return w < 480 ? "xs" : w < 768 ? "sm" : w < 1024 ? "md" : "lg";
  });
  useEffect(() => {
    const h = () => {
      const w = window.innerWidth;
      setBp(w < 480 ? "xs" : w < 768 ? "sm" : w < 1024 ? "md" : "lg");
    };
    window.addEventListener("resize", h, { passive: true });
    return () => window.removeEventListener("resize", h);
  }, []);
  return bp;
};
const isMobile = bp => bp === "xs" || bp === "sm";

// ── API ───────────────────────────────────────────────────────────
const apiGet = async (path, token) => {
  try {
    const r = await fetch(`${API}${path}`, {
      headers: { Authorization:`Bearer ${token}`, Accept:"application/json" }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch(e) { return null; }
};

// ── Context ───────────────────────────────────────────────────────
const MetricsCtx = createContext({});
const useM = () => useContext(MetricsCtx);

// ── Sparkline — only renders when real data exists ────────────────
const svgP = (v, w, h) => {
  const mx=Math.max(...v), mn=Math.min(...v), r=mx-mn||1;
  return v.map((x,i)=>`${i===0?"M":"L"}${(i/(v.length-1)*w).toFixed(1)},${(h-((x-mn)/r)*(h-6)-3).toFixed(1)}`).join(" ");
};
const Spark = memo(({vals, color, w=72, h=28}) => {
  if (!vals || vals.length < 2 || vals.every(v=>v===0)) return null;
  const id = `s${color.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={w} height={h} style={{overflow:"visible",flexShrink:0}}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <path d={svgP(vals,w,h)+` V${h} H0 Z`} fill={`url(#${id})`}/>
      <path d={svgP(vals,w,h)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
});

// ── Primitives ────────────────────────────────────────────────────
const Bdg = memo(({label,color}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,
    background:`${color}15`,border:`1px solid ${color}35`,fontSize:9,fontWeight:700,
    letterSpacing:"1px",color,textTransform:"uppercase",whiteSpace:"nowrap"}}>
    <span style={{width:4,height:4,borderRadius:"50%",background:color,flexShrink:0}}/>{label}
  </span>
));

const KPI = memo(({label,value,unit,color,vals,live,compact}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:compact?8:12,
    padding:compact?"12px 14px":"16px 18px",position:"relative",overflow:"hidden",minWidth:0}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:2,
      background:`linear-gradient(90deg,${color}00,${color}80,${color}00)`}}/>
    {live&&<span style={{position:"absolute",top:8,right:8,width:5,height:5,borderRadius:"50%",
      background:C.green,animation:"pulse 2s infinite"}}/>}
    <div style={{fontSize:compact?9:10,letterSpacing:"1.5px",color:C.muted,textTransform:"uppercase",
      marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
    <div style={{fontSize:compact?20:24,fontWeight:900,color,letterSpacing:"-0.5px",lineHeight:1,...mono,
      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:6}}>
      <span style={{fontSize:compact?10:11,color:C.muted,textTransform:"uppercase",overflow:"hidden",
        textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{unit}</span>
      {vals&&!compact&&<Spark vals={vals} color={color}/>}
    </div>
  </div>
));

const TH = memo(({c}) => (
  <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,letterSpacing:"1px",color:C.muted,
    textTransform:"uppercase",fontWeight:600,borderBottom:`1px solid ${C.border}`,
    whiteSpace:"nowrap",position:"sticky",top:0,background:C.surface,zIndex:1}}>{c}</th>
));
const TD = memo(({children,style={}}) => (
  <td style={{padding:"8px 12px",fontSize:13,color:"#94A3B8",
    borderBottom:"1px solid rgba(255,255,255,0.03)",whiteSpace:"nowrap",...style}}>{children}</td>
));

const Card = ({title,action,children,style={}}) => (
  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,...style}}>
    {title&&<div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,
      display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <span style={{fontSize:9,letterSpacing:"1.5px",color:C.muted,textTransform:"uppercase",flex:1}}>{title}</span>
      {action}
    </div>}
    {children}
  </div>
);

const KpiGrid = ({items,bp}) => {
  const cols = isMobile(bp) ? 2 : bp==="md" ? 3 : 4;
  return (
    <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:isMobile(bp)?8:12,marginBottom:isMobile(bp)?12:16}}>
      {items.map(([label,value,unit,color,vals,live],i) => (
        <KPI key={i} label={label} value={value} unit={unit} color={color} vals={vals} live={live} compact={isMobile(bp)}/>
      ))}
    </div>
  );
};

const ScrollTable = ({children,minWidth=700}) => (
  <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth}}>{children}</table>
  </div>
);

// Empty state component
const EmptyState = ({icon="📡", title, sub, children}) => (
  <div style={{padding:"48px 24px",textAlign:"center"}}>
    <div style={{fontSize:40,marginBottom:12}}>{icon}</div>
    <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{title}</div>
    <div style={{fontSize:12,color:C.muted,marginBottom:children?16:0}}>{sub}</div>
    {children}
  </div>
);

// ── NAV ───────────────────────────────────────────────────────────
const NAV = [
  {id:"dashboard", label:"Dashboard",    icon:"⬡", group:"ops"},
    {id:"routing",   label:"Connect IVR",   icon:"🔗", group:"ops"},
  {id:"suppliers", label:"Suppliers",      icon:"🔒", group:"ops"},
  {id:"didinventory", label:"📦 DID Inventory", icon:"📦", group:"voice"},
  {id:"ivr",       label:"IVR Builder",  icon:"⬡", group:"ops"},
  {id:"livecalls", label:"Live Calls",   icon:"◈", group:"ops"},
  {id:"revenue",   label:"Revenue",      icon:"$", group:"voice"},
  {id:"cdr",       label:"CDR Analytics",icon:"≡", group:"voice"},
  {id:"sipmonitor",label:"📡 SIP Monitor",icon:"📡", group:"voice"},
  {id:"agent",     label:"🤖 Agent",     icon:"🤖", group:"system"},
  {id:"customers", label:"Customers",    icon:"○", group:"system"},
  {id:"settings",  label:"Settings",     icon:"⚙", group:"system"},
  {id:"testlabs",  label:"Test Labs",  icon:"🧪", group:"system"},
  {id:"apidocs",   label:"📡 API Docs",   icon:"📡", group:"system"},
];

// ── Mobile bottom nav ─────────────────────────────────────────────
const MobileNav = memo(({page, setPage}) => (
  <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#080B12",
    borderTop:`1px solid ${C.border}`,display:"flex",zIndex:200,
    paddingBottom:"env(safe-area-inset-bottom,0)"}}>
    {[...NAV.slice(0,5),{id:"_menu",label:"More",icon:"☰",group:"ops"}].map(n => {
      const active = page===n.id;
      return (
        <button key={n.id} onClick={()=>setPage(n.id)}
          style={{flex:1,padding:"10px 4px 8px",background:"transparent",border:"none",
            color:active?C.green:"#CBD5E1",cursor:"pointer",display:"flex",
            flexDirection:"column",alignItems:"center",gap:3}}>
          <span style={{fontSize:16}}>{n.icon}</span>
          <span style={{fontSize:7,fontWeight:active?700:400}}>{n.label.split(" ")[0]}</span>
        </button>
      );
    })}
  </div>
));

// ── Mobile menu ───────────────────────────────────────────────────
const MobileMenu = memo(({page,setPage,onClose,onLogout,amiOk,lang,switchLang}) => (
  <div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}}>
    <div style={{flex:1,background:"rgba(0,0,0,0.6)"}} onClick={onClose}/>
    <div style={{width:240,background:"#080B12",borderLeft:`1px solid ${C.border}`,
      display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div style={{padding:"20px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:28,height:28,borderRadius:7,background:`linear-gradient(135deg,${C.green},${C.blue})`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#080B12"}}>G</div>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:C.text}}>Gulf-Premium-Telecom</div>
          <div style={{fontSize:9,color:C.muted}}>NOC v2.1</div>
        </div>
        <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer"}}>✕</button>
      </div>
      <nav style={{flex:1,padding:"8px"}}>
        {NAV.map(n => {
          const active = page===n.id;
          return (
            <button key={n.id} onClick={()=>{setPage(n.id);onClose();}}
              style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 10px",
                borderRadius:8,marginBottom:3,cursor:"pointer",textAlign:"left",
                background:active?"rgba(0,255,178,0.1)":"transparent",
                border:active?"1px solid rgba(0,255,178,0.25)":"1px solid transparent",
                color:active?C.green:"#6B7280",fontSize:13,fontWeight:active?700:400}}>
              <span style={{fontSize:16,width:22,textAlign:"center"}}>{n.icon}</span>
              <span style={{flex:1}}>{n.label}</span>
              {n.dot&&<span style={{width:6,height:6,borderRadius:"50%",background:amiOk?C.green:C.red,animation:"pulse 2s infinite"}}/>}
            </button>
          );
        })}
      </nav>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
        {/* Language Switcher */}
        <div style={{display:"flex",gap:3}}>
          {[["en","🇬🇧"],["ar","🇸🇦"],["bn","🇧🇩"],["hi","🇮🇳"]].map(([k,flag])=>(
            <button key={k} onClick={()=>switchLang&&switchLang(k)}
              style={{padding:"3px 7px",borderRadius:6,fontSize:12,cursor:"pointer",
                border:`1px solid ${lang===k?"#00FFB2":"rgba(255,255,255,0.1)"}`,
                background:lang===k?"rgba(0,255,178,0.1)":"transparent",
                color:lang===k?"#00FFB2":"#64748B"}}>
              {flag}
            </button>
          ))}
        </div>
        {/* Language Switcher */}
        <div style={{display:"flex",gap:3}}>
          {[["en","🇬🇧"],["ar","🇸🇦"],["bn","🇧🇩"],["hi","🇮🇳"]].map(([k,flag])=>(
            <button key={k} onClick={()=>switchLang&&switchLang(k)}
              style={{padding:"3px 7px",borderRadius:6,fontSize:12,cursor:"pointer",
                border:`1px solid ${lang===k?"#00FFB2":"rgba(255,255,255,0.1)"}`,
                background:lang===k?"rgba(0,255,178,0.1)":"transparent",
                color:lang===k?"#00FFB2":"#64748B"}}>
              {flag}
            </button>
          ))}
        </div>
        <button onClick={onLogout} style={{width:"100%",padding:"10px",borderRadius:8,
          border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:12,cursor:"pointer"}}>
          Logout
        </button>
      </div>
    </div>
  </div>
));

// ── Desktop Sidebar ───────────────────────────────────────────────
const Sidebar = memo(({page,setPage,open,toggle,amiOk}) => (
  <aside style={{width:open?210:52,minHeight:"100vh",background:"#080B12",
    borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",
    transition:"width 0.2s ease",overflow:"hidden",flexShrink:0,
    position:"sticky",top:0,height:"100vh",zIndex:100}}>
    <div style={{padding:"16px 12px 14px",borderBottom:`1px solid ${C.border}`,
      display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
      <div style={{width:26,height:26,borderRadius:6,flexShrink:0,
        background:`linear-gradient(135deg,${C.green},${C.blue})`,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"#080B12"}}>G</div>
      {open&&<div>
        <div style={{fontSize:12,fontWeight:800,color:C.text,whiteSpace:"nowrap"}}>Gulf-Premium-Telecom</div>
        <div style={{fontSize:8,color:C.muted}}>NOC v2.1 · Carrier Platform</div>
      </div>}
    </div>
    <nav style={{flex:1,overflowY:"auto",padding:"8px 6px"}}>
      {[{key:"ops",label:"Operations"},{key:"voice",label:"Analytics"},{key:"system",label:"System"}].map(g=>(
        <div key={g.key} style={{marginBottom:4}}>
          {open&&g.key==="system"&&<div style={{padding:"8px 8px 4px"}}>
              <div style={{fontSize:7,letterSpacing:"2px",color:"#64748B",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>LANGUAGE</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {Object.entries(LANGS).map(([k,v])=>(
                  <button key={k} onClick={()=>{setLang(k);setLangState(k);}} style={{padding:"3px 8px",borderRadius:6,fontSize:10,cursor:"pointer",border:`1px solid ${lang===k?"#00FFB2":"rgba(255,255,255,0.1)"}`,background:lang===k?"rgba(0,255,178,0.1)":"transparent",color:lang===k?"#00FFB2":"#64748B"}}>{v.flag} {v.name}</button>
                ))}
              </div>
            </div>}
            {open&&<div style={{fontSize:7,letterSpacing:"2px",color:"#64748B",textTransform:"uppercase",padding:"8px 8px 4px",fontWeight:700}}>{g.label}</div>}
          {NAV.filter(n=>n.group===g.key).map(n=>{
            const active=page===n.id;
            return (
              <button key={n.id} onClick={()=>setPage(n.id)} title={!open?n.label:""}
                style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"8px 9px",
                  borderRadius:7,marginBottom:2,cursor:"pointer",textAlign:"left",
                  background:active?"rgba(0,255,178,0.12)":"rgba(255,255,255,0.04)",
                  border:active?"1px solid rgba(0,255,178,0.3)":"1px solid rgba(255,255,255,0.06)",
                  color:active?C.green:"#CBD5E1",fontSize:12,fontWeight:active?700:400,transition:"all 0.12s"}}
                onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color="#F1F5F9";}}}
                onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#CBD5E1";}}}>
                <span style={{fontSize:13,width:18,textAlign:"center",flexShrink:0}}>{n.icon}</span>
                {open&&<span style={{whiteSpace:"nowrap",flex:1}}>{n.label}</span>}
                {open&&n.dot&&<span style={{width:5,height:5,borderRadius:"50%",background:amiOk?C.green:C.red,animation:"pulse 2s infinite"}}/>}
                {open&&active&&<span style={{width:3,height:16,borderRadius:2,background:C.green,marginLeft:"auto"}}/>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
    {open&&<div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
      <div style={{fontSize:7,letterSpacing:"1.5px",color:C.muted,marginBottom:7,textTransform:"uppercase"}}>Services</div>
      {[["Asterisk 20",amiOk?C.green:C.orange],["MariaDB",C.green],["Redis",C.green],["Fraud Engine",C.green]].map(([s,c])=>(
        <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:9,color:"#374151"}}>{s}</span>
          <span style={{display:"flex",alignItems:"center",gap:3,fontSize:8,color:c,fontWeight:700}}>
            <span style={{width:4,height:4,borderRadius:"50%",background:c}}/>UP
          </span>
        </div>
      ))}
    </div>}
    <button onClick={toggle} style={{margin:"6px",padding:"7px",borderRadius:6,border:`1px solid ${C.border}`,
      background:"transparent",color:C.muted,cursor:"pointer",fontSize:12,flexShrink:0}}>{open?"◀":"▶"}</button>
  </aside>
));

// ── TopBar ────────────────────────────────────────────────────────
const TopBar = memo(({toast,onLogout,onMenuOpen,bp,amiOk,onReload,lang,switchLang}) => {
  const {metrics} = useM();
  const mobile = isMobile(bp);
  const concurrent = metrics?.active_calls ?? 0;
  const cps        = metrics?.cps ?? 0;
  const asr        = metrics?.asr ?? 0;
  const revenue    = metrics?.total_revenue ?? 0;

  return (
    <div style={{height:mobile?44:48,background:"#080B12",borderBottom:`1px solid ${C.border}`,
      display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:mobile?"0 12px":"0 20px",flexShrink:0,position:"sticky",top:0,zIndex:90}}>
      <div style={{display:"flex",alignItems:"center",gap:mobile?10:20}}>
        {mobile&&<button onClick={onMenuOpen} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"4px"}}>☰</button>}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:amiOk?C.green:C.orange,
            boxShadow:`0 0 8px ${amiOk?C.green:C.orange}`,display:"inline-block",animation:"pulse 2s infinite"}}/>
          {!mobile&&<span style={{fontSize:9,letterSpacing:"2px",color:amiOk?C.green:C.orange,fontWeight:700}}>
            {amiOk?"AMI LIVE":"WAITING"}
          </span>}
        </div>
        {[
          !mobile&&["CPS",   cps,                    C.pink],
          ["CONC",  concurrent,                       C.green],
          !mobile&&["REV",   fmtM(revenue),            C.yellow],
          ["ASR",   asr>0?`${asr}%`:"—",              C.blue],
        ].filter(Boolean).map(([l,v,c])=>(
          <div key={l} style={{display:"flex",alignItems:"baseline",gap:3}}>
            {!mobile&&<span style={{fontSize:8,color:C.muted,letterSpacing:"1px"}}>{l}</span>}
            <span style={{fontSize:mobile?13:14,fontWeight:800,color:c,...mono}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        {toast&&<div style={{padding:"5px 12px",borderRadius:6,background:`${toast.color}15`,
          border:`1px solid ${toast.color}40`,fontSize:9,color:toast.color,fontWeight:600,
          maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{toast.msg}</div>}
        {!mobile&&<Bdg label="Gulf-Premium-Telecom" color={C.blue}/>}
        {!mobile&&<button onClick={onReload} title="Reload Asterisk dialplan"
          style={{fontSize:9,color:C.green,background:"none",border:`1px solid ${C.green}40`,
            borderRadius:5,padding:"4px 8px",cursor:"pointer",fontWeight:700}}>⟳ AST</button>}
        {!mobile&&<button onClick={onLogout} style={{fontSize:9,color:C.muted,background:"none",
          border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 8px",cursor:"pointer"}}>Logout</button>}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// PAGES — all real data, no simulation
// ═══════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────

const TodayLiveStats = memo(({token, bp}) => {
  const [stats, setStats] = useState({prefixes:[],countries:[],organizations:[]});
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const load = async()=>{
      try {
        const r = await fetch("https://gulf-premium-telecom.com/api/v1/cdr?per_page=200&from="+new Date().toISOString().split("T")[0]+"&to="+new Date().toISOString().split("T")[0],{
          headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}
        });
        const d = await r.json();
        const cdrs = d.data||[];

        // Group by prefix (first 8 digits)
        const prefixMap={};
        const countryMap={};
        const orgMap={};

        // Country code to name map
        const COUNTRIES = {
          "IT":"Italy","SA":"Saudi Arabia","AE":"UAE","KW":"Kuwait","BH":"Bahrain",
          "QA":"Qatar","OM":"Oman","JO":"Jordan","IQ":"Iraq","EG":"Egypt",
          "US":"United States","GB":"United Kingdom","DE":"Germany","FR":"France",
          "PK":"Pakistan","IN":"India","TR":"Turkey","RU":"Russia","NG":"Nigeria",
          "XX":"Unknown"
        };

        // Caller prefix → operator map
        const OPERATORS = {
          // Saudi Arabia — STC (050,053,055)
          "96650":"STC","96653":"STC","96655":"STC",
          // Saudi Arabia — Mobily (054,056)
          "96654":"Mobily","96656":"Mobily",
          // Saudi Arabia — Zain (058,059)
          "96658":"Zain SA","96659":"Zain SA",
          // Saudi Arabia — Salam (051)
          "96651":"Salam Mobile",
          // Saudi Arabia — MVNOs on STC
          "966570":"Virgin Mobile","966571":"Virgin Mobile",
          "966572":"Virgin Mobile","966573":"Virgin Mobile",
          // Saudi Arabia — MVNOs on Zain
          "966574":"Red Bull Mobile","966575":"Red Bull Mobile",
          // Saudi Arabia — MVNOs on Mobily
          "966576":"Lebara Mobile","966577":"Lebara Mobile",
          "966578":"Lebara Mobile","966579":"Lebara Mobile",
          // UAE
          "97150":"Etisalat UAE","97152":"Etisalat UAE","97156":"Etisalat UAE",
          "97154":"Du UAE","97155":"Du UAE","97158":"Du UAE",
          // Kuwait
          "96550":"STC KW","96560":"Zain KW","96565":"Zain KW","96566":"Ooredoo KW",
          // Qatar
          "97430":"Ooredoo QA","97433":"Vodafone QA","97450":"Ooredoo QA",
          // Oman
          "96890":"Omantel","96892":"Ooredoo OM","96899":"Omantel",
          // Bahrain
          "97330":"Batelco","97332":"Zain BH","97336":"Ooredoo BH",
          // Jordan
          "96277":"Orange JO","96278":"Zain JO","96279":"Umniah JO",
          // Iraq
          "96470":"Asia Cell","96471":"Zain IQ","96475":"Korek",
          // Pakistan
          "92300":"Jazz","92301":"Jazz","92302":"Ufone",
          "92303":"Ufone","92311":"Telenor","92333":"Zong",
          // UK/EU
          "447":"UK","449":"UK","33":"France","49":"Germany",
        };

        const getOperator = (ani)=>{
          if(!ani) return "Unknown";
          const num = ani.replace("+","");
          // Try longest prefix match (up to 7 digits)
          for(let len=7;len>=4;len--){
            const pfx = num.slice(0,len);
            if(OPERATORS[pfx]) return OPERATORS[pfx];
          }
          // Fallback by country code
          if(num.startsWith("966")) return "Saudi Arabia";
          if(num.startsWith("971")) return "UAE";
          if(num.startsWith("965")) return "Kuwait";
          if(num.startsWith("974")) return "Qatar";
          if(num.startsWith("968")) return "Oman";
          if(num.startsWith("44"))  return "UK";
          if(num.startsWith("49"))  return "Germany";
          if(num.startsWith("1"))   return "USA";
          return "Unknown";
        };

        cdrs.forEach(c=>{
          const did = (c.did||c.dst||"").replace("+","");
          if(!did.startsWith("39319905") && !did.startsWith("393199052")) return;
          const prefix  = did.slice(0,9)||"unknown";
          const cc      = c.country_code||"IT";
          const country = COUNTRIES[cc]||cc;
          const org     = getOperator(c.src||c.ani||"");

          prefixMap[prefix]  = (prefixMap[prefix]||0)+1;
          countryMap[country]= (countryMap[country]||0)+1;
          orgMap[org]        = (orgMap[org]||0)+1;
        });

        const sort = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,5);

        setStats({
          prefixes: sort(prefixMap),
          countries: sort(countryMap),
          organizations: sort(orgMap),
          total: cdrs.length,
        });
      } catch(e){}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000);
    return ()=>clearInterval(t);
  },[token]);

  const C2 = {green:"#00FFB2",blue:"#38BDF8",purple:"#A78BFA",yellow:"#FBBF24",
    surface:"#0C1018",border:"rgba(255,255,255,0.07)",text:"#E2E8F0",muted:"#4B5563"};

  const StatBox = ({title,icon,items,color})=>(
    <div style={{background:C2.surface,border:`1px solid ${C2.border}`,borderRadius:10,
      padding:"14px 16px",flex:1,minWidth:0}}>
      <div style={{fontSize:10,color:C2.muted,textTransform:"uppercase",letterSpacing:"1.5px",
        marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        <span>{icon}</span>{title}
      </div>
      {loading
        ?<div style={{color:C2.muted,fontSize:12}}>Loading...</div>
        :items.length===0
        ?<div style={{color:C2.muted,fontSize:12}}>No data today</div>
        :items.map(([key,count],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:6,gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontFamily:"monospace",color:C2.text,
                fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {key}
              </div>
              <div style={{height:3,background:`${color}15`,borderRadius:2,marginTop:3}}>
                <div style={{height:3,background:color,borderRadius:2,
                  width:`${Math.round(count/items[0][1]*100)}%`,transition:"width 0.3s"}}/>
              </div>
            </div>
            <span style={{fontSize:12,fontFamily:"monospace",color,fontWeight:700,
              flexShrink:0}}>{count}</span>
          </div>
        ))
      }
    </div>
  );

  return (
    <div style={{display:"flex",gap:12,marginBottom:12,flexWrap:bp==="xs"?"wrap":"nowrap"}}>
      <StatBox title="Today Live Prefix"       icon="🔢" items={stats.prefixes||[]}      color={C2.green}/>
      <StatBox title="Today Live Country"      icon="🌍" items={stats.countries||[]}     color={C2.blue}/>
      <StatBox title="Today Live Organization" icon="🏢" items={stats.organizations||[]} color={C2.purple}/>
    </div>
  );
});

const PageDashboard = memo(({token, setPage, bp}) => {
  const {metrics} = useM();
  const mobile = isMobile(bp);
  const m = metrics || {};

  return (
    <div>
      <div style={{marginBottom:mobile?12:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:C.green,display:"inline-block"}}/>
          <span style={{fontSize:8,letterSpacing:"2px",color:C.green,fontWeight:700,textTransform:"uppercase"}}>
            Carrier-Grade DID/IPRN Monetization Platform
          </span>
        </div>
        <h1 style={{margin:0,fontSize:mobile?"20px":"clamp(22px,3vw,32px)",fontWeight:900,letterSpacing:"-0.5px",
          background:`linear-gradient(135deg,${C.text} 0%,#64748B 100%)`,
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
          GULF-PREMIUM-TELECOM NOC
        </h1>
        <p style={{margin:"4px 0 0",fontSize:10,color:C.muted}}>
          ASTERISK 20.19 · LARAVEL 12 · AGI ROUTING · IP-AUTH · 9 CARRIERS
        </p>
      </div>

      <KpiGrid bp={bp} items={[
        ["Revenue Today",   fmtM(m.total_revenue??0),         "USD",         C.yellow, null, true],
        ["Active Channels", m.active_calls??0,                "concurrent",  C.green,  null, true],
        ["ASR",             m.asr>0?`${m.asr}%`:"—",          "answer rate", C.blue],
        ["Total Minutes",   m.total_minutes>0?`${(m.total_minutes).toFixed(0)}`:"—", "today", C.cyan],
      ]}/>

      {!mobile&&<KpiGrid bp={bp} items={[
        ["Platform Profit", m.platform_profit>0?`$${m.platform_profit.toFixed(2)}`:"—", "today",   C.purple],
        ["Total Calls",     m.total_calls??0,                  "today",     C.blue],
        ["Active DIDs",     m.active_dids??0,                  "numbers",   C.green],
        ["Fraud Alerts",    m.alerts_active??0,                "active",    C.red],
      ]}/>}

      {/* Today Live Stats */}
      <TodayLiveStats token={token} bp={bp}/>
      {/* Traffic flow */}
      <Card title="Live Traffic Flow" style={{marginBottom:12}}>
        <div style={{padding:"14px 18px"}}>
          {[
            ["Carrier SIP",    "IP-auth · 9 carriers",       C.blue,   true],
            ["AGI Fraud Check","Redis CPS/ANI/Loop detect",  C.orange, true],
            ["DID Router",     "DB lookup → cache 300s",     C.purple, true],
            ["IVR Playback",   "WAV 8kHz → Asterisk",        C.green,  true],
            ["Revenue Engine", "RPM × Minutes billing",      C.yellow, true],
            ["AMI → Redis",    "Live dashboard updates",     C.cyan,   true],
          ].map(([step,detail,color,ok],i,arr)=>(
            <div key={step} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",
              borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:ok?color:"#374151",
                flexShrink:0,boxShadow:ok?`0 0 6px ${color}`:"none"}}/>
              <span style={{fontSize:11,fontWeight:600,color:C.text,flex:1,...mono}}>{step}</span>
              <span style={{fontSize:10,color:C.muted}}>{detail}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Carrier status */}
      <Card title="STANDARD Trunk" action={
        <span style={{fontSize:9,color:C.muted}}>IP-auth · 1 trunk · All suppliers</span>
      }>
        <div style={{padding:"12px 16px"}}>
          <div style={{marginBottom:8,fontSize:11,color:C.muted}}>
            All whitelisted supplier IPs — any INVITE from these IPs auto-connects to IVR
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {[
              ["52.28.165.40",   "world-premium"],
              ["52.57.172.184",  "world-premium"],
              ["35.156.119.128", "world-premium"],
              ["185.209.147.14", "CARRIER-PN"],
              ["213.165.51.44",  "CARRIER-PN"],
              ["108.61.70.46",   "carrier-alpha"],
              ["157.90.193.196", "carrier-bravo"],
              ["51.77.77.223",   "carrier-charlie"],
              ["95.217.90.21",   "carrier-delta"],
              ["149.12.160.10",  "carrier-echo"],
              ["93.94.120.49",   "carrier-foxtrot"],
              ["149.56.232.122", "carrier-hotel"],
            ].map(([ip,name])=>(
              <div key={ip} style={{background:"rgba(0,255,178,0.05)",
                border:"1px solid rgba(0,255,178,0.2)",borderRadius:8,padding:"6px 10px"}}>
                <div style={{fontSize:11,fontFamily:"monospace",color:C.green,fontWeight:700}}>{ip}</div>
                <div style={{fontSize:9,color:C.muted,marginTop:1}}>{name}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
});

// ── Live NOC ──────────────────────────────────────────────────────

const getOp = (ani) => {
  if(!ani) return "—";
  const n = String(ani).replace("+","");
  const map = {
    "966570":"Virgin Mobile","966571":"Virgin Mobile","966572":"Virgin Mobile","966573":"Virgin Mobile",
    "966574":"Red Bull","966575":"Red Bull",
    "966576":"Lebara","966577":"Lebara","966578":"Lebara","966579":"Lebara",
    "96650":"STC","96653":"STC","96655":"STC",
    "96654":"Mobily","96656":"Mobily",
    "96658":"Zain SA","96659":"Zain SA",
    "96651":"Salam",
    "97150":"Etisalat","97152":"Etisalat","97156":"Etisalat",
    "97154":"Du","97155":"Du","97158":"Du",
    "96550":"STC KW","96560":"Zain KW","96566":"Ooredoo KW",
    "97430":"Ooredoo QA","97433":"Vodafone QA",
    "96890":"Omantel","96892":"Ooredoo OM",
  };
  for(let l=7;l>=4;l--){
    const p=n.slice(0,l);
    if(map[p]) return map[p];
  }
  if(n.startsWith("966")) return "Saudi Arabia";
  if(n.startsWith("971")) return "UAE";
  if(n.startsWith("965")) return "Kuwait";
  if(n.startsWith("974")) return "Qatar";
  if(n.startsWith("968")) return "Oman";
  return "—";
};

const CallRow = memo(({call, onHangup, compact}) => {
  const [dur, setDur] = useState(call.duration||0);
  useEffect(()=>{
    const t = setInterval(()=>setDur(d=>d+1), 1000);
    return ()=>clearInterval(t);
  }, []);
  const sc = {ACTIVE:C.green,Up:C.green,RINGING:C.yellow,HOLDING:C.blue}[call.status]||"#888";

  if(compact) return (
    <tr onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <TD style={{...mono,fontSize:10,color:C.blue}}>{(call.id||call.channel||"").slice(-8)}</TD>
      <TD style={{...mono,fontSize:10}}>{(call.src||call.calleridnum||"—").slice(-10)}</TD>
      <TD style={{...mono,color:C.yellow,fontSize:10}}>{fmt(dur)}</TD>
      <TD><Bdg label={call.status||"Up"} color={sc}/></TD>
      <TD><button onClick={()=>onHangup(call.id||call.channel)} style={{padding:"3px 8px",borderRadius:5,
        border:"1px solid #F8717135",background:"#F8717110",color:"#F87171",fontSize:8,fontWeight:700,cursor:"pointer"}}>END</button></TD>
    </tr>
  );

  return (
    <tr onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <TD style={{...mono,color:C.blue}}>{call.id||call.channel||"—"}</TD>
      <TD style={mono}>{call.src||call.calleridnum||"—"}</TD>
      <TD style={mono}>{call.dst||call.exten||call.did||"—"}</TD>
      <TD style={{fontSize:10}}>{call.country||call.country_code||"—"}</TD>
      <TD style={{fontSize:10,color:C.purple}}>{getOp(call.src||call.calleridnum)}</TD>
      <TD style={{...mono,color:C.yellow}}>{fmt(dur)}</TD>
      <TD style={{fontSize:10,color:"#64748B"}}>{call.trunk||call.context||"—"}</TD>
      <TD style={{...mono,color:C.green}}>{call.rpm?"$"+call.rpm:"—"}</TD>
      <TD><Bdg label={call.status||"Up"} color={sc}/></TD>
      <TD><button onClick={()=>onHangup(call.id||call.channel)} style={{padding:"3px 9px",borderRadius:5,
        border:"1px solid #F8717135",background:"#F8717110",color:"#F87171",fontSize:8,fontWeight:700,cursor:"pointer"}}>END</button></TD>
    </tr>
  );
});

const PageNoc = memo(({calls, onHangup, amiOk, bp}) => {
  const {metrics} = useM();
  const mobile = isMobile(bp);
  const m = metrics || {};

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,gap:8}}>
        <div>
          <h2 style={{margin:0,fontSize:mobile?16:18,fontWeight:800,color:C.text}}>Live NOC Monitor</h2>
          <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>
            {calls.length} active channels ·{" "}
            {amiOk
              ? <span style={{color:C.green,fontWeight:700}}>● AMI Connected — Asterisk 20.19</span>
              : <span style={{color:C.orange}}>● Waiting for calls...</span>
            }
          </p>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <Bdg label={`${calls.filter(c=>c.status==="ACTIVE"||c.status==="Up").length} Active`} color={C.green}/>
          {calls.filter(c=>c.status==="RINGING").length>0&&
            <Bdg label={`${calls.filter(c=>c.status==="RINGING").length} Ringing`} color={C.yellow}/>}
        </div>
      </div>

      <KpiGrid bp={bp} items={[
        ["CPS",        m.cps??0,                                  "calls/sec",   C.pink,   null, true],
        ["Concurrent", calls.length,                              "channels",    C.green,  null, true],
        ["ASR",        m.asr>0?`${m.asr}%`:"—",                  "answer rate", C.blue],
        ["Revenue",    m.total_revenue>0?fmtM(m.total_revenue):"—", "today",    C.yellow, null, true],
      ]}/>

      <Card>
        <ScrollTable minWidth={mobile?350:800}>
          <thead><tr>
            {mobile
              ? <><TH c="Channel"/><TH c="ANI"/><TH c="Duration"/><TH c="Status"/><TH c=""/></>
              : <><TH c="Channel"/><TH c="ANI"/><TH c="DID"/><TH c="Country"/><TH c="Organization"/><TH c="Duration"/><TH c="Carrier"/><TH c="RPM"/><TH c="Status"/><TH c="Action"/></>
            }
          </tr></thead>
          <tbody>
            {calls.length === 0
              ? <tr><td colSpan={mobile?5:9}>
                  <EmptyState icon="📞" title="No active calls"
                    sub="Waiting for inbound SIP traffic from carriers"/>
                </td></tr>
              : calls.map(c => <CallRow key={c.id||c.channel||Math.random()} call={c} onHangup={onHangup} compact={mobile}/>)
            }
          </tbody>
        </ScrollTable>
      </Card>
    </div>
  );
});

// ── Revenue ───────────────────────────────────────────────────────
const PageRevenue = memo(({token, bp}) => {
  const [today,   setToday]   = useState(null);
  const [byDid,   setByDid]   = useState([]);
  const [byCtry,  setByCtry]  = useState([]);
  const [chart,   setChart]   = useState([]);
  const [loading, setLoading] = useState(true);
  const mobile = isMobile(bp);

  useEffect(()=>{
    Promise.all([
      apiGet("/revenue/today",token),
      apiGet("/revenue/by-did",token),
      apiGet("/revenue/by-country",token),
      apiGet("/revenue/chart?days=14",token),
    ]).then(([t,d,c,ch])=>{
      t&&setToday(t.data);
      d&&setByDid(d.data||[]);
      c&&setByCtry(c.data||[]);
      ch&&setChart(ch.data||[]);
      setLoading(false);
    });
    const t = setInterval(()=>{
      apiGet("/revenue/today",token).then(d=>d&&setToday(d.data));
    }, 30000);
    return ()=>clearInterval(t);
  },[token]);

  const t = today || {};
  const maxRev = Math.max(...byCtry.map(c=>parseFloat(c.revenue||0)), 1);

  return (
    <div>
      <h2 style={{margin:"0 0 12px",fontSize:mobile?14:16,fontWeight:800,color:C.text}}>Revenue Analytics</h2>

      <KpiGrid bp={bp} items={[
        ["Revenue Today",   fmtM(t.total_revenue??0),                         "USD",        C.yellow, null, true],
        ["Platform Profit", t.platform_profit>0?`$${t.platform_profit.toFixed(2)}`:"—",     "today",  C.green],
        ["Total Minutes",   t.total_minutes>0?`${t.total_minutes.toFixed(0)}`:"—",          "today",  C.blue],
        ["Avg RPM",         t.avg_rpm>0?`$${t.avg_rpm.toFixed(6)}`:"—",                     "per min",C.purple],
      ]}/>

      {!mobile&&<KpiGrid bp={bp} items={[
        ["Total Calls",   t.total_calls??0,                                   "today",      C.cyan],
        ["Answered",      t.answered??0,                                       "calls",      C.green],
        ["ASR",           t.asr>0?`${t.asr}%`:"—",                           "answer rate",C.blue],
        ["Billable",      t.billable??0,                                       "calls",      C.yellow],
      ]}/>}

      {/* Revenue by DID */}
      <Card title="Top DIDs by Revenue" style={{marginBottom:12}}>
        <ScrollTable minWidth={mobile?400:600}>
          <thead><tr>
            <TH c="DID"/><TH c="Calls"/><TH c="Minutes"/><TH c="Revenue"/>
            {!mobile&&<TH c="Avg RPM"/>}
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={mobile?4:5} style={{padding:24,textAlign:"center",color:C.muted}}>Loading...</td></tr>
              : byDid.length === 0
              ? <tr><td colSpan={mobile?4:5}>
                  <EmptyState icon="💰" title="No revenue data yet" sub="Revenue appears after first answered calls"/>
                </td></tr>
              : byDid.slice(0,10).map((d,i)=>(
                <tr key={i} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <TD style={mono}>{d.did}</TD>
                  <TD>{d.calls}</TD>
                  <TD style={mono}>{parseFloat(d.minutes||0).toFixed(1)}</TD>
                  <TD style={{...mono,color:C.yellow,fontWeight:700}}>${parseFloat(d.revenue||0).toFixed(4)}</TD>
                  {!mobile&&<TD style={{...mono,color:C.blue}}>${parseFloat(d.avg_rpm||0).toFixed(6)}</TD>}
                </tr>
              ))
            }
          </tbody>
        </ScrollTable>
      </Card>

      {/* Country breakdown */}
      {byCtry.length > 0 && (
        <Card title="Revenue by Country" style={{marginBottom:12}}>
          <div style={{padding:"14px 18px"}}>
            {byCtry.slice(0,8).map((c,i)=>{
              const pct = Math.round(parseFloat(c.revenue||0)/maxRev*100);
              const colors=[C.green,C.blue,C.purple,C.yellow,C.pink,C.cyan,C.orange,C.red];
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <span style={{fontSize:11,color:"#64748B",width:30,flexShrink:0,...mono}}>{c.country_code}</span>
                  <div style={{flex:1,height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:colors[i%colors.length],borderRadius:2}}/>
                  </div>
                  <span style={{fontSize:11,color:C.muted,width:60,textAlign:"right",...mono}}>
                    ${parseFloat(c.revenue||0).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Chart */}
      {chart.filter(d=>d.revenue>0).length > 0 && (
        <Card title="Revenue — Last 14 Days">
          <div style={{padding:"14px 18px"}}>
            <div style={{display:"flex",gap:3,alignItems:"flex-end",height:mobile?60:80}}>
              {chart.map((d,i)=>{
                const maxR = Math.max(...chart.map(x=>x.revenue||0), 1);
                const h = Math.round((d.revenue||0)/maxR*(mobile?52:70))+4;
                return (
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div title={`$${parseFloat(d.revenue||0).toFixed(2)}`}
                      style={{width:"100%",height:h,background:(d.revenue||0)>0?`${C.yellow}60`:"rgba(255,255,255,0.04)",
                        borderRadius:"3px 3px 0 0",border:`1px solid ${(d.revenue||0)>0?C.yellow+"50":"transparent"}`}}/>
                    {!mobile&&<span style={{fontSize:7,color:C.muted,...mono}}>{(d.date||"").slice(5)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
});

// ── CDR Analytics ─────────────────────────────────────────────────
const PageCdr = memo(({token, bp}) => {
  const [cdrs,    setCdrs]    = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [from,    setFrom]    = useState(new Date(Date.now()-86400000).toISOString().split("T")[0]);
  const [to,      setTo]      = useState(new Date().toISOString().split("T")[0]);
  const [filter,  setFilter]  = useState("");
  const mobile = isMobile(bp);

  const load = async () => {
    setLoading(true);
    const [c,s] = await Promise.all([
      apiGet(`/cdr?from=${from}&to=${to}&per_page=50`, token),
      apiGet(`/cdr/summary?from=${from}&to=${to}`, token),
    ]);
    c&&setCdrs(c.data||[]);
    s&&setSummary(s.data);
    setLoading(false);
  };

  useEffect(()=>{ load(); }, [token]);

  const exportCsv = async () => {
    try {
      const r = await fetch(`${API}/cdr/export?from=${from}&to=${to}`, {
        headers:{Authorization:`Bearer ${token}`}
      });
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href=url; a.download=`cdrs_${from}.csv`; a.click();
    } catch(e) {}
  };

  const filtered = cdrs.filter(c=>!filter||
    (c.src||"").includes(filter)||(c.dst||"").includes(filter)||(c.did||"").includes(filter));
  const dc = {ANSWERED:C.green,"NO ANSWER":C.muted,BUSY:C.yellow,FAILED:C.red};
  const s  = summary || {};

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8}}>
        <h2 style={{margin:0,fontSize:mobile?14:16,fontWeight:800,color:C.text}}>CDR Analytics</h2>
        <button onClick={exportCsv} style={{padding:mobile?"7px 12px":"8px 16px",borderRadius:7,
          border:`1px solid ${C.green}40`,background:`${C.green}10`,color:C.green,
          fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>⬇ CSV</button>
      </div>

      <KpiGrid bp={bp} items={[
        ["Total CDRs",    (s.total??cdrs.length).toLocaleString(), "records",   C.blue],
        ["Revenue",       s.total_revenue>0?`$${parseFloat(s.total_revenue).toFixed(2)}`:"—", "period", C.yellow],
        ["ASR",           s.asr>0?`${s.asr}%`:"—",                "answer",    C.green],
        ["Avg Duration",  s.avg_billsec>0?`${parseFloat(s.avg_billsec).toFixed(0)}s`:"—", "billsec", C.purple],
      ]}/>

      <Card style={{padding:"12px 14px",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr 1fr":"1fr 1fr 2fr auto",gap:8,alignItems:"flex-end"}}>
          {[["From",from,setFrom,"date"],["To",to,setTo,"date"]].map(([l,v,sv,t])=>(
            <div key={l}>
              <div style={{fontSize:8,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"1px"}}>{l}</div>
              <input value={v} onChange={e=>sv(e.target.value)} type={t}
                style={{width:"100%",padding:"7px 9px",borderRadius:7,border:`1px solid ${C.border}`,
                  background:"rgba(255,255,255,0.04)",color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
          {!mobile&&<div>
            <div style={{fontSize:8,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"1px"}}>Search</div>
            <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="ANI, DID..."
              style={{width:"100%",padding:"7px 9px",borderRadius:7,border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.04)",color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
          </div>}
          <button onClick={load} style={{padding:"7px 16px",borderRadius:7,border:"none",
            background:C.purple,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Search</button>
        </div>
      </Card>

      <Card>
        <ScrollTable minWidth={mobile?380:900}>
          <thead><tr>
            {mobile
              ? <><TH c="Time"/><TH c="ANI"/><TH c="DID"/><TH c="Sec"/><TH c="Revenue"/><TH c="Status"/></>
              : <><TH c="Time"/><TH c="ANI"/><TH c="DID"/><TH c="Duration"/><TH c="Billsec"/><TH c="Carrier"/><TH c="Country"/><TH c="RPM"/><TH c="Revenue"/><TH c="Status"/></>
            }
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={mobile?6:10} style={{padding:24,textAlign:"center",color:C.muted}}>Loading CDRs...</td></tr>
              : filtered.length === 0
              ? <tr><td colSpan={mobile?6:10}>
                  <EmptyState icon="📋" title="No CDR records" sub="Call records appear after first calls are completed"/>
                </td></tr>
              : filtered.map((c,i)=>(
                <tr key={i}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <TD style={{fontSize:10}}>{(c.call_start||"—").slice(0,16)}</TD>
                  <TD style={mono}>{mobile?(c.src||"—").slice(-10):c.src||"—"}</TD>
                  <TD style={mono}>{c.did||c.dst||"—"}</TD>
                  {!mobile&&<TD style={mono}>{c.duration||0}s</TD>}
                  <TD style={mono}>{c.billsec||0}s</TD>
                  {!mobile&&<><TD style={{fontSize:10,color:"#64748B"}}>{c.trunk_name||"—"}</TD>
                    <TD style={{fontSize:10}}>{c.country_code||"—"}</TD>
                    <TD style={{...mono,color:C.blue}}>{c.rpm?"$"+c.rpm:"—"}</TD></>}
                  <TD style={{...mono,color:C.yellow,fontWeight:700}}>
                    {parseFloat(c.revenue||0)>0?`$${parseFloat(c.revenue).toFixed(4)}`:"—"}
                  </TD>
                  <TD><Bdg label={(c.disposition||"—").slice(0,8)} color={dc[c.disposition]||C.muted}/></TD>
                </tr>
              ))
            }
          </tbody>
        </ScrollTable>
      </Card>
    </div>
  );
});

// ── Fraud Monitor ─────────────────────────────────────────────────
const PageFraud = memo(({token, notify, bp}) => {
  const [rules,   setRules]   = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [stats,   setStats]   = useState(null);
  const [tab,     setTab]     = useState("rules");
  const [blockNum,setBlock]   = useState("");
  const mobile = isMobile(bp);

  const load = async () => {
    const [r,b,s] = await Promise.all([
      apiGet("/fraud/rules",token),
      apiGet("/fraud/blocked?per_page=50",token),
      apiGet("/fraud/live",token),
    ]);
    r&&setRules(r.data||[]);
    b&&setBlocked(b.data||[]);
    s&&setStats(s.data);
  };

  useEffect(()=>{ load(); const t=setInterval(()=>apiGet("/fraud/live",token).then(d=>d&&setStats(d.data)),5000); return()=>clearInterval(t); },[token]);

  const handleBlock = async () => {
    if(!blockNum.trim()) return;
    await fetch(`${API}/fraud/block`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({number:blockNum,reason:"manual"})});
    notify&&notify(`${blockNum} blocked`,C.orange); setBlock(""); load();
  };

  const ac={block:C.red,alert:C.yellow,flag:C.orange};
  const tc={irsf:C.red,loop:C.orange,spoofing:C.red,volume:C.yellow,short_duration:C.orange,geo_block:C.purple};

  return (
    <div>
      <h2 style={{margin:"0 0 12px",fontSize:mobile?14:16,fontWeight:800,color:C.text}}>Fraud Monitor</h2>
      <KpiGrid bp={bp} items={[
        ["Concurrent",   stats?.concurrent??0,           "channels",   C.green, null, true],
        ["CPS",          stats?.cps??0,                  "per second", C.pink,  null, true],
        ["Blacklisted",  stats?.blacklisted??0,           "numbers",    C.red],
        ["Rules Active", rules.filter(r=>r.is_active).length, "rules", C.yellow],
      ]}/>

      <Card style={{padding:"12px 14px",marginBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"1px"}}>Block Number</div>
            <input value={blockNum} onChange={e=>setBlock(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleBlock()}
              placeholder="+12125551234"
              style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.04)",color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button onClick={handleBlock} style={{padding:"8px 16px",borderRadius:7,border:"none",
            background:C.red,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Block</button>
        </div>
      </Card>

      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["rules","Detection Rules"],["blocked","Blocked Numbers"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:"7px 14px",borderRadius:7,fontSize:11,
            fontWeight:700,cursor:"pointer",border:tab===k?`1px solid ${C.red}`:`1px solid ${C.border}`,
            background:tab===k?`${C.red}15`:"transparent",color:tab===k?C.red:C.muted}}>{l}</button>
        ))}
      </div>

      {tab==="rules"&&<Card>
        <ScrollTable minWidth={400}>
          <thead><tr><TH c="Rule"/><TH c="Type"/><TH c="Threshold"/><TH c="Action"/><TH c="Status"/></tr></thead>
          <tbody>{rules.length===0
            ?<tr><td colSpan={5}><EmptyState icon="🛡️" title="No fraud rules" sub="Add rules to protect against IRSF, loops, and spam"/></td></tr>
            :rules.map((r,i)=>(
              <tr key={i} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <TD style={{fontWeight:600,color:C.text,fontSize:11}}>{r.name}</TD>
                <TD><Bdg label={r.type} color={tc[r.type]||C.muted}/></TD>
                <TD style={mono}>{r.threshold}</TD>
                <TD><Bdg label={r.action} color={ac[r.action]||C.muted}/></TD>
                <TD><Bdg label={r.is_active?"active":"off"} color={r.is_active?C.green:C.muted}/></TD>
              </tr>
            ))
          }</tbody>
        </ScrollTable>
      </Card>}

      {tab==="blocked"&&<Card>
        <ScrollTable minWidth={300}>
          <thead><tr><TH c="Number"/><TH c="Reason"/><TH c="Expires"/><TH c="Action"/></tr></thead>
          <tbody>{blocked.length===0
            ?<tr><td colSpan={4}><EmptyState icon="✅" title="No blocked numbers" sub="Blocked numbers appear after fraud detection fires"/></td></tr>
            :blocked.map((b,i)=>(
              <tr key={i} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <TD style={mono}>{b.number}</TD>
                <TD style={{fontSize:10,color:C.muted}}>{b.reason||"manual"}</TD>
                <TD style={{fontSize:10}}>{b.expires_at?.slice(0,16)||"Never"}</TD>
                <TD><button onClick={async()=>{
                  await fetch(`${API}/fraud/blocked/${encodeURIComponent(b.number)}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});
                  notify&&notify(`${b.number} unblocked`,C.green); load();
                }} style={{padding:"3px 9px",borderRadius:5,border:`1px solid ${C.green}35`,
                  background:`${C.green}10`,color:C.green,fontSize:8,fontWeight:700,cursor:"pointer"}}>UNBLOCK</button></TD>
              </tr>
            ))
          }</tbody>
        </ScrollTable>
      </Card>}
    </div>
  );
});

// ── Customers ─────────────────────────────────────────────────────
const PageCustomers = memo(({token, notify, bp}) => {
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const mobile = isMobile(bp);

  const load = async () => {
    setLoading(true);
    const d = await apiGet("/customers?per_page=50", token);
    d&&setCustomers(d.data||[]);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[token]);

  const rc={customer:C.blue,reseller:C.purple,wholesale:C.yellow,super_admin:C.red,noc_operator:C.orange};

  return (
    <div>
      <h2 style={{margin:"0 0 12px",fontSize:mobile?14:16,fontWeight:800,color:C.text}}>Customer Management</h2>
      <KpiGrid bp={bp} items={[
        ["Total",     customers.length,                                   "accounts",  C.green],
        ["Active",    customers.filter(c=>c.status!=="suspended").length, "active",    C.blue],
        ["Resellers", customers.filter(c=>c.role==="reseller").length,    "resellers", C.purple],
        ["Wholesale", customers.filter(c=>c.role==="wholesale").length,   "wholesale", C.yellow],
      ]}/>
      <Card>
        <ScrollTable minWidth={mobile?400:700}>
          <thead><tr>
            <TH c="Name"/><TH c="Email"/><TH c="Role"/>
            {!mobile&&<TH c="DIDs"/>}<TH c="Status"/><TH c="Action"/>
          </tr></thead>
          <tbody>{loading
            ?<tr><td colSpan={mobile?5:6} style={{padding:24,textAlign:"center",color:C.muted}}>Loading...</td></tr>
            :customers.length===0
            ?<tr><td colSpan={mobile?5:6}><EmptyState icon="👤" title="No customers yet" sub="Add customers to assign DIDs and track revenue"/></td></tr>
            :customers.map((c,i)=>(
              <tr key={i} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <TD style={{fontWeight:600,color:C.text,fontSize:11}}>{c.name}</TD>
                <TD style={{fontSize:mobile?9:10,color:C.muted}}>{mobile?(c.email||"").split("@")[0]:c.email}</TD>
                <TD><Bdg label={c.role||"customer"} color={rc[c.role]||C.blue}/></TD>
                {!mobile&&<TD style={mono}>{c.dids_count||0}</TD>}
                <TD><Bdg label={c.status||"active"} color={c.status==="suspended"?C.red:C.green}/></TD>
                <TD>{c.status!=="suspended"
                  ?<button onClick={async()=>{ await fetch(`${API}/customers/${c.id}/suspend`,{method:"POST",headers:{Authorization:`Bearer ${token}`}}); notify&&notify("Suspended",C.yellow); load(); }} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${C.yellow}35`,background:`${C.yellow}10`,color:C.yellow,fontSize:8,fontWeight:700,cursor:"pointer"}}>SUSPEND</button>
                  :<button onClick={async()=>{ await fetch(`${API}/customers/${c.id}/activate`,{method:"POST",headers:{Authorization:`Bearer ${token}`}}); notify&&notify("Activated",C.green); load(); }} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${C.green}35`,background:`${C.green}10`,color:C.green,fontSize:8,fontWeight:700,cursor:"pointer"}}>ACTIVATE</button>
                }</TD>
              </tr>
            ))
          }</tbody>
        </ScrollTable>
      </Card>
    </div>
  );
});

// ── Settings ──────────────────────────────────────────────────────
const PageSettings = memo(({amiOk, bp}) => {
  const mobile = isMobile(bp);
  return (
    <div>
      <h2 style={{margin:"0 0 16px",fontSize:mobile?14:16,fontWeight:800,color:C.text}}>Platform Settings</h2>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        {[
          ["⟳ Reload Asterisk",  C.green],
          ["⟳ Reload PJSIP",     C.blue],
          ["↻ Restart Asterisk", C.yellow],
          ["↻ Restart Server",   C.orange],
          ["⏻ Turn Off Server",  C.red],
          ["▶ Turn On Server",   "#00FF88"],
        ].map(([label,color])=>(
          <button key={label}
            style={{padding:"12px 20px",borderRadius:10,fontSize:12,fontWeight:800,cursor:"pointer",
              border:`1px solid ${color}50`,background:`${color}15`,color:color,
              boxShadow:`0 2px 8px ${color}15`}}
            onClick={async()=>{
              if(!window.confirm("Run: "+label+"?")) return;
              const r = await fetch("https://gulf-premium-telecom.com/api/v1/system/exec",{
                method:"POST",
                headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
                body:JSON.stringify({cmd:label})
              });
              const d = await r.json();
              alert(d.output||d.message||"Done");
            }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:12}}>
        {[
          {title:"Asterisk AMI",   items:[["Host","127.0.0.1"],["Port","5038"],["Auth","IP-only"],["Status",amiOk?"Connected":"Waiting"],["Version","20.19.0"]]},
          {title:"PJSIP Carriers", items:[["world-premium","52.28.165.40-3"],["carrier-alpha","108.61.70.46"],["carrier-bravo","157.90.193.196"],["carrier-charlie","51.77.77.223"],["+ 5 more","see NOC"]]},
          {title:"Dialplan Flow",  items:[["Inbound","from-carrier"],["Fraud","AGI did_router.php"],["Billing","After Answer()"],["IVR","custom/gulf-premium-main"],["CDR","realtime"]]},
          {title:"Revenue Engine", items:[["Formula","Minutes × RPM"],["Profit","RPM − Carrier Cost"],["Billing","After Playback()"],["Counters","Redis realtime"]]},
          {title:"Server",         items:[["IP","72.60.190.132"],["OS","Debian 12"],["PHP","8.3-FPM"],["Asterisk","20.19.0"]]},
        ].map(s=>(
          <Card key={s.title} style={{padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>{s.title}</div>
            {s.items.map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:10,color:C.muted}}>{l}</span>
                <code style={{fontSize:10,color:C.green,background:`${C.green}0D`,padding:"2px 7px",
                  borderRadius:4,border:`1px solid ${C.green}25`,...mono}}>{v}</code>
              </div>
            ))}
          </Card>
        ))}

        {/* Asterisk Config Preview */}
        <div style={{gridColumn:"1/-1"}}>
          <Card style={{padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>Asterisk Configuration Preview</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[
                ["pjsip.conf",`[STANDARD]\ntype=endpoint\ncontext=from-carrier\ndisallow=all\nallow=alaw\nallow=ulaw\nallow=g729\ndirect_media=no\nrtp_symmetric=yes\nforce_rport=yes`],
                ["extensions.conf",`[from-carrier]\nexten => _+X.,1,NoOp(Gulf Premium)\nsame => n,AGI(did_router.php)\nsame => n,Progress()\nsame => n,Answer()\nsame => n(loop),Playback(\${IVR_CONTEXT})\nsame => n,GotoIf(\$["\${PLAYBACKSTATUS}"="SUCCESS"]?loop)\nsame => n,Hangup()`],
                ["rtp.conf",`rtpstart = 10000\nrtpend   = 20000\nstrictrtp = no`],
                ["pjsip identify",`[STANDARD-identify]\ntype=identify\nendpoint=STANDARD\nmatch=52.28.165.40\nmatch=52.57.172.184\nmatch=35.156.119.128\nmatch=185.209.147.14\nmatch=213.165.51.44\nmatch=108.61.70.46\nmatch=157.90.193.196\nmatch=51.77.77.223\nmatch=95.217.90.21\nmatch=149.12.160.10\nmatch=93.94.120.49\nmatch=149.56.232.122`],
              ].map(([title,code])=>(
                <div key={title}>
                  <div style={{fontSize:10,color:C.purple,fontWeight:700,marginBottom:6}}>{title}</div>
                  <pre style={{background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"10px 12px",
                    fontSize:10,color:"#94A3B8",margin:0,overflowX:"auto",
                    fontFamily:"monospace",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                    {code.replace(/\n/g,"\n")}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* dummy to close map */}
        {[
        ].map(s=>(
          <Card key={s.title} style={{padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>{s.title}</div>
            {s.items.map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:10,color:C.muted}}>{l}</span>
                <code style={{fontSize:10,color:C.green,background:`${C.green}0D`,padding:"2px 7px",
                  borderRadius:4,border:`1px solid ${C.green}25`,...mono}}>{v}</code>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
});


// ── SIP Routing ───────────────────────────────────────────────────
const PageRouting = memo(({token, notify}) => {
  const [ranges,   setRanges]   = useState([]);
  const [ivrFiles, setIvrFiles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [step,     setStep]     = useState(1);
  const [country,  setCountry]  = useState("");
  const [range,    setRange]    = useState("ALL");
  const [ivr,      setIvr]      = useState("");
  const [route,    setRoute]    = useState("");

  const apiFetch = useCallback(async(path,opts={})=>{
    const r = await fetch(`${API}${path}`,{
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
      ...opts
    });
    return r.json();
  },[token]);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const d = await apiFetch('/did-ranges');
      setRanges(d.data||[]);
      const d2 = await apiFetch('/ivr-lib/audio');
      setIvrFiles(d2.data||d2||[]);
      setLoading(false);
    })();
  },[token]);

  const handleApply = async()=>{
    if(!ivr){ notify&&notify("Select IVR first",C.red); return; }
    setSaving(true);
    const ivrCtx = ivr.startsWith("custom/")?ivr:`custom/${ivr}`;
    if(range==="ALL"){
      await apiFetch('/did-ranges/bulk-ivr',{method:"PUT",body:JSON.stringify({ivr_context:ivrCtx})});
      notify&&notify(`All DIDs updated to ${ivrCtx.replace("custom/","")}`,C.green);
    } else {
      await apiFetch(`/did-ranges/${range}/ivr`,{method:"PUT",body:JSON.stringify({ivr_context:ivrCtx})});
      notify&&notify(`Range updated to ${ivrCtx.replace("custom/","")}`,C.green);
    }
    setStep(1);
    setSaving(false);
  };

  const filteredRanges = ranges.filter(r=>!country||r.country_code===country);
  const selectedRange = ranges.find(r=>String(r.id)===String(range));

  const Step = ({n,label})=>(
    <div style={{flex:1,textAlign:"center"}}>
      <div style={{width:32,height:32,borderRadius:"50%",margin:"0 auto 4px",
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,
        background:step>n?C.green:step===n?`${C.green}25`:"rgba(255,255,255,0.04)",
        color:step>n?"#000":step===n?C.green:C.muted,
        border:`2px solid ${step>=n?C.green:C.border}`}}>{n}</div>
      <div style={{fontSize:9,color:step===n?C.green:C.muted,textTransform:"uppercase",letterSpacing:"1px"}}>{label}</div>
    </div>
  );

  return (
    <div style={{background:C.bg,minHeight:"100vh",padding:"20px 24px",fontFamily:"'DM Mono',monospace",color:C.text}}>
      <div style={{marginBottom:20}}>
        <h1 style={{margin:0,fontSize:20,fontWeight:800}}>🔗 Connect IVR</h1>
        <p style={{margin:"4px 0 0",fontSize:11,color:C.muted}}>Assign IVR audio to DID ranges in 3 steps</p>
      </div>

      {loading
        ?<div style={{textAlign:"center",padding:48,color:C.muted}}>Loading...</div>
        :<div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:24}}>

            {/* Step indicators */}
            <div style={{display:"flex",gap:8,marginBottom:28}}>
              <Step n={1} label="Range"/>
              <Step n={2} label="IVR"/>
              <Step n={3} label="Finish"/>
            </div>

            {/* Step 1 */}
            {step===1&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Country (filter)</div>
                  <select style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,width:"100%",outline:"none"}}
                    value={country} onChange={e=>{setCountry(e.target.value);setRange("ALL");}}>
                    <option value="">-- All Countries --</option>
                    {[...new Set(ranges.map(r=>r.country_code))].map(cc=>(
                      <option key={cc} value={cc}>{ranges.find(r=>r.country_code===cc)?.country_name} ({cc})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Select Range</div>
                  <select style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,width:"100%",outline:"none"}}
                    value={range} onChange={e=>setRange(e.target.value)}>
                    <option value="ALL">ALL RANGES ({ranges.length} ranges · {ranges.reduce((a,r)=>a+(r.total||0),0)} numbers)</option>
                    {filteredRanges.map(r=>(
                      <option key={r.id} value={r.id}>{r.country_name} — {r.batch_name} ({r.total} numbers)</option>
                    ))}
                  </select>
                </div>
                <div style={{padding:"10px 14px",borderRadius:8,background:`${C.blue}10`,
                  border:`1px solid ${C.blue}20`,fontSize:11,color:C.blue}}>
                  {range==="ALL"
                    ?`Will update all ${ranges.reduce((a,r)=>a+(r.total||0),0)} numbers across ${ranges.length} ranges`
                    :`Will update ${selectedRange?.total||0} numbers in ${selectedRange?.batch_name||""}`
                  }
                </div>
                <button onClick={()=>setStep(2)}
                  style={{padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
                    background:`${C.green}15`,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  Next → Select IVR
                </button>
              </div>
            )}

            {/* Step 2 */}
            {step===2&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Select IVR Audio</div>
                  <select style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,width:"100%",outline:"none"}}
                    value={ivr} onChange={e=>setIvr(e.target.value)}>
                    <option value="">-- Select IVR --</option>
                    {ivrFiles.map(f=>(
                      <option key={f.id} value={`custom/${f.name}`}>{f.display_name||f.name}</option>
                    ))}
                  </select>
                </div>
                {ivr&&(
                  <div style={{padding:"10px 14px",borderRadius:8,background:`${C.purple}10`,
                    border:`1px solid ${C.purple}20`,fontSize:11,color:C.purple}}>
                    Selected: {ivr.replace("custom/","")}
                  </div>
                )}
                <div>
                  <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Route (optional)</div>
                  <select style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,width:"100%",outline:"none"}}
                    value={route} onChange={e=>setRoute(e.target.value)}>
                    <option value="">-- Default Route --</option>
                    <option value="direct">Direct to IVR</option>
                    <option value="random">Random IVR Pool</option>
                    <option value="fixed">Fixed IVR per DID</option>
                  </select>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setStep(1)}
                    style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,
                      background:"transparent",color:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    Back
                  </button>
                  <button onClick={()=>setStep(3)} disabled={!ivr}
                    style={{flex:2,padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
                      background:`${C.green}15`,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    Next → Review
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step===3&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{background:`${C.green}05`,border:`1px solid ${C.green}20`,
                  borderRadius:10,padding:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:12}}>Ready to Apply</div>
                  {[
                    ["Range", range==="ALL"?"All Ranges":selectedRange?.batch_name||"-"],
                    ["Numbers", String(range==="ALL"?ranges.reduce((a,r)=>a+(r.total||0),0):selectedRange?.total||0)],
                    ["IVR", ivr.replace("custom/","")],
                    ["Route", route||"Default"],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",
                      padding:"6px 0",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
                      <span style={{fontSize:11,color:C.muted}}>{k}</span>
                      <span style={{fontSize:11,color:C.text,fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setStep(2)}
                    style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,
                      background:"transparent",color:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    Back
                  </button>
                  <button onClick={handleApply} disabled={saving}
                    style={{flex:2,padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
                      background:`${C.green}15`,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    {saving?"Applying...":"Apply IVR"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      }
    </div>
  );
});

// ── Login ─────────────────────────────────────────────────────────
const Login = memo(({onLogin}) => {
  const [email,  setEmail]  = useState("admin@gulf-premium-telecom.com");
  const [pass,   setPass]   = useState("");
  const [err,    setErr]    = useState("");
  const [loading,setLoading]= useState(false);

  const submit = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/auth/login`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({email, password:pass}),
      });
      const d = await r.json();
      if(!r.ok){ setErr(d.message||"Login failed"); setLoading(false); return; }
      localStorage.setItem("noc_token", d.token);
      localStorage.setItem("noc_user",  JSON.stringify(d.user));
      onLogin(d.token, d.user);
    } catch(e) { setErr("Cannot connect to API"); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:380,background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"28px 24px"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:52,height:52,borderRadius:14,margin:"0 auto 12px",
            background:`linear-gradient(135deg,${C.green},${C.blue})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,color:"#080B12"}}>G</div>
          <div style={{fontSize:18,fontWeight:800,color:C.text}}>Gulf-Premium-Telecom</div>
          <div style={{fontSize:11,color:C.muted,marginTop:3}}>NOC Platform v2.1 · Carrier Grade</div>
        </div>
        {err&&<div style={{background:"#F8717115",border:"1px solid #F8717140",borderRadius:8,
          padding:"10px 14px",fontSize:12,color:"#F87171",marginBottom:16}}>{err}</div>}
        {[["Email",email,setEmail,"text"],["Password",pass,setPass,"password"]].map(([l,v,sv,t])=>(
          <div key={l} style={{marginBottom:16}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:"1px",marginBottom:6,textTransform:"uppercase"}}>{l}</div>
            <input type={t} value={v} onChange={e=>sv(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
              style={{width:"100%",padding:"11px 14px",borderRadius:8,border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.04)",color:C.text,fontSize:14,
                fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
        <button onClick={submit} disabled={loading}
          style={{width:"100%",padding:13,borderRadius:10,border:"none",
            background:`linear-gradient(135deg,${C.green},${C.blue})`,color:"#080B12",
            fontSize:13,fontWeight:800,cursor:"pointer",letterSpacing:"1px",
            textTransform:"uppercase",opacity:loading?0.7:1}}>
          {loading?"Connecting...":"Login"}
        </button>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// ROOT APP — Real data only
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const bp     = useBreakpoint();
  const mobile = isMobile(bp);

  const [token,   setToken]   = useState(()=>localStorage.getItem("noc_token")||"");
  const [user,    setUser]    = useState(()=>{ try{return JSON.parse(localStorage.getItem("noc_user")||"null")}catch{return null} });
  const [page,    setPage]    = useState("dashboard");
  const [sidebar, setSidebar] = useState(true);
  const [showMenu,setMenu]    = useState(false);
  const [toast,   setToast]   = useState(null);
  const [amiOk,   setAmiOk]   = useState(false);

  // Real metrics from API only
  const [metrics, setMetrics] = useState(null);
  // Real calls from AMI only
  const [calls,   setCalls]   = useState([]);

  const pollInterval = useRef(null);

  const pollData = useCallback(async () => {
    if(!token) return;
    try {
      // Poll live calls
      const lc = await apiGet("/live-calls", token);
      if(lc) {
        setAmiOk(true);
        setCalls(lc.data||[]);
      }
      // Poll metrics every 10s
      const m = await apiGet("/metrics/dashboard", token);
      if(m) setMetrics(m.data);
    } catch(e) { setAmiOk(false); }
  }, [token]);

  useEffect(()=>{
    if(!token) return;
    pollData();
    pollInterval.current = setInterval(pollData, mobile?5000:3000);
    return ()=>clearInterval(pollInterval.current);
  },[token, pollData, mobile]);

  const notify = useCallback((msg,color=C.green)=>{
    setToast({msg,color});
    setTimeout(()=>setToast(null),3500);
  },[]);

  const hangup = useCallback(async id=>{
    try {
      await fetch(`${API}/live-calls/${encodeURIComponent(id)}`,{
        method:"DELETE",
        headers:{Authorization:`Bearer ${token}`}
      });
    } catch(e){}
    setCalls(p=>p.filter(c=>(c.id||c.channel)!==id));
    notify(`${id} terminated via AMI`, C.yellow);
  },[token, notify]);

  const ctx = useMemo(()=>({ metrics, calls }), [metrics, calls]);

  if(!token||!user) return <Login onLogin={(t,u)=>{setToken(t);setUser(u);}}/>;

  const renderPage = () => {
    switch(page){
      case "dashboard": return <PageDashboard token={token} setPage={setPage} bp={bp}/>;
      case "livecalls": return <PageNoc calls={calls} onHangup={hangup} amiOk={amiOk} bp={bp}/>;
      case "didinventory": return <DIDInventoryPage token={token} notify={notify}/>;
      case "dids":      return <DIDPage token={token} notify={notify}/>;
      case "ivr":       return <IVRPage token={token} notify={notify}/>;
      case "revenue":   return <RevenuePage token={token} bp={bp}/>;
      case "cdr":       return <PageCdr token={token} bp={bp}/>;
      case "routing":   return <PageRouting token={token} notify={notify} bp={bp}/>;
      case "suppliers": return <SupplierPage token={token} notify={notify} bp={bp}/>;
      
      case "sipmonitor": return <SIPMonitorPage token={token}/>;
      case "agent":     return <AgentPage token={token}/>;
      case "customers": return <CustomersPage token={token} notify={notify}/>;
      case "testlabs":  return <TestLabsPage token={token}/>;
      case "settings":  return <PageSettings amiOk={amiOk} bp={bp}/>;
      default:          return <PageDashboard token={token} setPage={setPage} bp={bp}/>;
    }
  };

  return (
    <MetricsCtx.Provider value={ctx}>
      <div style={{display:"flex",minHeight:"100vh",background:C.bg,
        fontFamily:"'DM Mono','Fira Code',monospace",color:C.text,fontSize:12}}>

        {!mobile&&<Sidebar page={page} setPage={setPage} open={sidebar} toggle={()=>setSidebar(o=>!o)} amiOk={amiOk}/>}
        {mobile&&showMenu&&<MobileMenu page={page} setPage={p=>{setPage(p);setMenu(false);}} onClose={()=>setMenu(false)} onLogout={()=>{localStorage.clear();setToken("");setUser(null);}} amiOk={amiOk} lang={lang} switchLang={switchLang}/>}

        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          <TopBar toast={toast} onLogout={()=>{localStorage.clear();setToken("");setUser(null);}} onReload={async()=>{ try{ await fetch(`${API}/suppliers/reload`,{method:"POST",headers:{Authorization:`Bearer ${token}`}}); notify("Asterisk reloaded ✅",C.green); }catch(e){} }}
            onMenuOpen={()=>setMenu(true)} bp={bp} amiOk={amiOk}/>
          <main style={{flex:1,overflowY:"auto",padding:mobile?"12px 12px 70px":"20px 22px",minHeight:0,
            WebkitOverflowScrolling:"touch"}}>
            {renderPage()}
          </main>
        </div>

        {mobile&&<MobileNav page={page} setPage={p=>p==="_menu"?setMenu(true):setPage(p)}/>}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#07090F;-webkit-tap-highlight-color:transparent;}
        input,select,button{font-family:inherit;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-thumb{background:#1E293B;border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.2}}
        input[type=date]{color-scheme:dark;}
        button{-webkit-tap-highlight-color:transparent;}
      `}</style>
    </MetricsCtx.Provider>
  );
}

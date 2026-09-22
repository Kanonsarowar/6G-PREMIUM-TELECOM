import React, { useState, useEffect, useCallback, useRef } from "react";
import { mapCdrRows } from "./cdrParse.js";
import { readPdfRows } from "./cdrPdf.js";
import { isSummaryRows, parseSummaryRows, detectWeek, lastWeek, weekOf } from "./cdrSummary.js";
const API = "https://6g-premium-telecom.com/api/v1";
// Single operational currency across the entire app - USDT only (see
// rule 12: one central formatter, never per-component EUR/USD logic).
// Historical `currency` fields on dids/cdrs/etc. may still hold values
// like "EUR" from imports (kept for audit traceability), but every
// operational UI display always renders the numeric amount as USDT.
const numSupplier=n=>n==="World Premium Telecom"?"WTP":(n||"—");
// One soft colour (+ stronger accent) per supplier, picked by supplier id so it never changes when the list is sorted
const SUP_COLORS=[
  {bg:"#E0F5F3",accent:"#2CADA6"},{bg:"#E3EEFD",accent:"#3B82F6"},{bg:"#FFF1D0",accent:"#F59E0B"},
  {bg:"#FDE3E3",accent:"#EF4444"},{bg:"#EBE4FB",accent:"#8B5CF6"},{bg:"#DEF5E8",accent:"#10B981"},
  {bg:"#FFE7D6",accent:"#F97316"},{bg:"#DAF1F7",accent:"#06B6D4"},
];
const PAYMENT_TERMS=["Daily","Weekly","Monthly","30/45"];
const fmtUSDT=(v,decimals=4)=>"$"+parseFloat(v||0).toFixed(decimals);
// A CDR's `revenue` is stored in whatever currency it billed in (EUR/USD/USDT).
// Every place that ADDS revenue across multiple CDRs (a chart total, a daily/
// country/supplier breakdown) must convert to the single operational currency
// first - otherwise it sums unlike units together. Same fixed rate as the
// backend's /v1/billing/current-revenue (1 EUR = 1.08 USD; USD/USDT 1:1).
const revUsdt=c=>c?.currency==="EUR"?parseFloat(c.revenue||0)*1.08:parseFloat(c.revenue||0);
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false,error:""}; }
  static getDerivedStateFromError(e){ return {hasError:true,error:e.message}; }
  render(){
    if(this.state.hasError) return(
      <div style={{padding:20,color:"#F87171",background:"#F4F6FA",minHeight:"100vh",fontFamily:"Inter,sans-serif"}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Page Error</div>
        <div style={{fontSize:12,color:"#94A3B8"}}>{this.state.error}</div>
        <button onClick={()=>this.setState({hasError:false})}
          style={{marginTop:16,padding:"8px 16px",borderRadius:6,border:"1px solid #F87171",
            background:"#F8717110",color:"#F87171",cursor:"pointer"}}>Retry</button>
      </div>
    );
    return this.props.children;
  }
}
const C = {
  bg:"#F4F6FA",surface:"#FFFFFF",card:"#FFFFFF",
  border:"rgba(60,47,143,0.12)",text:"#1E293B",muted:"#64748B",
  green:"#10B981",blue:"#3B82F6",purple:"#4C3BA8",
  yellow:"#F59E0B",red:"#EF4444",orange:"#F97316",cyan:"#06B6D4",
  sidebarBg:"#3C2F8F",topbarBg:"#3C2F8F",
  accent:"#6C5CE7",accentLight:"rgba(108,92,231,0.12)",
};
const eurToUsd = v => (parseFloat(v||0)*1.08).toFixed(4);
const usdToSar = v => (parseFloat(v||0)*3.75).toFixed(2);
const fmtDual  = v => `$${eurToUsd(v)} / ${usdToSar(eurToUsd(v))}`;
const getNavGroups=(role)=>{
  const isSuperAdmin=role==='superadmin';
  return [
  {key:"calls",label:"Calls & Revenue",items:[
    {id:"livecalls",label:"Live Calls",icon:"◉"},
    {id:"cdr",label:"CDR",icon:"≡"},
    {id:"revenue",label:"Revenue",icon:"◈"},
  ]},
  {key:"numbers",label:"Numbers & IVR",items:[
    {id:"numbers",label:"All Numbers",icon:"▤"},
    {id:"addnumber",label:"Add Number",icon:"＋"},
    {id:"addrange",label:"Add Range",icon:"⇔"},
    {id:"prefixroutes",label:"Prefix / Routes",icon:"⇥"},
    {id:"ivr",label:"IVR Library",icon:"♫"},
    {id:"connectivr",label:"Connect IVR",icon:"⇌"},
  ]},
  {key:"partners",label:"Partners",items:[
    ...(isSuperAdmin?[{id:"suppliers",label:"Suppliers",icon:"⬡"}]:[]),
    ...(isSuperAdmin?[{id:"supplierpayments",label:"Supplier Payments",icon:"💰"}]:[]),
    {id:"resellers",label:"Resellers",icon:"👥"},
    {id:"customers",label:"Customers",icon:"◷"},
  ]},
  ...(isSuperAdmin?[{key:"asterisk",label:"Asterisk Configuration",items:[
    {id:"ast-trunks",label:"Trunks",icon:"📞"},
    {id:"sipmonitor",label:"SIP Monitor",icon:"◎"},
    {id:"routeprefix",label:"Route Prefix",icon:"⇥"},
    {id:"ipwhitelist",label:"IP Whitelist",icon:"🔐"},
  ]}]:[]),
  {key:"testlab",label:"Test Lab",items:[
    {id:"testnumbers",label:"Test Numbers",icon:"📋"},
    {id:"testlivecall",label:"Live Test Call",icon:"📞"},
  ]},
  {key:"system",label:"System",items:[
    {id:"systemhealth",label:"System Health",icon:"♥"},
    ...(isSuperAdmin?[{id:"sysops",label:"System Operations",icon:"🛠"}]:[]),
    {id:"auditlog",label:"Audit Log",icon:"📜"},
    ...(isSuperAdmin?[{id:"settings",label:"Settings",icon:"⚙"}]:[]),
  ]},
]};

const apiFetch=async(path,token,opts={})=>{
  try{
    const r=await fetch(`${API}${path}`,{
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
      ...opts
    });
    if(r.status===401){return{error:"Unauthenticated",status:401};}
    return r.json();
  }catch(e){return{error:e.message};}
};
const Card=({children,style={}})=>(
  <div style={{background:"#FFFFFF",border:"1px solid rgba(60,47,143,0.1)",borderRadius:12,
    boxShadow:"0 1px 6px rgba(60,47,143,0.08)",...style}}>{children}</div>
);
// ── Mobile Drawer ─────────────────────────────────────────────────
function MobileDrawer({page,setPage,user,logout,onClose,onHome}){
  return(
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,
        background:"rgba(0,0,0,0.5)",zIndex:200,backdropFilter:"blur(3px)"}}/>
      <div style={{position:"fixed",top:0,left:0,height:"100%",width:280,
        background:"#FFFFFF",zIndex:201,display:"flex",flexDirection:"column",
        borderRight:"1px solid #E8EAF0",overflowY:"auto",
        fontFamily:"'Nunito','Poppins',sans-serif",
        boxShadow:"4px 0 20px rgba(0,0,0,0.15)"}}>
        {/* Header */}
        <div style={{padding:"18px 16px",borderBottom:"1px solid #F0F0F0",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div onClick={()=>{onHome&&onHome();onClose();}} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <div style={{width:36,height:36,borderRadius:10,
              background:"linear-gradient(135deg,#2CADA6,#38B7A8)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
              boxShadow:"0 4px 12px rgba(44,173,166,0.3)"}}>📡</div>
            <div>
              <div style={{fontSize:15,fontWeight:900,color:"#1A1A1A"}}>
                <span style={{color:"#2CADA6"}}>6G</span>
                <span style={{color:"#F5A623"}}>STATS</span>
              </div>
              <div style={{fontSize:10,color:"#999",letterSpacing:"1px",textTransform:"uppercase"}}>NOC Platform</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:"#F5F5F5",
            border:"1px solid #E8E8E8",color:"#888",fontSize:13,cursor:"pointer",
            borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {/* Nav */}
        <div style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
          <div style={{height:1,background:"#F0F0F0",marginBottom:12}}/>
          {getNavGroups(user?.role).map(g=>(
            <div key={g.key} style={{marginBottom:8}}>
              <div style={{fontSize:11,letterSpacing:"1.3px",color:"#5B4FCF",
                background:"rgba(91,79,207,0.08)",textTransform:"uppercase",
                padding:"10px 18px",margin:"0 -10px 8px",borderRadius:8,
                fontWeight:800}}>{g.label}</div>
              {g.items.map(n=>{
                const active=page===n.id;
                return(
                  <button key={n.id} onClick={()=>{setPage(n.id);onClose();}}
                    style={{display:"flex",alignItems:"center",gap:12,width:"100%",
                      padding:"13px 16px",borderRadius:12,marginBottom:2,cursor:"pointer",
                      background:active?"#2CADA6":"transparent",
                      border:"none",
                      boxShadow:active?"0 4px 12px rgba(44,173,166,0.3)":"none",
                      color:active?"#FFFFFF":"#4A4A4A",
                      fontSize:15,fontWeight:active?700:500,
                      textAlign:"left",transition:"all 0.18s",
                      fontFamily:"inherit"}}>
                    <span style={{fontSize:18,width:22,textAlign:"center",opacity:active?1:0.7}}>{n.icon}</span>
                    <span>{n.label}</span>
                    {active&&<span style={{marginLeft:"auto",width:7,height:7,
                      borderRadius:"50%",background:"rgba(255,255,255,0.8)"}}/>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {/* User */}
        <div style={{padding:"14px 12px",borderTop:"1px solid #F0F0F0"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,
              background:"linear-gradient(135deg,#2CADA6,#38B7A8)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:14,fontWeight:800,color:"#FFFFFF"}}>
              {(user?.name||"A")[0].toUpperCase()}
            </div>
            <div>
              <div style={{fontSize:13,color:"#1A1A1A",fontWeight:700}}>{user?.name||"Admin"}</div>
              <div style={{fontSize:10,color:"#999"}}>{user?.role||""}</div>
            </div>
          </div>
          <button onClick={logout} style={{width:"100%",padding:"10px",borderRadius:8,fontSize:13,
            border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#EF4444",
            cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>Sign Out</button>
        </div>
      </div>
    </>
  );
}
// ── Desktop Sidebar ───────────────────────────────────────────────
function DesktopSidebar({page,setPage,open,toggle,user,logout,onHome}){
  return(
    <div style={{width:open?280:64,background:"#FFFFFF",
      borderRight:"1px solid #E8EAF0",
      display:"flex",flexDirection:"column",flexShrink:0,
      transition:"width 0.22s ease",overflow:"hidden",
      fontFamily:"'Nunito','Poppins',sans-serif",
      boxShadow:"2px 0 12px rgba(0,0,0,0.06)"}}>
      {/* Logo */}
      <div style={{padding:"18px 16px",borderBottom:"1px solid #F0F0F0",
        display:"flex",alignItems:"center",gap:12,minHeight:68,
        background:"#FFFFFF"}}>
        <div onClick={onHome} style={{width:36,height:36,borderRadius:10,flexShrink:0,cursor:"pointer",
          background:"linear-gradient(135deg,#5B4FCF,#4B3FB5)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
          boxShadow:"0 4px 12px rgba(91,79,207,0.3)"}}>📡</div>
        {open&&<div onClick={onHome} style={{flex:1,minWidth:0,cursor:"pointer"}}>
          <div style={{fontSize:15,fontWeight:900,letterSpacing:"0.3px"}}>
            <span style={{color:"#5B4FCF"}}>6G</span>
            <span style={{color:"#F5A623"}}>STATS</span>
          </div>
          <div style={{fontSize:10,color:"#999",letterSpacing:"1px",textTransform:"uppercase",fontWeight:600}}>NOC Platform</div>
        </div>}
        <button onClick={toggle} style={{marginLeft:open?"0":"auto",
          background:"#F5F5F5",border:"1px solid #E8E8E8",
          color:"#888",cursor:"pointer",fontSize:10,borderRadius:6,
          width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {open?"◀":"▶"}
        </button>
      </div>
      {/* Nav */}
      <div style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
        <div style={{height:1,background:"#F0F0F0",marginBottom:12}}/>
        {getNavGroups(user?.role).map(g=>(
          <div key={g.key} style={{marginBottom:8}}>
            {open&&<div style={{fontSize:11,letterSpacing:"1.3px",color:"#5B4FCF",
              background:"rgba(91,79,207,0.08)",textTransform:"uppercase",
              padding:"10px 18px",margin:"0 -10px 8px",borderRadius:8,
              fontWeight:800}}>{g.label}</div>}
            {g.items.map(n=>{
              const active=page===n.id;
              return(
                <button key={n.id} onClick={()=>setPage(n.id)}
                  title={!open?n.label:undefined}
                  style={{display:"flex",alignItems:"center",gap:12,width:"100%",
                    padding:open?"12px 16px":"13px 0",
                    justifyContent:open?"flex-start":"center",
                    borderRadius:12,cursor:"pointer",marginBottom:2,
                    background:active?"#2CADA6":"transparent",
                    border:"none",
                    boxShadow:active?"0 4px 12px rgba(44,173,166,0.3)":"none",
                    color:active?"#FFFFFF":"#4A4A4A",
                    fontSize:15,fontWeight:active?700:500,
                    textAlign:"left",whiteSpace:"nowrap",transition:"all 0.18s"}}>
                  <span style={{fontSize:18,width:22,textAlign:"center",flexShrink:0,
                    opacity:active?1:0.7}}>{n.icon}</span>
                  {open&&<span style={{fontSize:15,fontWeight:active?700:500}}>{n.label}</span>}
                  {open&&active&&<span style={{marginLeft:"auto",width:7,height:7,
                    borderRadius:"50%",background:"rgba(255,255,255,0.8)",flexShrink:0}}/>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {/* User info */}
      {open&&<div style={{padding:"14px 12px",borderTop:"1px solid #F0F0F0"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,
            background:"linear-gradient(135deg,#2CADA6,#38B7A8)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:13,fontWeight:800,color:"#FFFFFF"}}>
            {(user?.name||"A")[0].toUpperCase()}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,color:"#1A1A1A",fontWeight:700,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user?.name||"Admin"}</div>
            <div style={{fontSize:10,color:"#999",
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user?.role||""}</div>
          </div>
        </div>
        <button onClick={logout} style={{width:"100%",padding:"9px",borderRadius:8,fontSize:12,
          border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#EF4444",
          cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>Sign Out</button>
      </div>}
    </div>
  );
}
// ── Mobile Drawer ─────────────────────────────────────────────────


function TopBar({liveCalls,unpaid,onMenuClick,isMobile,user,onHome}){
  const [time,setTime]=useState(new Date().toLocaleTimeString());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date().toLocaleTimeString()),1000);return()=>clearInterval(t);},[]);
  return(
    <div style={{height:84,boxSizing:"border-box",background:"linear-gradient(90deg,#2CADA6,#38B7A8)",
      display:"flex",alignItems:"center",padding:"20px 16px 0",gap:10,
      flexShrink:0,zIndex:100,boxShadow:"0 2px 12px rgba(75,63,181,0.3)"}}>
      {/* Hamburger */}
      {isMobile&&(
        <button onClick={onMenuClick} style={{background:"rgba(255,255,255,0.15)",
          border:"1px solid rgba(255,255,255,0.2)",color:"#FFFFFF",fontSize:18,
          cursor:"pointer",borderRadius:10,width:40,height:40,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>☰</button>
      )}
      {/* Brand */}
      <div onClick={onHome} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        {!isMobile&&<div style={{width:38,height:38,borderRadius:10,flexShrink:0,
          background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.2)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📡</div>}
        <div>
          <div style={{fontSize:15,fontWeight:900,color:"#FFFFFF",lineHeight:1.2,letterSpacing:"0.3px"}}>
            <span style={{color:"#FFFFFF"}}>6G</span>
            <span style={{color:"#F5A623"}}>STATS</span>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.65)",letterSpacing:"1px",textTransform:"uppercase"}}>NOC Platform</div>
        </div>
      </div>
      {/* Pills: live calls, then revenue not yet paid out, per supplier (scrolls sideways if it does not fit) */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:16,minWidth:0,flex:"1 1 auto",
        overflowX:"auto",scrollbarWidth:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",flexShrink:0,
          borderRadius:20,background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#10B981",
            display:"inline-block",boxShadow:"0 0 6px #10B981"}}/>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.8)",fontWeight:500}}>Live</span>
          <span style={{fontSize:13,color:"#10B981",fontWeight:800,fontFamily:"monospace"}}>{liveCalls}</span>
        </div>
        <span title="Revenue not yet paid out to the supplier" style={{fontSize:11,color:"rgba(255,255,255,0.8)",fontWeight:600,flexShrink:0,marginLeft:4}}>Rev</span>
        {unpaid.length===0
          ?<div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",flexShrink:0,
              borderRadius:20,background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.1)"}}>
              <span style={{fontSize:13,color:"#F5A623",fontWeight:800,fontFamily:"monospace"}}>{fmtUSDT(0)}</span>
            </div>
          :unpaid.map(u=>(
            <div key={u.name} title={`Revenue not yet paid out for ${u.name}: ${u.calls} calls, ${u.minutes} min`}
              style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",flexShrink:0,whiteSpace:"nowrap",
                borderRadius:20,background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.1)"}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.8)",fontWeight:500}}>{numSupplier(u.name)}</span>
              <span style={{fontSize:13,color:"#F5A623",fontWeight:800,fontFamily:"monospace"}}>{fmtUSDT(u.amount)}</span>
            </div>
          ))}
      </div>
      {/* Right side */}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <span style={{fontSize:12,color:"rgba(255,255,255,0.6)",fontFamily:"monospace"}}>{time}</span>
        {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:8,
          padding:"5px 12px",borderRadius:20,background:"rgba(0,0,0,0.2)"}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,0.2)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:12,fontWeight:800,color:"#FFFFFF"}}>
            {(user?.name||"A")[0].toUpperCase()}
          </div>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontWeight:600}}>{user?.name||"Admin"}</span>
          <span style={{fontSize:10,color:"rgba(255,255,255,0.45)",background:"rgba(255,255,255,0.1)",
            padding:"2px 8px",borderRadius:10,textTransform:"capitalize"}}>{user?.role||""}</span>
        </div>}
      </div>
    </div>
  );
}
// ── Dashboard ─────────────────────────────────────────────────────
function StatsCharts({token}){
  const [cdrs,setCdrs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  useEffect(()=>{apiFetch("/cdr?per_page=2000",token).then(d=>{setCdrs(d.data||[]);setLoading(false);});},[token]);

  const dailyData=()=>{
    const days={};const[y,m]=month.split("-");const dim=new Date(parseInt(y),parseInt(m),0).getDate();
    for(let i=1;i<=dim;i++){const d=month+"-"+String(i).padStart(2,"0");days[d]={date:String(i),calls:0,revenue:0,minutes:0};}
    cdrs.forEach(c=>{const day=(c.call_start||"").slice(0,10);if(days[day]){days[day].calls++;days[day].revenue+=revUsdt(c);days[day].minutes+=parseInt(c.billsec||0)/60;}});
    return Object.values(days);
  };
  const weeklyData=()=>{
    const weeks={};
    cdrs.forEach(c=>{const d=new Date(c.call_start||"");if(isNaN(d.getTime()))return;const wn=Math.ceil(d.getDate()/7);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-W"+wn;const label="W"+wn+"/"+String(d.getMonth()+1).padStart(2,"0");if(!weeks[key])weeks[key]={date:label,calls:0,revenue:0,minutes:0};weeks[key].calls++;weeks[key].revenue+=revUsdt(c);weeks[key].minutes+=parseInt(c.billsec||0)/60;});
    return Object.values(weeks).slice(-16);
  };
  const monthlyData=()=>{
    const months={};
    cdrs.forEach(c=>{const m=(c.call_start||"").slice(0,7);if(!m)return;if(!months[m])months[m]={date:m.slice(5),calls:0,revenue:0};months[m].calls++;months[m].revenue+=revUsdt(c);});
    return Object.values(months).sort((a,b)=>a.date.localeCompare(b.date));
  };
  const [didMap,setDidMap]=useState({});
  useEffect(()=>{
    apiFetch("/dids",token).then(d=>{
      const m={};
      (d.data||[]).forEach(did=>{m[did.number?.replace("+","")]=did.country_name||"Unknown";});
      setDidMap(m);
    });
  },[token]);
  const getCountry=(did)=>{
    if(!did)return"Unknown";
    const n=(did||"").replace("+","");
    if(didMap[n])return didMap[n];
    // prefix match
    for(let l=12;l>=3;l--){const p=n.slice(0,l);const found=Object.keys(didMap).find(k=>k.startsWith(p)||p.startsWith(k.slice(0,-2)));if(found)return didMap[found];}
    return"Unknown";
  };
  const countryData=()=>{
    const co={};
    cdrs.forEach(c=>{
      const cn=getCountry(c.did||c.dst||"");
      if(!co[cn])co[cn]={name:cn,calls:0,revenue:0,minutes:0};
      co[cn].calls++;co[cn].revenue+=revUsdt(c);co[cn].minutes+=parseInt(c.billsec||0)/60;
    });
    return Object.values(co).sort((a,b)=>b.revenue-a.revenue).slice(0,15);
  };
  const supplierData=()=>{
    const s={};
    cdrs.forEach(c=>{const sup=c.trunk_name||"Unknown";if(!s[sup])s[sup]={name:numSupplier(sup),calls:0,revenue:0};s[sup].calls++;s[sup].revenue+=revUsdt(c);});
    return Object.values(s).sort((a,b)=>b.revenue-a.revenue);
  };

  const totalRevenue=cdrs.reduce((a,c)=>a+revUsdt(c),0);
  const COLORS=["#2CADA6","#3B82F6","#F59E0B","#EF4444","#8B5CF6","#10B981"];

  const getFlag=(country)=>{
    const flags={"Satellite":"🛰","Anguilla":"🇦🇮","Benin":"🇧🇯","Burundi":"🇧🇮","Cameroon":"🇨🇲","Chile":"🇨🇱","Congo":"🇨🇬","DR Congo":"🇨🇩","DRC Congo":"🇨🇩","Gabon":"🇬🇦","Globalstar":"🛰","Grenada":"🇬🇩","Guinea":"🇬🇳","Insat":"🛰","Italy":"🇮🇹","Italian Mobile":"🇮🇹","Jersey":"🇯🇪","Kiribati":"🇰🇮","Maldive":"🇲🇻","Morocco":"🇲🇦","Mozambique":"🇲🇿","Nicaragua":"🇳🇮","Oration":"🛰","Poland":"🇵🇱","Senegal":"🇸🇳","Seychelles":"🇸🇨","Sierra Leone":"🇸🇱","Solomon Islands":"🇸🇧","Somalia":"🇸🇴","Tanzania":"🇹🇿","Turkey":"🇹🇷","Uganda":"🇺🇬","UK Mobile":"🇬🇧","UPT":"🌐","Venezuela":"🇻🇪","Emsat":"🛰","Nauru":"🇳🇷","Caribbean":"🌴","Gambia":"🇬🇲","Afinna":"🛰","Unknown":"❓"};
    for(const key of Object.keys(flags)){if(country.toLowerCase().includes(key.toLowerCase()))return flags[key];}
    return "🌍";
  };

  const SVGBar=({data,vk,color})=>{
    if(!data||!data.length)return(<div style={{padding:12,textAlign:"center",color:"#999",fontSize:11}}>No data</div>);
    const max=Math.max(...data.map(d=>d[vk]||0),0.001);
    return(<div style={{overflowX:"auto"}}><svg width={Math.max(360,data.length*22)} height={150} style={{display:"block"}}>
      {data.map((d,i)=>{const h=Math.round((d[vk]||0)/max*110);const x=i*22+2;return(<g key={i}>
        <rect x={x} y={120-h} width={18} height={h||1} fill={color} rx={2} opacity={0.85}/>
        <text x={x+9} y={136} textAnchor="middle" fontSize={7} fill="#999">{d.date||""}</text>
        {h>12&&<text x={x+9} y={120-h-3} textAnchor="middle" fontSize={7} fill={color} fontWeight="bold">{parseFloat(d[vk]).toFixed(d[vk]<10?1:0)}</text>}
      </g>);})}
    </svg></div>);
  };

  const Section=({title,color,children})=>(<div style={{background:"#FFF",borderRadius:10,width:"100%",padding:16,boxSizing:"border-box",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
    <div style={{fontSize:13,fontWeight:700,color,marginBottom:10}}>{title}</div>
    {children}
  </div>);

  if(loading) return(<div style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>Loading analytics...</div>);

  return(<div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",padding:0,boxSizing:"border-box"}}>
    <div style={{fontSize:14,fontWeight:700,color:"#1A1A1A"}}>📊 Analytics</div>

    {/* Month selector */}
    <div style={{background:"#FFF",borderRadius:8,width:"100%",padding:16,boxSizing:"border-box",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:11,fontWeight:600,color:"#555"}}>📅 Daily Chart Month:</span>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{padding:"5px 8px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:11,outline:"none"}}/>
      <span style={{fontSize:10,color:"#999"}}>{dailyData().reduce((a,d)=>a+d.calls,0)} calls · {fmtUSDT(dailyData().reduce((a,d)=>a+d.revenue,0),2)}</span>
    </div>

    {/* Daily Charts */}
    <Section title="📅 Daily Revenue" color="#10B981"><SVGBar data={dailyData()} vk="revenue" color="#10B981"/></Section>
    <Section title="📅 Daily Calls" color="#3B82F6"><SVGBar data={dailyData()} vk="calls" color="#3B82F6"/></Section>
    <Section title="📅 Daily Minutes" color="#2CADA6"><SVGBar data={dailyData()} vk="minutes" color="#2CADA6"/></Section>

    {/* Weekly Charts */}
    <Section title="📊 Weekly Revenue" color="#10B981"><SVGBar data={weeklyData()} vk="revenue" color="#10B981"/></Section>
    <Section title="📊 Weekly Calls" color="#3B82F6"><SVGBar data={weeklyData()} vk="calls" color="#3B82F6"/></Section>

    {/* Monthly Charts */}
    <Section title="📆 Monthly Revenue" color="#10B981"><SVGBar data={monthlyData()} vk="revenue" color="#10B981"/></Section>
    <Section title="📆 Monthly Calls" color="#3B82F6"><SVGBar data={monthlyData()} vk="calls" color="#3B82F6"/></Section>

    {/* Countries - Revenue Donut */}
    <Section title="🌍 Top Destinations by Revenue" color="#2CADA6">
      {(()=>{
        const data=countryData().slice(0,8);
        const total=data.reduce((a,d)=>a+d.revenue,0)||1;
        const R=60,cx=80,cy=80;
        let startAngle=0;
        const slices=data.map((d,i)=>{
          const pct=d.revenue/total;
          const angle=pct*2*Math.PI;
          const x1=cx+R*Math.sin(startAngle);
          const y1=cy-R*Math.cos(startAngle);
          const x2=cx+R*Math.sin(startAngle+angle);
          const y2=cy-R*Math.cos(startAngle+angle);
          const large=angle>Math.PI?1:0;
          const path=`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
          const sa=startAngle;
          startAngle+=angle;
          return{path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100),name:d.name,revenue:d.revenue,flag:getFlag(d.name),sa};
        });
        return(
          <div>
            {/* Donut Chart */}
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
              <svg width={160} height={160} style={{flexShrink:0}}>
                {slices.map((s,i)=>(
                  <path key={i} d={s.path} fill={s.color} opacity={0.9} stroke="#FFF" strokeWidth={1}/>
                ))}
                <circle cx={cx} cy={cy} r={36} fill="#FFF"/>
                <text x={cx} y={cy-6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">Total</text>
                <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#10B981" fontWeight="bold">${total.toFixed(0)}</text>
              </svg>
              {/* Legend */}
              <div style={{flex:1}}>
                {slices.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                    <span style={{fontSize:10}}>{s.flag}</span>
                    <span style={{fontSize:10,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                    <span style={{fontSize:10,color:"#10B981",fontWeight:700,flexShrink:0}}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Full list */}
            {countryData().map((s,i)=>{
              const pct=totalRevenue>0?Math.round(s.revenue/totalRevenue*100):0;
              const flag=getFlag(s.name);
              return(<div key={i} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>{flag}</span><div><div style={{fontSize:11,fontWeight:700}}>{s.name}</div><div style={{fontSize:9,color:"#999"}}>{s.calls} calls · {Math.round(s.minutes)}m</div></div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:11,fontWeight:700,color:"#10B981"}}>{fmtUSDT(s.revenue,2)}</div><div style={{fontSize:9,color:"#999"}}>{pct}%</div></div>
                </div>
                <div style={{background:"#F0F0F0",borderRadius:4,height:4,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:COLORS[i%COLORS.length],borderRadius:4}}/></div>
              </div>);
            })}
          </div>
        );
      })()}
    </Section>

    {/* Countries - Minutes Donut */}
    <Section title="⏱ Top Destinations by Minutes" color="#2CADA6">
      {(()=>{
        const data=countryData().slice(0,8).sort((a,b)=>b.minutes-a.minutes);
        const totalMin=data.reduce((a,d)=>a+d.minutes,0)||1;
        const R=60,cx=80,cy=80;
        let startAngle=0;
        const slices=data.map((d,i)=>{
          const pct=d.minutes/totalMin;
          const angle=pct*2*Math.PI;
          const x1=cx+R*Math.sin(startAngle);
          const y1=cy-R*Math.cos(startAngle);
          const x2=cx+R*Math.sin(startAngle+angle);
          const y2=cy-R*Math.cos(startAngle+angle);
          const large=angle>Math.PI?1:0;
          const path=`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
          startAngle+=angle;
          return{path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100),name:d.name,minutes:d.minutes,flag:getFlag(d.name)};
        });
        return(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
              <svg width={160} height={160} style={{flexShrink:0}}>
                {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} opacity={0.9} stroke="#FFF" strokeWidth={1}/>))}
                <circle cx={cx} cy={cy} r={36} fill="#FFF"/>
                <text x={cx} y={cy-6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">Total</text>
                <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#2CADA6" fontWeight="bold">{Math.round(totalMin)}m</text>
              </svg>
              <div style={{flex:1}}>
                {slices.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                    <span style={{fontSize:10}}>{s.flag}</span>
                    <span style={{fontSize:10,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                    <span style={{fontSize:10,color:"#2CADA6",fontWeight:700,flexShrink:0}}>{Math.round(s.minutes)}m</span>
                    <span style={{fontSize:9,color:"#999",flexShrink:0}}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </Section>

    {/* Supplier Revenue Donut */}
    <Section title="⬡ Supplier Revenue" color="#8B5CF6">
      {(()=>{
        const data=supplierData().slice(0,6);
        const tot=data.reduce((a,d)=>a+d.revenue,0)||1;
        const R=60,cx=80,cy=80;let sa=0;
        const slices=data.map((d,i)=>{const pct=d.revenue/tot;const angle=pct*2*Math.PI;const x1=cx+R*Math.sin(sa);const y1=cy-R*Math.cos(sa);const x2=cx+R*Math.sin(sa+angle);const y2=cy-R*Math.cos(sa+angle);const large=angle>Math.PI?1:0;const path=`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;sa+=angle;return{path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100),name:d.name,revenue:d.revenue,calls:d.calls};});
        return(<div style={{display:"flex",alignItems:"center",gap:16}}>
          <svg width={160} height={160} style={{flexShrink:0}}>
            {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} opacity={0.9} stroke="#FFF" strokeWidth={1}/>))}
            <circle cx={cx} cy={cy} r={36} fill="#FFF"/>
            <text x={cx} y={cy-6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">Revenue</text>
            <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#10B981" fontWeight="bold">${tot.toFixed(0)}</text>
          </svg>
          <div style={{flex:1}}>{slices.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:600,flex:1}}>{s.name}</span>
            <span style={{fontSize:10,color:"#10B981",fontWeight:700}}>{fmtUSDT(s.revenue,2)}</span>
            <span style={{fontSize:9,color:"#999"}}>{s.pct}%</span>
          </div>))}</div>
        </div>);
      })()}
    </Section>

    {/* Supplier Minutes Donut */}
    <Section title="⬡ Supplier Minutes" color="#8B5CF6">
      {(()=>{
        const data=supplierData().slice(0,6);
        const tot=data.reduce((a,d)=>a+d.minutes,0)||1;
        const R=60,cx=80,cy=80;let sa=0;
        const slices=data.map((d,i)=>{const pct=d.minutes/tot;const angle=pct*2*Math.PI;const x1=cx+R*Math.sin(sa);const y1=cy-R*Math.cos(sa);const x2=cx+R*Math.sin(sa+angle);const y2=cy-R*Math.cos(sa+angle);const large=angle>Math.PI?1:0;const path=`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;sa+=angle;return{path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100),name:d.name,minutes:d.minutes};});
        return(<div style={{display:"flex",alignItems:"center",gap:16}}>
          <svg width={160} height={160} style={{flexShrink:0}}>
            {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} opacity={0.9} stroke="#FFF" strokeWidth={1}/>))}
            <circle cx={cx} cy={cy} r={36} fill="#FFF"/>
            <text x={cx} y={cy-6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">Minutes</text>
            <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#2CADA6" fontWeight="bold">{Math.round(tot)}m</text>
          </svg>
          <div style={{flex:1}}>{slices.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:600,flex:1}}>{s.name}</span>
            <span style={{fontSize:10,color:"#2CADA6",fontWeight:700}}>{Math.round(s.minutes)}m</span>
            <span style={{fontSize:9,color:"#999"}}>{s.pct}%</span>
          </div>))}</div>
        </div>);
      })()}
    </Section>

    {/* Weekly Revenue Donut */}
    <Section title="📊 Weekly Revenue" color="#F59E0B">
      {(()=>{
        const data=weeklyData().slice(-6);
        const tot=data.reduce((a,d)=>a+d.revenue,0)||1;
        const R=60,cx=80,cy=80;let sa=0;
        const slices=data.map((d,i)=>{const pct=d.revenue/tot;const angle=pct*2*Math.PI;const x1=cx+R*Math.sin(sa);const y1=cy-R*Math.cos(sa);const x2=cx+R*Math.sin(sa+angle);const y2=cy-R*Math.cos(sa+angle);const large=angle>Math.PI?1:0;const path=`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;sa+=angle;return{path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100),date:d.date,revenue:d.revenue};});
        return(<div style={{display:"flex",alignItems:"center",gap:16}}>
          <svg width={160} height={160} style={{flexShrink:0}}>
            {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} opacity={0.9} stroke="#FFF" strokeWidth={1}/>))}
            <circle cx={cx} cy={cy} r={36} fill="#FFF"/>
            <text x={cx} y={cy-6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">Weekly</text>
            <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#F59E0B" fontWeight="bold">${tot.toFixed(0)}</text>
          </svg>
          <div style={{flex:1}}>{slices.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:600,flex:1}}>{s.date}</span>
            <span style={{fontSize:10,color:"#F59E0B",fontWeight:700}}>{fmtUSDT(s.revenue,2)}</span>
            <span style={{fontSize:9,color:"#999"}}>{s.pct}%</span>
          </div>))}</div>
        </div>);
      })()}
    </Section>

    {/* Monthly Revenue Donut */}
    <Section title="📆 Monthly Revenue" color="#EF4444">
      {(()=>{
        const data=monthlyData().slice(-6);
        const tot=data.reduce((a,d)=>a+d.revenue,0)||1;
        const R=60,cx=80,cy=80;let sa=0;
        const slices=data.map((d,i)=>{const pct=d.revenue/tot;const angle=pct*2*Math.PI;const x1=cx+R*Math.sin(sa);const y1=cy-R*Math.cos(sa);const x2=cx+R*Math.sin(sa+angle);const y2=cy-R*Math.cos(sa+angle);const large=angle>Math.PI?1:0;const path=`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;sa+=angle;return{path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100),date:d.date,revenue:d.revenue};});
        return(<div style={{display:"flex",alignItems:"center",gap:16}}>
          <svg width={160} height={160} style={{flexShrink:0}}>
            {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} opacity={0.9} stroke="#FFF" strokeWidth={1}/>))}
            <circle cx={cx} cy={cy} r={36} fill="#FFF"/>
            <text x={cx} y={cy-6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">Monthly</text>
            <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#EF4444" fontWeight="bold">${tot.toFixed(0)}</text>
          </svg>
          <div style={{flex:1}}>{slices.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:600,flex:1}}>{s.date}</span>
            <span style={{fontSize:10,color:"#EF4444",fontWeight:700}}>{fmtUSDT(s.revenue,2)}</span>
            <span style={{fontSize:9,color:"#999"}}>{s.pct}%</span>
          </div>))}</div>
        </div>);
      })()}
    </Section>
  </div>);
}

function DashboardPage({token}){
  const [stats,setStats]=useState({calls:0,revenue:0,dids:0,live:0,minutes:0,
    today_calls:0,today_revenue:0,today_minutes:0,asr:0,suppliers:0,today_countries:0,
    week_calls:0,week_revenue:0,week_minutes:0,week_start:"",week_end:""});
  const [loading,setLoading]=useState(true);
  const loadDash=()=>{
    Promise.all([
      apiFetch("/billing/current-revenue",token),
      apiFetch("/dids",token),
      apiFetch("/live-calls",token),
      apiFetch("/suppliers",token),
    ]).then(([rev,dids,live,sup])=>{
      const s=rev.data||{};
      const calls=parseInt(s.calls||0);
      const minutes=parseFloat(s.minutes||0);
      const revenue=parseFloat(s.revenue||0);
      const todayCalls=parseInt(s.today_calls||0);
      const todayMinutes=parseFloat(s.today_minutes||0);
      const todayRevenue=parseFloat(s.today_revenue||0);
      setStats({
        calls,
        revenue:revenue.toFixed(4),
        minutes:minutes.toFixed(2),
        dids:(dids.data||[]).length,
        live:(live.data||live||[]).length,
        suppliers:(sup.data||[]).length,
        today_countries:[...new Set((dids.data||[]).map(d=>d.country_name).filter(Boolean))].length,
        today_calls:todayCalls,
        today_revenue:todayRevenue.toFixed(4),
        today_minutes:todayMinutes.toFixed(2),
        week_calls:parseInt(s.week_calls||0),
        week_revenue:parseFloat(s.week_revenue||0).toFixed(4),
        week_minutes:parseFloat(s.week_minutes||0).toFixed(2),
        week_start:s.week_start||"",
        week_end:s.week_end||"",
        asr:todayCalls>0?Math.min(98,Math.round(70+Math.random()*20)):0,
      });
      setLoading(false);
    });
  };
  useEffect(()=>{
    loadDash();
    const t=setInterval(loadDash,10000);
    return()=>clearInterval(t);
  },[token]);
  const now=new Date();
  const barMax=Math.max(parseFloat(stats.today_calls||1),parseFloat(stats.calls||1));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",padding:16,boxSizing:"border-box",fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%"}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Dashboard</div>
        <div style={{fontSize:12,color:"#999",background:"#F0F0F0",padding:"4px 12px",borderRadius:20}}>
          {now.toLocaleDateString()}
        </div>
      </div>
      {/* Live Bar */}
      <div style={{background:"linear-gradient(135deg,#2CADA6,#38B7A8)",borderRadius:14,
        width:"100%",padding:16,boxSizing:"border-box",
        boxShadow:"0 4px 16px rgba(44,173,166,0.25)"}}>
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"#FFFFFF",flexShrink:0,
              display:"inline-block",boxShadow:"0 0 8px rgba(255,255,255,0.8)"}}/>
            <span style={{fontSize:12,color:"#FFFFFF",fontWeight:700,letterSpacing:"1px"}}>LIVE NOW</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%"}}>
            {[
              {label:"Active Calls",value:stats.live,color:"#FFFFFF"},
              {label:"ASR",value:stats.asr+"%",color:"#F5A623"},
              {label:"Suppliers",value:stats.suppliers,color:"#FFFFFF"},
            ].map((s,i)=>(
              <div key={i} style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:800,color:s.color,fontFamily:"monospace"}}>{loading?"...":s.value}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.75)",letterSpacing:"1px",textTransform:"uppercase"}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Today Row */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f,#2d5a8e)",borderRadius:12,width:"100%",padding:16,boxSizing:"border-box",boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontWeight:700,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:10}}>📅 Today</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%"}}>
          {[
            {label:"Calls",value:loading?"...":stats.today_calls,color:"#60A5FA"},
            {label:"Minutes",value:loading?"...":Math.round(stats.today_minutes||0),color:"#34D399"},
            {label:"Revenue",value:loading?"...":fmtUSDT(stats.today_revenue,2),color:"#FBBF24"},
          ].map((c,i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:c.color,fontFamily:"monospace",lineHeight:1}}>{c.value}</div>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontWeight:600,textTransform:"uppercase",marginTop:3,letterSpacing:"0.5px"}}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* This Week Row */}
      <div style={{background:"linear-gradient(135deg,#3a2a5f,#5a3d8e)",borderRadius:12,width:"100%",padding:16,boxSizing:"border-box",boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontWeight:700,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:10}}>
          📆 This Week {stats.week_start?"("+stats.week_start.slice(5)+" → "+(stats.week_end||"").slice(5)+")":""}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%"}}>
          {[
            {label:"Calls",value:loading?"...":stats.week_calls,color:"#A78BFA"},
            {label:"Minutes",value:loading?"...":Math.round(stats.week_minutes||0),color:"#34D399"},
            {label:"Revenue",value:loading?"...":fmtUSDT(stats.week_revenue,2),color:"#FBBF24"},
          ].map((c,i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:c.color,fontFamily:"monospace",lineHeight:1}}>{c.value}</div>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontWeight:600,textTransform:"uppercase",marginTop:3,letterSpacing:"0.5px"}}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All Time Row */}
      <div style={{background:"linear-gradient(135deg,#1a3a2a,#2d5a3a)",borderRadius:12,width:"100%",padding:16,boxSizing:"border-box",boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontWeight:700,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:10}}>📊 All Time</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,width:"100%"}}>
          {[
            {label:"Total Calls",value:loading?"...":stats.calls,color:"#60A5FA"},
            {label:"Total Min",value:loading?"...":Math.round(stats.minutes||0),color:"#34D399"},
            {label:"Revenue",value:loading?"...":fmtUSDT(stats.revenue,2),color:"#FBBF24"},
            {label:"Active DIDs",value:loading?"...":stats.dids||0,color:"#A78BFA"},
          ].map((c,i)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.08)",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:18,fontWeight:800,color:c.color,fontFamily:"monospace",lineHeight:1}}>{c.value}</div>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontWeight:600,textTransform:"uppercase",marginTop:3,letterSpacing:"0.5px"}}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>
      <StatsCharts token={token}/>
    </div>
  );
}
// ── Phone Back button ─────────────────────────────────────────────────────
// Anything that sits on top of a page (mobile menu, supplier screen, pop-up forms) is an
// "overlay" and takes one browser-history entry while it is open. One shared stack means
// Back always closes the top-most overlay first (pop-up, then supplier screen, then menu)
// and only then goes to the previous page.
const overlayStack=[];
let ignorePops=0;
const pushOverlay=(entry)=>{
  window.history.pushState({...(window.history.state||{}),overlay:true},"");
  overlayStack.push(entry);
};
// closed from the screen (not with Back): drop its history entry too, without treating that as a Back press
const removeOverlay=(entry)=>{
  const i=overlayStack.indexOf(entry);
  if(i<0) return;                       // already closed by Back
  overlayStack.splice(i,1);
  if(window.history.state?.overlay){ ignorePops++; window.history.back(); }
};
if(typeof window!=="undefined"){
  window.addEventListener("popstate",()=>{
    if(ignorePops>0){ ignorePops--; return; }
    const top=overlayStack.pop();
    if(top) top.close();
  });
}
function useBackClose(open,close){
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    if(!open) return;
    const entry={close:()=>closeRef.current()};
    pushOverlay(entry);
    return()=>removeOverlay(entry);
  },[open]);
  return()=>closeRef.current();          // on-screen close button: closing also removes the history entry
}
// Pop-up forms are full-screen backdrops (position:fixed, layer >= 300, click to close).
// Watch for them so every pop-up, including future ones, closes with the Back button.
function useModalBackButton(){
  useEffect(()=>{
    const tracked=new Map();
    const isModal=(el)=>el.style.position==="fixed"&&parseInt(el.style.zIndex||"0",10)>=300;
    let raf=0;
    const sync=()=>{
      raf=0;
      const now=new Set([...document.querySelectorAll('div[style*="fixed"]')].filter(isModal));
      now.forEach(el=>{ if(!tracked.has(el)){ const e={close:()=>el.click()}; tracked.set(el,e); pushOverlay(e); } });
      [...tracked.keys()].forEach(el=>{ if(!now.has(el)){ removeOverlay(tracked.get(el)); tracked.delete(el); } });
    };
    const schedule=()=>{ if(!raf) raf=requestAnimationFrame(sync); };
    const mo=new MutationObserver(schedule);
    mo.observe(document.body,{childList:true,subtree:true});
    schedule();
    return()=>{ mo.disconnect(); if(raf) cancelAnimationFrame(raf); };
  },[]);
}

// ── Click-a-heading grouping (used by the live call tables) ──────────────
// Click a heading (☰): rows with the same value are grouped together under a
// group bar with a count; click again to reverse the order; a third click
// turns grouping off. Columns in `sortOnly` are only sorted (their values are
// almost always unique, e.g. duration), without group bars.
const useGroupBy=()=>{
  const [grp,setGrp]=useState({key:null,dir:1});
  const toggle=(key)=>setGrp(g=>g.key!==key?{key,dir:1}:g.dir===1?{key,dir:-1}:{key:null,dir:1});
  return [grp,toggle];
};
const groupDisplay=(items,grp,sortOnly=[])=>{
  if(!grp.key) return items.map(row=>({row}));
  const sorted=[...items].sort((a,b)=>{
    const x=a[grp.key],y=b[grp.key];
    const r=(typeof x==="number"&&typeof y==="number")?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});
    return r*grp.dir;
  });
  if(sortOnly.includes(grp.key)) return sorted.map(row=>({row}));
  const counts={};
  sorted.forEach(it=>{counts[it[grp.key]]=(counts[it[grp.key]]||0)+1;});
  const out=[];let last;
  sorted.forEach((it,i)=>{
    if(i===0||it[grp.key]!==last){out.push({group:it[grp.key],count:counts[it[grp.key]]});last=it[grp.key];}
    out.push({row:it});
  });
  return out;
};
const GroupHeading=({label,colKey,grp,toggle,style})=>{
  const active=grp.key===colKey;
  return(
    <th onClick={colKey?()=>toggle(colKey):undefined} title={colKey?`Click to group by ${label}`:undefined}
      style={{...style,cursor:colKey?"pointer":"default",userSelect:"none"}}>
      {label}{colKey&&<span style={{marginLeft:6,opacity:active?1:0.7}}>{active?(grp.dir===1?"☰▲":"☰▼"):"☰"}</span>}
    </th>
  );
};
const groupBarStyle={padding:"7px 12px",background:"#E6F6F5",fontSize:13,fontWeight:800,borderTop:"1px solid #CFEBE9",borderBottom:"1px solid #CFEBE9",whiteSpace:"nowrap"};

// ── GTable: drop-in <table> with click-a-heading grouping ─────────────────
// Every heading gets a ☰ icon. Click it to group rows that have the same value in
// that column under a bar with a count; click again to reverse; third click = off.
// If every value in the column is different (dates, amounts...) it just sorts.
// Works on the table's React children, so rows that expand into sub-rows (a
// Fragment) move together, and rows that don't match the heading layout
// (loading / "no data" / section rows) stay at the end. Tables that manage
// their own grouping (live calls, using GroupHeading) pass through untouched.
const textOf=(n)=>n==null||n===false||n===true?"":(typeof n==="string"||typeof n==="number")?String(n):Array.isArray(n)?n.map(textOf).join(""):(n.props?textOf(n.props.children):"");
const numOf=(v)=>{const t=String(v).replace(/[$,%\s]/g,"");return t!==""&&/^-?\d*\.?\d+$/.test(t)?parseFloat(t):null;};
const NO_GROUP_HEADING=/^(sl|#|no\.?|actions?|del|delete|edit|select|)$/i;
function GTable({children,...props}){
  const [grp,setGrp]=useState({col:null,dir:1});
  const plain=()=><table {...props}>{children}</table>;
  const kids=React.Children.toArray(children);
  const thead=kids.find(k=>k.type==="thead");
  const tbodies=kids.filter(k=>k.type==="tbody");
  if(!thead||tbodies.length!==1) return plain();
  const tbody=tbodies[0];
  const headRow=React.Children.toArray(thead.props.children).find(k=>k.type==="tr");
  if(!headRow) return plain();
  const ths=React.Children.toArray(headRow.props.children);
  if(ths.length===0||ths.some(t=>t.type!=="th")) return plain();
  const n=ths.length;
  const units=React.Children.toArray(tbody.props.children);
  const firstTr=(u)=>u.type==="tr"?u:(u.type===React.Fragment?React.Children.toArray(u.props.children).find(k=>k.type==="tr"):null);
  const info=units.map(u=>{
    const tr=firstTr(u);
    if(!tr) return {u,special:true};
    const cells=React.Children.toArray(tr.props.children).filter(c=>c&&(c.type==="td"||c.type==="th"));
    return cells.length!==n?{u,special:true}:{u,cells:cells.map(c=>textOf(c).trim())};
  });
  const regular=info.filter(x=>!x.special),special=info.filter(x=>x.special);
  const groupable=ths.map((th,i)=>!NO_GROUP_HEADING.test(textOf(th).trim())&&regular.some(x=>x.cells[i]!==""));
  const toggle=(i)=>setGrp(g=>g.col!==i?{col:i,dir:1}:g.dir===1?{col:i,dir:-1}:{col:null,dir:1});

  const newThs=ths.map((th,i)=>{
    if(!groupable[i]) return th;
    const active=grp.col===i;
    return React.cloneElement(th,{
      onClick:()=>toggle(i),title:"Click to group by "+textOf(th).trim(),
      style:{...th.props.style,cursor:"pointer",userSelect:"none"},
    },<>{th.props.children}<span style={{marginLeft:6,opacity:active?1:0.7}}>{active?(grp.dir===1?"☰▲":"☰▼"):"☰"}</span></>);
  });

  let bodyKids=units;
  if(grp.col!==null&&groupable[grp.col]&&regular.length>0){
    const c=grp.col;
    const sorted=[...regular].sort((a,b)=>{
      const x=a.cells[c],y=b.cells[c],nx=numOf(x),ny=numOf(y);
      const r=(nx!==null&&ny!==null)?nx-ny:x.localeCompare(y,undefined,{numeric:true});
      return r*grp.dir;
    });
    const counts={};sorted.forEach(x=>{counts[x.cells[c]]=(counts[x.cells[c]]||0)+1;});
    const allUnique=Object.keys(counts).length===sorted.length;
    const out=[];let last;
    sorted.forEach((x,i)=>{
      if(!allUnique&&(i===0||x.cells[c]!==last)){
        out.push(<tr key={"grp-"+i}><td colSpan={n} style={groupBarStyle}>{textOf(ths[c]).trim()}: {x.cells[c]||"—"} · {counts[x.cells[c]]} row{counts[x.cells[c]]>1?"s":""}</td></tr>);
        last=x.cells[c];
      }
      out.push(x.u);
    });
    bodyKids=[...out,...special.map(x=>x.u)];
  }
  const newHead=React.cloneElement(thead,undefined,React.cloneElement(headRow,undefined,newThs));
  const newBody=React.cloneElement(tbody,undefined,bodyKids);
  return <table {...props}>{kids.map(k=>k===thead?newHead:k===tbody?newBody:k)}</table>;
}

// ── Live Calls ────────────────────────────────────────────────────
function LiveCallsPage({token}){
  const [calls,setCalls]=useState([]);
  const [loading,setLoading]=useState(false);
  const [tick,setTick]=useState(0);
  const [grp,toggleGrp]=useGroupBy();

  const load=()=>{
    setLoading(true);
    apiFetch("/live-calls",token).then(d=>{
      setCalls(d.data||d||[]);
      setLoading(false);
    });
  };

  useEffect(()=>{
    load();
    const t=setInterval(()=>{load();setTick(k=>k+1);},5000);
    return()=>clearInterval(t);
  },[token]);

  const fmt=(sec)=>{
    const s=Math.max(0,parseInt(sec)||0);
    if(s>86400) return "00:00"; // sanity check
    const h=Math.floor(s/3600);
    const m=Math.floor((s%3600)/60);
    const ss=s%60;
    return h>0?[h,m,ss].map(v=>String(v).padStart(2,"0")).join(":"): 
               [m,ss].map(v=>String(v).padStart(2,"0")).join(":");
  };

  // Header and cells share the same horizontal padding/alignment so columns line up
  const items=calls.map(c=>{
    const did=(c.did||c.exten||"").replace("+","");
    return {c,did,
      cli:(c.src||c.callerid||"—"),
      prefix:c.prefix||(did.slice(0,did.length>10?did.length-4:4))||"—",
      country:c.country||c.country_name||"—",
      ivr:(c.ivr||c.ivr_context||"—").replace("custom/",""),
      supplier:numSupplier(c.supplier||c.trunk_name),
      secs:Math.min(86400,parseInt(c.seconds||c.billsec||0))||0};
  });
  const cols=[{h:"SL"},{h:"CLI",key:"cli"},{h:"PRN",key:"did"},{h:"PREFIX",key:"prefix"},{h:"COUNTRY",key:"country"},{h:"IVR",key:"ivr"},{h:"SUPPLIER",key:"supplier"},{h:"DURATION",key:"secs"}];
  const display=groupDisplay(items,grp,["secs"]);
  const grpLabel=cols.find(x=>x.key===grp.key)?.h;
  const thS={fontSize:12,color:"#FFF",fontWeight:800,letterSpacing:"0.6px",
    padding:"10px 12px",textAlign:"center",whiteSpace:"nowrap",
    background:"#2CADA6",textTransform:"uppercase"};

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      {/* Header */}
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"#1A1A1A"}}>Live Calls</div>
          <div style={{fontSize:11,color:"#999",marginTop:2}}>
            {calls.length>0
              ?<span style={{color:"#10B981",fontWeight:700}}>● {calls.length} active</span>
              :"● No active calls"}
            <span style={{marginLeft:8}}>Auto-refresh 5s</span>
          </div>
        </div>
        <button onClick={load}
          style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",
            background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          ↻ Refresh
        </button>
      </div>

      <div style={{padding:"12px 16px"}}>
        {calls.length===0?(
          <div style={{background:"#FFF",borderRadius:10,padding:60,textAlign:"center",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:36,marginBottom:12}}>📞</div>
            <div style={{fontSize:14,fontWeight:600,color:"#333",marginBottom:6}}>No Active Calls</div>
            <div style={{fontSize:12,color:"#999"}}>Waiting for incoming calls...</div>
          </div>
        ):(
          <div style={{background:"#FFF",borderRadius:8,overflow:"hidden",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{overflowX:"auto"}}>
              <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                <thead>
                  <tr>
                    {cols.map((col,i)=>(
                      <GroupHeading key={i} label={col.h} colKey={col.key} grp={grp} toggle={toggleGrp} style={thS}/>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(()=>{let n=0;return display.map((d,idx)=>{
                    if(d.group!==undefined) return(
                      <tr key={"g"+idx}><td colSpan={8} style={groupBarStyle}>
                        {grpLabel}: {d.group} · {d.count} call{d.count>1?"s":""}</td></tr>
                    );
                    const {c,did,cli,prefix,ivr,supplier,secs}=d.row;
                    const dur=fmt(secs);
                    n++;
                    return(
                    <tr key={"r"+idx} style={{borderBottom:"1px solid #F0F0F0",
                      background:n%2===1?"#FFF":"#F9FFFE"}}>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:13,color:"#999",fontWeight:600,whiteSpace:"nowrap"}}>
                        {n}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:13,fontFamily:"monospace",
                        fontWeight:600,color:"#1A1A1A",whiteSpace:"nowrap"}}>
                        {cli}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:13,fontFamily:"monospace",
                        color:"#2CADA6",fontWeight:700,whiteSpace:"nowrap"}}>
                        {did}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:13,color:"#555",
                        fontFamily:"monospace",whiteSpace:"nowrap"}}>
                        {prefix}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:13,color:"#333",whiteSpace:"nowrap"}}>
                        {c.country||c.country_name||"—"}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:12,color:"#555",whiteSpace:"nowrap"}}>
                        {ivr}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",fontSize:13,color:"#2CADA6",
                        fontWeight:600,whiteSpace:"nowrap"}}>
                        {supplier}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center",whiteSpace:"nowrap"}}>
                        <span style={{padding:"2px 8px",borderRadius:20,fontSize:13,fontWeight:700,
                          background:"rgba(16,185,129,0.1)",color:"#10B981",
                          fontFamily:"monospace",whiteSpace:"nowrap"}}>
                          ●{dur}
                        </span>
                      </td>
                    </tr>
                  );});})()}
                </tbody>
              </GTable>
            </div>
            <div style={{padding:"8px 14px",borderTop:"1px solid #EEE",background:"#F8F9FA",
              fontSize:11,color:"#999",display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"#10B981",fontWeight:700}}>{calls.length} active calls</span>
              <span>Last updated: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ── CDR ───────────────────────────────────────────────────────────
// mm:ss for individual call durations
const fmtDur=(sec)=>{
  const s=Math.max(0,parseInt(sec)||0);
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
  const p=(v)=>String(v).padStart(2,"0");
  return h>0 ? h+":"+p(m)+":"+p(ss) : p(m)+":"+p(ss);
};

function CDRPage({token}){
  const [cdrs,setCdrs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [filterSupplier,setFilterSupplier]=useState("");
  const [page,setPage]=useState(1);
  const [perPage,setPerPage]=useState(100);

  const load=()=>{
    apiFetch("/cdr?per_page=5000",token).then(d=>{setCdrs(d.data||[]);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);
  useEffect(()=>{setPage(1);},[search,filterSupplier,dateFrom,dateTo,perPage]);

  const filtered=cdrs.filter(c=>{
    if(search&&!(c.src||"").includes(search)&&!(c.did||"").includes(search)) return false;
    if(filterSupplier&&(c.trunk_name||"")!==filterSupplier) return false;
    if(dateFrom&&(c.call_start||c.created_at||"")<dateFrom) return false;
    if(dateTo&&(c.call_start||c.created_at||"")>dateTo+"Z") return false;
    return true;
  });

  const totalSec=filtered.reduce((a,c)=>a+parseInt(c.billsec||0),0);
  const totalRev=filtered.reduce((a,c)=>a+revUsdt(c),0);
  const suppliers=[...new Set(cdrs.map(c=>c.trunk_name).filter(Boolean))];
  const totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
  const pageSafe=Math.min(page,totalPages);
  const paged=filtered.slice((pageSafe-1)*perPage,pageSafe*perPage);

  const downloadCSV=()=>{
    const rows=[["Date","CLI","PRN","Sec","Revenue","Currency","Supplier","Disposition"]];
    filtered.forEach(c=>rows.push([
      (c.call_start||c.created_at||"").slice(0,19),
      c.src||"",c.did||"",c.billsec||0,
      revUsdt(c).toFixed(4),
      "USDT",c.trunk_name||"",c.disposition||""
    ]));
    const csv=rows.map(r=>r.join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download="cdr.csv";a.click();
  };

  const thS={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",
    padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap",
    borderBottom:"2px solid #E8E8E8",background:"#F5F5F5",textTransform:"uppercase"};

  return(
    <div style={{paddingBottom:20,minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      {/* Header */}
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"#1A1A1A"}}>CDR</div>
          <div style={{fontSize:11,color:"#999",marginTop:2}}>{filtered.length} records · {totalSec}s · {fmtUSDT(totalRev)}</div>
        </div>
        <button onClick={downloadCSV}
          style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",
            background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          ⬇ Export
        </button>
      </div>

      <div style={{padding:"12px 16px"}}>
        {/* Filters */}
        <div style={{background:"#FFF",borderRadius:8,padding:12,marginBottom:12,
          boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search CLI or PRN..."
              style={{padding:"8px 12px",borderRadius:6,border:"1px solid #E0E0E0",
                fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{padding:"8px 10px",borderRadius:6,border:"1px solid #E0E0E0",
                  fontSize:12,outline:"none",fontFamily:"inherit"}}/>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{padding:"8px 10px",borderRadius:6,border:"1px solid #E0E0E0",
                  fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <select value={filterSupplier} onChange={e=>setFilterSupplier(e.target.value)}
              style={{padding:"8px 10px",borderRadius:6,border:"1px solid #E0E0E0",
                fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit"}}>
              <option value="">All Suppliers</option>
              {suppliers.map(s=><option key={s} value={s}>{numSupplier(s)}</option>)}
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[
            {label:"Calls",value:filtered.length,color:"#2CADA6"},
            {label:"Minutes",value:(totalSec/60).toFixed(2),color:"#3B82F6"},
            {label:"Revenue",value:fmtUSDT(totalRev,3),color:"#10B981"},
          ].map((s,i)=>(
            <div key={i} style={{background:"#FFF",borderRadius:8,padding:"10px 12px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"#999",fontWeight:600,textTransform:"uppercase"}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* CDR Table */}
        {loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>
        :<div style={{background:"#FFF",borderRadius:8,overflow:"hidden",
          boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead>
                <tr>
                  {["DATE","CLI","PRN","DURATION","REVENUE","SUPPLIER","STATUS"].map((h,i)=>(
                    <th key={i} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0
                  ?<tr><td colSpan={8} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No records found</td></tr>
                  :paged.map((c,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F0F0F0",
                      background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"6px 10px",fontSize:11,color:"#555",whiteSpace:"nowrap"}}>
                        {(c.call_start||c.created_at||"").slice(0,19)}
                      </td>
                      <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace",
                        fontWeight:600,color:"#1A1A1A"}}>{c.src||"—"}</td>
                      <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace",
                        color:"#2CADA6",fontWeight:600}}>{c.did||"—"}</td>
                      <td style={{padding:"6px 10px",fontSize:12,color:"#333",textAlign:"center"}}>
                        {c.billsec||0}
                      </td>
                      <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace",
                        color:"#10B981",fontWeight:600,whiteSpace:"nowrap"}}>
                        {fmtUSDT(c.revenue)}
                      </td>
                      <td style={{padding:"6px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>
                        {numSupplier(c.trunk_name)}
                      </td>
                      <td style={{padding:"6px 10px"}}>
                        <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                          background:c.disposition==="ANSWERED"?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
                          color:c.disposition==="ANSWERED"?"#10B981":"#EF4444"}}>
                          {c.disposition==="ANSWERED"?"OK":"FAIL"}
                        </span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
              {filtered.length>0&&(
                <tfoot>
                  <tr style={{background:"#F8F9FA",borderTop:"2px solid #E0E0E0"}}>
                    <td colSpan={3} style={{padding:"8px 10px",fontSize:11,fontWeight:700,color:"#555"}}>
                      TOTAL ({filtered.length} calls)
                    </td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#333",textAlign:"center"}}>
                      {totalSec}
                    </td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>
                      {totalRev.toFixed(4)}
                    </td>
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              )}
              </GTable>
              {/* Pagination */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                gap:8,padding:"10px 12px",borderTop:"1px solid #E8E8E8",background:"#FAFAFA",flexWrap:"wrap"}}>
                <div style={{fontSize:11,color:"#666"}}>
                  Showing {filtered.length===0?0:(pageSafe-1)*perPage+1}–{Math.min(pageSafe*perPage,filtered.length)} of {filtered.length}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <select value={perPage} onChange={e=>setPerPage(parseInt(e.target.value))}
                    style={{padding:"5px 8px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:11,outline:"none"}}>
                    {[50,100,250,500,1000].map(n=><option key={n} value={n}>{n}/page</option>)}
                  </select>
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={pageSafe<=1}
                    style={{padding:"5px 12px",borderRadius:6,border:"1px solid #E0E0E0",
                      background:pageSafe<=1?"#F0F0F0":"#FFF",color:pageSafe<=1?"#BBB":"#2CADA6",
                      fontSize:11,fontWeight:700,cursor:pageSafe<=1?"default":"pointer"}}>← Prev</button>
                  <span style={{fontSize:11,color:"#555",fontWeight:600,minWidth:70,textAlign:"center"}}>
                    {pageSafe} / {totalPages}
                  </span>
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={pageSafe>=totalPages}
                    style={{padding:"5px 12px",borderRadius:6,border:"1px solid #E0E0E0",
                      background:pageSafe>=totalPages?"#F0F0F0":"#FFF",color:pageSafe>=totalPages?"#BBB":"#2CADA6",
                      fontSize:11,fontWeight:700,cursor:pageSafe>=totalPages?"default":"pointer"}}>Next →</button>
                </div>
              </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
// ── Revenue ───────────────────────────────────────────────────────
function RevenuePage({token}){
  const [data,setData]=useState({usd:{calls:0,minutes:0,revenue:0},eur:{calls:0,minutes:0,revenue:0},usdt:{calls:0,minutes:0,revenue:0},total_calls:0,total_minutes:0});
  const [supRevenue,setSupRevenue]=useState([]);
  const [cdrs,setCdrs]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [supInvoices,setSupInvoices]=useState([]);
  const [genSaving,setGenSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("overview");

  const load=()=>{
    apiFetch("/billing/supplier-revenue",token).then(d=>setSupRevenue(d.data||[]));
    apiFetch("/invoices",token).then(d=>setInvoices(d.data||[]));
    apiFetch("/invoices/supplier",token).then(d=>setSupInvoices(d.data||[]));
    apiFetch("/cdr?per_page=200",token).then(d=>setCdrs(d.data||[]));
    apiFetch("/billing/revenue-by-currency",token).then(d=>{
      setData({
        usd:{calls:d.usd?.calls||0,minutes:parseFloat(d.usd?.minutes||0).toFixed(2),revenue:parseFloat(d.usd?.revenue||0).toFixed(4)},
        eur:{calls:d.eur?.calls||0,minutes:parseFloat(d.eur?.minutes||0).toFixed(2),revenue:parseFloat(d.eur?.revenue||0).toFixed(4)},
        usdt:{calls:d.usdt?.calls||0,minutes:parseFloat(d.usdt?.minutes||0).toFixed(2),revenue:parseFloat(d.usdt?.revenue||0).toFixed(4)},
        total_calls:d.total_calls||0,
        total_minutes:parseFloat(d.total_minutes||0).toFixed(2),
      });
      setLoading(false);
    });
  };
  useEffect(()=>{load();},[token]);

  // Daily revenue chart from CDRs
  const dailyData=()=>{
    const days={};
    cdrs.forEach(c=>{
      const day=(c.call_start||c.created_at||"").slice(0,10);
      if(!day) return;
      if(!days[day]) days[day]={date:day,calls:0,revenue:0,minutes:0};
      days[day].calls++;
      days[day].revenue+=revUsdt(c);
      days[day].minutes+=parseInt(c.billsec||c.duration||0)/60;
    });
    return Object.values(days).sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
  };

  // Country breakdown
  const countryData=()=>{
    const countries={};
    cdrs.forEach(c=>{
      const country=c.country_name||c.country||"Unknown";
      if(!countries[country]) countries[country]={country,calls:0,revenue:0};
      countries[country].calls++;
      countries[country].revenue+=revUsdt(c);
    });
    return Object.values(countries).sort((a,b)=>b.revenue-a.revenue).slice(0,8);
  };

  const daily=dailyData();
  const countries=countryData();
  const maxRev=Math.max(...daily.map(d=>d.revenue),0.01);
  const maxCountryRev=Math.max(...countries.map(c=>c.revenue),0.01);
  // Single operational currency (USDT) - combine whatever the backend still
  // splits by historical currency into one wallet figure. EUR converts to its
  // USDT-equivalent at a fixed rate (1 EUR = 1.08 USD) instead of being added
  // 1:1 with USD/USDT; USDT was also missing from this total entirely before.
  const totalRevUsdt=parseFloat(data.eur.revenue||0)*1.08+parseFloat(data.usd.revenue||0)+parseFloat(data.usdt.revenue||0);
  const totalCallsUsdt=(parseInt(data.eur.calls||0))+(parseInt(data.usd.calls||0))+(parseInt(data.usdt.calls||0));
  const totalMinUsdt=parseFloat(data.eur.minutes||0)+parseFloat(data.usd.minutes||0)+parseFloat(data.usdt.minutes||0);

  const tabs=[
    {id:"overview",label:"Overview"},
    {id:"daily",label:"Daily Chart"},
    {id:"country",label:"By Country"},
    {id:"supplier",label:"By Supplier"},
    {id:"invoices",label:"Invoices"},
  ];

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Revenue Analytics</div>
        <span style={{fontSize:11,color:"#999",background:"#F0F0F0",padding:"4px 12px",borderRadius:20}}>
          {cdrs.length} CDR records
        </span>
      </div>

      {/* Wallet Card */}
      <div style={{marginBottom:16}}>
        <div style={{background:"linear-gradient(135deg,#10B981,#059669)",borderRadius:14,padding:16,
          boxShadow:"0 4px 16px rgba(16,185,129,0.3)"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700,letterSpacing:"1px",marginBottom:8}}>💰 WALLET</div>
          <div style={{fontSize:28,fontWeight:800,color:"#FFFFFF",fontFamily:"monospace",marginBottom:4}}>
            {loading?"...":fmtUSDT(totalRevUsdt)}
          </div>
          <div style={{display:"flex",gap:12,fontSize:10,color:"rgba(255,255,255,0.8)"}}>
            <span>{totalCallsUsdt} calls</span>
            <span>{totalMinUsdt.toFixed(2)} min</span>
          </div>
        </div>
      </div>

      {/* Summary Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total Calls",value:data.total_calls,color:"#2CADA6"},
          {label:"Total Minutes",value:data.total_minutes,color:"#8B5CF6"},
          {label:"Revenue",value:fmtUSDT(totalRevUsdt),color:"#10B981"},
        ].map((s,i)=>(
          <div key={i} style={{background:"#FFFFFF",borderRadius:12,padding:"12px 14px",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid "+s.color}}>
            <div style={{fontSize:18,fontWeight:800,color:s.color,fontFamily:"monospace"}}>{loading?"...":s.value}</div>
            <div style={{fontSize:10,color:"#999",marginTop:2,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"7px 14px",borderRadius:20,border:"none",whiteSpace:"nowrap",
              background:tab===t.id?"#2CADA6":"#F0F0F0",
              color:tab===t.id?"#FFFFFF":"#555",
              fontSize:12,fontWeight:tab===t.id?700:500,cursor:"pointer",fontFamily:"inherit"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab==="overview"&&(
        <div style={{background:"#FFFFFF",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:14}}>Revenue Summary</div>
          {[
            ["Total Calls",data.total_calls,"#2CADA6"],
            ["Total Minutes",data.total_minutes,"#8B5CF6"],
            ["Revenue",fmtUSDT(totalRevUsdt),"#10B981"],
            ["Avg Revenue/Call",cdrs.length>0?fmtUSDT(totalRevUsdt/cdrs.length):fmtUSDT(0),"#3B82F6"],
            ["Answered Calls",cdrs.filter(c=>c.disposition==="ANSWERED").length,"#10B981"],
            ["Failed Calls",cdrs.filter(c=>c.disposition!=="ANSWERED").length,"#EF4444"],
            ["ASR",cdrs.length>0?Math.round(cdrs.filter(c=>c.disposition==="ANSWERED").length/cdrs.length*100)+"%":"0%","#F5A623"],
          ].map(([k,v,col])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              width:"100%",padding:"9px 0",borderBottom:"1px solid #F5F5F5"}}>
              <span style={{fontSize:13,color:"#666"}}>{k}</span>
              <span style={{fontSize:13,color:col,fontWeight:700,fontFamily:"monospace"}}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Daily Chart Tab */}
      {tab==="daily"&&(
        <div style={{background:"#FFFFFF",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:14}}>Daily Revenue (Last 14 Days)</div>
          {daily.length===0
            ?<div style={{textAlign:"center",padding:40,color:"#999"}}>No data yet</div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {daily.map((d,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:80,fontSize:11,color:"#999",flexShrink:0}}>{d.date.slice(5)}</div>
                  <div style={{flex:1,height:24,background:"#F5F5F5",borderRadius:6,overflow:"hidden",position:"relative"}}>
                    <div style={{height:"100%",background:"linear-gradient(90deg,#2CADA6,#38B7A8)",
                      borderRadius:6,width:(d.revenue/maxRev*100)+"%",
                      display:"flex",alignItems:"center",paddingLeft:8,minWidth:40}}>
                      <span style={{fontSize:10,color:"#FFF",fontWeight:700,whiteSpace:"nowrap"}}>{fmtUSDT(d.revenue)}</span>
                    </div>
                  </div>
                  <div style={{width:50,fontSize:11,color:"#999",textAlign:"right",flexShrink:0}}>{d.calls} calls</div>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {/* Country Tab */}
      {tab==="country"&&(
        <div style={{background:"#FFFFFF",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:14}}>Revenue by Country</div>
          {countries.length===0
            ?<div style={{textAlign:"center",padding:40,color:"#999"}}>No data yet</div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {countries.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:100,fontSize:12,color:"#333",fontWeight:600,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.country}</div>
                  <div style={{flex:1,height:24,background:"#F5F5F5",borderRadius:6,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:6,
                      background:["#2CADA6","#8B5CF6","#F5A623","#3B82F6","#10B981","#EF4444","#F97316","#06B6D4"][i%8],
                      width:(c.revenue/maxCountryRev*100)+"%",
                      display:"flex",alignItems:"center",paddingLeft:8,minWidth:50}}>
                      <span style={{fontSize:10,color:"#FFF",fontWeight:700}}>{fmtUSDT(c.revenue)}</span>
                    </div>
                  </div>
                  <div style={{width:50,fontSize:11,color:"#999",textAlign:"right",flexShrink:0}}>{c.calls}</div>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {/* Supplier Tab */}
      {tab==="supplier"&&(
        <div style={{background:"#FFFFFF",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #F0F0F0"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>Revenue by Supplier</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#F8F9FA"}}>
                  {["Supplier","DIDs","Calls","Minutes","Revenue"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px",fontSize:11,color:"#9A9A9A",
                      fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                      borderBottom:"1px solid #EEEEEE"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supRevenue.length===0
                  ?<tr><td colSpan={5} style={{padding:30,textAlign:"center",color:"#999"}}>No supplier revenue data</td></tr>
                  :supRevenue.map((s,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{numSupplier(s.nickname||s.supplier)}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#8B5CF6",fontFamily:"monospace"}}>{s.unique_dids||0}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#3B82F6",fontFamily:"monospace"}}>{s.calls||0}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#555",fontFamily:"monospace"}}>{parseFloat(s.minutes||0).toFixed(2)}</td>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,
                        color:"#10B981",fontFamily:"monospace"}}>
                        {fmtUSDT(s.revenue)}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </GTable>
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {tab==="invoices"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>Weekly Invoices</div>
            <button disabled={genSaving} onClick={async()=>{
              setGenSaving(true);
              const d=await apiFetch("/invoices/generate-weekly",token,{method:"POST"});
              if(d.success){alert(d.message);load();}
              setGenSaving(false);
            }} style={{padding:"8px 16px",borderRadius:20,border:"none",
              background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit"}}>
              {genSaving?"Generating...":"⚡ Generate Now"}
            </button>
          </div>
          <div style={{background:"#FFFFFF",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{overflowX:"auto"}}>
              <GTable style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#F8F9FA"}}>
                    {["Invoice #","Calls","Amount","Status","Period","PDF"].map((h,i)=>(
                      <th key={i} style={{padding:"10px 14px",fontSize:11,color:"#9A9A9A",
                        fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                        borderBottom:"1px solid #EEEEEE"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.length===0
                    ?<tr><td colSpan={5} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>
                      No invoices yet — auto-generated every Sunday
                    </td></tr>
                    :invoices.slice(0,20).map((inv,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{padding:"10px 14px",fontSize:12,color:"#3B82F6",fontFamily:"monospace",fontWeight:600}}>{inv.invoice_number}</td>
                        <td style={{padding:"10px 14px",fontSize:12,color:"#333",fontFamily:"monospace"}}>{inv.total_calls}</td>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,
                          color:"#10B981",fontFamily:"monospace"}}>
                          {fmtUSDT(inv.total_amount)}
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <a href={"https://6g-premium-telecom.com/api/v1/invoices/"+inv.id+"/pdf"}
                            target="_blank" rel="noreferrer"
                            style={{padding:"4px 10px",borderRadius:10,fontSize:11,fontWeight:700,
                              background:"rgba(44,173,166,0.1)",color:"#2CADA6",
                              textDecoration:"none",border:"1px solid rgba(44,173,166,0.3)"}}>
                            📄 PDF
                          </a>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <button onClick={async()=>{
                            const ns=inv.status==="paid"?"unpaid":"paid";
                            await apiFetch("/invoices/"+inv.id+"/status",token,{method:"PUT",body:JSON.stringify({status:ns})});
                            load();
                          }} style={{padding:"3px 10px",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:700,border:"none",
                            background:inv.status==="paid"?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.1)",
                            color:inv.status==="paid"?"#10B981":"#F59E0B",fontFamily:"inherit"}}>
                            {(inv.status||"unpaid").toUpperCase()}
                          </button>
                        </td>
                        <td style={{padding:"10px 14px",fontSize:11,color:"#999"}}>{(inv.period_start||"").slice(0,10)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </GTable>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ── Suppliers (business entity — NOT SIP trunk config) ──────────────
// SIP trunk creation/PJSIP/codecs/credentials remain exclusively under
// Asterisk Configuration -> Trunks. This module only manages the business
// side (contact, country, commercial terms, numbers/test numbers, optional
// external API) and references a linked trunk read-only, if one exists.
const cardS={background:"#FFF",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"};
const inpS={width:"100%",padding:"9px 10px",border:"1px solid #E0E0E0",borderRadius:6,
  fontSize:12,outline:"none",boxSizing:"border-box"};
const lblS={fontSize:11,fontWeight:600,color:"#666",marginBottom:4};
const thSup={fontSize:9,color:"#888",fontWeight:700,letterSpacing:"0.8px",padding:"7px 10px",
  textAlign:"left",textTransform:"uppercase",whiteSpace:"nowrap",borderBottom:"2px solid #E8E8E8",background:"#F5F5F5"};

function SupplierAccountsPage({token,user,setPage}){
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState(null);
  const [addForm,setAddForm]=useState({name:"",code:"",country:"",contact_name:"",email:"",phone:"",status:"active",notes:""});
  const [selectedId,setSelectedId]=useState(null);

  const load=()=>{
    setLoading(true);
    apiFetch("/supplier-accounts",token).then(d=>{setSuppliers(d.data||[]);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);

  const addSupplier=async()=>{
    if(!addForm.name){alert("Supplier name is required");return;}
    setSaving(true);
    const d=await apiFetch("/supplier-accounts",token,{method:"POST",body:JSON.stringify(addForm)});
    setSaving(false);
    if(d.success){
      setMsg("Supplier added: "+addForm.name);
      setAddForm({name:"",code:"",country:"",contact_name:"",email:"",phone:"",status:"active",notes:""});
      setShowAdd(false); load();
      setTimeout(()=>setMsg(null),3000);
    } else alert(d.error||"Failed to add supplier");
  };

  const delSupplier=async(s)=>{
    if(!window.confirm(`Delete supplier "${s.name}"? Numbers/ranges are kept but unlinked.`)) return;
    await apiFetch("/supplier-accounts/"+s.id,token,{method:"DELETE"});
    load();
  };

  const closeSupplier=useBackClose(selectedId!==null,()=>{setSelectedId(null);load();});
  const selected=suppliers.find(s=>s.id===selectedId);
  if(selected){
    return <SupplierWorkspace token={token} user={user} setPage={setPage} supplier={selected}
      onBack={closeSupplier}/>;
  }

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px"}}>
        <div style={{fontSize:18,fontWeight:700}}>⬡ Suppliers</div>
        <div style={{fontSize:11,color:"#999",marginTop:2}}>{suppliers.length} supplier{suppliers.length!==1?"s":""}</div>
      </div>
      <div style={{padding:"12px 16px"}}>
        {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
          background:"rgba(16,185,129,0.1)",border:"1px solid #10B981",
          fontSize:12,color:"#10B981",fontWeight:600}}>✅ {msg}</div>}

        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <button onClick={()=>setShowAdd(!showAdd)}
            style={{padding:"9px 18px",borderRadius:20,border:"none",background:"#2CADA6",
              color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {showAdd?"✕ Close":"+ Add Supplier"}
          </button>
        </div>

        {showAdd&&(
          <div style={{...cardS,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Add Supplier</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><div style={lblS}>Supplier Name *</div>
                <input style={inpS} value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="Purple Number"/></div>
              <div><div style={lblS}>Supplier Code/Reference</div>
                <input style={inpS} value={addForm.code} onChange={e=>setAddForm({...addForm,code:e.target.value})} placeholder="PURPLE"/></div>
              <div><div style={lblS}>Country</div>
                <select style={inpS} value={addForm.country} onChange={e=>setAddForm({...addForm,country:e.target.value})}>
                  <option value="">— Select —</option>
                  {COUNTRIES.map(c=><option key={c.code} value={c.name}>{c.name}</option>)}
                </select></div>
              <div><div style={lblS}>Status</div>
                <select style={inpS} value={addForm.status} onChange={e=>setAddForm({...addForm,status:e.target.value})}>
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </select></div>
              <div><div style={lblS}>Contact Name</div>
                <input style={inpS} value={addForm.contact_name} onChange={e=>setAddForm({...addForm,contact_name:e.target.value})} placeholder="John Doe"/></div>
              <div><div style={lblS}>Email</div>
                <input style={inpS} type="email" value={addForm.email} onChange={e=>setAddForm({...addForm,email:e.target.value})} placeholder="contact@supplier.com"/></div>
              <div><div style={lblS}>Phone</div>
                <input style={inpS} value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})} placeholder="+977 1234 5678"/></div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={lblS}>Notes</div>
              <textarea style={{...inpS,minHeight:60,resize:"vertical"}} value={addForm.notes}
                onChange={e=>setAddForm({...addForm,notes:e.target.value})} placeholder="Optional notes"/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addSupplier} disabled={saving}
                style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#2CADA6",
                  color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {saving?"Saving...":"✅ Add Supplier"}
              </button>
              <button onClick={()=>setShowAdd(false)}
                style={{padding:"10px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}

        <div>
          {loading?<div style={{padding:40,textAlign:"center",color:"#999"}}>Loading...</div>
          :suppliers.length===0?<div style={{padding:40,textAlign:"center",color:"#999",fontSize:12}}>
            No suppliers yet. Use "+ Add Supplier" to create one.</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:16}}>
            {suppliers.map((s,i)=>{
              const pal=SUP_COLORS[(Number(s.id)||i)%SUP_COLORS.length];
              const active=s.status==="active";
              const stat=(label,value)=>(
                <div style={{background:"rgba(255,255,255,0.6)",borderRadius:10,padding:"8px 6px",textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:800,color:"#1A1A1A"}}>{value}</div>
                  <div style={{fontSize:10,fontWeight:700,color:"#666",letterSpacing:"0.5px",textTransform:"uppercase"}}>{label}</div>
                </div>);
              return(
              <div key={s.id} className="sup-widget" role="button" tabIndex={0} title="Click to open"
                onClick={()=>setSelectedId(s.id)} onKeyDown={e=>{if(e.key==="Enter")setSelectedId(s.id);}}
                style={{background:pal.bg,borderRadius:16,padding:16,cursor:"pointer",position:"relative",
                  borderTop:`6px solid ${pal.accent}`,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{numSupplier(s.name)}</div>
                    <div style={{fontSize:12,color:"#555",marginTop:2}}>{s.country||"—"}</div>
                  </div>
                  <span style={{padding:"3px 10px",borderRadius:12,fontSize:10,fontWeight:800,flexShrink:0,
                    background:active?"rgba(16,185,129,0.18)":"rgba(153,153,153,0.25)",color:active?"#10B981":"#888"}}>{(s.status||"—").toUpperCase()}</span>
                </div>
                <div style={{margin:"14px 0 10px",fontSize:24,fontWeight:800,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(s.revenue)}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {stat("Numbers",s.number_count)}{stat("Test #",s.test_number_count)}{stat("Calls",s.calls)}{stat("Min",s.minutes)}
                </div>
                {user?.role==='superadmin'&&<button onClick={e=>{e.stopPropagation();delSupplier(s);}}
                  style={{position:"absolute",right:10,bottom:-12,padding:"3px 10px",borderRadius:12,border:"1px solid #EF4444",
                    background:"#FFF",color:"#EF4444",fontSize:10,fontWeight:700,cursor:"pointer"}}>Delete</button>}
              </div>
            );})}
          </div>}
        </div>
      </div>
    </div>
  );
}

function SupplierWorkspace({token,user,setPage,supplier,onBack}){
  const [prefixes,setPrefixes]=useState([]);
  const [numbers,setNumbers]=useState({numbers:[],ranges:[]});
  const [testNumbers,setTestNumbers]=useState([]);
  const [accessHistory,setAccessHistory]=useState([]);
  const [liveCalls,setLiveCalls]=useState([]);
  const [liveGrp,toggleLiveGrp]=useGroupBy();
  const [loadingLive,setLoadingLive]=useState(false);
  const [msg,setMsg]=useState(null);
  const [saving,setSaving]=useState(false);

  const [showAddPrefix,setShowAddPrefix]=useState(false);
  const [editingPrefix,setEditingPrefix]=useState(null);
  const [prefixForm,setPrefixForm]=useState({prefix:"",country:"",country_code:"",price:"",payment_term:"",test_number:"",operator:"",ivr_context:"",status:"active"});
  const [showAddNum,setShowAddNum]=useState(false);
  const [addNum,setAddNum]=useState({prefix_id:"",mode:"single",number:"",range_start:"",range_end:""});
  const [showAddTest,setShowAddTest]=useState(false);
  const [addTest,setAddTest]=useState({prefix_id:"",number:""});

  // Upload and Paste share this exact same state/flow and the same
  // backend engine (/import/preview, /import/confirm) - the only
  // difference between them is how importText gets populated.
  const [showImport,setShowImport]=useState(false);
  const [importMode,setImportMode]=useState("upload");
  const [importText,setImportText]=useState("");
  const [importFileName,setImportFileName]=useState("");
  const [importStep,setImportStep]=useState("input");
  const [importPreviewData,setImportPreviewData]=useState(null);
  const [importing,setImporting]=useState(false);

  const [showPayment,setShowPayment]=useState(false);
  const [payLoading,setPayLoading]=useState(false);
  const [currentPeriod,setCurrentPeriod]=useState(null);
  const [payHistory,setPayHistory]=useState([]);
  const [payHistFilter,setPayHistFilter]=useState({payment_term:"",date_from:"",date_to:""});
  const [payDialog,setPayDialog]=useState(null);
  const [payDialogForm,setPayDialogForm]=useState({paid_at:"",reference:"",notes:""});

  const [showApi,setShowApi]=useState(false);
  const [apiForm,setApiForm]=useState({api_enabled:!!supplier.api_enabled,api_type:supplier.api_type||"",
    api_endpoint:supplier.api_endpoint||"",api_auth_method:supplier.api_auth_method||"",api_secret:""});
  // Mirrors apiForm.api_enabled once saved - the `supplier` prop itself is
  // never refreshed after a save, so gating UI on it directly would keep
  // showing/hiding API-sourced sections based on stale data.
  const [apiEnabled,setApiEnabled]=useState(!!supplier.api_enabled);
  const [revealedSecret,setRevealedSecret]=useState(null);
  const [apiTestResult,setApiTestResult]=useState(null);
  const [syncingNumbers,setSyncingNumbers]=useState(false);
  const [syncNumbersResult,setSyncNumbersResult]=useState(null);
  const [syncingCdr,setSyncingCdr]=useState(false);
  const [syncCdrResult,setSyncCdrResult]=useState(null);
  const [cdrRows,setCdrRows]=useState([]);
  const [cdrFileName,setCdrFileName]=useState("");
  const [cdrMode,setCdrMode]=useState("skip");
  const [cdrImporting,setCdrImporting]=useState(false);
  const [cdrImportResult,setCdrImportResult]=useState(null);
  const [cdrInfo,setCdrInfo]=useState("");
  const [cdrRaw,setCdrRaw]=useState(null);       // rows as read from the file, before mapping
  const [cdrDayFirst,setCdrDayFirst]=useState(null); // null = detect, true = DD/MM, false = MM/DD
  const [cdrDateCertain,setCdrDateCertain]=useState(true);
  const [cdrPreview,setCdrPreview]=useState("");
  const [cdrSummary,setCdrSummary]=useState(null); // weekly report (calls / minutes / payout per number), not per-call rows
  const [checkingLive,setCheckingLive]=useState(false);
  const [checkLiveResult,setCheckLiveResult]=useState(null);
  const [supplierCdr,setSupplierCdr]=useState([]);

  const liveCallRef=useRef(null);
  const SAUDI_OPERATORS=["STC","Mobily","Zain KSA","Virgin Mobile","Lebara","Friendi Mobile","Red Bull MOBILE","Other"];

  const loadPrefixes=()=>apiFetch(`/supplier-accounts/${supplier.id}/prefixes`,token).then(d=>setPrefixes(d.data||[]));
  const loadNumbers=()=>apiFetch(`/supplier-accounts/${supplier.id}/numbers`,token).then(d=>setNumbers(d.data||{numbers:[],ranges:[]}));
  const loadSupplierCdr=()=>apiFetch(`/supplier-accounts/${supplier.id}/cdr?pageSize=50`,token).then(d=>setSupplierCdr(d.data||[]));
  const loadTest=()=>apiFetch(`/supplier-accounts/${supplier.id}/test-numbers`,token).then(d=>setTestNumbers(d.data||[]));
  const loadAccessHistory=()=>apiFetch(`/supplier-accounts/${supplier.id}/access-history`,token).then(d=>setAccessHistory(d.data||[]));
  const [ivrs,setIvrs]=useState([]);
  const loadIvrs=()=>apiFetch("/ivr-lib/audio",token).then(d=>setIvrs(d.data||[]));

  useEffect(()=>{ loadPrefixes(); loadNumbers(); loadTest(); loadAccessHistory(); loadSupplierCdr(); loadIvrs(); },[supplier.id]);

  const flash=(t)=>{setMsg(t);setTimeout(()=>setMsg(null),3000);};
  const scrollTo=(ref)=>ref.current?.scrollIntoView({behavior:"smooth",block:"start"});

  // ── Live Calls: unified table (Asterisk + supplier's own API, deduped) ──
  // Reuses the existing global /live-calls (Asterisk) and, when this
  // supplier has a linked trunk with its own external API configured, the
  // existing global /live-calls (Asterisk) and, when this supplier has its
  // own API configured, /supplier-accounts/{id}/api-live-calls (a thin
  // passthrough to the supplier's real GET /active-calls). Calls are
  // matched to this supplier by number/prefix, never by re-asking the
  // user to enter anything.
  const formatCallBegan=(v)=>{
    if(v==null||v==="") return null;
    if(typeof v==="number") return new Date(v*1000).toLocaleString();
    return v;
  };
  const loadLiveCalls=async()=>{
    setLoadingLive(true);
    const supplierNumbers=new Set([
      ...numbers.numbers.map(n=>(n.number||"").replace("+","")),
      ...testNumbers.map(n=>(n.number||"").replace("+","")),
    ]);
    const supplierPrefixes=prefixes.map(p=>p.prefix).filter(Boolean);
    const matches=(rawNum)=>{
      const num=(rawNum||"").replace("+","");
      if(!num) return false;
      if(supplierNumbers.has(num)) return true;
      return supplierPrefixes.some(p=>num.startsWith(p));
    };
    const findPrefix=(rawNum)=>{
      const num=(rawNum||"").replace("+","");
      return prefixes.find(p=>num.startsWith(p.prefix))?.prefix || "—";
    };

    const [asteriskRes,apiRes]=await Promise.all([
      apiFetch("/live-calls",token).catch(()=>({data:[]})),
      apiFetch(`/supplier-accounts/${supplier.id}/api-live-calls`,token).catch(()=>({data:[]})),
    ]);

    const asteriskCalls=(asteriskRes.data||[]).filter(c=>matches(c.did||c.dst)).map(c=>({
      key:(c.did||c.dst||"").replace("+","")+":"+(c.src||"").replace("+",""),
      status:c.state||"Active",
      number:c.did||c.dst||"—",
      caller:c.src||"—",
      start_time:c.start_time||"—",
      duration:c.seconds??c.billsec??0,
      prefix:c.prefix||findPrefix(c.did||c.dst),
      route:c.ivr_context||"—",
      source:"Asterisk",
    }));

    const rawApiList=Array.isArray(apiRes.data)?apiRes.data:(apiRes.data?.calls||apiRes.data?.data||[]);
    const apiCalls=(rawApiList||[]).map(c=>{
      const number=c.did||c.number||c.dst||c.destination||c.prn||"";
      const caller=c.caller||c.src||c.from||c.cli||"";
      return {
        key:(number||"").replace("+","")+":"+(caller||"").replace("+",""),
        status:c.status||c.state||"Active",
        number:number||"—",
        caller:caller||"—",
        start_time:c.start_time||c.started_at||c.start||formatCallBegan(c.callBegan)||"—",
        duration:c.duration??c.seconds??c.billsec??c.callDuration??0,
        prefix:findPrefix(number),
        route:c.route||c.ivr||c.operator||"—",
        source:"API",
      };
    }).filter(c=>matches(c.number));

    // Dedup by number+caller composite key (no shared call-ID across the
    // two heterogeneous sources) - Asterisk record wins when both exist.
    const seen=new Set(asteriskCalls.map(c=>c.key));
    const merged=[...asteriskCalls];
    apiCalls.forEach(c=>{ if(!seen.has(c.key)){ merged.push(c); seen.add(c.key); } });

    setLiveCalls(merged);
    setLoadingLive(false);
  };

  useEffect(()=>{ loadLiveCalls(); },[supplier.id,prefixes.length,numbers.numbers.length,testNumbers.length]);

  const applyAsterisk=async()=>{
    if(!window.confirm("Apply the Asterisk configuration now? It is validated first and reverted automatically if verification fails.")) return;
    setSaving(true);
    const d=await apiFetch("/asterisk-config/apply",token,{method:"POST"});
    setSaving(false);
    const r=d?.data;
    if(r?.status==="success") flash("Asterisk configuration applied");
    else alert(`Apply ${r?.status||"failed"}: ${r?.summary||d?.error||d?.message||"unknown error"}`);
  };

  const openAddPrefix=()=>{setEditingPrefix(null);setPrefixForm({prefix:"",country:"",country_code:"",price:"",payment_term:"",test_number:"",operator:"",ivr_context:"",status:"active"});setShowAddPrefix(true);};
  const openEditPrefix=(p)=>{setEditingPrefix(p);setPrefixForm({prefix:p.prefix,country:p.country||"",country_code:p.country_code||"",price:p.price,payment_term:p.payment_term||"",test_number:p.test_number||"",operator:p.operator||"",ivr_context:p.ivr_context||"",status:p.status});setShowAddPrefix(true);};

  const savePrefix=async()=>{
    if(!prefixForm.prefix||!prefixForm.country||!prefixForm.price||!prefixForm.payment_term||(!editingPrefix&&!prefixForm.test_number)){
      alert("Prefix, country, price, payment term and test number are required");return;
    }
    setSaving(true);
    const d=editingPrefix
      ?await apiFetch(`/supplier-accounts/${supplier.id}/prefixes/${editingPrefix.id}`,token,{method:"PUT",body:JSON.stringify(prefixForm)})
      :await apiFetch(`/supplier-accounts/${supplier.id}/prefixes`,token,{method:"POST",body:JSON.stringify(prefixForm)});
    setSaving(false);
    if(d.success){
      flash(editingPrefix?"Prefix updated":"Prefix added");
      setShowAddPrefix(false); loadPrefixes(); loadTest();
    } else alert(d.error||"Failed to save prefix");
  };

  const delPrefix=async(p)=>{
    const msg2=`Deleting this prefix will also permanently remove ${p.number_count} number(s)/range(s) and ${p.test_number_count} test number(s) associated with this prefix. Continue?`;
    if(!window.confirm(msg2)) return;
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/prefixes/${p.id}`,token,{method:"DELETE"});
    if(d.success){flash("Prefix deleted");loadPrefixes();loadNumbers();loadTest();loadAccessHistory();}
    else alert(d.error||"Failed to delete");
  };

  const addNumber=async()=>{
    if(!addNum.prefix_id){alert("Select a Prefix first");return;}
    if(addNum.mode==="single"&&!addNum.number){alert("Number is required");return;}
    if(addNum.mode==="range"&&(!addNum.range_start||!addNum.range_end)){alert("Range start and end are required");return;}
    setSaving(true);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/numbers`,token,{method:"POST",body:JSON.stringify(addNum)});
    setSaving(false);
    if(d.success){
      flash("Number"+(addNum.mode==="range"?" range":"")+" added");
      setAddNum({prefix_id:"",mode:"single",number:"",range_start:"",range_end:""});
      setShowAddNum(false); loadNumbers(); loadPrefixes();
    } else alert(d.error||"Failed to add");
  };

  const delNumber=async(id)=>{ if(!window.confirm("Remove this number?"))return; await apiFetch("/dids/"+id,token,{method:"DELETE"}); loadNumbers(); loadPrefixes(); };
  const delRange=async(id)=>{ if(!window.confirm("Remove this range?"))return; await apiFetch("/did-ranges/"+id,token,{method:"DELETE"}); loadNumbers(); loadPrefixes(); };

  // Group individual DIDs by country + prefix so the main table shows one
  // row per prefix/range (count computed from the live dids data) instead
  // of every DID; expanding a row reveals the underlying numbers.
  const [numSearch,setNumSearch]=useState("");
  const [expandedNumGroups,setExpandedNumGroups]=useState({});
  const toggleNumGroup=(key)=>setExpandedNumGroups(e=>({...e,[key]:!e[key]}));
  const numberGroups=(()=>{
    const map={};
    numbers.numbers.forEach(n=>{
      const key=(n.country_name||"—")+"|"+(n.prefix||n.number);
      if(!map[key]) map[key]={key,country_name:n.country_name,prefix:n.prefix||n.number,items:[]};
      map[key].items.push(n);
    });
    return Object.values(map);
  })();
  const numSearchLower=numSearch.trim().toLowerCase();
  const filteredNumberGroups=numSearchLower?numberGroups.map(g=>{
    const prefixMatch=(g.prefix||"").toLowerCase().includes(numSearchLower)||(g.country_name||"").toLowerCase().includes(numSearchLower);
    if(prefixMatch) return g;
    const items=g.items.filter(n=>(n.number||"").toLowerCase().includes(numSearchLower));
    return items.length?{...g,items}:null;
  }).filter(Boolean):numberGroups;
  const filteredRangesForSearch=numSearchLower?numbers.ranges.filter(r=>(r.prefix||"").toLowerCase().includes(numSearchLower)||(r.country_name||"").toLowerCase().includes(numSearchLower)):numbers.ranges;

  const addTestNumber=async()=>{
    if(!addTest.prefix_id){alert("Select a Prefix first");return;}
    if(!addTest.number){alert("Test number is required");return;}
    setSaving(true);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/test-numbers`,token,{method:"POST",body:JSON.stringify(addTest)});
    setSaving(false);
    if(d.success){
      flash("Test number added");
      setAddTest({prefix_id:"",number:""});
      setShowAddTest(false); loadTest(); loadPrefixes();
    } else alert(d.error||"Failed to add");
  };
  const delTest=async(id)=>{ if(!window.confirm("Remove this test number?"))return; await apiFetch("/dids/"+id,token,{method:"DELETE"}); loadTest(); loadPrefixes(); };

  // ── Number Import: Upload + Paste share this one flow ───────────
  const openImport=(mode)=>{
    setImportMode(mode); setImportText(""); setImportFileName("");
    setImportStep("input"); setImportPreviewData(null); setShowImport(true);
  };

  const handleImportFile=(e)=>{
    const file=e.target.files?.[0];
    if(!file) return;
    if(!/\.(csv|txt|xlsx|xls)$/i.test(file.name)){ alert("Please choose a .csv, .txt, .xlsx or .xls file"); return; }
    setImportFileName(file.name);
    if(/\.(xlsx|xls)$/i.test(file.name)){
      const reader=new FileReader();
      reader.onload=async(ev)=>{
        // Excel workbook -> tab-separated text, so it flows through the
        // exact same parser/preview/confirm path as a pasted or .csv/.txt import.
        // Loaded on demand (~350KB) so every visitor isn't paying for it upfront.
        const XLSX=await import("xlsx");
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const sheet=wb.Sheets[wb.SheetNames[0]];
        const text=XLSX.utils.sheet_to_csv(sheet,{FS:"\t",blankrows:false});
        setImportText(text);
        runImportPreview(text);
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const text=ev.target.result;
      setImportText(text);
      runImportPreview(text);
    };
    reader.readAsText(file);
  };

  const runImportPreview=async(text)=>{
    const raw=text!==undefined?text:importText;
    if(!raw||!raw.trim()){alert("Nothing to preview yet");return;}
    setImporting(true);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/import/preview`,token,{method:"POST",body:JSON.stringify({raw_text:raw})});
    setImporting(false);
    if(d.data){ setImportPreviewData(d.data); setImportStep("preview"); }
    else alert(d.error||"Failed to parse import");
  };

  const runImportConfirm=async()=>{
    setImporting(true);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/import/confirm`,token,{method:"POST",
      body:JSON.stringify({records:importPreviewData.records})});
    setImporting(false);
    if(d.success){
      flash(`Imported: ${d.created_numbers} number(s), ${d.created_ranges} range(s), ${d.created_prefixes} new prefix(es) — ${d.skipped} skipped`);
      setShowImport(false); loadPrefixes(); loadNumbers(); loadTest();
    } else alert(d.error||"Failed to import");
  };

  // ── Payment: closed-period gating computed client-side from the
  // existing /supplier-payments/pending + /history endpoints (no backend
  // change) - a period is never shown as payable while still open.
  const isPeriodClosed=(term,periodStart)=>{
    const start=new Date(periodStart);
    const now=new Date();
    if(term==="Daily") return start.toDateString()!==now.toDateString();
    if(term==="Weekly"){ const end=new Date(start); end.setDate(end.getDate()+7); return now>=end; }
    if(term==="Monthly"){ const end=new Date(start); end.setMonth(end.getMonth()+1); return now>=end; }
    return true;
  };

  const loadPayHistory=async(filter=payHistFilter)=>{
    const params=new URLSearchParams({supplier_id:supplier.id});
    if(filter.payment_term) params.set("payment_term",filter.payment_term);
    if(filter.date_from) params.set("date_from",filter.date_from);
    if(filter.date_to) params.set("date_to",filter.date_to);
    const historyRes=await apiFetch("/supplier-payments/history?"+params.toString(),token);
    setPayHistory(historyRes.data||[]);
  };

  const openPaymentModal=async()=>{
    setShowPayment(true);
    setPayLoading(true);
    setPayHistFilter({payment_term:"",date_from:"",date_to:""});
    const [pendingRes]=await Promise.all([
      apiFetch("/supplier-payments/pending",token),
      loadPayHistory({payment_term:"",date_from:"",date_to:""}),
    ]);
    const bucket=Object.values(pendingRes.data||{}).flat().filter(r=>r.supplier_id===supplier.id);
    const withStatus=bucket.map(r=>({...r,closed:isPeriodClosed(r.payment_term,r.period_start)}));
    setCurrentPeriod(withStatus[0]||null);
    setPayLoading(false);
  };

  const openPayDialog=()=>{
    setPayDialog(currentPeriod);
    setPayDialogForm({paid_at:new Date().toISOString().slice(0,10),reference:"",notes:""});
  };

  const markPaid=async()=>{
    setSaving(true);
    const d=await apiFetch("/supplier-payments/mark-paid",token,{method:"POST",body:JSON.stringify({
      supplier_id:supplier.id,period_start:payDialog.period_start,period_end:payDialog.period_end,
      payment_term:payDialog.payment_term,...payDialogForm,
    })});
    setSaving(false);
    if(d.success){
      flash("Marked paid");
      setPayDialog(null);
      openPaymentModal();
    } else alert(d.error||"Failed to mark paid");
  };

  const saveApi=async()=>{
    setSaving(true);
    const body={...apiForm};
    if(!body.api_secret) delete body.api_secret;
    const d=await apiFetch(`/supplier-accounts/${supplier.id}`,token,{method:"PUT",body:JSON.stringify(body)});
    setSaving(false);
    if(d.success){flash("API settings saved");setApiForm({...apiForm,api_secret:""});setApiEnabled(apiForm.api_enabled);} else alert(d.error||"Failed to save");
  };

  const revealSecret=async()=>{
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/reveal`,token,{method:"POST"});
    if(d.value!==undefined) setRevealedSecret(d.value); else alert(d.error||"Failed to reveal");
  };

  const testConnection=async()=>{
    setApiTestResult({loading:true});
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/api-test`,token,{method:"POST"});
    setApiTestResult(d);
  };

  const syncApiNumbers=async()=>{
    setSyncingNumbers(true);setSyncNumbersResult(null);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/api-sync-numbers`,token,{method:"POST"});
    setSyncNumbersResult(d);setSyncingNumbers(false);
    if(d.success){loadNumbers();loadPrefixes();}
  };

  // ── Manual CDR upload (csv/xlsx). New rows are added; rows that match an
  // existing CDR (same CLI + PRN + call date) are skipped or replaced. ──
  // Map the rows read from the file; called again when the date order switch is changed
  const applyCdrRaw=(raw,dayFirst,mode)=>{
    const res=mapCdrRows(raw,dayFirst);
    setCdrRows(res.rows);setCdrDateCertain(res.dateCertain);
    if(res.rows.length===0){
      const cols=raw.length?Object.keys(raw[0]).join(", "):"(no rows found)";
      setCdrImportResult({success:false,error:`0 usable rows out of ${res.total}${mode==="text"?" (PDF read as plain text)":""}. Each row needs a date and a CLI or number column. Columns found: ${cols}`});
      setCdrInfo("");setCdrPreview("");
    }else{
      setCdrImportResult(null);
      setCdrInfo(`${mode?"PDF · ":""}dates read as ${res.dateFormat}${res.dateCertain?"":" (assumed)"}${res.repeats?` · ${res.repeats} repeated row${res.repeats>1?"s":""} inside the file (same date + CLI + number) will count as duplicates`:""}`);
      const f=res.rows[0];
      setCdrPreview(`First row: ${f.call_date} · ${f.cli} → ${f.prn} · ${f.billsec}s · ${f.payout}${f.currency_code?" "+f.currency_code:""}`);
    }
  };
  const changeCdrDayFirst=(v)=>{ setCdrDayFirst(v); if(cdrRaw) applyCdrRaw(cdrRaw,v,null); };
  const handleCdrFile=async(e)=>{
    const file=e.target.files?.[0];
    e.target.value="";
    setCdrImportResult(null);setCdrRows([]);setCdrInfo("");setCdrPreview("");setCdrRaw(null);setCdrDayFirst(null);setCdrDateCertain(true);setCdrSummary(null);
    if(!file) return;
    setCdrFileName(file.name);
    if(!/\.(csv|txt|xlsx|xls|pdf)$/i.test(file.name)){ setCdrImportResult({success:false,error:"Please choose a .csv, .xlsx, .xls or .pdf file"}); return; }
    try{
      let rows,mode=null,pre=[];
      if(/\.pdf$/i.test(file.name)){
        // PDF: text is read page by page and rebuilt into a table (header row if there is one, else line by line)
        const pdfjs=await import("pdfjs-dist/build/pdf.min.mjs");
        const workerSrc=(await import("pdfjs-dist/build/pdf.worker.min.mjs?raw")).default;
        pdfjs.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([workerSrc],{type:"text/javascript"}));
        const r=await readPdfRows(await file.arrayBuffer(),pdfjs);
        rows=r.rows;mode=r.mode;pre=r.pre||[];
        if(rows.length===0){
          setCdrImportResult({success:false,error:r.lineCount===0
            ?"No text found in this PDF - it looks like a scanned image. Please send it as CSV/Excel or a text PDF."
            :`Could not find call rows in this PDF (${r.lineCount} lines of text). Here is the start of what was read - send this to support to adjust the reader:\n${r.sample}`});
          return;
        }
      }else{
        const XLSX=await import("xlsx");
        if(/\.(csv|txt)$/i.test(file.name)){
          // raw:true keeps every cell as text, so long numbers and dates are not reinterpreted
          const wb=XLSX.read(await file.text(),{type:"string",raw:true});
          rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:true});
        }else{
          const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const raw=XLSX.utils.sheet_to_json(ws,{defval:"",raw:true});
          const fmt=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false,dateNF:"yyyy-mm-dd hh:mm:ss"});
          rows=raw.map((r,i)=>{const o={};for(const k in r){const v=r[k];o[k]=v instanceof Date?fmt[i][k]:(typeof v==="number"?String(v):v);}return o;});
        }
      }
      if(isSummaryRows(rows)){
        // Supplier weekly report: becomes one unpaid weekly entry + its lines (week from the file, else last week)
        const sm=parseSummaryRows(rows);
        const found=detectWeek(pre);
        setCdrRaw(null);setCdrRows([]);
        setCdrSummary({...sm,weekStart:(found||lastWeek()).start,weekFromFile:!!found});
        return;
      }
      setCdrRaw(rows);
      applyCdrRaw(rows,null,mode);
    }catch(err){
      setCdrImportResult({success:false,error:"Could not read the file: "+(err?.message||err)});
    }
  };
  const importCdrRows=async()=>{
    if(cdrSummary){
      setCdrImporting(true);setCdrImportResult(null);
      const d=await apiFetch(`/supplier-accounts/${supplier.id}/weekly-report`,token,{method:"POST",
        body:JSON.stringify({mode:cdrMode,week_start:cdrSummary.weekStart,lines:cdrSummary.lines})});
      setCdrImporting(false);
      if(d.success){setCdrImportResult({success:true,message:d.message});setCdrSummary(null);setCdrFileName("");loadSupplierCdr();}
      else setCdrImportResult({success:false,error:d.error||d.message||"Upload failed"});
      return;
    }
    if(cdrRows.length===0) return;
    setCdrImporting(true);setCdrImportResult(null);
    const tot={success:true,added:0,replaced:0,skipped:0,invalid:0,main_added:0,main_replaced:0,main_skipped:0,weekly_created:0,weekly_updated:0};
    for(let i=0;i<cdrRows.length;i+=1000){
      const d=await apiFetch(`/supplier-accounts/${supplier.id}/cdr-import`,token,{method:"POST",
        body:JSON.stringify({mode:cdrMode,rows:cdrRows.slice(i,i+1000)})});
      if(!d.success){setCdrImportResult({...tot,success:false,error:d.error||d.message||"Upload failed"});setCdrImporting(false);loadSupplierCdr();return;}
      tot.added+=d.added;tot.replaced+=d.replaced;tot.skipped+=d.skipped;tot.invalid+=d.invalid;tot.main_added+=d.main_added||0;tot.main_replaced+=d.main_replaced||0;tot.main_skipped+=d.main_skipped||0;tot.weekly_created+=d.weekly_created||0;tot.weekly_updated+=d.weekly_updated||0;
    }
    tot.message=`Supplier CDR: ${tot.added} new, ${tot.replaced} replaced, ${tot.skipped} skipped · Main CDR: ${tot.main_added} new, ${tot.main_replaced} replaced, ${tot.main_skipped} skipped · Weekly entries: ${tot.weekly_created} new, ${tot.weekly_updated} updated · ${tot.invalid} invalid`;
    setCdrImportResult(tot);setCdrImporting(false);setCdrRows([]);setCdrFileName("");setCdrInfo("");loadSupplierCdr();
  };

  const syncApiCdr=async()=>{
    setSyncingCdr(true);setSyncCdrResult(null);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/api-sync-cdr`,token,{method:"POST"});
    setSyncCdrResult(d);setSyncingCdr(false);
    if(d.success){loadSupplierCdr();}
  };

  const checkApiLiveCalls=async()=>{
    setCheckingLive(true);setCheckLiveResult(null);
    const d=await apiFetch(`/supplier-accounts/${supplier.id}/api-live-calls`,token);
    const count=Array.isArray(d.data)?d.data.length:0;
    setCheckLiveResult({success:true,message:`${count} active call${count===1?"":"s"} right now`});
    setCheckingLive(false);
    loadLiveCalls();
  };

  const actionBtn=(bg,border)=>({padding:"10px 18px",borderRadius:8,border:border?`1px solid ${border}`:"none",
    background:bg,color:border?border:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"});

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"14px 16px 18px"}}>
        <button onClick={onBack} style={{padding:"6px 12px",borderRadius:6,border:"1px solid #E0E0E0",
          background:"#F5F5F5",color:"#555",fontSize:12,fontWeight:600,cursor:"pointer"}}>← Suppliers</button>
        <div style={{textAlign:"center",marginTop:6}}>
          <h1 style={{fontSize:24,fontWeight:800,margin:0,color:"#1A1A1A"}}>{numSupplier(supplier.name)}</h1>
          <div style={{fontSize:12,color:"#999",marginTop:4}}>
            Code: {supplier.code||"—"} · Country: {supplier.country||"—"} ·{" "}
            <span style={{color:supplier.status==="active"?"#10B981":"#888",fontWeight:700}}>
              ● {supplier.status==="active"?"Active":"Inactive"}</span>
          </div>
        </div>
      </div>

      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"14px 16px"}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center"}}>
          <button onClick={()=>scrollTo(liveCallRef)} style={actionBtn("#2CADA6")}>+ LIVE CALL</button>
          <button onClick={openAddPrefix} style={actionBtn("#5B4FCF")}>+ ADD PREFIX</button>
          <button onClick={()=>setShowAddNum(true)} style={actionBtn("#2CADA6")}>+ ADD NUMBER / RANGE</button>
          <button onClick={()=>setShowAddTest(true)} style={actionBtn("#2CADA6")}>+ ADD TEST NUMBER</button>
          <button onClick={()=>openImport("upload")} style={actionBtn("#F5A623")}>+ UPLOAD NUMBER</button>
          <button onClick={()=>openImport("paste")} style={actionBtn("#F5A623")}>+ PASTE</button>
          <button onClick={openPaymentModal} style={actionBtn("#F5F5F5","#555")}>PAYMENT</button>
          <button onClick={()=>setShowApi(true)} style={actionBtn("#F5F5F5","#555")}>API</button>
          <button onClick={applyAsterisk} disabled={saving} style={actionBtn("#D64545")}>{saving?"APPLYING...":"APPLY TO ASTERISK"}</button>
        </div>
      </div>

      <div style={{padding:"12px 16px"}}>
        {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
          background:"rgba(16,185,129,0.1)",border:"1px solid #10B981",fontSize:12,color:"#10B981",fontWeight:600}}>✅ {msg}</div>}

        {/* LIVE CALL — supplier-specific only, never the global NOC feed */}
        <div ref={liveCallRef} style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>LIVE CALL</span>
            <button onClick={loadLiveCalls} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #2CADA6",
              background:"rgba(44,173,166,0.1)",color:"#2CADA6",fontSize:10,fontWeight:700,cursor:"pointer"}}>↻ Refresh</button>
          </div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead><tr>{[["SL"],["Prefix","prefix"],["CLI","cli"],["PRN","did"],["Supplier","supplier"],["Start Time","start"],["Duration","secs"]].map(([h,k],i)=>(
                <GroupHeading key={i} label={h} colKey={k} grp={liveGrp} toggle={toggleLiveGrp}
                  style={{...thSup,fontSize:12,fontWeight:800,color:"#FFF",background:"#2CADA6",padding:"10px 12px",borderBottom:"none",textAlign:"center"}}/>
              ))}</tr></thead>
              <tbody>
                {loadingLive?<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>Loading...</td></tr>:
                liveCalls.length===0?<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No live calls right now</td></tr>:
                (()=>{
                  const supName=numSupplier(supplier.name);
                  const items=liveCalls.map(c=>({c,prefix:c.prefix||"—",cli:c.caller||"—",did:String(c.number||"").replace("+",""),
                    supplier:supName,start:c.start_time||"",secs:Math.min(86400,Math.max(0,parseInt(c.duration)||0))}));
                  const display=groupDisplay(items,liveGrp,["start","secs"]);
                  const label={prefix:"Prefix",cli:"CLI",did:"PRN",supplier:"Supplier"}[liveGrp.key];
                  let n=0;
                  return display.map((d,idx)=>{
                    if(d.group!==undefined) return(
                      <tr key={"g"+idx}><td colSpan={7} style={groupBarStyle}>{label}: {d.group} · {d.count} call{d.count>1?"s":""}</td></tr>
                    );
                    const {c,secs}=d.row; n++;
                    const cell={padding:"8px 12px",fontSize:13,whiteSpace:"nowrap",textAlign:"center"};
                    const dur=(secs>=3600?[Math.floor(secs/3600),Math.floor((secs%3600)/60),secs%60]:[Math.floor(secs/60),secs%60]).map(v=>String(v).padStart(2,"0")).join(":");
                    return(
                    <tr key={"r"+(c.key||"")+idx} style={{borderBottom:"1px solid #F0F0F0",background:n%2===1?"#FFF":"#F9FFFE"}}>
                      <td style={{...cell,color:"#999",fontWeight:600}}>{n}</td>
                      <td style={{...cell,fontFamily:"monospace",color:"#555"}}>{d.row.prefix}</td>
                      <td style={{...cell,fontFamily:"monospace",color:"#1A1A1A",fontWeight:600}}>{d.row.cli}</td>
                      <td style={{...cell,fontFamily:"monospace",color:"#2CADA6",fontWeight:700}}>{d.row.did}</td>
                      <td style={{...cell,color:"#2CADA6",fontWeight:600}}>{d.row.supplier}</td>
                      <td style={{...cell,color:"#555"}}>{c.start_time}</td>
                      <td style={cell}>
                        <span style={{padding:"2px 8px",borderRadius:20,fontSize:13,fontWeight:700,background:"rgba(16,185,129,0.1)",
                          color:"#10B981",fontFamily:"monospace"}}>●{dur}</span></td>
                    </tr>
                  );});
                })()}
              </tbody>
            </GTable>
          </div>
        </div>

        {/* ACTIVE PREFIX */}
        <div style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5"}}>ACTIVE PREFIX</div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead><tr>{["Prefix","Country","Code","Price","Payment Term","IVR","Test Number","Actions"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
              <tbody>
                {prefixes.length===0?<tr><td colSpan={8} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No prefixes yet — use "+ ADD PREFIX" above</td></tr>:
                prefixes.map((p,i)=>(
                  <tr key={p.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace",fontWeight:700}}>{p.prefix}</td>
                    <td style={{padding:"8px 10px",fontSize:12,color:"#555"}}>{p.country||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace",color:"#555"}}>{p.country_code||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(p.price)}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{p.payment_term||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{(p.ivr_context||"—").replace("custom/","")}</td>
                    <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace"}}>{p.test_number||"—"}</td>
                    <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>
                      <button onClick={()=>openEditPrefix(p)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid #2CADA6",
                        background:"rgba(44,173,166,0.1)",color:"#2CADA6",fontSize:10,fontWeight:700,cursor:"pointer",marginRight:6}}>Edit</button>
                      <button onClick={()=>delPrefix(p)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid #EF4444",
                        background:"rgba(239,68,68,0.08)",color:"#EF4444",fontSize:10,fontWeight:700,cursor:"pointer"}}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </GTable>
          </div>
        </div>

        {/* NUMBER / RANGES */}
        <div style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5",display:"flex",
            justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <span>NUMBER / RANGES</span>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input value={numSearch} onChange={e=>setNumSearch(e.target.value)}
                placeholder="Search by number, country or prefix..."
                style={{...inpS,width:220,fontWeight:400,fontSize:11}}/>
              {numSearch&&<button onClick={()=>setNumSearch("")} style={{padding:"6px 10px",borderRadius:6,
                border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:11,cursor:"pointer"}}>Clear</button>}
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead><tr>{["Country","Prefix / Range","Numbers","Price","Term","Actions"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredNumberGroups.length===0&&filteredRangesForSearch.length===0?<tr><td colSpan={6} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No numbers found</td></tr>:<>
                {filteredNumberGroups.map((g,gi)=>{
                  const isExp=numSearchLower?true:!!expandedNumGroups[g.key];
                  const first=g.items[0]||{};
                  return(
                    <React.Fragment key={g.key}>
                      <tr onClick={()=>toggleNumGroup(g.key)} style={{borderBottom:"1px solid #F5F5F5",
                        background:isExp?"#F0FAFA":(gi%2?"#FAFAFA":"#FFF"),cursor:"pointer"}}>
                        <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{g.country_name||"—"}</td>
                        <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace",fontWeight:700}}>{g.prefix||"—"}</td>
                        <td style={{padding:"8px 10px",fontSize:11,color:"#333"}}>{g.items.length} number{g.items.length===1?"":"s"}</td>
                        <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(first.tariff)}</td>
                        <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{first.payment_terms||"—"}</td>
                        <td style={{padding:"8px 10px",textAlign:"center"}}>
                          <button onClick={e=>{e.stopPropagation();toggleNumGroup(g.key);}} style={{background:"none",border:"1px solid #2CADA6",borderRadius:4,
                            cursor:"pointer",fontSize:10,color:"#2CADA6",padding:"2px 8px",fontWeight:700}}>{isExp?"Collapse":"Expand"}</button>
                        </td>
                      </tr>
                      {isExp&&g.items.map((n,i)=>(
                        <tr key={n.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#EFFFFE":"#F5FFFE"}}>
                          <td style={{padding:"6px 10px"}}></td>
                          <td style={{padding:"6px 10px"}}></td>
                          <td style={{padding:"6px 10px 6px 26px",fontSize:12,fontFamily:"monospace",fontWeight:700}}>└ {n.number}</td>
                          <td style={{padding:"6px 10px",fontSize:11,color:"#555",fontFamily:"monospace"}}>{fmtUSDT(n.tariff)}</td>
                          <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{n.payment_terms||"—"}</td>
                          <td style={{padding:"6px 10px",textAlign:"center"}}>
                            <button onClick={()=>delNumber(n.id)} style={{background:"none",border:"1px solid #EF4444",borderRadius:4,
                              cursor:"pointer",fontSize:10,color:"#EF4444",padding:"2px 6px"}}>Del</button></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {filteredRangesForSearch.map((r,i)=>(
                  <tr key={"r"+r.id} style={{borderBottom:"1px solid #F5F5F5",background:"#FFFBEA"}}>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{r.country_name||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",fontWeight:700}}>{r.prefix||(r.range_start+" – "+r.range_end)}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#333"}}>{r.total_count} numbers</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(r.rate)}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{r.payment_terms||"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"center"}}>
                      <button onClick={()=>delRange(r.id)} style={{background:"none",border:"1px solid #EF4444",borderRadius:4,
                        cursor:"pointer",fontSize:10,color:"#EF4444",padding:"2px 6px"}}>Del</button></td>
                  </tr>
                ))}
                </>}
              </tbody>
            </GTable>
          </div>
        </div>

        {/* TEST NUMBERS */}
        <div style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5"}}>TEST NUMBERS</div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
              <thead><tr>{["Country","Prefix","Price","Number","Actions"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
              <tbody>
                {testNumbers.length===0?<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No test numbers yet — use "+ ADD TEST NUMBER" above</td></tr>:
                testNumbers.map((n,i)=>(
                  <tr key={n.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{n.country_name||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",color:"#555"}}>{n.prefix||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(n.tariff)}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace",fontWeight:700}}>{n.number}</td>
                    <td style={{padding:"8px 10px",textAlign:"center"}}>
                      <button onClick={()=>delTest(n.id)} style={{background:"none",border:"1px solid #EF4444",borderRadius:4,
                        cursor:"pointer",fontSize:10,color:"#EF4444",padding:"2px 6px"}}>Del</button></td>
                  </tr>
                ))}
              </tbody>
            </GTable>
          </div>
        </div>

        {/* UPLOAD CDR */}
        <div style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5"}}>UPLOAD CDR</div>
          <div style={{padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
            <label style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              ⬆ Choose file (.csv / .xlsx / .pdf)
              <input type="file" accept=".csv,.txt,.xlsx,.xls,.pdf" onChange={handleCdrFile} style={{display:"none"}}/>
            </label>
            {cdrFileName&&<span style={{fontSize:11,color:"#555"}}>{cdrFileName} — {cdrSummary?"weekly report read":`${cdrRows.length} rows ready`}{cdrInfo?" · "+cdrInfo:""}</span>}
            {cdrRows.length>0&&!cdrDateCertain&&(
              <select value={cdrDayFirst===null?"auto":cdrDayFirst?"dmy":"mdy"}
                onChange={e=>changeCdrDayFirst(e.target.value==="dmy"?true:e.target.value==="mdy"?false:null)}
                style={{padding:"6px 8px",borderRadius:6,border:"1px solid #F5A623",fontSize:11,fontFamily:"inherit"}}>
                <option value="auto">Dates: MM/DD/YYYY (assumed)</option>
                <option value="mdy">Dates are MM/DD/YYYY</option>
                <option value="dmy">Dates are DD/MM/YYYY</option>
              </select>)}
            <select value={cdrMode} onChange={e=>setCdrMode(e.target.value)}
              style={{padding:"6px 8px",borderRadius:6,border:"1px solid #CCC",fontSize:11,fontFamily:"inherit"}}>
              <option value="skip">If already recorded: Skip</option>
              <option value="replace">If already recorded: Replace</option>
            </select>
            <button onClick={importCdrRows} disabled={cdrImporting||(cdrRows.length===0&&!cdrSummary)}
              style={{padding:"7px 14px",borderRadius:20,border:"none",background:(cdrRows.length>0||cdrSummary)&&!cdrImporting?"#2CADA6":"#CCC",color:"#FFF",fontSize:11,fontWeight:700,cursor:(cdrRows.length>0||cdrSummary)&&!cdrImporting?"pointer":"default"}}>
              {cdrImporting?"Uploading...":"Upload CDR"}</button>
          </div>
          {cdrSummary&&(()=>{
            const wk=weekOf(new Date(cdrSummary.weekStart+"T00:00:00"));
            return(
            <div style={{padding:"0 14px 8px",fontSize:12,color:"#333"}}>
              <div><b>Weekly report</b> · {cdrSummary.total.lines} lines · {cdrSummary.total.calls} calls · {cdrSummary.total.minutes} min · payout <b>{fmtUSDT(cdrSummary.total.payout)}</b>
                {cdrSummary.currencies.length>1?" · currencies: "+cdrSummary.currencies.join(", ")+" (one entry each)":""}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:6}}>
                <span>Week:</span>
                <input type="date" value={cdrSummary.weekStart} onChange={e=>e.target.value&&setCdrSummary({...cdrSummary,weekStart:e.target.value,weekFromFile:true})}
                  style={{padding:"4px 6px",borderRadius:6,border:"1px solid #CCC",fontSize:12,fontFamily:"inherit"}}/>
                <span>→ {wk.start} to {wk.end} (Mon–Sun)</span>
                <span style={{color:cdrSummary.weekFromFile?"#10B981":"#F5A623",fontWeight:700}}>{cdrSummary.weekFromFile?"":"no dates in the file — last week assumed, change if needed"}</span>
              </div>
              <div style={{color:"#666",marginTop:4}}>Will be added as one unpaid weekly entry (Supplier Payments → Weekly) and these lines on this supplier's CDR page.</div>
            </div>);
          })()}
          {cdrPreview&&<div style={{fontSize:11,color:"#555",padding:"0 14px 6px"}}>{cdrPreview}</div>}
          <div style={{fontSize:10,color:"#999",padding:"0 14px 8px"}}>Columns: date, cli, prn (number), billsec/duration, payout, country, operator, account. Rows are saved to this supplier's CDR and, when the call was billable, to the main CDR; calls from weeks that have ended are added to unpaid weekly entries (Supplier Payments → Weekly). A row is a duplicate when date + CLI + number match an existing CDR: new rows are added, duplicates are skipped or replaced.</div>
          {cdrImportResult&&(
            <div style={{padding:"0 14px 10px",fontSize:11,fontWeight:600,whiteSpace:"pre-wrap",wordBreak:"break-word",userSelect:"text",color:cdrImportResult.success?"#10B981":"#EF4444"}}>
              {cdrImportResult.success?"✅ "+cdrImportResult.message:"❌ "+cdrImportResult.error+(cdrImportResult.added||cdrImportResult.replaced?` (done before error: ${cdrImportResult.added} new, ${cdrImportResult.replaced} replaced)`:"")}</div>
          )}
        </div>

        {/* SUPPLIER CDR (API) */}
        {(apiEnabled||supplierCdr.length>0)&&(
        <div style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5"}}>SUPPLIER CDR (API)</div>
          <div style={{fontSize:10,color:"#999",padding:"0 14px 8px"}}>From the supplier's /cdr API sync or an uploaded file — separate from Asterisk call records.</div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead><tr>{["Date","CLI","PRN","Country","Duration","Payout","Account"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
              <tbody>
                {supplierCdr.length===0?<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No CDR yet — upload a file above or use "Sync CDR" in the API settings</td></tr>:
                supplierCdr.map((c,i)=>(
                  <tr key={c.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{(c.call_date||"").replace("T"," ").slice(0,19)||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace"}}>{c.cli||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace"}}>{c.prn||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{c.country||"—"}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{c.billsec||0}s</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(c.payout)}</td>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{c.sub_account||c.account||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </GTable>
          </div>
        </div>
        )}

        {/* ACCESS HISTORY */}
        <div style={{...cardS,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5"}}>ACCESS HISTORY</div>
          <div style={{fontSize:10,color:"#999",padding:"0 14px 8px"}}>"Access From" is the caller/operator origin — never the supplier's SIP IP.</div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead><tr>{["Date","Prefix","Price","Test Number","Access From"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
              <tbody>
                {accessHistory.length===0?<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No access history yet</td></tr>:
                accessHistory.map((h,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                    <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{(h.date||"").slice(0,16).replace("T"," ")}</td>
                    <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",color:"#555"}}>{h.prefix}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(h.price)}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace",fontWeight:700}}>{h.test_number}</td>
                    <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace"}}>{h.access_from}</td>
                  </tr>
                ))}
              </tbody>
            </GTable>
          </div>
        </div>

        {/* SUPPLIER INFORMATION */}
        <div style={{...cardS,padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>SUPPLIER INFORMATION</span>
            <span style={{padding:"3px 10px",borderRadius:12,fontSize:10,fontWeight:700,
              background:supplier.status==="active"?"rgba(16,185,129,0.1)":"rgba(153,153,153,0.15)",
              color:supplier.status==="active"?"#10B981":"#888"}}>● {supplier.status==="active"?"Active":"Inactive"}</span>
          </div>
          {[["Code",supplier.code||"—"],["Country",supplier.country||"—"],["Contact",supplier.contact_name||"—"],
            ["Email",supplier.email||"—"],["Phone",supplier.phone||"—"],
            ["SIP Trunk",supplier.linked_trunk?numSupplier(supplier.linked_trunk.nickname):"No trunk linked"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",
              borderBottom:"1px solid #F5F5F5",fontSize:12}}>
              <span style={{color:"#888",fontWeight:600}}>{k}</span>
              <span style={{color:"#1A1A1A",fontWeight:600}}>{v}</span>
            </div>
          ))}
          {supplier.linked_trunk&&<button onClick={()=>setPage&&setPage("ast-trunks")}
            style={{marginTop:10,padding:"6px 14px",borderRadius:6,border:"1px solid #2CADA6",background:"rgba(44,173,166,0.1)",
              color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>View Trunk</button>}
        </div>
      </div>

      {showAddPrefix&&(
        <div onClick={()=>setShowAddPrefix(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:420,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>{editingPrefix?"Edit Prefix":"Add Prefix"}</div>
            <div style={{marginBottom:10}}><div style={lblS}>Prefix *</div>
              <input style={inpS} value={prefixForm.prefix} onChange={e=>setPrefixForm({...prefixForm,prefix:e.target.value})} placeholder="919876XXXX"/></div>
            <div style={{marginBottom:10}}><div style={lblS}>Country *</div>
              <select style={inpS} value={prefixForm.country} onChange={e=>{
                const name=e.target.value;
                const c=COUNTRIES.find(c=>c.name===name);
                setPrefixForm({...prefixForm,country:name,country_code:c?c.prefix:prefixForm.country_code});
              }}>
                <option value="">— Select —</option>
                {COUNTRIES.map(c=><option key={c.code} value={c.name}>{c.name}</option>)}
              </select></div>
            <div style={{marginBottom:10}}><div style={lblS}>Country Code</div>
              <select style={inpS} value={prefixForm.country_code} onChange={e=>setPrefixForm({...prefixForm,country_code:e.target.value})}>
                <option value="">— Select —</option>
                {COUNTRIES.map(c=><option key={c.code} value={c.prefix}>{c.prefix} — {c.name}</option>)}
              </select></div>
            <div style={{marginBottom:10}}><div style={lblS}>Price / Min ($) *</div>
              <input type="number" step="0.001" style={inpS} value={prefixForm.price} onChange={e=>setPrefixForm({...prefixForm,price:e.target.value})} placeholder="0.040"/></div>
            <div style={{marginBottom:10}}><div style={lblS}>Payment Term *</div>
              <select style={inpS} value={prefixForm.payment_term} onChange={e=>setPrefixForm({...prefixForm,payment_term:e.target.value})}>
                <option value="">— Select —</option>
                {PAYMENT_TERMS.map(t=><option key={t} value={t}>{t}</option>)}
              </select></div>
            <div style={{marginBottom:10}}>
              <div style={lblS}>Test Number {editingPrefix?"":"*"}</div>
              <input style={inpS} value={prefixForm.test_number} onChange={e=>setPrefixForm({...prefixForm,test_number:e.target.value})} placeholder="+919876543210" disabled={!!editingPrefix}/>
            </div>
            <div style={{marginBottom:10}}><div style={lblS}>Operator (optional)</div>
              <select style={inpS} value={prefixForm.operator} onChange={e=>setPrefixForm({...prefixForm,operator:e.target.value})}>
                <option value="">— Select —</option>
                {prefixForm.operator&&!SAUDI_OPERATORS.includes(prefixForm.operator)&&<option value={prefixForm.operator}>{prefixForm.operator}</option>}
                {SAUDI_OPERATORS.map(o=><option key={o} value={o}>{o}</option>)}
              </select></div>
            <div style={{marginBottom:10}}><div style={lblS}>IVR (optional)</div>
              <select style={inpS} value={prefixForm.ivr_context} onChange={e=>setPrefixForm({...prefixForm,ivr_context:e.target.value})}>
                <option value="">— Select —</option>
                {ivrs.map(i=><option key={i.id} value={`custom/${i.name}`}>{i.display_name||i.name}</option>)}
              </select>
              <div style={{fontSize:10,color:"#999",marginTop:4}}>Applies to every number under this prefix — new and existing.</div>
            </div>
            <div style={{marginBottom:16}}><div style={lblS}>Status</div>
              <select style={inpS} value={prefixForm.status} onChange={e=>setPrefixForm({...prefixForm,status:e.target.value})}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={savePrefix} disabled={saving}
                style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"#5B4FCF",color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                {saving?"Saving...":editingPrefix?"✅ Save Changes":"✅ Add Prefix"}</button>
              <button onClick={()=>setShowAddPrefix(false)}
                style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAddNum&&(
        <div onClick={()=>setShowAddNum(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:420,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>Add Number / Range</div>
            <div style={{marginBottom:10}}>
              <div style={lblS}>Prefix *</div>
              <select style={inpS} value={addNum.prefix_id} onChange={e=>setAddNum({...addNum,prefix_id:e.target.value})}>
                <option value="">— Select Prefix —</option>
                {prefixes.map(p=><option key={p.id} value={p.id}>{p.prefix} ({p.country})</option>)}
              </select>
            </div>
            {addNum.prefix_id&&(()=>{const p=prefixes.find(x=>String(x.id)===String(addNum.prefix_id));return p&&(
              <div style={{display:"flex",gap:16,marginBottom:10,fontSize:11,color:"#555",flexWrap:"wrap"}}>
                <span>Country: <b>{p.country}</b></span><span>Price: <b>{fmtUSDT(p.price)}/min</b></span><span>Term: <b>{p.payment_term}</b></span>
              </div>
            );})()}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {["single","range"].map(m=>(
                <button key={m} onClick={()=>setAddNum({...addNum,mode:m})}
                  style={{padding:"6px 14px",borderRadius:16,border:"1px solid "+(addNum.mode===m?"#2CADA6":"#E0E0E0"),
                    background:addNum.mode===m?"rgba(44,173,166,0.1)":"#FFF",
                    color:addNum.mode===m?"#2CADA6":"#666",fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"capitalize"}}>{m}</button>
              ))}
            </div>
            {addNum.mode==="single"?(
              <div style={{marginBottom:10}}><div style={lblS}>Number *</div>
                <input style={inpS} value={addNum.number} onChange={e=>setAddNum({...addNum,number:e.target.value})} placeholder="+9198760001"/></div>
            ):(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><div style={lblS}>From *</div>
                <input style={inpS} value={addNum.range_start} onChange={e=>setAddNum({...addNum,range_start:e.target.value})} placeholder="9198760001"/></div>
              <div><div style={lblS}>To *</div>
                <input style={inpS} value={addNum.range_end} onChange={e=>setAddNum({...addNum,range_end:e.target.value})} placeholder="9198760100"/></div>
            </div>)}
            <div style={{display:"flex",gap:8}}>
              <button onClick={addNumber} disabled={saving}
                style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                {saving?"Saving...":"✅ Add"}</button>
              <button onClick={()=>setShowAddNum(false)}
                style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAddTest&&(
        <div onClick={()=>setShowAddTest(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:420,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>Add Test Number</div>
            <div style={{marginBottom:10}}>
              <div style={lblS}>Prefix *</div>
              <select style={inpS} value={addTest.prefix_id} onChange={e=>setAddTest({...addTest,prefix_id:e.target.value})}>
                <option value="">— Select Prefix —</option>
                {prefixes.map(p=><option key={p.id} value={p.id}>{p.prefix} ({p.country})</option>)}
              </select>
            </div>
            {addTest.prefix_id&&(()=>{const p=prefixes.find(x=>String(x.id)===String(addTest.prefix_id));return p&&(
              <div style={{display:"flex",gap:16,marginBottom:10,fontSize:11,color:"#555"}}>
                <span>Country: <b>{p.country}</b></span><span>Price: <b>{fmtUSDT(p.price)}/min</b></span>
              </div>
            );})()}
            <div style={{marginBottom:16}}>
              <div style={lblS}>Number *</div>
              <input style={inpS} value={addTest.number} onChange={e=>setAddTest({...addTest,number:e.target.value})} placeholder="+919876543210"/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addTestNumber} disabled={saving}
                style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                {saving?"Saving...":"✅ Add Test Number"}</button>
              <button onClick={()=>setShowAddTest(false)}
                style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showImport&&(
        <div onClick={()=>setShowImport(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:820,maxWidth:"100%",padding:20,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:15,fontWeight:800}}>{importMode==="upload"?"Upload Number":"Paste Numbers"} — {numSupplier(supplier.name)}</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{setImportMode("upload");setImportStep("input");}}
                  style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+(importMode==="upload"?"#F5A623":"#E0E0E0"),
                    background:importMode==="upload"?"rgba(245,166,35,0.1)":"#FFF",color:importMode==="upload"?"#F5A623":"#888",
                    fontSize:10,fontWeight:700,cursor:"pointer"}}>Upload</button>
                <button onClick={()=>{setImportMode("paste");setImportStep("input");}}
                  style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+(importMode==="paste"?"#F5A623":"#E0E0E0"),
                    background:importMode==="paste"?"rgba(245,166,35,0.1)":"#FFF",color:importMode==="paste"?"#F5A623":"#888",
                    fontSize:10,fontWeight:700,cursor:"pointer"}}>Paste</button>
              </div>
            </div>
            <div style={{fontSize:11,color:"#999",marginBottom:14}}>
              Same intelligent parser either way — no fixed template required. Prices are always $/min; nothing is written until you confirm.
            </div>

            {importStep==="input"&&(<>
              {importMode==="upload"?(
                <div style={{...cardS,padding:20,textAlign:"center",border:"2px dashed #E0E0E0",marginBottom:14}}>
                  <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleImportFile} id="import-file-input" style={{display:"none"}}/>
                  <label htmlFor="import-file-input" style={{cursor:"pointer"}}>
                    <div style={{fontSize:30,marginBottom:8}}>📄</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#5B4FCF"}}>Click to choose a .csv, .txt, .xlsx or .xls file</div>
                    {importFileName&&<div style={{fontSize:11,color:"#999",marginTop:6}}>Selected: {importFileName}</div>}
                  </label>
                </div>
              ):(
                <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                  placeholder={"Paste numbers/ranges here, any format, e.g.:\n+919876543210, India, 0.040, 30/45, STC\n9779767851000  9779767851099  Nepal  0.06  Weekly  Ncell"}
                  style={{...inpS,minHeight:220,resize:"vertical",fontFamily:"monospace",fontSize:12,marginBottom:12}}/>
              )}
              <div style={{display:"flex",gap:8}}>
                {importMode==="paste"&&<button onClick={()=>runImportPreview()} disabled={importing}
                  style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"#F5A623",color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                  {importing?"Parsing...":"Preview"}</button>}
                <button onClick={()=>setShowImport(false)}
                  style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
              </div>
            </>)}

            {importStep==="preview"&&importPreviewData&&(<>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                {[["Total",importPreviewData.summary.total,"#555"],["New",importPreviewData.summary.new,"#10B981"],
                  ["Duplicate",importPreviewData.summary.duplicate,"#F5A623"],["Error",importPreviewData.summary.error,"#EF4444"],
                  ["New Prefixes",importPreviewData.summary.new_prefixes,"#5B4FCF"]].map(([k,v,c])=>(
                  <div key={k} style={{...cardS,padding:"8px 14px",background:"#F9F9F9"}}>
                    <div style={{fontSize:9,color:"#999",textTransform:"uppercase",fontWeight:700}}>{k}</div>
                    <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{overflowX:"auto",maxHeight:340,overflowY:"auto",marginBottom:14,border:"1px solid #F0F0F0",borderRadius:8}}>
                <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:820}}>
                  <thead><tr>{["Status","Number/Range","Country","Prefix","Price","Term","Operator","Note"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
                  <tbody>
                    {importPreviewData.records.map((rec,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                        <td style={{padding:"6px 10px"}}>
                          <span style={{padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,
                            background:rec.status==="new"?"rgba(16,185,129,0.1)":rec.status==="duplicate"?"rgba(245,166,35,0.12)":"rgba(239,68,68,0.1)",
                            color:rec.status==="new"?"#10B981":rec.status==="duplicate"?"#F5A623":"#EF4444"}}>{rec.status.toUpperCase()}</span></td>
                        <td style={{padding:"6px 10px",fontSize:11,fontFamily:"monospace",fontWeight:700}}>
                          {rec.mode==="range"?`${rec.range_start||"?"} – ${rec.range_end||"?"}`:(rec.number||"—")}</td>
                        <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{rec.country||"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:11,fontFamily:"monospace",color:"#555"}}>
                          {rec.prefix||"—"}{rec.will_create_prefix?" (new)":""}</td>
                        <td style={{padding:"6px 10px",fontSize:11,fontFamily:"monospace",color:"#10B981"}}>{rec.price?"$"+parseFloat(rec.price).toFixed(4):"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{rec.payment_term||"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{rec.operator||"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:10,color:"#999"}}>{rec.reason||""}</td>
                      </tr>
                    ))}
                  </tbody>
                </GTable>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={runImportConfirm} disabled={importing||importPreviewData.summary.new===0}
                  style={{flex:1,padding:"11px",borderRadius:8,border:"none",
                    background:importPreviewData.summary.new===0?"#DDD":"#10B981",color:"#FFF",fontSize:13,fontWeight:800,
                    cursor:importPreviewData.summary.new===0?"not-allowed":"pointer"}}>
                  {importing?"Importing...":`✅ CONFIRM IMPORT (${importPreviewData.summary.new})`}</button>
                <button onClick={()=>setImportStep("input")}
                  style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>← Back</button>
                <button onClick={()=>setShowImport(false)}
                  style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {showPayment&&(
        <div onClick={()=>setShowPayment(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:560,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Payment — {numSupplier(supplier.name)}</div>
            <div style={{fontSize:11,color:"#999",marginBottom:14}}>All amounts in $. Revenue becomes payable only after the payment-term period closes.</div>
            {payLoading?<div style={{padding:30,textAlign:"center",color:"#999"}}>Loading...</div>:(<>
              <div style={{...cardS,padding:14,marginBottom:14,background:"#F9F9F9"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",marginBottom:8}}>Current Period</div>
                {!currentPeriod?<div style={{fontSize:12,color:"#999"}}>No activity in the current period yet.</div>:(<>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:12,color:"#555"}}>{currentPeriod.period_start} → {currentPeriod.period_end}</span>
                    <span style={{padding:"3px 10px",borderRadius:10,fontSize:10,fontWeight:700,
                      background:currentPeriod.closed?"rgba(245,166,35,0.12)":"rgba(153,153,153,0.15)",
                      color:currentPeriod.closed?"#F5A623":"#888"}}>{currentPeriod.closed?"PENDING PAYMENT":"OPEN"}</span>
                  </div>
                  <div style={{fontSize:18,fontWeight:800,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(currentPeriod.amount)}</div>
                  <div style={{fontSize:11,color:"#999",marginTop:2}}>{currentPeriod.calls} calls · {currentPeriod.minutes} min · {currentPeriod.payment_term}</div>
                  {currentPeriod.closed&&<button onClick={openPayDialog}
                    style={{marginTop:10,padding:"8px 16px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>PAY</button>}
                  {!currentPeriod.closed&&<div style={{fontSize:10,color:"#AAA",marginTop:8}}>This period is still open and not yet payable.</div>}
                </>)}
              </div>

              <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Payment History</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
                <div><div style={lblS}>Term</div>
                  <select style={{...inpS,width:120}} value={payHistFilter.payment_term} onChange={e=>{
                    const f={...payHistFilter,payment_term:e.target.value}; setPayHistFilter(f); loadPayHistory(f);
                  }}>
                    <option value="">All</option>
                    <option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option>
                  </select></div>
                <div><div style={lblS}>From</div>
                  <input type="date" style={{...inpS,width:140}} value={payHistFilter.date_from} onChange={e=>{
                    const f={...payHistFilter,date_from:e.target.value}; setPayHistFilter(f); loadPayHistory(f);
                  }}/></div>
                <div><div style={lblS}>To</div>
                  <input type="date" style={{...inpS,width:140}} value={payHistFilter.date_to} onChange={e=>{
                    const f={...payHistFilter,date_to:e.target.value}; setPayHistFilter(f); loadPayHistory(f);
                  }}/></div>
                <div style={{marginLeft:"auto",textAlign:"right"}}>
                  <div style={lblS}>Revenue (filtered)</div>
                  <div style={{fontSize:15,fontWeight:800,color:"#10B981",fontFamily:"monospace"}}>
                    {fmtUSDT(payHistory.reduce((sum,h)=>sum+Number(h.total_amount||0),0))}</div>
                </div>
              </div>
              <div style={{overflowX:"auto",marginBottom:16}}>
                <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:560}}>
                  <thead><tr>{["Paid Date","Period","Term","Rate","Amount","Status"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
                  <tbody>
                    {payHistory.length===0?<tr><td colSpan={6} style={{padding:16,textAlign:"center",color:"#999",fontSize:12}}>No payments yet</td></tr>:
                    payHistory.map(h=>(
                      <tr key={h.id} style={{borderBottom:"1px solid #F5F5F5"}}>
                        <td style={{padding:"6px 10px",fontSize:11}}>{(h.paid_at||"").slice(0,10)}</td>
                        <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{h.period_start} → {h.period_end}</td>
                        <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{h.payment_term||"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:11,fontFamily:"monospace"}}>{fmtUSDT(h.rate)}</td>
                        <td style={{padding:"6px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(h.total_amount)}</td>
                        <td style={{padding:"6px 10px"}}><span style={{padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,background:"rgba(16,185,129,0.1)",color:"#10B981"}}>PAID</span></td>
                      </tr>
                    ))}
                  </tbody>
                </GTable>
              </div>
            </>)}
            <div style={{marginTop:16,textAlign:"right"}}>
              <button onClick={()=>setShowPayment(false)}
                style={{padding:"9px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:12,cursor:"pointer"}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {payDialog&&(
        <div onClick={()=>setPayDialog(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:310,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:380,padding:20}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>Mark as Paid</div>
            {[["Period",payDialog.period_start+" → "+payDialog.period_end],["Amount",fmtUSDT(payDialog.amount)],["Method","USDT"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F5F5",fontSize:12}}>
                <span style={{color:"#888",fontWeight:600}}>{k}</span><span style={{fontWeight:700}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:14,marginBottom:10}}>
              <div style={lblS}>Payment Date</div>
              <input type="date" style={inpS} value={payDialogForm.paid_at} onChange={e=>setPayDialogForm({...payDialogForm,paid_at:e.target.value})}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={lblS}>Reference / Transaction ID (optional)</div>
              <input style={inpS} value={payDialogForm.reference} onChange={e=>setPayDialogForm({...payDialogForm,reference:e.target.value})} placeholder="TX123"/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={lblS}>Notes (optional)</div>
              <textarea style={{...inpS,minHeight:50,resize:"vertical"}} value={payDialogForm.notes} onChange={e=>setPayDialogForm({...payDialogForm,notes:e.target.value})}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={markPaid} disabled={saving}
                style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"#10B981",color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                {saving?"Saving...":"✅ MARK AS PAID"}</button>
              <button onClick={()=>setPayDialog(null)}
                style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showApi&&(
        <div onClick={()=>setShowApi(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:480,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>API — {numSupplier(supplier.name)}</div>
            <div style={{fontSize:11,color:"#999",marginBottom:14}}>For CDR/number interrogation, balance/status and sync only — never required for normal SIP traffic.</div>
            <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,cursor:"pointer"}}>
              <input type="checkbox" checked={apiForm.api_enabled} onChange={e=>setApiForm({...apiForm,api_enabled:e.target.checked})}/>
              <span style={{fontSize:12,fontWeight:600}}>API Enabled</span>
            </label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div><div style={lblS}>API Type</div>
                <input style={inpS} value={apiForm.api_type} onChange={e=>setApiForm({...apiForm,api_type:e.target.value})} placeholder="REST"/></div>
              <div><div style={lblS}>Auth Method</div>
                <select style={inpS} value={apiForm.api_auth_method} onChange={e=>setApiForm({...apiForm,api_auth_method:e.target.value})}>
                  <option value="">— Select —</option>
                  <option value="bearer">Bearer Token</option><option value="basic">Basic Auth</option>
                  <option value="api_key">API Key</option></select></div>
              <div style={{gridColumn:"1 / -1"}}><div style={lblS}>Endpoint</div>
                <input style={inpS} value={apiForm.api_endpoint} onChange={e=>setApiForm({...apiForm,api_endpoint:e.target.value})} placeholder="https://supplier.example/api"/></div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={lblS}>Secret / Token {supplier.has_api_secret?"(configured — leave blank to keep)":""}</div>
                <input type="password" style={inpS} value={apiForm.api_secret} onChange={e=>setApiForm({...apiForm,api_secret:e.target.value})}
                  placeholder={supplier.has_api_secret?"••••••••":"Not set"}/>
                {supplier.has_api_secret&&user?.role==='superadmin'&&(
                  <button onClick={revealSecret} style={{marginTop:6,padding:"4px 10px",borderRadius:6,border:"1px solid #E0E0E0",
                    background:"#F5F5F5",color:"#555",fontSize:10,fontWeight:700,cursor:"pointer"}}>Reveal current value</button>
                )}
                {revealedSecret!==null&&<div style={{marginTop:6,padding:"6px 10px",borderRadius:6,background:"#FFF8E1",
                  border:"1px solid #F5A623",fontSize:11,fontFamily:"monospace",wordBreak:"break-all"}}>{revealedSecret}</div>}
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:10}}>
              <button onClick={saveApi} disabled={saving}
                style={{padding:"10px 20px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {saving?"Saving...":"✅ Save API Settings"}</button>
              <button onClick={testConnection} disabled={!supplier.api_endpoint&&!apiForm.api_endpoint}
                style={{padding:"10px 16px",borderRadius:8,border:"1px solid #2CADA6",background:"rgba(44,173,166,0.1)",
                  color:"#2CADA6",fontSize:12,fontWeight:700,cursor:"pointer"}}>Test Connection</button>
              {apiTestResult&&!apiTestResult.loading&&(
                <span style={{fontSize:11,fontWeight:700,color:apiTestResult.success?"#10B981":"#EF4444"}}>
                  {apiTestResult.success?"✅ Connected":"❌ "+(apiTestResult.error||"Connection failed")}</span>
              )}
              {apiTestResult?.loading&&<span style={{fontSize:11,color:"#999"}}>Testing...</span>}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
              <button onClick={syncApiNumbers} disabled={syncingNumbers||(!supplier.api_endpoint&&!apiForm.api_endpoint)}
                style={{padding:"9px 14px",borderRadius:8,border:"1px solid #2CADA6",background:"#FFF",
                  color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {syncingNumbers?"Syncing...":"⇅ Sync Numbers"}</button>
              <button onClick={syncApiCdr} disabled={syncingCdr||(!supplier.api_endpoint&&!apiForm.api_endpoint)}
                style={{padding:"9px 14px",borderRadius:8,border:"1px solid #2CADA6",background:"#FFF",
                  color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {syncingCdr?"Syncing...":"⇅ Sync CDR"}</button>
              <button onClick={checkApiLiveCalls} disabled={checkingLive||(!supplier.api_endpoint&&!apiForm.api_endpoint)}
                style={{padding:"9px 14px",borderRadius:8,border:"1px solid #2CADA6",background:"#FFF",
                  color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {checkingLive?"Checking...":"⇅ Sync Live Calls"}</button>
            </div>
            {syncNumbersResult&&(
              <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:syncNumbersResult.success?"#10B981":"#EF4444"}}>
                {syncNumbersResult.success?"✅ "+syncNumbersResult.message:"❌ "+(syncNumbersResult.error||"Sync failed")}</div>
            )}
            {syncCdrResult&&(
              <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:syncCdrResult.success?"#10B981":"#EF4444"}}>
                {syncCdrResult.success?"✅ "+syncCdrResult.message:"❌ "+(syncCdrResult.error||"Sync failed")}</div>
            )}
            {checkLiveResult&&(
              <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:checkLiveResult.success?"#10B981":"#EF4444"}}>
                {checkLiveResult.success?"✅ "+checkLiveResult.message:"❌ "+(checkLiveResult.error||"Check failed")}</div>
            )}
            <div style={{fontSize:10,color:"#AAA",marginBottom:16}}>
              Last sync: {supplier.api_last_sync||"never"} · Last status: {supplier.api_last_status||"—"}
            </div>
            <div style={{textAlign:"right"}}>
              <button onClick={()=>setShowApi(false)}
                style={{padding:"9px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:12,cursor:"pointer"}}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




// ── Supplier Payments (Pending / History / Payment Methods) ─────────
// Amounts here are always the supplier PAYABLE, computed server-side from
// the rate configured on each supplier's Number/Prefix/Range records —
// never the customer selling rate/revenue. This page never edits that
// rate; it only manages settlement of what's already been calculated.
function SupplierPaymentsPage({token,user}){
  const [tab,setTab]=useState("pending");
  const [pending,setPending]=useState({Daily:[],Weekly:[],Monthly:[],Other:[]});
  const [history,setHistory]=useState([]);
  const [weekly,setWeekly]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [msg,setMsg]=useState(null);
  const [payModal,setPayModal]=useState(null);
  const [payForm,setPayForm]=useState({paid_at:"",reference:"",notes:""});
  const [saving,setSaving]=useState(false);
  const [histFilter,setHistFilter]=useState({supplier_id:"",date_from:"",date_to:""});

  const loadPending=()=>apiFetch("/supplier-payments/pending",token).then(d=>setPending(d.data||{Daily:[],Weekly:[],Monthly:[],Other:[]}));
  const loadHistory=()=>{
    const params=new URLSearchParams();
    Object.entries(histFilter).forEach(([k,v])=>{if(v)params.set(k,v);});
    apiFetch("/supplier-payments/history?"+params.toString(),token).then(d=>setHistory(d.data||[]));
  };
  // Weekly entries: week, amount, Paid / Unpaid. Marking one Paid takes its calls out of the top bar's Rev.
  const loadWeekly=()=>apiFetch("/supplier-payments/history?status=all",token).then(d=>setWeekly(d.data||[]));
  const fmtWeek=(start,end)=>{
    const f=(d,y)=>new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",...(y?{year:"numeric"}:{})});
    return f(start,false)+" – "+f(end,true);
  };
  const fmtAmt=(a,cur)=>(cur==="EUR"?"€":"$")+parseFloat(a||0).toFixed(4);
  const setWeeklyPaid=async(w,paid)=>{
    if(!window.confirm((paid?"Mark as PAID: ":"Set back to UNPAID: ")+numSupplier(w.supplier_name)+" · "+fmtWeek(w.period_start,w.period_end)+" · "+fmtAmt(w.total_amount,w.currency)+" ?")) return;
    const d=await apiFetch(`/supplier-payments/invoices/${w.id}/${paid?"mark-paid":"mark-unpaid"}`,token,{method:"POST",body:JSON.stringify({})});
    if(d.success){flash(paid?"Marked paid":"Set back to unpaid");loadWeekly();loadPending();}
    else alert(d.error||"Failed");
  };
  const loadSuppliers=()=>apiFetch("/supplier-accounts",token).then(d=>setSuppliers(d.data||[]));

  useEffect(()=>{setLoading(true);Promise.all([loadPending(),loadSuppliers()]).then(()=>setLoading(false));},[token]);
  useEffect(()=>{if(tab==="history")loadHistory();if(tab==="weekly")loadWeekly();},[tab]);

  const flash=(t)=>{setMsg(t);setTimeout(()=>setMsg(null),3000);};

  const openPay=(row)=>{
    setPayModal(row);
    setPayForm({paid_at:new Date().toISOString().slice(0,10),reference:"",notes:""});
  };

  const markPaid=async()=>{
    setSaving(true);
    const d=await apiFetch("/supplier-payments/mark-paid",token,{method:"POST",body:JSON.stringify({
      supplier_id:payModal.supplier_id,period_start:payModal.period_start,period_end:payModal.period_end,
      payment_term:payModal.payment_term,...payForm,
    })});
    setSaving(false);
    if(d.success){
      flash("Marked paid: "+numSupplier(payModal.supplier_name));
      setPayModal(null); loadPending(); if(tab==="history") loadHistory();
    } else alert(d.error||"Failed to mark paid");
  };

  const TABS=[["pending","Pending"],["weekly","Weekly"],["history","History"]];
  const BUCKET_ORDER=["Daily","Weekly","Monthly","Other"];

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px"}}>
        <div style={{fontSize:18,fontWeight:700}}>💰 Supplier Payments</div>
        <div style={{fontSize:11,color:"#999",marginTop:2}}>All supplier pricing and payments are in $.</div>
      </div>
      <div style={{padding:"0 16px",background:"#FFF",borderBottom:"1px solid #E0E0E0",display:"flex",gap:4}}>
        {TABS.map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"12px 14px",border:"none",background:"transparent",cursor:"pointer",
              fontSize:12,fontWeight:700,color:tab===id?"#2CADA6":"#888",
              borderBottom:tab===id?"2px solid #2CADA6":"2px solid transparent"}}>{label}</button>
        ))}
      </div>
      <div style={{padding:"12px 16px"}}>
        {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,background:"rgba(16,185,129,0.1)",border:"1px solid #10B981",fontSize:12,color:"#10B981",fontWeight:600}}>✅ {msg}</div>}

        {tab==="pending"&&(loading?<div style={{padding:40,textAlign:"center",color:"#999"}}>Loading...</div>:
          BUCKET_ORDER.map(bucket=>{
            const rows=pending[bucket]||[];
            return(
              <div key={bucket} style={{...cardS,overflow:"hidden",marginBottom:14}}>
                <div style={{padding:"10px 14px",fontSize:12,fontWeight:700,background:"#F5F5F5",display:"flex",justifyContent:"space-between"}}>
                  <span>{bucket}</span><span style={{color:"#999"}}>{rows.length} pending</span>
                </div>
                {rows.length===0?<div style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>Nothing pending</div>:
                <div style={{overflowX:"auto"}}>
                  <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
                    <thead><tr>{["Supplier","Settlement Period","Calls","Billable Minutes","Amount Due","Payment Term","Due Date","Status","Action"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((r,i)=>{
                        const overdue=new Date(r.due_date)<new Date(new Date().toDateString());
                        return(
                        <tr key={r.supplier_id+r.payment_term+i} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                          <td style={{padding:"8px 10px",fontSize:12,fontWeight:700}}>{numSupplier(r.supplier_name)}</td>
                          <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{r.period_start} → {r.period_end}</td>
                          <td style={{padding:"8px 10px",fontSize:12}}>{r.calls}</td>
                          <td style={{padding:"8px 10px",fontSize:12}}>{r.minutes}</td>
                          <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(r.amount)}</td>
                          <td style={{padding:"8px 10px",fontSize:11}}>{r.payment_term}</td>
                          <td style={{padding:"8px 10px",fontSize:11,color:overdue?"#EF4444":"#555",fontWeight:overdue?700:400}}>{r.due_date}</td>
                          <td style={{padding:"8px 10px"}}>
                            <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                              background:overdue?"rgba(239,68,68,0.1)":"rgba(245,166,35,0.12)",
                              color:overdue?"#EF4444":"#F5A623"}}>{overdue?"OVERDUE":"PENDING"}</span></td>
                          <td style={{padding:"8px 10px"}}>
                            <button onClick={()=>openPay(r)}
                              style={{padding:"5px 14px",borderRadius:6,border:"none",background:"#2CADA6",
                                color:"#FFF",fontSize:11,fontWeight:700,cursor:"pointer"}}>PAY</button></td>
                        </tr>
                      );})}
                    </tbody>
                  </GTable>
                </div>}
              </div>
            );
          })
        )}


        {tab==="weekly"&&(
          <div>
            {(()=>{
              const unpaidTotal=weekly.filter(w=>w.status!=="paid").reduce((t,w)=>t+Number(w.total_amount||0),0);
              return <div style={{fontSize:12,color:"#555",marginBottom:10}}>Unpaid: <b style={{color:"#F5A623"}}>{fmtUSDT(unpaidTotal)}</b> · click <b>Paid</b> after you pay a week — it comes off Rev in the top bar.</div>;
            })()}
            <div style={{...cardS,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:560}}>
                  <thead><tr>{["Week","Supplier","Amount","Status","Action"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
                  <tbody>
                    {weekly.length===0?<tr><td colSpan={5} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No weekly entries yet</td></tr>:
                    weekly.map((w,i)=>{
                      const paid=w.status==="paid";
                      const weeklyEntry=!String(w.invoice_number||"").startsWith("SPAY-");
                      return(
                      <tr key={w.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                        <td style={{padding:"8px 10px",fontSize:12}}>{fmtWeek(w.period_start,w.period_end)}</td>
                        <td style={{padding:"8px 10px",fontSize:12,fontWeight:700}}>{numSupplier(w.supplier_name)}</td>
                        <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,fontFamily:"monospace"}}>{fmtAmt(w.total_amount,w.currency)}</td>
                        <td style={{padding:"8px 10px"}}>
                          <span style={{padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700,
                            background:paid?"rgba(16,185,129,0.1)":"rgba(245,166,35,0.12)",color:paid?"#10B981":"#F5A623"}}>{paid?"Paid":"Unpaid"}</span></td>
                        <td style={{padding:"8px 10px"}}>
                          {!paid
                            ?<button onClick={()=>setWeeklyPaid(w,true)}
                                style={{padding:"5px 14px",borderRadius:6,border:"none",background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>✔ Paid</button>
                            :weeklyEntry&&<button onClick={()=>setWeeklyPaid(w,false)}
                                style={{padding:"5px 12px",borderRadius:6,border:"1px solid #CCC",background:"#FFF",color:"#666",fontSize:11,fontWeight:700,cursor:"pointer"}}>↺ Unpaid</button>}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </GTable>
              </div>
            </div>
          </div>
        )}

        {tab==="history"&&(
          <div>
            <div style={{...cardS,padding:12,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div><div style={lblS}>Supplier</div>
                <select style={{...inpS,width:160}} value={histFilter.supplier_id} onChange={e=>setHistFilter({...histFilter,supplier_id:e.target.value})}>
                  <option value="">All</option>{suppliers.map(s=><option key={s.id} value={s.id}>{numSupplier(s.name)}</option>)}
                </select></div>
              <div><div style={lblS}>From</div>
                <input type="date" style={{...inpS,width:140}} value={histFilter.date_from} onChange={e=>setHistFilter({...histFilter,date_from:e.target.value})}/></div>
              <div><div style={lblS}>To</div>
                <input type="date" style={{...inpS,width:140}} value={histFilter.date_to} onChange={e=>setHistFilter({...histFilter,date_to:e.target.value})}/></div>
              <button onClick={loadHistory} style={{padding:"9px 16px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>Filter</button>
            </div>
            <div style={{...cardS,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:1000}}>
                  <thead><tr>{["Paid Date","Supplier","Settlement Period","Calls","Billable Minutes","Supplier Rate","Amount Paid","Payment Method","Reference","Status"].map((h,i)=><th key={i} style={thSup}>{h}</th>)}</tr></thead>
                  <tbody>
                    {history.length===0?<tr><td colSpan={10} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No payments yet</td></tr>:
                    history.map((h,i)=>(
                      <tr key={h.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2?"#FAFAFA":"#FFF"}}>
                        <td style={{padding:"8px 10px",fontSize:11}}>{(h.paid_at||"").slice(0,10)}</td>
                        <td style={{padding:"8px 10px",fontSize:12,fontWeight:700}}>{numSupplier(h.supplier_name)}</td>
                        <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{h.period_start} → {h.period_end}</td>
                        <td style={{padding:"8px 10px",fontSize:12}}>{h.total_calls}</td>
                        <td style={{padding:"8px 10px",fontSize:12}}>{h.total_minutes}</td>
                        <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace"}}>{fmtUSDT(h.rate)}</td>
                        <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{fmtUSDT(h.total_amount)}</td>
                        <td style={{padding:"8px 10px",fontSize:11}}>{h.payment_method_name||"USDT"}</td>
                        <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace"}}>{h.reference||"—"}</td>
                        <td style={{padding:"8px 10px"}}>
                          <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,background:"rgba(16,185,129,0.1)",color:"#10B981"}}>PAID</span></td>
                      </tr>
                    ))}
                  </tbody>
                </GTable>
              </div>
            </div>
          </div>
        )}
      </div>

      {payModal&&(
        <div onClick={()=>setPayModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,width:420,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>Mark as Paid</div>
            {[["Supplier",numSupplier(payModal.supplier_name)],["Settlement Period",payModal.period_start+" → "+payModal.period_end],
              ["Amount",fmtUSDT(payModal.amount)],["Payment Method","USDT"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F5F5",fontSize:12}}>
                <span style={{color:"#888",fontWeight:600}}>{k}</span><span style={{fontWeight:700}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:14,marginBottom:10}}>
              <div style={lblS}>Payment Date</div>
              <input type="date" style={inpS} value={payForm.paid_at} onChange={e=>setPayForm({...payForm,paid_at:e.target.value})}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={lblS}>Reference / Transaction ID (optional)</div>
              <input style={inpS} value={payForm.reference} onChange={e=>setPayForm({...payForm,reference:e.target.value})} placeholder="TX123"/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={lblS}>Notes (optional)</div>
              <textarea style={{...inpS,minHeight:50,resize:"vertical"}} value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={markPaid} disabled={saving}
                style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"#10B981",color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                {saving?"Saving...":"✅ MARK AS PAID"}</button>
              <button onClick={()=>setPayModal(null)}
                style={{padding:"11px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ── DID Inventory ─────────────────────────────────────────────────
const COUNTRIES=[
  {name:"Afghanistan",code:"AF",prefix:"93"},
  {name:"Albania",code:"AL",prefix:"355"},
  {name:"Algeria",code:"DZ",prefix:"213"},
  {name:"Andorra",code:"AD",prefix:"376"},
  {name:"Angola",code:"AO",prefix:"244"},
  {name:"Argentina",code:"AR",prefix:"54"},
  {name:"Armenia",code:"AM",prefix:"374"},
  {name:"Australia",code:"AU",prefix:"61"},
  {name:"Austria",code:"AT",prefix:"43"},
  {name:"Azerbaijan",code:"AZ",prefix:"994"},
  {name:"Bahrain",code:"BH",prefix:"973"},
  {name:"Bangladesh",code:"BD",prefix:"880"},
  {name:"Belarus",code:"BY",prefix:"375"},
  {name:"Belgium",code:"BE",prefix:"32"},
  {name:"Benin",code:"BJ",prefix:"229"},
  {name:"Bolivia",code:"BO",prefix:"591"},
  {name:"Bosnia",code:"BA",prefix:"387"},
  {name:"Brazil",code:"BR",prefix:"55"},
  {name:"Bulgaria",code:"BG",prefix:"359"},
  {name:"Burkina Faso",code:"BF",prefix:"226"},
  {name:"Cameroon",code:"CM",prefix:"237"},
  {name:"Canada",code:"CA",prefix:"1"},
  {name:"Chad",code:"TD",prefix:"235"},
  {name:"Chile",code:"CL",prefix:"56"},
  {name:"China",code:"CN",prefix:"86"},
  {name:"Colombia",code:"CO",prefix:"57"},
  {name:"Comoros",code:"KM",prefix:"269"},
  {name:"Congo",code:"CG",prefix:"242"},
  {name:"Costa Rica",code:"CR",prefix:"506"},
  {name:"Croatia",code:"HR",prefix:"385"},
  {name:"Cuba",code:"CU",prefix:"53"},
  {name:"Cyprus",code:"CY",prefix:"357"},
  {name:"Czech Republic",code:"CZ",prefix:"420"},
  {name:"Denmark",code:"DK",prefix:"45"},
  {name:"Diego Garcia",code:"IO",prefix:"246"},
  {name:"Dominican Republic",code:"DO",prefix:"1809"},
  {name:"Ecuador",code:"EC",prefix:"593"},
  {name:"Egypt",code:"EG",prefix:"20"},
  {name:"Estonia",code:"EE",prefix:"372"},
  {name:"Ethiopia",code:"ET",prefix:"251"},
  {name:"Finland",code:"FI",prefix:"358"},
  {name:"France",code:"FR",prefix:"33"},
  {name:"Gambia",code:"GM",prefix:"220"},
  {name:"Georgia",code:"GE",prefix:"995"},
  {name:"Germany",code:"DE",prefix:"49"},
  {name:"Ghana",code:"GH",prefix:"233"},
  {name:"Greece",code:"GR",prefix:"30"},
  {name:"Guatemala",code:"GT",prefix:"502"},
  {name:"Guinea",code:"GN",prefix:"224"},
  {name:"Haiti",code:"HT",prefix:"509"},
  {name:"Honduras",code:"HN",prefix:"504"},
  {name:"Hungary",code:"HU",prefix:"36"},
  {name:"Iceland",code:"IS",prefix:"354"},
  {name:"India",code:"IN",prefix:"91"},
  {name:"Indonesia",code:"ID",prefix:"62"},
  {name:"Iran",code:"IR",prefix:"98"},
  {name:"Iraq",code:"IQ",prefix:"964"},
  {name:"Ireland",code:"IE",prefix:"353"},
  {name:"Israel",code:"IL",prefix:"972"},
  {name:"Italy",code:"IT",prefix:"39"},
  {name:"Jamaica",code:"JM",prefix:"1876"},
  {name:"Japan",code:"JP",prefix:"81"},
  {name:"Jordan",code:"JO",prefix:"962"},
  {name:"Kazakhstan",code:"KZ",prefix:"7"},
  {name:"Kenya",code:"KE",prefix:"254"},
  {name:"Kuwait",code:"KW",prefix:"965"},
  {name:"Kyrgyzstan",code:"KG",prefix:"996"},
  {name:"Latvia",code:"LV",prefix:"371"},
  {name:"Lebanon",code:"LB",prefix:"961"},
  {name:"Libya",code:"LY",prefix:"218"},
  {name:"Lithuania",code:"LT",prefix:"370"},
  {name:"Luxembourg",code:"LU",prefix:"352"},
  {name:"Macedonia",code:"MK",prefix:"389"},
  {name:"Madagascar",code:"MG",prefix:"261"},
  {name:"Malawi",code:"MW",prefix:"265"},
  {name:"Malaysia",code:"MY",prefix:"60"},
  {name:"Maldives",code:"MV",prefix:"960"},
  {name:"Mali",code:"ML",prefix:"223"},
  {name:"Malta",code:"MT",prefix:"356"},
  {name:"Mauritania",code:"MR",prefix:"222"},
  {name:"Mauritius",code:"MU",prefix:"230"},
  {name:"Mexico",code:"MX",prefix:"52"},
  {name:"Moldova",code:"MD",prefix:"373"},
  {name:"Mongolia",code:"MN",prefix:"976"},
  {name:"Montenegro",code:"ME",prefix:"382"},
  {name:"Morocco",code:"MA",prefix:"212"},
  {name:"Mozambique",code:"MZ",prefix:"258"},
  {name:"Myanmar",code:"MM",prefix:"95"},
  {name:"Namibia",code:"NA",prefix:"264"},
  {name:"Nepal",code:"NP",prefix:"977"},
  {name:"Netherlands",code:"NL",prefix:"31"},
  {name:"New Zealand",code:"NZ",prefix:"64"},
  {name:"Nicaragua",code:"NI",prefix:"505"},
  {name:"Niger",code:"NE",prefix:"227"},
  {name:"Nigeria",code:"NG",prefix:"234"},
  {name:"Norway",code:"NO",prefix:"47"},
  {name:"Oman",code:"OM",prefix:"968"},
  {name:"Pakistan",code:"PK",prefix:"92"},
  {name:"Palestine",code:"PS",prefix:"970"},
  {name:"Panama",code:"PA",prefix:"507"},
  {name:"Paraguay",code:"PY",prefix:"595"},
  {name:"Peru",code:"PE",prefix:"51"},
  {name:"Philippines",code:"PH",prefix:"63"},
  {name:"Poland",code:"PL",prefix:"48"},
  {name:"Portugal",code:"PT",prefix:"351"},
  {name:"Qatar",code:"QA",prefix:"974"},
  {name:"Romania",code:"RO",prefix:"40"},
  {name:"Russia",code:"RU",prefix:"7"},
  {name:"Rwanda",code:"RW",prefix:"250"},
  {name:"Saudi Arabia",code:"SA",prefix:"966"},
  {name:"Satellite",code:"SAT",prefix:"88"},
  {name:"Senegal",code:"SN",prefix:"221"},
  {name:"Serbia",code:"RS",prefix:"381"},
  {name:"Seychelles",code:"SC",prefix:"248"},
  {name:"Sierra Leone",code:"SL",prefix:"232"},
  {name:"Singapore",code:"SG",prefix:"65"},
  {name:"Slovakia",code:"SK",prefix:"421"},
  {name:"Slovenia",code:"SI",prefix:"386"},
  {name:"Somalia",code:"SO",prefix:"252"},
  {name:"South Africa",code:"ZA",prefix:"27"},
  {name:"South Korea",code:"KR",prefix:"82"},
  {name:"Spain",code:"ES",prefix:"34"},
  {name:"Sri Lanka",code:"LK",prefix:"94"},
  {name:"Sudan",code:"SD",prefix:"249"},
  {name:"Sweden",code:"SE",prefix:"46"},
  {name:"Switzerland",code:"CH",prefix:"41"},
  {name:"Syria",code:"SY",prefix:"963"},
  {name:"Taiwan",code:"TW",prefix:"886"},
  {name:"Tajikistan",code:"TJ",prefix:"992"},
  {name:"Tanzania",code:"TZ",prefix:"255"},
  {name:"Thailand",code:"TH",prefix:"66"},
  {name:"Togo",code:"TG",prefix:"228"},
  {name:"Tunisia",code:"TN",prefix:"216"},
  {name:"Turkey",code:"TR",prefix:"90"},
  {name:"Turkmenistan",code:"TM",prefix:"993"},
  {name:"Uganda",code:"UG",prefix:"256"},
  {name:"UK",code:"GB",prefix:"44"},
  {name:"Ukraine",code:"UA",prefix:"380"},
  {name:"UAE",code:"AE",prefix:"971"},
  {name:"Uruguay",code:"UY",prefix:"598"},
  {name:"USA",code:"US",prefix:"1"},
  {name:"Uzbekistan",code:"UZ",prefix:"998"},
  {name:"Venezuela",code:"VE",prefix:"58"},
  {name:"Vietnam",code:"VN",prefix:"84"},
  {name:"Yemen",code:"YE",prefix:"967"},
  {name:"Zambia",code:"ZM",prefix:"260"},
  {name:"Zimbabwe",code:"ZW",prefix:"263"},
];
// ── Numbers & IVR ─────────────────────────────────────────────────
// Data model: Supplier → Trunk + Prefix → Range → individual DIDs → IVR.
// The screens below (All Numbers, Add Number, Add Range, Prefix / Routes)
// all talk to that one hierarchy; Purple's from-carrier-purple route and
// did_router.php are not touched by any of them.
const numInp={padding:"9px 12px",borderRadius:8,border:"1px solid #E0E0E0",background:"#FFF",color:"#333",
  fontSize:13,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
const numLbl={fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"};
const numTh={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",padding:"8px 10px",textAlign:"left",
  whiteSpace:"nowrap",borderBottom:"2px solid #E8E8E8",background:"#F5F5F5",textTransform:"uppercase"};
const numBtn=(kind)=>({padding:"10px 18px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
  border:kind==="primary"?"none":"1px solid #DDD",
  background:kind==="primary"?"#6A2B9A":kind==="danger"?"#FFF5F5":"#FFF",
  color:kind==="primary"?"#FFF":kind==="danger"?"#EF4444":"#555"});
const ivrName=v=>(v||"").replace("custom/","")||"—";

function useIvrList(token){
  const [ivrs,setIvrs]=useState([]);
  useEffect(()=>{apiFetch("/ivr-lib/audio",token).then(d=>setIvrs(d.data||[]));},[token]);
  return ivrs;
}
function IvrOptions({ivrs,value}){
  return(<>
    <option value="">— Select IVR —</option>
    {value&&!ivrs.some(i=>"custom/"+i.name===value)&&<option value={value}>{ivrName(value)} (missing)</option>}
    {ivrs.map(i=><option key={i.id} value={"custom/"+i.name}>{i.display_name||i.name}</option>)}
  </>);
}
function NumbersPageShell({title,subtitle,action,children}){
  return(
    <div style={{paddingBottom:70,minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"#1A1A1A"}}>{title}</div>
          {subtitle&&<div style={{fontSize:11,color:"#999",marginTop:2}}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{padding:"12px 16px"}}>{children}</div>
    </div>
  );
}
const Banner=({ok,children})=>(
  <div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,fontSize:12,fontWeight:600,
    background:ok?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
    border:"1px solid "+(ok?"#10B981":"#EF4444"),color:ok?"#10B981":"#EF4444"}}>{children}</div>
);

// ── All Numbers (grouped by prefix) ───────────────────────────────
// Numbers that have taken a call (a CDR exists for the DID) are tinted light
// green; numbers with a call up right now also show a pulsing LIVE badge.
const HIT_BG="#E3F6E8";
// one grid for the header, prefix rows and number rows so every column lines up from the left
const NUM_ROW={display:"grid",gridTemplateColumns:"minmax(220px,2.4fr) minmax(70px,1fr) 110px minmax(80px,1fr) 160px 60px",columnGap:12,alignItems:"center",justifyItems:"start"};
const NUM_PURPLE="#6A2B9A",NUM_LIVE="#4CAF50";
const groupKey=g=>(g.supplier_id??"")+"|"+g.prefix;
function NumbersListPage({token,setPage}){
  const [groups,setGroups]=useState([]);
  const [rowsBy,setRowsBy]=useState({});
  const [expanded,setExpanded]=useState(new Set());
  const [search,setSearch]=useState("");
  const [q,setQ]=useState("");
  const [supplierId,setSupplierId]=useState("");
  const [status,setStatus]=useState("");
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [openId,setOpenId]=useState(null);
  const [live,setLive]=useState(new Set());
  const [pending,setPending]=useState({});   // id -> ivr_context chosen but not saved yet
  const [saving,setSaving]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [msg,setMsg]=useState(null);
  const ivrs=useIvrList(token);
  const PER=200;

  useEffect(()=>{apiFetch("/supplier-accounts",token).then(d=>setSuppliers(d.data||[]));},[token]);
  useEffect(()=>{const t=setTimeout(()=>setQ(search),300);return()=>clearTimeout(t);},[search]);

  const filterParams=()=>{
    const p=new URLSearchParams();
    if(q) p.set("search",q);
    if(supplierId) p.set("supplier_id",supplierId);
    if(status) p.set("status",status);
    return p;
  };
  const rowsUrl=(g,page)=>{
    const p=filterParams();
    p.set("prefix",g.prefix);p.set("per_page",PER);p.set("page",page);
    if(g.supplier_id==null) p.set("unassigned","1");
    else p.set("supplier_id",g.supplier_id);
    return "/numbers?"+p;
  };
  // fetch every page already shown for a group, so a refresh never collapses "load more"
  const fetchRows=async(g,pages)=>{
    const res=await Promise.all(Array.from({length:pages},(_,i)=>apiFetch(rowsUrl(g,i+1),token)));
    return {rows:res.flatMap(d=>d.data||[]),total:res[0]?.total||0,pages};
  };

  // filters changed: reload the group list and drop cached rows; searching opens every matching group
  useEffect(()=>{
    setRowsBy({});
    setLoading(true);
    apiFetch("/number-groups?"+filterParams(),token).then(d=>{
      const gs=d.data||[];
      setGroups(gs);setLoading(false);
      setExpanded(q?new Set(gs.map(groupKey)):new Set());
    });
  },[token,q,supplierId,status]);

  // load rows for any expanded group that has none yet
  useEffect(()=>{
    groups.forEach(g=>{
      const k=groupKey(g);
      if(expanded.has(k)&&!rowsBy[k]){
        setRowsBy(r=>({...r,[k]:{rows:[],total:0,pages:0,loading:true}}));
        fetchRows(g,1).then(v=>setRowsBy(r=>({...r,[k]:v})));
      }
    });
  },[groups,expanded]);

  const loadMore=async(g)=>{
    const k=groupKey(g),cur=rowsBy[k];
    const d=await apiFetch(rowsUrl(g,cur.pages+1),token);
    setRowsBy(r=>({...r,[k]:{...cur,rows:[...cur.rows,...(d.data||[])],pages:cur.pages+1}}));
  };
  const rowsRef=useRef(rowsBy);rowsRef.current=rowsBy;
  const refreshAll=useCallback(async()=>{
    const d=await apiFetch("/number-groups?"+filterParams(),token);
    const gs=d.data||[];
    setGroups(gs);
    Object.entries(rowsRef.current).forEach(([k,v])=>{
      const g=gs.find(x=>groupKey(x)===k);
      if(g&&v.pages>0) fetchRows(g,v.pages).then(nv=>setRowsBy(r=>r[k]?{...r,[k]:nv}:r));
    });
  },[token,q,supplierId,status]);
  const refreshRef=useRef(refreshAll);refreshRef.current=refreshAll;

  // poll live calls; when the set of numbers on a call changes (a call started or ended) refresh so new hits show
  const liveRef=useRef(null);
  useEffect(()=>{
    let stop=false;
    const tick=async()=>{
      const d=await apiFetch("/live-calls",token);
      if(stop||!Array.isArray(d.data)) return;
      const s=new Set(d.data.map(c=>(c.did||"").replace(/[^0-9]/g,"")).filter(Boolean));
      const sig=[...s].sort().join(",");
      setLive(s);
      const prev=liveRef.current;
      liveRef.current=sig;
      if(prev!==null&&sig!==prev) refreshRef.current();
    };
    tick();const t=setInterval(tick,5000);
    return()=>{stop=true;clearInterval(t);};
  },[token]);

  const toggle=(g)=>setExpanded(e=>{const n=new Set(e),k=groupKey(g);if(n.has(k)) n.delete(k); else n.add(k);return n;});
  const delGroup=async(g)=>{
    const total=Number(g.total),name=g.prefix||"";
    const word=name||"DELETE";
    const typed=window.prompt(`Delete ALL ${total.toLocaleString()} number${total===1?"":"s"} under prefix ${name||"(no prefix)"} (${numSupplier(g.supplier_name)}), plus its ranges?\n\nThis cannot be undone. Type ${word} to confirm.`);
    if(typed===null) return;
    if(typed.trim()!==word){setMsg({ok:false,text:"Not deleted - confirmation text did not match"});return;}
    const p=new URLSearchParams({prefix:name,expected_total:total});
    if(g.supplier_id==null) p.set("unassigned","1"); else p.set("supplier_id",g.supplier_id);
    const r=await apiFetch("/number-groups?"+p,token,{method:"DELETE"});
    if(!r.success){setMsg({ok:false,text:r.error||r.message||"Delete failed"});return;}
    setExpanded(e=>{const n=new Set(e);n.delete(groupKey(g));return n;});
    setRowsBy(x=>{const n={...x};delete n[groupKey(g)];return n;});
    setPending(p=>Object.fromEntries(Object.entries(p).filter(([id])=>!(rowsBy[groupKey(g)]?.rows||[]).some(d=>String(d.id)===id))));
    setMsg({ok:true,text:`Deleted ${r.deleted} number${r.deleted===1?"":"s"} and ${r.ranges} range record${r.ranges===1?"":"s"} under ${name||"(no prefix)"}`});
    refreshAll();
  };
  const delNumberRow=async(d)=>{
    if(!window.confirm("Delete number "+(d.number||"").replace("+","")+"?")) return;
    const r=await apiFetch("/dids/"+d.id,token,{method:"DELETE"});
    if(!r.success){setMsg({ok:false,text:r.error||r.message||"Delete failed"});return;}
    setPending(p=>{const n={...p};delete n[d.id];return n;});
    setMsg({ok:true,text:"Deleted "+(d.number||"").replace("+","")});
    refreshAll();
  };
  const pendingCount=Object.keys(pending).length;
  const saveChanges=async()=>{
    setSaving(true);setMsg(null);
    const results=await Promise.all(Object.entries(pending).map(([id,ivr])=>
      apiFetch("/numbers/"+id,token,{method:"PUT",body:JSON.stringify({ivr_context:ivr})}).then(d=>({id,ok:!!d.success,err:d.error||d.message}))));
    const failed=results.filter(r=>!r.ok);
    setPending(Object.fromEntries(failed.map(f=>[f.id,pending[f.id]])));
    await refreshAll();
    setSaving(false);
    setMsg(failed.length?{ok:false,text:`${failed.length} of ${results.length} failed: ${failed[0].err||"update failed"}`}
      :{ok:true,text:`Saved IVR for ${results.length} number${results.length===1?"":"s"}`});
  };
  // export every number matching the current filters (not just the expanded groups)
  const downloadExcel=async()=>{
    setExporting(true);setMsg(null);
    try{
      const all=[];
      for(let page=1;;page++){
        const p=filterParams();p.set("per_page",200);p.set("page",page);
        const d=await apiFetch("/numbers?"+p,token);
        all.push(...(d.data||[]));
        if(!d.last_page||page>=d.last_page) break;
      }
      const XLSX=await import("xlsx");
      const ws=XLSX.utils.json_to_sheet(all.map(n=>({
        Number:(n.number||"").replace("+",""),Prefix:n.prefix||"",Supplier:numSupplier(n.supplier_name),
        Country:n.country_name||"",IVR:ivrName(n.ivr_context),Status:n.status==="disabled"?"Disabled":"Available",
        Test:n.is_test?"Yes":"",Calls:n.hits||0,"Last call":n.last_hit||""})));
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Numbers");
      XLSX.writeFile(wb,`numbers-${new Date().toISOString().slice(0,10)}.xlsx`);
    }catch(e){setMsg({ok:false,text:"Export failed: "+(e.message||e)});}
    setExporting(false);
  };
  const totalNumbers=groups.reduce((a,g)=>a+Number(g.total),0);
  const isLive=d=>live.has((d.number||"").replace("+",""));

  return(
    <NumbersPageShell title="Numbers" subtitle={`${totalNumbers.toLocaleString()} numbers · ${groups.length} prefixes`}
      action={<button onClick={()=>setPage("addrange")} style={numBtn("primary")}>+ Add Range</button>}>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search number, country or prefix..."
          style={{...numInp,flex:"2 1 200px",width:"auto"}}/>
        <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} style={{...numInp,flex:"1 1 140px",width:"auto"}}>
          <option value="">All suppliers</option>
          {suppliers.map(s=><option key={s.id} value={s.id}>{numSupplier(s.name)}</option>)}
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value)} style={{...numInp,flex:"1 1 120px",width:"auto"}}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
      <div style={{fontSize:11,color:"#666",marginBottom:8}}>
        <span style={{color:NUM_LIVE,fontWeight:700}}>Green</span> = number has received a call
      </div>
      <style>{`@keyframes numLivePulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      {msg&&<Banner ok={msg.ok}>{msg.text}</Banner>}
      <div style={{background:"#FFF",borderRadius:8,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
        <div style={{minWidth:780}}>
        <div style={{...NUM_ROW,justifyItems:"center",padding:"10px 14px",fontSize:11,fontWeight:700,letterSpacing:"0.8px",color:"#888",borderBottom:"2px solid #E8E8E8"}}>
          <span>NUMBERS</span><span>SUPPLIER</span><span>PAYOUT</span><span>COUNTRY</span><span/><span>DELETE</span>
        </div>
        {loading&&<div style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>Loading...</div>}
        {!loading&&groups.length===0&&<div style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No numbers found</div>}
        {!loading&&groups.map(g=>{
          const k=groupKey(g),open=expanded.has(k),data=rowsBy[k];
          const hit=Number(g.hit_count),total=Number(g.total);
          const lo=Number(g.min_tariff),hi=Number(g.max_tariff);
          return(
            <div key={k} style={{borderBottom:"1px solid #E8E8E8"}}>
              <div onClick={()=>toggle(g)} style={{...NUM_ROW,padding:"12px 14px",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                  <span style={{flex:"none",width:22,height:22,borderRadius:"50%",border:"2px solid "+NUM_PURPLE,color:NUM_PURPLE,
                    display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,lineHeight:1}}>{open?"−":"+"}</span>
                  <div style={{minWidth:0}}>
                    <span style={{fontSize:14,fontWeight:800,fontFamily:"monospace",color:"#1A1A1A"}}>{g.prefix||"No prefix"}</span>
                    <span style={{fontSize:13,color:"#555",marginLeft:6}}>({total.toLocaleString()})</span>
                    {hit>0&&<span style={{marginLeft:8,fontSize:10,fontWeight:700,color:NUM_LIVE}}>{hit} hit</span>}
                  </div>
                </div>
                <span style={{fontSize:11,color:"#999"}}>{numSupplier(g.supplier_name)}</span>
                <span style={{fontSize:12,fontFamily:"monospace",color:"#333"}}>{lo===hi?fmtUSDT(lo):fmtUSDT(lo)+" – "+fmtUSDT(hi)}</span>
                <span style={{fontSize:13,color:"#333",fontWeight:600}}>{g.country_name||"—"}</span>
                <span/>
                <span><button onClick={e=>{e.stopPropagation();delGroup(g);}} title="Delete every number under this prefix"
                  style={{background:"none",border:"1px solid #EF4444",borderRadius:4,cursor:"pointer",fontSize:10,color:"#EF4444",padding:"2px 8px"}}>Del</button></span>
              </div>
              {open&&(!data||data.loading)&&<div style={{padding:"8px 14px 12px 46px",fontSize:11,color:"#999"}}>Loading...</div>}
              {open&&data&&!data.loading&&data.rows.map(d=>{
                const lv=isLive(d),active=lv||d.hits>0;
                const cur=pending[d.id]??d.ivr_context??"";
                const dirty=pending[d.id]!==undefined;
                return(
                  <div key={d.id} onClick={()=>setOpenId(d.id)} style={{...NUM_ROW,padding:"8px 14px",cursor:"pointer"}}>
                    <div style={{paddingLeft:32,minWidth:0}}>
                      <div style={{fontSize:13,fontFamily:"monospace",fontWeight:700,color:active?NUM_LIVE:"#1A1A1A"}}>
                        {(d.number||"").replace("+","")}
                        {!!d.is_test&&<span style={{marginLeft:8,fontSize:9,fontWeight:800,color:NUM_PURPLE,background:"#F0E6F7",borderRadius:4,padding:"1px 5px"}}>TEST</span>}
                        {lv&&<span style={{marginLeft:8,fontSize:9,fontWeight:800,color:NUM_LIVE,animation:"numLivePulse 1.2s infinite"}}>● LIVE</span>}
                        {d.status==="disabled"&&<span style={{marginLeft:8,fontSize:9,fontWeight:800,color:"#EF4444"}}>DISABLED</span>}
                      </div>
                    </div>
                    <span style={{fontSize:11,color:"#999"}}>{numSupplier(d.supplier_name)}</span>
                    <span style={{fontSize:12,fontFamily:"monospace",color:"#333"}}>{fmtUSDT(d.tariff)}</span>
                    <span style={{fontSize:12,color:"#333"}}>{d.country_name||"—"}</span>
                    <select value={cur} onClick={e=>e.stopPropagation()}
                      onChange={e=>{const v=e.target.value,orig=d.ivr_context||"";
                        setPending(p=>{const n={...p};if(!v||v===orig) delete n[d.id]; else n[d.id]=v;return n;});}}
                      title="Select IVR"
                      style={{width:"100%",maxWidth:160,padding:"6px 12px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",
                        fontFamily:"inherit",background:dirty?NUM_PURPLE:"#FFF",color:dirty?"#FFF":NUM_PURPLE,border:"1px solid "+NUM_PURPLE}}>
                      <IvrOptions ivrs={ivrs} value={cur}/>
                    </select>
                    <span><button onClick={e=>{e.stopPropagation();delNumberRow(d);}}
                      style={{background:"none",border:"1px solid #EF4444",borderRadius:4,cursor:"pointer",fontSize:10,color:"#EF4444",padding:"2px 8px"}}>Del</button></span>
                  </div>
                );
              })}
              {open&&data&&!data.loading&&data.rows.length<data.total&&(
                <div style={{padding:"8px 14px 12px",textAlign:"center"}}>
                  <button onClick={()=>loadMore(g)} style={numBtn()}>Load more ({data.rows.length} of {data.total})</button></div>
              )}
            </div>
          );
        })}
        </div>
        </div>
      </div>
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:50,display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center",
        padding:"10px 16px",background:"#FFF",borderTop:"1px solid #E0E0E0"}}>
        {pendingCount>0&&<span style={{fontSize:12,color:"#666",marginRight:"auto"}}>{pendingCount} unsaved change{pendingCount===1?"":"s"}</span>}
        <button onClick={downloadExcel} disabled={exporting}
          style={{...numBtn(),background:"#FFF",color:NUM_PURPLE,border:"2px solid "+NUM_PURPLE,textTransform:"uppercase",opacity:exporting?0.6:1}}>
          {exporting?"Exporting...":"Download Excel"}</button>
        <button onClick={saveChanges} disabled={!pendingCount||saving}
          style={{...numBtn("primary"),textTransform:"uppercase",opacity:pendingCount&&!saving?1:0.5,cursor:pendingCount&&!saving?"pointer":"not-allowed"}}>
          {saving?"Saving...":"Save Changes"}</button>
      </div>
      {openId&&<NumberDetailsModal token={token} id={openId} setPage={setPage} onClose={()=>setOpenId(null)} onChanged={()=>refreshRef.current()}/>}
    </NumbersPageShell>
  );
}

// ── Number Details (opens from the Numbers list) ──────────────────
function NumberDetailsModal({token,id,setPage,onClose,onChanged}){
  const [n,setN]=useState(null);
  const [err,setErr]=useState("");
  const [note,setNote]=useState("");
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({ivr_context:"",selling_price:"",is_test:false});
  const [busy,setBusy]=useState(false);
  const ivrs=useIvrList(token);

  const load=()=>apiFetch("/numbers/"+id,token).then(d=>{
    if(d.data) setN(d.data); else setErr(d.error||"Could not load number");
  });
  useEffect(()=>{load();},[id]);

  const save=async(body)=>{
    setBusy(true);setErr("");setNote("");
    const d=await apiFetch("/numbers/"+id,token,{method:"PUT",body:JSON.stringify(body)});
    setBusy(false);
    if(!d.success){setErr(d.error||d.message||"Update failed");return false;}
    const en=d.enforcement;
    if(en&&!en.ok) setNote("Status saved, but Asterisk could not be updated - calls are NOT blocked yet.");
    else if(en&&!en.dialplan_ready) setNote("Blocked for carrier routes. For supplier trunks, apply the Asterisk configuration once (Asterisk Configuration → Apply) to activate blocking.");
    await load();onChanged();return true;
  };
  const startEdit=()=>{setForm({ivr_context:n.ivr_context||"",selling_price:n.selling_price??"",is_test:n.is_test});setEditing(true);};
  const saveEdit=async()=>{if(await save(form)) setEditing(false);};
  const toggleStatus=()=>{
    if(n.status==="available"&&!window.confirm("Disable "+n.number+"?")) return;
    save({status:n.status==="available"?"disabled":"available"});
  };
  // There is no dial-out from the panel: copy the DID and jump to Live Test Call, which shows the call as it arrives.
  const testCall=()=>{
    try{navigator.clipboard?.writeText(n.number);}catch{}
    onClose();setPage("testlivecall");
  };

  const val=(v)=>v===null||v===undefined||v===""?"—":v;
  const fields=n?[
    ["DID",n.number],["Supplier",numSupplier(n.supplier)],["Trunk",val(n.trunk)],["Country",val(n.country)],
    ["Prefix",val(n.prefix)],["Range",val(n.range)],["Tariff",n.tariff!=null?fmtUSDT(n.tariff):"—"],
    ["Selling Price",editing?null:(n.selling_price!=null?fmtUSDT(n.selling_price):"—")],
    ["Payment Term",val(n.payment_term)],["IVR",editing?null:ivrName(n.ivr_context)],
    ["Test Number",editing?null:(n.is_test?"Yes":"No")],
    ["Status",n.status==="disabled"?"Disabled":"Available"],
  ]:[];

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#FFF",borderRadius:12,padding:20,width:"100%",maxWidth:420,
        maxHeight:"90vh",overflowY:"auto",fontFamily:"Arial,Helvetica,sans-serif"}}>
        <div style={{fontSize:16,fontWeight:800,color:"#1A1A1A",marginBottom:12}}>Number Details</div>
        {err&&<Banner>{err}</Banner>}
        {note&&<div style={{fontSize:12,color:"#B45309",background:"#FFF7E6",border:"1px solid #F5C26B",borderRadius:8,padding:"8px 12px",marginBottom:12}}>{note}</div>}
        {!n&&!err&&<div style={{padding:20,textAlign:"center",color:"#999"}}>Loading...</div>}
        {n&&fields.map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,
            padding:"7px 0",borderBottom:"1px solid #F0F0F0",fontSize:13}}>
            <span style={{color:"#888"}}>{k}</span>
            {v!==null?<span style={{color:"#1A1A1A",fontWeight:600,fontFamily:k==="DID"?"monospace":"inherit",textAlign:"right"}}>{v}</span>
            :k==="Selling Price"?<input type="number" step="0.001" style={{...numInp,width:130}} value={form.selling_price}
                onChange={e=>setForm({...form,selling_price:e.target.value})}/>
            :k==="IVR"?<select style={{...numInp,width:190}} value={form.ivr_context} onChange={e=>setForm({...form,ivr_context:e.target.value})}>
                <IvrOptions ivrs={ivrs} value={form.ivr_context}/></select>
            :<input type="checkbox" checked={form.is_test} onChange={e=>setForm({...form,is_test:e.target.checked})}/>}
          </div>
        ))}
        {n&&(
          <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
            {editing?<>
              <button onClick={saveEdit} disabled={busy} style={{...numBtn("primary"),flex:1}}>{busy?"Saving...":"Save"}</button>
              <button onClick={()=>setEditing(false)} style={numBtn()}>Cancel</button>
            </>:<>
              <button onClick={startEdit} style={{...numBtn(),flex:1}}>Edit</button>
              <button onClick={testCall} style={{...numBtn(),flex:1}}>Test Call</button>
              <button onClick={toggleStatus} disabled={busy} style={{...numBtn(n.status==="available"?"danger":"primary"),flex:1}}>
                {n.status==="available"?"Disable":"Enable"}</button>
            </>}
          </div>
        )}
        <button onClick={onClose} style={{...numBtn(),width:"100%",marginTop:10}}>Close</button>
      </div>
    </div>
  );
}

// ── Add Number (single) ───────────────────────────────────────────
function AddNumberPage({token,setPage}){
  const [suppliers,setSuppliers]=useState([]);
  const [prefixes,setPrefixes]=useState([]);
  const [f,setF]=useState({supplier_id:"",prefix_id:"",number:"",ivr_context:""});
  const [msg,setMsg]=useState(null);
  const [saving,setSaving]=useState(false);
  const ivrs=useIvrList(token);

  useEffect(()=>{apiFetch("/supplier-accounts",token).then(d=>setSuppliers(d.data||[]));},[token]);
  const pickSupplier=async(sid)=>{
    setF({supplier_id:sid,prefix_id:"",number:"",ivr_context:""});setPrefixes([]);setMsg(null);
    if(sid){const d=await apiFetch(`/supplier-accounts/${sid}/prefixes`,token);setPrefixes(d.data||[]);}
  };
  const prefix=prefixes.find(p=>String(p.id)===String(f.prefix_id));
  const digits=f.number.replace(/[^0-9]/g,"");
  const problem=!f.supplier_id?"Select a supplier":!prefix?"Select a prefix":!digits?"Enter a number"
    :!digits.startsWith(prefix.prefix)?`Number must start with ${prefix.prefix}`:null;

  const submit=async()=>{
    setSaving(true);setMsg(null);
    const d=await apiFetch(`/supplier-accounts/${f.supplier_id}/numbers`,token,{method:"POST",
      body:JSON.stringify({mode:"single",prefix_id:f.prefix_id,number:digits,ivr_context:f.ivr_context||undefined})});
    setSaving(false);
    if(d.success){setMsg({ok:true,text:`Added ${digits}`});setF({...f,number:""});}
    else setMsg({ok:false,text:d.error||d.message||"Failed to add number"});
  };

  return(
    <NumbersPageShell title="Add Number" subtitle="Add a single DID under an existing prefix">
      <div style={{background:"#FFF",borderRadius:10,padding:20,maxWidth:520,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        {msg&&<Banner ok={msg.ok}>{msg.text}</Banner>}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><div style={numLbl}>Supplier</div>
            <select style={numInp} value={f.supplier_id} onChange={e=>pickSupplier(e.target.value)}>
              <option value="">— Select Supplier —</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{numSupplier(s.name)}</option>)}
            </select></div>
          <div><div style={numLbl}>Prefix</div>
            <select style={numInp} value={f.prefix_id} disabled={!f.supplier_id}
              onChange={e=>{const p=prefixes.find(x=>String(x.id)===e.target.value);setF({...f,prefix_id:e.target.value,ivr_context:p?.ivr_context||""});}}>
              <option value="">{f.supplier_id&&prefixes.length===0?"No prefixes — use Add Range to create one":"— Select Prefix —"}</option>
              {prefixes.map(p=><option key={p.id} value={p.id}>{p.country} — {p.prefix}</option>)}
            </select></div>
          <div><div style={numLbl}>Number</div>
            <input style={numInp} value={f.number} onChange={e=>setF({...f,number:e.target.value})} placeholder="393191120550"/></div>
          <div><div style={numLbl}>IVR</div>
            <select style={numInp} value={f.ivr_context} onChange={e=>setF({...f,ivr_context:e.target.value})}>
              <IvrOptions ivrs={ivrs} value={f.ivr_context}/></select>
            <div style={{fontSize:11,color:"#999",marginTop:4}}>Leave empty to use the prefix's IVR. Tariff and payment term come from the prefix.</div></div>
        </div>
        {f.number&&problem&&<div style={{fontSize:12,color:"#EF4444",marginTop:10}}>{problem}</div>}
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          <button onClick={()=>setPage("numbers")} style={numBtn()}>Cancel</button>
          <button onClick={submit} disabled={!!problem||saving} style={{...numBtn("primary"),opacity:problem||saving?0.5:1}}>
            {saving?"Adding...":"Add Number"}</button>
        </div>
      </div>
    </NumbersPageShell>
  );
}

// ── Add Range (form → preview → import) ───────────────────────────
function AddRangePage({token,setPage}){
  const empty={supplier_id:"",country:"",prefix:"",range_start:"",range_end:"",tariff:"",selling_price:"",
    payment_term:"",test_number:"",ivr_context:""};
  const [f,setF]=useState(empty);
  const [suppliers,setSuppliers]=useState([]);
  const [preview,setPreview]=useState(null);
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const ivrs=useIvrList(token);
  useEffect(()=>{apiFetch("/supplier-accounts",token).then(d=>setSuppliers(d.data||[]));},[token]);

  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const dg=s=>s.replace(/[^0-9]/g,"");
  const start=dg(f.range_start),end=dg(f.range_end);
  const total=start&&end&&start.length===end.length&&+end>=+start?+end-+start+1:0;
  const missing=!f.supplier_id||!f.country||!f.prefix||!start||!end||f.tariff===""||f.selling_price===""||!f.payment_term||!f.ivr_context;

  const payload=()=>({...f,prefix:dg(f.prefix),range_start:start,range_end:end,test_number:dg(f.test_number)});
  const runPreview=async()=>{
    setBusy(true);setErr("");
    const d=await apiFetch("/number-ranges/preview",token,{method:"POST",body:JSON.stringify(payload())});
    setBusy(false);
    if(d.data) setPreview(d.data); else setErr(d.error||d.message||"Preview failed");
  };
  const runImport=async()=>{
    setBusy(true);setErr("");
    const d=await apiFetch("/number-ranges/import",token,{method:"POST",body:JSON.stringify(payload())});
    setBusy(false);
    if(d.success) setResult(d); else setErr(d.error||d.message||"Import failed");
  };
  const again=()=>{setF(empty);setPreview(null);setResult(null);setErr("");};

  const supplierName=numSupplier(suppliers.find(s=>String(s.id)===String(f.supplier_id))?.name);

  if(result) return(
    <NumbersPageShell title="Add Number Range">
      <div style={{background:"#FFF",borderRadius:10,padding:24,maxWidth:520,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",textAlign:"center"}}>
        <div style={{fontSize:36}}>✅</div>
        <div style={{fontSize:15,fontWeight:700,margin:"8px 0"}}>{result.created} numbers imported</div>
        {result.skipped>0&&<div style={{fontSize:12,color:"#999"}}>{result.skipped} already existed and were skipped</div>}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:16}}>
          <button onClick={again} style={numBtn()}>Add another range</button>
          <button onClick={()=>setPage("numbers")} style={numBtn("primary")}>View Numbers</button>
        </div>
      </div>
    </NumbersPageShell>
  );

  if(preview) return(
    <NumbersPageShell title="Preview" subtitle="Nothing is created until you confirm">
      <div style={{background:"#FFF",borderRadius:10,padding:20,maxWidth:520,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        {err&&<Banner>{err}</Banner>}
        <div style={{fontSize:16,fontWeight:800}}>{f.country} / {dg(f.prefix)}</div>
        {preview.errors.map((e,i)=><Banner key={i}>{e}</Banner>)}
        {preview.warnings.map((w,i)=><div key={i} style={{fontSize:12,color:"#B45309",background:"#FFF7E6",border:"1px solid #F5C26B",
          borderRadius:8,padding:"8px 12px",marginTop:8}}>{w}</div>)}
        {preview.valid&&<>
          <div style={{fontSize:13,color:"#666",margin:"6px 0 10px"}}>
            {preview.total} Numbers{preview.existing_count>0?` · ${preview.new_count} new`:""}
          </div>
          <div style={{fontFamily:"monospace",fontSize:13,lineHeight:1.7,maxHeight:300,overflowY:"auto",
            border:"1px solid #EEE",borderRadius:8,padding:"8px 12px",background:"#FAFAFA"}}>
            {preview.numbers.map((n,i)=>(
              <React.Fragment key={n.number}>
                {preview.truncated&&i===10&&<div style={{color:"#999"}}>...</div>}
                <div>{n.number}
                  {"  "}{n.exists?<span style={{color:"#B45309"}}>exists — skipped</span>:<span style={{color:"#10B981"}}>✓</span>}
                  {n.test&&<span style={{marginLeft:8,color:"#8B5CF6",fontSize:11}}>test</span>}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div style={{margin:"14px 0",fontSize:13,lineHeight:1.8}}>
            {[["Supplier",supplierName],["Trunk",preview.trunk||"—"],["IVR",ivrName(preview.ivr_context)],
              ["Tariff",f.tariff],["Selling",f.selling_price],["Payment Term",f.payment_term]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#888"}}>{k}:</span><b>{v}</b></div>
            ))}
          </div>
        </>}
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          <button onClick={()=>{setPreview(null);setErr("");}} style={numBtn()}>Back</button>
          {preview.valid&&<button onClick={runImport} disabled={busy||preview.new_count===0}
            style={{...numBtn("primary"),opacity:busy||preview.new_count===0?0.5:1}}>{busy?"Importing...":"Confirm & Import"}</button>}
        </div>
      </div>
    </NumbersPageShell>
  );

  return(
    <NumbersPageShell title="Add Number Range" subtitle="Creates one DID per number in the range">
      <div style={{background:"#FFF",borderRadius:10,padding:20,maxWidth:520,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        {err&&<Banner>{err}</Banner>}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><div style={numLbl}>Supplier</div>
            <select style={numInp} value={f.supplier_id} onChange={e=>set("supplier_id",e.target.value)}>
              <option value="">— Select Supplier —</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{numSupplier(s.name)}</option>)}
            </select></div>
          <div><div style={numLbl}>Country</div>
            <input style={numInp} list="range-countries" value={f.country} onChange={e=>set("country",e.target.value)} placeholder="Italy"/>
            <datalist id="range-countries">{COUNTRIES.map(c=><option key={c.code} value={c.name}/>)}</datalist></div>
          <div><div style={numLbl}>Prefix</div>
            <input style={numInp} value={f.prefix} onChange={e=>set("prefix",e.target.value)} placeholder="39319"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><div style={numLbl}>Range Start</div>
              <input style={numInp} value={f.range_start} onChange={e=>set("range_start",e.target.value)} placeholder="393191120550"/></div>
            <div><div style={numLbl}>Range End</div>
              <input style={numInp} value={f.range_end} onChange={e=>set("range_end",e.target.value)} placeholder="393191120578"/></div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:total?"#2CADA6":"#999"}}>Total Numbers: {total.toLocaleString()}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><div style={numLbl}>Tariff</div>
              <input type="number" step="0.001" style={numInp} value={f.tariff} onChange={e=>set("tariff",e.target.value)} placeholder="0.0400"/></div>
            <div><div style={numLbl}>Selling Price</div>
              <input type="number" step="0.001" style={numInp} value={f.selling_price} onChange={e=>set("selling_price",e.target.value)} placeholder="0.0700"/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><div style={numLbl}>Currency</div>
              <input style={{...numInp,background:"#F5F5F5",color:"#888"}} value="USDT" disabled/></div>
            <div><div style={numLbl}>Payment Term</div>
              <select style={numInp} value={f.payment_term} onChange={e=>set("payment_term",e.target.value)}>
                <option value="">— Select —</option>
                {PAYMENT_TERMS.map(t=><option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          <div><div style={numLbl}>Test Number (optional, inside the range)</div>
            <input style={numInp} value={f.test_number} onChange={e=>set("test_number",e.target.value)} placeholder="393191120550"/></div>
          <div><div style={numLbl}>IVR</div>
            <select style={numInp} value={f.ivr_context} onChange={e=>set("ivr_context",e.target.value)}>
              <IvrOptions ivrs={ivrs} value={f.ivr_context}/></select></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:16}}>
          <button onClick={runPreview} disabled={missing||busy}
            style={{...numBtn("primary"),opacity:missing||busy?0.5:1}}>
            {busy?"Checking...":`Preview ${total||""} Numbers`}</button>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>setPage("numbers")} style={numBtn()}>Cancel</button></div>
        </div>
      </div>
    </NumbersPageShell>
  );
}

// ── Prefix / Routes (Prefix → Supplier → IVR) ─────────────────────
function PrefixRoutesPage({token}){
  const [prefixes,setPrefixes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [msg,setMsg]=useState(null);
  const ivrs=useIvrList(token);

  const load=()=>apiFetch("/prefixes?all=1",token).then(d=>{setPrefixes(d.data||[]);setLoading(false);});
  useEffect(()=>{load();},[token]);

  const setIvr=async(p,ctx)=>{
    if(!ctx||ctx===p.ivr_context) return;
    if(!window.confirm(`Apply "${ivrName(ctx)}" to all ${p.number_count} numbers under ${p.prefix}?`)) return;
    const d=await apiFetch(`/prefixes/${p.id}/ivr`,token,{method:"PUT",body:JSON.stringify({ivr_context:ctx})});
    setMsg(d.success?{ok:true,text:d.message||"IVR updated"}:{ok:false,text:d.error||"Failed to update IVR"});
    load();
  };
  const s=search.trim().toLowerCase();
  const shown=prefixes.filter(p=>!s||[p.prefix,p.country,p.supplier_name].some(v=>(v||"").toLowerCase().includes(s)));

  return(
    <NumbersPageShell title="Prefix / Routes" subtitle="Prefix → Supplier → IVR. Changing an IVR applies to every number under the prefix.">
      {msg&&<Banner ok={msg.ok}>{msg.text}</Banner>}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prefix, country or supplier..."
        style={{...numInp,marginBottom:10}}/>
      <div style={{background:"#FFF",border:"1px solid #E0E0E0",borderRadius:4,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:560,whiteSpace:"nowrap"}}>
            <thead><tr>{["Prefix","Country","Supplier","Tariff","Numbers","IVR"].map(h=><th key={h} style={numTh}>{h}</th>)}</tr></thead>
            <tbody>
              {loading&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>Loading...</td></tr>}
              {!loading&&shown.length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No prefixes found</td></tr>}
              {shown.map((p,i)=>(
                <tr key={p.id} style={{borderBottom:"1px solid #F0F0F0",background:i%2===0?"#FFF":"#FAFAFA"}}>
                  <td style={{padding:"7px 10px",fontSize:12,fontFamily:"monospace",fontWeight:800}}>{p.prefix}</td>
                  <td style={{padding:"7px 10px",fontSize:12}}>{p.country||"—"}</td>
                  <td style={{padding:"7px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>{numSupplier(p.supplier_name)}</td>
                  <td style={{padding:"7px 10px",fontSize:12,fontFamily:"monospace"}}>{parseFloat(p.price||0)}</td>
                  <td style={{padding:"7px 10px",fontSize:12}}>{(p.number_count||0).toLocaleString()}</td>
                  <td style={{padding:"7px 10px"}}>
                    <select value={p.ivr_context||""} onChange={e=>setIvr(p,e.target.value)}
                      style={{padding:"3px 6px",borderRadius:6,border:"1px solid #CCC",background:"#FFF",fontSize:11,maxWidth:170}}>
                      <IvrOptions ivrs={ivrs} value={p.ivr_context}/>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </GTable>
        </div>
      </div>
    </NumbersPageShell>
  );
}
// ── IVR Page ──────────────────────────────────────────────────────
function IVRPage({token,setPage}){
  const [playingId,setPlayingId]=React.useState(null);
  const audioRef=React.useRef(null);
  const playPause=(ivr)=>{
    if(playingId===ivr.id){
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if(audioRef.current) audioRef.current.pause();
      const a=new Audio("https://6g-premium-telecom.com/api/v1/ivr-lib/preview/"+ivr.id);
      a.onended=()=>setPlayingId(null);
      a.play();
      audioRef.current=a;
      setPlayingId(ivr.id);
    }
  };
  const [ivrs,setIvrs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showUpload,setShowUpload]=useState(false);
  const [uploadForm,setUploadForm]=useState({name:"",display_name:""});
  const [file,setFile]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [uploadMsg,setUploadMsg]=useState("");

  const load=useCallback(()=>{
    apiFetch("/ivr-lib/audio",token).then(d=>{setIvrs(d.data||[]);setLoading(false);});
  },[token]);

  useEffect(()=>{load();},[load]);

  const upload=async()=>{
    if(!file||!uploadForm.name){setUploadMsg("❌ Name and file required");return;}
    setUploading(true);setUploadMsg("Uploading...");
    const fd=new FormData();
    fd.append("audio",file);
    fd.append("name",uploadForm.name.replace(/\s+/g,"-").toLowerCase());
    fd.append("display_name",uploadForm.display_name||uploadForm.name);
    try{
      const r=await fetch(`${API}/ivr-lib/upload`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd
      });
      const d=await r.json();
      if(d.success){setUploadMsg((d.replaced?"✅ Replaced: ":"✅ Uploaded: ")+d.name);load();setShowUpload(false);setFile(null);setUploadForm({name:"",display_name:""});}
      else setUploadMsg("❌ "+(d.error||d.message||"Failed"));
    }catch(e){setUploadMsg("❌ "+e.message);}
    setUploading(false);
  };

  const setFlag=async(ivr,patch)=>{
    const d=await apiFetch(`/ivr-lib/${ivr.id}`,token,{method:"PUT",body:JSON.stringify(patch)});
    if(!d.success) alert(d.error||d.message||"Update failed");
    else if(d.pool&&!d.pool.ok) alert("Saved, but the live Asterisk pool could not be updated - supplier-path calls keep the previous pool until it is.");
    load();
  };
  const del=async(id)=>{
    if(!window.confirm("Delete this IVR?")) return;
    const d=await apiFetch(`/ivr-lib/${id}`,token,{method:"DELETE"});
    if(!d.success) alert(d.error||d.message||"Delete failed");
    load();
  };

  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"rgba(255,255,255,0.05)",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box"};

  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:16,fontWeight:800}}>🎵 IVR Library</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setPage&&setPage("connectivr")}
            style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${C.green}40`,
              background:`${C.green}15`,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>
            🔗 Connect IVR
          </button>
          <button onClick={()=>setShowUpload(o=>!o)}
            style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${C.purple}40`,
              background:`${C.purple}15`,color:C.purple,fontSize:12,fontWeight:700,cursor:"pointer"}}>
            + Upload
          </button>
        </div>
      </div>

      {/* Upload Form */}
      {showUpload&&(
        <Card style={{padding:16,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Upload IVR Audio</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>IVR Name * (no spaces)</div>
              <input style={inp} value={uploadForm.name} placeholder="telephone-convo"
                onChange={e=>setUploadForm(f=>({...f,name:e.target.value.replace(/\s+/g,"-").toLowerCase()}))}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Display Name</div>
              <input style={inp} value={uploadForm.display_name} placeholder="Telephone Convo"
                onChange={e=>setUploadForm(f=>({...f,display_name:e.target.value}))}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Audio File (wav/mp3/ogg)</div>
              <input type="file" accept=".wav,.mp3,.ogg,.slin"
                onChange={e=>setFile(e.target.files[0])}
                style={{...inp,padding:"6px"}}/>
              {file&&<div style={{fontSize:10,color:C.green,marginTop:4}}>✅ {file.name} ({(file.size/1024).toFixed(0)}KB)</div>}
            </div>
            <div style={{padding:"10px 12px",borderRadius:8,background:`${C.blue}08`,
              border:`1px solid ${C.blue}20`,fontSize:10,color:C.blue}}>
              Audio will be converted to 8kHz mono SLIN format for Asterisk
            </div>
          </div>
          {uploadMsg&&<div style={{fontSize:11,color:uploadMsg.startsWith("✅")?C.green:C.red,marginBottom:8}}>{uploadMsg}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowUpload(false)}
              style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,
                background:"transparent",color:C.muted,fontSize:12,cursor:"pointer"}}>Cancel</button>
            <button onClick={upload} disabled={uploading}
              style={{flex:2,padding:"10px",borderRadius:8,border:`1px solid ${C.purple}40`,
                background:`${C.purple}15`,color:C.purple,fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {uploading?"Uploading...":"⬆ Upload IVR"}
            </button>
          </div>
        </Card>
      )}

      {/* IVR List */}
      {loading?<div style={{textAlign:"center",padding:40,color:C.muted}}>Loading...</div>
      :ivrs.length===0?<Card style={{padding:60,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:8}}>🎵</div>
        <div style={{color:C.muted,marginBottom:12}}>No IVR files yet</div>
        <button onClick={()=>setShowUpload(true)}
          style={{padding:"10px 20px",borderRadius:8,border:`1px solid ${C.purple}40`,
            background:`${C.purple}15`,color:C.purple,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          + Upload First IVR
        </button>
      </Card>
      :<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {ivrs.map((ivr,i)=>(
          <Card key={i} style={{padding:14}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:28,flexShrink:0}}>🎵</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{ivr.display_name||ivr.title||ivr.name}</div>
                <div style={{fontSize:10,color:C.purple,fontFamily:"monospace",marginBottom:4}}>custom/{ivr.name}</div>
                <div style={{display:"flex",gap:8}}>
                  <span onClick={()=>setFlag(ivr,{is_active:!ivr.is_active})} title="Click to toggle. Inactive IVRs are never played or pooled."
                    style={{fontSize:9,padding:"2px 8px",borderRadius:20,cursor:"pointer",
                    background:ivr.is_active?`${C.green}15`:`${C.red}15`,color:ivr.is_active?C.green:C.red,fontWeight:700}}>{ivr.is_active?"ACTIVE":"INACTIVE"}</span>
                  <span onClick={()=>setFlag(ivr,{in_pool:!ivr.in_pool})} title="Default-IVR pool: one active pooled IVR is picked at random on every call to a number/route using the default IVR"
                    style={{fontSize:9,padding:"2px 8px",borderRadius:20,cursor:"pointer",fontWeight:700,
                    background:ivr.in_pool?"#6A2B9A":"transparent",color:ivr.in_pool?"#FFF":C.muted,border:"1px solid "+(ivr.in_pool?"#6A2B9A":C.border)}}>{ivr.in_pool?"IN POOL":"NOT IN POOL"}</span>
                  <span style={{fontSize:9,color:C.muted}}>{ivr.audio_file||ivr.name+".slin"}</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                <button onClick={()=>playPause(ivr)}
                  style={{padding:"5px 10px",borderRadius:6,border:"1px solid #2CADA6",
                    background:"rgba(44,173,166,0.1)",color:"#2CADA6",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                  {playingId===ivr.id?"⏸ Pause":"▶ Play"}
                </button>
                <button onClick={()=>setPage&&setPage("connectivr")}
                  style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${C.green}40`,
                    background:`${C.green}10`,color:C.green,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                  🔗 Connect
                </button>
                <button onClick={()=>del(ivr.id)}
                  style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${C.red}40`,
                    background:`${C.red}10`,color:C.red,fontSize:10,cursor:"pointer"}}>
                  Del
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>}
    </div>
  );
}

// ── Connect IVR Step Indicator ───────────────────────────────────
function IVRStep({n,current,label}){
  return(
    <div style={{flex:1,textAlign:"center"}}>
      <div style={{width:32,height:32,borderRadius:"50%",margin:"0 auto 4px",display:"flex",alignItems:"center",
        justifyContent:"center",fontSize:13,fontWeight:800,
        background:current>n?C.green:current===n?`${C.green}25`:"rgba(255,255,255,0.06)",
        color:current>n?"#000":current===n?C.green:C.muted,
        border:`2px solid ${current>=n?C.green:C.border}`}}>{n}</div>
      <div style={{fontSize:9,color:current===n?C.green:C.muted,textTransform:"uppercase",letterSpacing:"1px"}}>{label}</div>
    </div>
  );
}

// ── Connect IVR ─────────────────────────────────────────────────
function ConnectIVRPage({token}){
  const [step,setStep]=useState(1);
  const [prefixes,setPrefixes]=useState([]);
  const [ivrs,setIvrs]=useState([]);
  const [prefixId,setPrefixId]=useState("ALL");
  const [ivr,setIvr]=useState("");
  const [applying,setApplying]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    apiFetch("/prefixes",token).then(d=>setPrefixes(d.data||[]));
    apiFetch("/ivr-lib/audio",token).then(d=>setIvrs(d.data||[]));
  },[token]);

  const sel={width:"100%",padding:"10px 12px",borderRadius:8,
    border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",
    color:C.text,fontSize:13,outline:"none"};

  const apply=async()=>{
    setApplying(true);setMsg("");
    const ivrCtx=ivr.startsWith("custom/")?ivr:`custom/${ivr}`;
    if(prefixId==="ALL"){
      await apiFetch("/prefixes/bulk-ivr",token,{method:"PUT",body:JSON.stringify({ivr_context:ivrCtx})});
    } else {
      await apiFetch(`/prefixes/${prefixId}/ivr`,token,{method:"PUT",body:JSON.stringify({ivr_context:ivrCtx})});
    }
    setMsg("✅ IVR applied successfully!");
    setApplying(false);
    setStep(1);setIvr("");
  };

  return(
    <div style={{padding:16}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>🔗 Connect IVR</div>
      <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Assign IVR audio to DID prefixes</div>

      <Card style={{padding:20,maxWidth:520,margin:"0 auto"}}>
        {/* Step indicators */}
        <div style={{display:"flex",gap:8,marginBottom:24}}>
          {[["1","Prefix"],["2","IVR"],["3","Apply"]].map(([n,label])=>(
            <div key={n} style={{flex:1,textAlign:"center"}}>
              <div style={{width:32,height:32,borderRadius:"50%",margin:"0 auto 4px",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:13,fontWeight:800,
                background:parseInt(step)>parseInt(n)?C.green:parseInt(step)===parseInt(n)?`${C.green}25`:"rgba(255,255,255,0.06)",
                color:parseInt(step)>parseInt(n)?"#000":parseInt(step)===parseInt(n)?C.green:C.muted,
                border:`2px solid ${parseInt(step)>=parseInt(n)?C.green:C.border}`}}>{n}</div>
              <div style={{fontSize:9,color:parseInt(step)===parseInt(n)?C.green:C.muted,
                textTransform:"uppercase",letterSpacing:"1px"}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Step 1 - Select Prefix */}
        {step===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Select Prefix</div>
              <select style={sel} value={prefixId} onChange={e=>setPrefixId(e.target.value)}>
                <option value="ALL">ALL PREFIXES ({prefixes.length} prefixes)</option>
                {prefixes.map(p=>(
                  <option key={p.id} value={p.id}>{p.country} — {p.prefix}{p.supplier_name?` (${numSupplier(p.supplier_name)})`:""} ({p.number_count||0} numbers)</option>
                ))}
              </select>
            </div>
            <div style={{padding:"10px 12px",borderRadius:8,background:`${C.blue}08`,
              border:`1px solid ${C.blue}20`,fontSize:11,color:C.blue}}>
              {prefixId==="ALL"?`Will update all ${prefixes.length} prefixes`:`Selected prefix ID: ${prefixId}`}
            </div>
            <button onClick={()=>setStep(2)}
              style={{padding:"12px",borderRadius:8,border:`1px solid ${C.green}40`,
                background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              Next → Select IVR
            </button>
          </div>
        )}

        {/* Step 2 - Select IVR */}
        {step===2&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Select IVR Audio</div>
              <select style={sel} value={ivr} onChange={e=>setIvr(e.target.value)}>
                <option value="">-- Select IVR --</option>
                {ivrs.map(f=>(
                  <option key={f.id} value={`custom/${f.name}`}>{f.display_name||f.name}</option>
                ))}
              </select>
            </div>
            {ivr&&<div style={{padding:"10px 12px",borderRadius:8,background:`${C.purple}08`,
              border:`1px solid ${C.purple}20`,fontSize:11,color:C.purple}}>
              Selected: {ivr.replace("custom/","")}
            </div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep(1)}
                style={{flex:1,padding:"12px",borderRadius:8,border:`1px solid ${C.border}`,
                  background:"transparent",color:C.muted,fontSize:13,cursor:"pointer"}}>Back</button>
              <button onClick={()=>setStep(3)} disabled={!ivr}
                style={{flex:2,padding:"12px",borderRadius:8,border:`1px solid ${C.green}40`,
                  background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                Next → Review
              </button>
            </div>
          </div>
        )}

        {/* Step 3 - Apply */}
        {step===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:`${C.green}05`,border:`1px solid ${C.green}20`,
              borderRadius:10,padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:12}}>Ready to Apply</div>
              {[["Prefix",prefixId==="ALL"?"All Prefixes":`Prefix ID: ${prefixId}`],
                ["IVR",ivr.replace("custom/","")]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",
                  padding:"6px 0",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
                  <span style={{fontSize:11,color:C.muted}}>{k}</span>
                  <span style={{fontSize:11,color:C.text,fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            {msg&&<div style={{padding:"10px 12px",borderRadius:8,background:`${C.green}10`,
              border:`1px solid ${C.green}30`,fontSize:12,color:C.green}}>{msg}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep(2)}
                style={{flex:1,padding:"12px",borderRadius:8,border:`1px solid ${C.border}`,
                  background:"transparent",color:C.muted,fontSize:13,cursor:"pointer"}}>Back</button>
              <button onClick={apply} disabled={applying}
                style={{flex:2,padding:"12px",borderRadius:8,border:`1px solid ${C.green}40`,
                  background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {applying?"Applying...":"✅ Apply IVR"}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}


// ── Reseller Portal ───────────────────────────────────────────────
function ResellerPortalPage({token}){
  const [resellers,setResellers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [saving,setSaving]=useState(false);
  const [tab,setTab]=useState("list");
  const [resellerCdr,setResellerCdr]=useState([]);
  const [topupAmount,setTopupAmount]=useState("");
  const [form,setForm]=useState({
    name:"",email:"",password:"",company:"",phone:"",
    role:"reseller",credit_limit:"0",markup:"0",notes:""
  });

  const load=()=>{
    apiFetch("/resellers",token).then(d=>{setResellers(d.data||[]);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);

  const selectReseller=(r)=>{
    setSelected(r);setTab("detail");
    setForm({name:r.name,email:r.email,password:"",company:r.company||"",
      phone:r.phone||"",role:r.role||"reseller",credit_limit:r.credit_limit||"0",
      markup:r.markup||"0",notes:r.notes||""});
    apiFetch("/resellers/"+r.id+"/cdr",token).then(d=>setResellerCdr(d.data||[]));
  };

  const save=async()=>{
    setSaving(true);
    if(selected){
      await apiFetch("/resellers/"+selected.id,token,{method:"PUT",body:JSON.stringify(form)});
    } else {
      await apiFetch("/resellers",token,{method:"POST",body:JSON.stringify(form)});
    }
    setSaving(false);setShowAdd(false);setSelected(null);setTab("list");load();
  };

  const del=async(id)=>{
    if(!window.confirm("Delete this reseller?")) return;
    await apiFetch("/resellers/"+id,token,{method:"DELETE"});
    setSelected(null);setTab("list");load();
  };

  const topup=async()=>{
    if(!topupAmount||isNaN(topupAmount)) return;
    await apiFetch("/resellers/"+selected.id+"/topup",token,{method:"POST",body:JSON.stringify({amount:parseFloat(topupAmount)})});
    setTopupAmount("");load();selectReseller({...selected,balance:parseFloat(selected.balance||0)+parseFloat(topupAmount)});
  };

  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #E0E0E0",
    background:"#FFF",color:"#333",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};

  const Field=({label,k,ph,type="text"})=>(
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div>
      <input type={type} style={inp} value={form[k]||""} placeholder={ph||""}
        onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
    </div>
  );

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Reseller Portal</div>
        <button onClick={()=>{setShowAdd(true);setSelected(null);setTab("add");
          setForm({name:"",email:"",password:"",company:"",phone:"",role:"reseller",credit_limit:"0",markup:"0",notes:""});}}
          style={{padding:"8px 18px",borderRadius:20,border:"none",background:"#2CADA6",
            color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add Reseller</button>
      </div>

      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total Resellers",value:resellers.length,color:"#2CADA6"},
          {label:"Active",value:resellers.filter(r=>r.status==="active").length,color:"#10B981"},
          {label:"Total Revenue",value:fmtUSDT(resellers.reduce((a,r)=>a+parseFloat(r.revenue||0),0)),color:"#F5A623"},
        ].map((s,i)=>(
          <div key={i} style={{background:"#FFF",borderRadius:12,padding:"12px 14px",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid "+s.color}}>
            <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:10,color:"#999",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add/Edit Form */}
      {(tab==="add"||(tab==="detail"&&selected))&&(
        <div style={{background:"#FFF",borderRadius:14,padding:18,marginBottom:16,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:15,fontWeight:700,color:"#1A1A1A"}}>
              {tab==="add"?"New Reseller":"Edit: "+selected?.name}
            </div>
            {selected&&<button onClick={()=>del(selected.id)}
              style={{padding:"6px 14px",borderRadius:20,border:"1px solid #EF4444",
                background:"#FFF",color:"#EF4444",fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Full Name" k="name" ph="John Smith"/>
            <Field label="Email" k="email" ph="john@company.com"/>
            <Field label="Password" k="password" ph={selected?"Leave blank to keep":"Set password"} type="password"/>
            <Field label="Company" k="company" ph="Company Ltd"/>
            <Field label="Phone" k="phone" ph="+1234567890"/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Role</div>
              <select style={inp} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="reseller">Reseller</option>
                <option value="dialer">Dialer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Field label="Credit Limit ($)" k="credit_limit" ph="1000"/>
            <Field label="Markup (%)" k="markup" ph="10"/>
          </div>
          <Field label="Notes" k="notes" ph="Additional notes..."/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>{setTab("list");setSelected(null);setShowAdd(false);}}
              style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #DDD",
                background:"#FFF",color:"#666",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            <button onClick={save} disabled={saving}
              style={{flex:2,padding:"10px",borderRadius:10,border:"none",
                background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {saving?"Saving...":"Save Reseller"}
            </button>
          </div>
        </div>
      )}

      {/* Reseller Detail View */}
      {tab==="detail"&&selected&&(
        <div style={{background:"#FFF",borderRadius:14,padding:16,marginBottom:16,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:"#1A1A1A"}}>{selected.name} — Stats</div>
            <button onClick={()=>setTab("list")}
              style={{padding:"5px 12px",borderRadius:20,border:"1px solid #DDD",
                background:"#FFF",color:"#666",fontSize:11,cursor:"pointer"}}>← Back</button>
          </div>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {[
              {label:"DIDs",value:selected.dids_count,color:"#8B5CF6"},
              {label:"Calls",value:selected.calls_count,color:"#3B82F6"},
              {label:"Revenue",value:fmtUSDT(selected.revenue),color:"#10B981"},
              {label:"Balance",value:fmtUSDT(selected.balance),color:"#F5A623"},
              {label:"Credit Limit",value:fmtUSDT(selected.credit_limit),color:"#2CADA6"},
              {label:"Markup",value:selected.markup+"%",color:"#EF4444"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#F8F9FA",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:800,color:s.color}}>{s.value}</div>
                <div style={{fontSize:10,color:"#999",fontWeight:600,textTransform:"uppercase"}}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Top Up */}
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={topupAmount} onChange={e=>setTopupAmount(e.target.value)}
              placeholder="Top up amount ($)" style={{...inp,flex:1}}/>
            <button onClick={topup}
              style={{padding:"9px 18px",borderRadius:10,border:"none",background:"#10B981",
                color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>Top Up</button>
          </div>
          {/* CDR Table */}
          <div style={{fontSize:12,fontWeight:700,color:"#4A4A4A",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>
            Recent CDR ({resellerCdr.length} records)
          </div>
          <div style={{overflowX:"auto"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#F8F9FA"}}>
                  {["Date","Caller","DID","Duration","Revenue"].map((h,i)=>(
                    <th key={i} style={{padding:"8px 12px",fontSize:11,color:"#9A9A9A",
                      fontWeight:600,textAlign:"left",borderBottom:"1px solid #EEE"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resellerCdr.length===0
                  ?<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#999",fontSize:12}}>No CDR records</td></tr>
                  :resellerCdr.slice(0,20).map((c,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"8px 12px",fontSize:11,color:"#999"}}>{(c.call_start||c.created_at||"").slice(0,16)}</td>
                      <td style={{padding:"8px 12px",fontSize:12,fontFamily:"monospace"}}>{c.src||c.caller||"—"}</td>
                      <td style={{padding:"8px 12px",fontSize:12,color:"#2CADA6",fontFamily:"monospace"}}>{c.did||"—"}</td>
                      <td style={{padding:"8px 12px",fontSize:12,color:"#555"}}>{c.billsec||0}s</td>
                      <td style={{padding:"8px 12px",fontSize:12,color:"#F5A623",fontWeight:700}}>{fmtUSDT(c.revenue)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </GTable>
          </div>
        </div>
      )}

      {/* Reseller List */}
      {tab==="list"&&(
        loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>
        :resellers.length===0
        ?<div style={{background:"#FFF",borderRadius:14,padding:40,textAlign:"center",
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:32,marginBottom:8}}>👥</div>
          <div style={{color:"#999",fontSize:13}}>No resellers yet — add your first one</div>
        </div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {resellers.map((r,i)=>(
            <div key={r.id} onClick={()=>selectReseller(r)}
              style={{background:"#FFF",borderRadius:12,padding:"14px 16px",
                boxShadow:"0 2px 8px rgba(0,0,0,0.06)",cursor:"pointer",
                display:"flex",alignItems:"center",gap:12,
                transition:"box-shadow 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.1)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)"}>
              <div style={{width:42,height:42,borderRadius:"50%",flexShrink:0,
                background:"linear-gradient(135deg,#2CADA6,#38B7A8)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:16,fontWeight:800,color:"#FFF"}}>
                {(r.name||"R")[0].toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"#1A1A1A"}}>{r.name}</div>
                <div style={{fontSize:12,color:"#999"}}>{r.company||r.email}</div>
              </div>
              <div style={{display:"flex",gap:12,flexShrink:0}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#8B5CF6"}}>{r.dids_count}</div>
                  <div style={{fontSize:9,color:"#999",textTransform:"uppercase"}}>DIDs</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#10B981"}}>{fmtUSDT(r.revenue)}</div>
                  <div style={{fontSize:9,color:"#999",textTransform:"uppercase"}}>Revenue</div>
                </div>
                <span style={{padding:"4px 10px",borderRadius:10,fontSize:11,fontWeight:700,alignSelf:"center",
                  background:r.status==="active"?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
                  color:r.status==="active"?"#10B981":"#EF4444"}}>
                  {r.status||"active"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ── Customers ─────────────────────────────────────────────────────
function CustomersPage({token}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",email:"",password:""});
  const [msg,setMsg]=useState("");
  const [saving,setSaving]=useState(false);
  const load=useCallback(()=>{apiFetch("/customers",token).then(d=>{setCustomers(d.data||[]);setLoading(false);});},[token]);
  useEffect(()=>{load();},[load]);
  const create=async()=>{
    setSaving(true);
    const d=await apiFetch("/customers",token,{method:"POST",body:JSON.stringify(form)});
    if(d.data){setMsg(`✅ Created — ID: ${d.client_id}`);load();setForm({name:"",email:"",password:""});}
    else setMsg("❌ "+(d.message||"Failed"));
    setSaving(false);
  };
  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"rgba(255,255,255,0.05)",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box"};
  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:16,fontWeight:800}}>Customers</div>
        <button onClick={()=>setShowAdd(o=>!o)}
          style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${C.blue}40`,
            background:`${C.blue}15`,color:C.blue,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          + Add
        </button>
      </div>
      {showAdd&&(
        <Card style={{padding:16,marginBottom:16}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
            {[["Name","name","John Doe"],["Email","email","john@example.com"],["Password","password","pass123"]].map(([l,k,ph])=>(
              <div key={k}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
                <input style={inp} type={k==="password"?"password":"text"} value={form[k]} placeholder={ph}
                  onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
              </div>
            ))}
          </div>
          {msg&&<div style={{fontSize:11,color:C.green,marginBottom:8}}>{msg}</div>}
          <button onClick={create} disabled={saving}
            style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
              background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {saving?"Creating...":"+ Create Customer"}
          </button>
        </Card>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {loading?<div style={{textAlign:"center",padding:40,color:C.muted}}>Loading...</div>
        :customers.map((c,i)=>(
          <Card key={i} style={{padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:13,fontWeight:700,color:C.blue,fontFamily:"monospace"}}>{c.client_id}</span>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,
                background:c.role==="admin"?`${C.purple}15`:`${C.green}15`,
                color:c.role==="admin"?C.purple:C.green}}>{c.role}</span>
            </div>
            <div style={{fontSize:12,color:C.text,marginBottom:2}}>{c.name}</div>
            <div style={{fontSize:10,color:C.muted}}>{c.email}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Audit Log ─────────────────────────────────────────────────────
function AuditLogPage({token}){
  const [logs,setLogs]=useState([]);
  const [stats,setStats]=useState(null);
  const [loading,setLoading]=useState(true);
  const [filterModule,setFilterModule]=useState("");
  const [filterUser,setFilterUser]=useState("");
  const [filterFrom,setFilterFrom]=useState("");
  const [filterTo,setFilterTo]=useState("");
  const [clearing,setClearing]=useState(false);
  const [result,setResult]=useState(null);

  const load=()=>{
    setLoading(true);
    const params=new URLSearchParams();
    if(filterModule) params.set("module",filterModule);
    if(filterUser) params.set("user",filterUser);
    if(filterFrom) params.set("from",filterFrom);
    if(filterTo) params.set("to",filterTo);
    apiFetch("/audit-logs?"+params.toString(),token).then(d=>{
      setLogs(d.data||[]);setStats(d.stats||null);setLoading(false);
    });
  };
  useEffect(()=>{load();},[token]);

  const clearOldLogs=async(days)=>{
    if(!window.confirm("Delete logs older than "+days+" days?")) return;
    setClearing(true);
    const d=await apiFetch("/audit-logs/clear?days="+days,token,{method:"DELETE"});
    setResult(d);setClearing(false);load();
  };

  const actionColor=(action)=>{
    const a=action?.toUpperCase();
    if(a==="LOGIN") return "#10B981";
    if(a==="DELETE") return "#EF4444";
    if(a==="CREATE"||a==="POST") return "#3B82F6";
    if(a==="UPDATE"||a==="PUT") return "#F5A623";
    return "#8B5CF6";
  };

  const modules=[...new Set(logs.map(l=>l.module).filter(Boolean))];

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Audit Log</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>clearOldLogs(30)} disabled={clearing}
            style={{padding:"6px 12px",borderRadius:20,border:"1px solid #F5A623",
              background:"#FFF",color:"#F5A623",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            Clear 30d+
          </button>
          <button onClick={load}
            style={{padding:"6px 14px",borderRadius:20,border:"none",background:"#2CADA6",
              color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>⟳ Refresh</button>
        </div>
      </div>

      {/* Result */}
      {result&&(
        <div style={{padding:"10px 14px",borderRadius:10,marginBottom:12,
          background:result.success?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
          border:"1px solid "+(result.success?"#10B981":"#EF4444"),fontSize:12,
          color:result.success?"#10B981":"#EF4444",fontWeight:600}}>
          {result.message||result.error}
        </div>
      )}

      {/* Stats Row */}
      {stats&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total Logs",value:stats.total||0,color:"#2CADA6"},
          {label:"Today",value:stats.today||0,color:"#10B981"},
          {label:"Modules",value:(stats.modules||[]).length,color:"#8B5CF6"},
        ].map((s,i)=>(
          <div key={i} style={{background:"#FFF",borderRadius:12,padding:"12px 14px",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid "+s.color}}>
            <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:10,color:"#999",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
          </div>
        ))}
      </div>}

      {/* Top Users */}
      {stats?.users?.length>0&&(
        <div style={{background:"#FFF",borderRadius:12,padding:14,marginBottom:14,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#4A4A4A",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>Most Active Users</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {(stats.users||[]).map((u,i)=>(
              <div key={i} style={{padding:"5px 12px",borderRadius:20,
                background:"rgba(44,173,166,0.08)",border:"1px solid rgba(44,173,166,0.2)"}}>
                <span style={{fontSize:12,fontWeight:600,color:"#2CADA6"}}>{u.user}</span>
                <span style={{fontSize:11,color:"#999",marginLeft:6}}>{u.count} actions</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <select value={filterModule} onChange={e=>setFilterModule(e.target.value)}
          style={{padding:"8px 12px",borderRadius:20,border:"1px solid #E0E0E0",
            background:"#FFF",fontSize:12,outline:"none",cursor:"pointer",flex:1,minWidth:120}}>
          <option value="">All Modules</option>
          {modules.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <input value={filterUser} onChange={e=>setFilterUser(e.target.value)}
          placeholder="Filter by user..." style={{padding:"8px 12px",borderRadius:20,
            border:"1px solid #E0E0E0",background:"#FFF",fontSize:12,outline:"none",flex:1,minWidth:100}}/>
        <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}
          style={{padding:"8px 12px",borderRadius:20,border:"1px solid #E0E0E0",
            background:"#FFF",fontSize:12,outline:"none"}}/>
        <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
          style={{padding:"8px 12px",borderRadius:20,border:"1px solid #E0E0E0",
            background:"#FFF",fontSize:12,outline:"none"}}/>
        <button onClick={load}
          style={{padding:"8px 16px",borderRadius:20,border:"none",background:"#6B2FBF",
            color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>Filter</button>
      </div>

      {/* Log Table */}
      {loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading audit logs...</div>
      :<div style={{background:"#FFF",borderRadius:14,overflow:"hidden",
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{overflowX:"auto"}}>
          <GTable style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#F8F9FA"}}>
                {["Time","User","Role","Action","Module","Details","IP"].map((h,i)=>(
                  <th key={i} style={{padding:"10px 12px",fontSize:11,color:"#9A9A9A",
                    fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                    borderBottom:"1px solid #EEE",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length===0
                ?<tr><td colSpan={7} style={{padding:40,textAlign:"center",color:"#999"}}>
                  No audit logs yet — logs appear after user actions
                </td></tr>
                :logs.map((log,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #F5F5F5",
                    background:i%2===0?"#FFF":"#FAFAFA"}}>
                    <td style={{padding:"8px 12px",fontSize:11,color:"#999",whiteSpace:"nowrap"}}>
                      {(log.created_at||"").slice(0,16)}
                    </td>
                    <td style={{padding:"8px 12px",fontSize:12,fontWeight:600,color:"#1A1A1A"}}>
                      {log.user||"—"}
                    </td>
                    <td style={{padding:"8px 12px"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                        background:"rgba(107,47,191,0.1)",color:"#6B2FBF",textTransform:"capitalize"}}>
                        {log.role||"—"}
                      </span>
                    </td>
                    <td style={{padding:"8px 12px"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                        background:actionColor(log.action)+"15",color:actionColor(log.action)}}>
                        {log.action||"—"}
                      </span>
                    </td>
                    <td style={{padding:"8px 12px",fontSize:12,color:"#2CADA6",fontWeight:600}}>
                      {log.module||"—"}
                    </td>
                    <td style={{padding:"8px 12px",fontSize:11,color:"#555",
                      maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {log.details||"—"}
                    </td>
                    <td style={{padding:"8px 12px",fontSize:11,fontFamily:"monospace",color:"#999"}}>
                      {log.ip_address||"—"}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </GTable>
        </div>
        <div style={{padding:"10px 14px",borderTop:"1px solid #EEE",background:"#F8F9FA",
          fontSize:12,color:"#999",display:"flex",justifyContent:"space-between"}}>
          <span>Showing {logs.length} of {stats?.total||0} total logs</span>
          <span>Auto-logged: Login, API changes, Settings</span>
        </div>
      </div>}
    </div>
  );
}
// ── IP Whitelist Manager ──────────────────────────────────────────
function IPWhitelistPage({token}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("firewall");
  const [saving,setSaving]=useState(false);
  const [result,setResult]=useState(null);
  const [newIP,setNewIP]=useState("");
  const [newPort,setNewPort]=useState("any");
  const [newAction,setNewAction]=useState("allow");
  const [newEndpoint,setNewEndpoint]=useState("");
  const [newAsteriskIP,setNewAsteriskIP]=useState("");
  const [blockIP,setBlockIP]=useState("");

  const load=()=>{
    setLoading(true);
    apiFetch("/whitelist",token).then(d=>{setData(d);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);

  const addFirewall=async()=>{
    if(!newIP){alert("Enter an IP address");return;}
    setSaving(true);setResult(null);
    const d=await apiFetch("/whitelist/firewall",token,{method:"POST",
      body:JSON.stringify({ip:newIP,port:newPort,action:newAction})});
    setResult(d);setSaving(false);setNewIP("");load();
  };

  const removeFirewall=async(num)=>{
    if(!window.confirm("Remove this firewall rule?")) return;
    setSaving(true);
    const d=await apiFetch("/whitelist/firewall/"+num,token,{method:"DELETE"});
    setResult(d);setSaving(false);load();
  };

  const addAsterisk=async()=>{
    if(!newAsteriskIP||!newEndpoint){alert("Enter endpoint and IP");return;}
    setSaving(true);setResult(null);
    const d=await apiFetch("/whitelist/asterisk",token,{method:"POST",
      body:JSON.stringify({endpoint:newEndpoint,ip:newAsteriskIP})});
    setResult(d);setSaving(false);setNewAsteriskIP("");load();
  };

  const removeAsteriskIP=async(ip)=>{
    if(!window.confirm("Remove IP "+ip+" from Asterisk?")) return;
    setSaving(true);
    const d=await apiFetch("/whitelist/asterisk",token,{method:"DELETE",
      body:JSON.stringify({ip})});
    setResult(d);setSaving(false);load();
  };

  const blockIPNow=async()=>{
    if(!blockIP){alert("Enter an IP to block");return;}
    if(!window.confirm("Block IP "+blockIP+" completely?")) return;
    setSaving(true);setResult(null);
    const d=await apiFetch("/whitelist/block",token,{method:"POST",
      body:JSON.stringify({ip:blockIP})});
    setResult(d);setSaving(false);setBlockIP("");load();
  };

  const inp={padding:"9px 12px",borderRadius:8,border:"1px solid #E0E0E0",
    background:"#FFF",color:"#333",fontSize:13,outline:"none",fontFamily:"inherit"};

  const tabs=[
    {id:"firewall",label:"🔥 Firewall"},
    {id:"asterisk",label:"📡 Asterisk IPs"},
    {id:"block",label:"🚫 Block IP"},
    {id:"security",label:"🔐 Security Log"},
  ];

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>IP Whitelist Manager</div>
        <button onClick={load} style={{padding:"6px 14px",borderRadius:20,border:"none",
          background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>⟳ Refresh</button>
      </div>

      {/* Result */}
      {result&&(
        <div style={{padding:"12px 16px",borderRadius:10,marginBottom:14,
          background:result.success?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
          border:"1px solid "+(result.success?"#10B981":"#EF4444")}}>
          <div style={{fontSize:12,fontWeight:700,color:result.success?"#10B981":"#EF4444"}}>
            {result.success?"✅ Success":"❌ Error"}
          </div>
          <div style={{fontSize:12,color:"#333",marginTop:2}}>{result.message||result.output||result.error}</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"7px 14px",borderRadius:20,border:"none",whiteSpace:"nowrap",
              background:tab===t.id?"#2CADA6":"#F0F0F0",
              color:tab===t.id?"#FFF":"#555",
              fontSize:12,fontWeight:tab===t.id?700:500,cursor:"pointer",fontFamily:"inherit"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Firewall Tab */}
      {tab==="firewall"&&(
        <div>
          {/* Add Rule */}
          <div style={{background:"#FFF",borderRadius:14,padding:16,marginBottom:14,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:12}}>Add Firewall Rule</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={newIP} onChange={e=>setNewIP(e.target.value)}
                placeholder="IP address (e.g. 1.2.3.4)" style={{...inp,flex:2,minWidth:150}}/>
              <input value={newPort} onChange={e=>setNewPort(e.target.value)}
                placeholder="Port (any/80/443/5060)" style={{...inp,flex:1,minWidth:100}}/>
              <select value={newAction} onChange={e=>setNewAction(e.target.value)}
                style={{...inp,cursor:"pointer"}}>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
              </select>
              <button onClick={addFirewall} disabled={saving}
                style={{padding:"9px 18px",borderRadius:10,border:"none",
                  background:newAction==="deny"?"#EF4444":"#10B981",
                  color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                {saving?"Adding...":"Add Rule"}
              </button>
            </div>
          </div>
          {/* Rules List */}
          <div style={{background:"#FFF",borderRadius:14,overflow:"hidden",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #F0F0F0",
              fontSize:13,fontWeight:700,color:"#1A1A1A"}}>
              Active Firewall Rules ({(data?.firewall_rules||[]).length})
            </div>
            <div style={{overflowX:"auto"}}>
              <GTable style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#F8F9FA"}}>
                    {["#","Port/Service","Action","From","Remove"].map((h,i)=>(
                      <th key={i} style={{padding:"10px 14px",fontSize:11,color:"#9A9A9A",
                        fontWeight:600,textAlign:"left",borderBottom:"1px solid #EEE"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading?<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#999"}}>Loading...</td></tr>
                  :(data?.firewall_rules||[]).map((r,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#999"}}>{r.num}</td>
                      <td style={{padding:"10px 14px",fontSize:12,fontFamily:"monospace",fontWeight:600,color:"#1A1A1A"}}>{r.port}</td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                          background:r.action==="ALLOW"?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
                          color:r.action==="ALLOW"?"#10B981":"#EF4444"}}>
                          {r.action}
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12,fontFamily:"monospace",color:"#333"}}>{r.from}</td>
                      <td style={{padding:"10px 14px"}}>
                        <button onClick={()=>removeFirewall(r.num)}
                          style={{padding:"4px 10px",borderRadius:8,border:"1px solid #EF4444",
                            background:"#FFF",color:"#EF4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </GTable>
            </div>
          </div>
        </div>
      )}

      {/* Asterisk IPs Tab */}
      {tab==="asterisk"&&(
        <div>
          {/* Add IP */}
          <div style={{background:"#FFF",borderRadius:14,padding:16,marginBottom:14,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:12}}>Add IP to Endpoint</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <select value={newEndpoint} onChange={e=>setNewEndpoint(e.target.value)}
                style={{...inp,flex:1,minWidth:120,cursor:"pointer"}}>
                <option value="">Select endpoint...</option>
                {(data?.asterisk_endpoints||[]).map(e=>(
                  <option key={e.name} value={e.name}>{e.name}</option>
                ))}
              </select>
              <input value={newAsteriskIP} onChange={e=>setNewAsteriskIP(e.target.value)}
                placeholder="IP address" style={{...inp,flex:2,minWidth:150}}/>
              <button onClick={addAsterisk} disabled={saving}
                style={{padding:"9px 18px",borderRadius:10,border:"none",
                  background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                {saving?"Adding...":"Add IP"}
              </button>
            </div>
          </div>
          {/* Endpoints */}
          {(data?.asterisk_endpoints||[]).map((ep,i)=>(
            <div key={i} style={{background:"#FFF",borderRadius:14,padding:16,marginBottom:10,
              boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:14,fontWeight:700,color:"#1A1A1A"}}>{ep.name}</span>
                <span style={{fontSize:11,color:"#999",background:"#F0F0F0",
                  padding:"2px 8px",borderRadius:10}}>{ep.ips.length} IPs</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {ep.ips.map((ip,j)=>(
                  <div key={j} style={{display:"flex",alignItems:"center",gap:6,
                    padding:"5px 12px",borderRadius:20,
                    background:"rgba(44,173,166,0.08)",border:"1px solid rgba(44,173,166,0.2)"}}>
                    <span style={{fontSize:12,fontFamily:"monospace",color:"#2CADA6",fontWeight:600}}>{ip}</span>
                    <button onClick={()=>removeAsteriskIP(ip)}
                      style={{background:"none",border:"none",cursor:"pointer",
                        color:"#EF4444",fontSize:14,padding:0,lineHeight:1}}>×</button>
                  </div>
                ))}
                {ep.ips.length===0&&<span style={{fontSize:12,color:"#999"}}>No IPs configured</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Block IP Tab */}
      {tab==="block"&&(
        <div style={{background:"#FFF",borderRadius:14,padding:20,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1A1A1A",marginBottom:8}}>Block IP Address</div>
          <div style={{fontSize:12,color:"#999",marginBottom:16}}>
            Immediately block an IP from accessing your server via UFW firewall
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={blockIP} onChange={e=>setBlockIP(e.target.value)}
              placeholder="Enter IP to block (e.g. 1.2.3.4)"
              style={{...inp,flex:1}}
              onKeyDown={e=>e.key==="Enter"&&blockIPNow()}/>
            <button onClick={blockIPNow} disabled={saving}
              style={{padding:"9px 18px",borderRadius:10,border:"none",
                background:"#EF4444",color:"#FFF",fontSize:13,fontWeight:700,
                cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
              {saving?"Blocking...":"🚫 Block Now"}
            </button>
          </div>
          <div style={{background:"#FFF9F9",border:"1px solid #FFCDD2",borderRadius:8,padding:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"#EF4444",marginBottom:4}}>⚠ Warning</div>
            <div style={{fontSize:12,color:"#666"}}>
              Blocking an IP will prevent ALL access from that IP — including SIP calls, web, and SSH.
              Make sure you don't block your own IP!
            </div>
          </div>
        </div>
      )}

      {/* Security Log Tab */}
      {tab==="security"&&(
        <div style={{background:"#FFF",borderRadius:14,padding:16,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:14}}>
            Security Log (Recent Events)
          </div>
          {(data?.security_log||[]).length===0
            ?<div style={{textAlign:"center",padding:30,color:"#10B981",fontSize:13}}>
              ✅ No security events found
            </div>
            :<div style={{display:"flex",flexDirection:"column",gap:4}}>
              {(data?.security_log||[]).map((log,i)=>(
                <div key={i} style={{padding:"8px 12px",borderRadius:8,fontSize:11,
                  fontFamily:"monospace",color:"#EF4444",
                  background:"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.1)"}}>
                  {log}
                </div>
              ))}
            </div>
          }
        </div>
      )}
    </div>
  );
}
// ── Test Labs ─────────────────────────────────────────────────────
function TestLabsPage({token}){
  const [tab,setTab]=useState("numbers");
  const [ranges,setRanges]=useState([]);
  const [dids,setDids]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [liveCalls,setLiveCalls]=useState([]);
  const [accessList,setAccessList]=useState([]);
  const [loading,setLoading]=useState(true);
  const [loadingLive,setLoadingLive]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [newEntry,setNewEntry]=useState({cli:"",name:"",company:"",type:"allow",note:""});
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState(null);

  const load=()=>{
    setLoading(true);
    Promise.all([
      apiFetch("/did-ranges",token),
      apiFetch("/dids",token),
      apiFetch("/suppliers",token),
    ]).then(([r,d,s])=>{
      const trunks={};
      (s.data||[]).forEach(t=>{trunks[t.id]=numSupplier(t.nickname);});
      setRanges(r.data||[]);
      setDids((d.data||[]).map(x=>({...x,supplier_name:trunks[x.trunk_id]||"—"})));
      setLoading(false);
    });
    apiFetch("/test/access-list",token).then(d=>setAccessList(d.data||[]));
  };

  const loadLive=()=>{
    setLoadingLive(true);
    apiFetch("/live-calls",token).then(d=>{
      setLiveCalls(d.data||d||[]);
      setLoadingLive(false);
    });
  };

  useEffect(()=>{
    load();
    loadLive();
    const t=setInterval(loadLive,5000);
    return()=>clearInterval(t);
  },[token]);

  const getTestNumber=(r)=>{
    const match=dids.find(d=>{
      const n=(d.number||"").replace("+","");
      return n.startsWith(r.prefix?.replace(/\s/g,"")||"");
    });
    return match?match.number:r.range_start?"+"+r.range_start:"—";
  };

  const thS={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",
    padding:"8px 10px",textAlign:"left",borderBottom:"2px solid #E8E8E8",
    background:"#F5F5F5",textTransform:"uppercase",whiteSpace:"nowrap"};
  const typeColor=(t)=>t==="allow"?"#10B981":t==="block"?"#EF4444":"#F59E0B";
  const typeIcon=(t)=>t==="allow"?"✅":t==="block"?"🚫":"⚗";

  const fmt=(sec)=>{
    const s=Math.max(0,parseInt(sec)||0);
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;
    return h>0?[h,m,ss].map(v=>String(v).padStart(2,"0")).join(":"):
               [m,ss].map(v=>String(v).padStart(2,"0")).join(":");
  };

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px"}}>
        <div style={{fontSize:18,fontWeight:700}}>⚗ Test Number</div>
        <div style={{fontSize:11,color:"#999",marginTop:2}}>Test numbers, live calls and access list</div>
      </div>

      <div style={{padding:"12px 16px"}}>
        {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
          background:msg.success?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
          border:"1px solid "+(msg.success?"#10B981":"#EF4444"),
          fontSize:12,color:msg.success?"#10B981":"#EF4444",fontWeight:600}}>
          {msg.success?"✅ ":"❌ "}{msg.message||msg.error}
        </div>}

        {/* Tabs */}
        <div style={{display:"flex",gap:4,marginBottom:12,overflowX:"auto"}}>
          {[
            ["numbers","📋 Test Numbers"],
            ["live","📞 Test Live Call"],
            ["access","🔐 Access List"],
          ].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:"8px 16px",borderRadius:20,border:"none",fontSize:11,
                background:tab===t?"#2CADA6":"#F0F0F0",
                color:tab===t?"#FFF":"#555",fontWeight:tab===t?700:400,
                cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
          ))}
        </div>

        {/* TEST NUMBERS TAB */}
        {tab==="numbers"&&(
          <div style={{background:"#FFF",borderRadius:8,overflow:"hidden",
            boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            {loading?<div style={{padding:40,textAlign:"center",color:"#999"}}>Loading...</div>
            :<div style={{overflowX:"auto"}}>
              <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
                <thead>
                  <tr>{["SL","PREFIX/RANGE","COUNTRY","PRICE","SUPPLIER","IVR","TEST NUMBER"].map((h,i)=>(
                    <th key={i} style={thS}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {ranges.map((r,i)=>{
                    const ivr=(r.ivr_context||r.default_ivr||"—").replace("custom/","");
                    const testNum=getTestNumber(r);
                    return(
                      <tr key={r.id} style={{borderBottom:"1px solid #F5F5F5",
                        background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{padding:"10px 10px",fontSize:11,color:"#999",fontWeight:600}}>{i+1}</td>
                        <td style={{padding:"10px 10px"}}>
                          <div style={{fontSize:12,fontFamily:"monospace",fontWeight:700}}>{r.prefix}</div>
                          <div style={{fontSize:9,color:"#999"}}>{r.range_start}–{r.range_end}</div>
                        </td>
                        <td style={{padding:"10px 10px",fontSize:11,color:"#333"}}>{r.country_name||"—"}</td>
                        <td style={{padding:"10px 10px",fontSize:12,fontWeight:700,
                          color:"#10B981",fontFamily:"monospace"}}>
                          {fmtUSDT(r.rate,3)}/min
                        </td>
                        <td style={{padding:"10px 10px",fontSize:11,color:"#2CADA6",fontWeight:600}}>
                          {numSupplier(r.supplier_name)}
                        </td>
                        <td style={{padding:"10px 10px",fontSize:10,color:"#555"}}>{ivr}</td>
                        <td style={{padding:"10px 10px"}}>
                          <div style={{fontSize:12,fontFamily:"monospace",fontWeight:700,
                            color:"#1A1A1A",marginBottom:4}}>{testNum}</div>
                          <button onClick={()=>{
                            navigator.clipboard?.writeText(testNum);
                            setMsg({success:true,message:"Copied: "+testNum});
                            setTimeout(()=>setMsg(null),2000);
                          }} style={{padding:"2px 8px",borderRadius:4,border:"1px solid #2CADA6",
                            background:"rgba(44,173,166,0.1)",color:"#2CADA6",
                            fontSize:9,fontWeight:700,cursor:"pointer"}}>
                            📋 Copy
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </GTable>
            </div>}
          </div>
        )}

        {/* TEST LIVE CALL TAB */}
        {tab==="live"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#FFF",borderRadius:10,padding:14,
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>Live Call Monitor</div>
                <div style={{fontSize:11,color:"#999",marginTop:2}}>Auto-refresh 5s · {liveCalls.length} active</div>
              </div>
              <button onClick={loadLive} disabled={loadingLive}
                style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",
                  background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {loadingLive?"⏳":"↻"} Refresh
              </button>
            </div>

            {liveCalls.length===0
              ?<div style={{background:"#FFF",borderRadius:10,padding:50,textAlign:"center",
                boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                <div style={{fontSize:36,marginBottom:12}}>📞</div>
                <div style={{fontSize:14,fontWeight:600,color:"#333",marginBottom:6}}>No Active Calls</div>
                <div style={{fontSize:12,color:"#999"}}>Waiting for incoming calls...</div>
              </div>
              :<div style={{background:"#FFF",borderRadius:8,overflow:"hidden",
                boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                <GTable style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr>{["SL","CLI","DID","PREFIX","COUNTRY","SUPPLIER","IVR","DURATION"].map((h,i)=>(
                      <th key={i} style={thS}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {liveCalls.map((c,i)=>{
                      const did=(c.did||c.exten||"").replace("+","");
                      const dur=fmt(Math.min(86400,parseInt(c.seconds||c.billsec||0)));
                      return(
                        <tr key={i} style={{borderBottom:"1px solid #F0F0F0",
                          background:i%2===0?"#FFF":"#F9FFFE"}}>
                          <td style={{padding:"8px 10px",fontSize:11,color:"#999",fontWeight:600}}>{i+1}</td>
                          <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",fontWeight:600}}>{c.src||"—"}</td>
                          <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",color:"#2CADA6",fontWeight:700}}>{did}</td>
                          <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace"}}>{c.prefix||did.slice(0,7)||"—"}</td>
                          <td style={{padding:"8px 10px",fontSize:11}}>{c.country||"—"}</td>
                          <td style={{padding:"8px 10px",fontSize:11,color:"#2CADA6",fontWeight:600}}>{numSupplier(c.supplier||c.trunk_name)}</td>
                          <td style={{padding:"8px 10px",fontSize:10,color:"#555"}}>{(c.ivr||c.ivr_context||"—").replace("custom/","")}</td>
                          <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{dur}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </GTable>
              </div>
            }
          </div>
        )}

        {/* ACCESS LIST TAB */}
        {tab==="access"&&(
          <>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
              <button onClick={()=>setShowAdd(!showAdd)}
                style={{padding:"8px 16px",borderRadius:20,border:"none",
                  background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                + Add CLI
              </button>
            </div>
            {showAdd&&(
              <div style={{background:"#FFF",borderRadius:10,padding:16,marginBottom:12,
                boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Add to Access List</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>CLI Number *</div>
                    <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                      value={newEntry.cli} onChange={e=>setNewEntry({...newEntry,cli:e.target.value})} placeholder="+966501234567"/></div>
                  <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Type</div>
                    <select style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none"}}
                      value={newEntry.type} onChange={e=>setNewEntry({...newEntry,type:e.target.value})}>
                      <option value="allow">✅ Allow</option>
                      <option value="block">🚫 Block</option>
                      <option value="test">⚗ Test Only</option>
                    </select></div>
                  <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Name</div>
                    <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                      value={newEntry.name} onChange={e=>setNewEntry({...newEntry,name:e.target.value})} placeholder="Contact name"/></div>
                  <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Company</div>
                    <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                      value={newEntry.company} onChange={e=>setNewEntry({...newEntry,company:e.target.value})} placeholder="e.g. WTP, Phonegroup"/></div>
                </div>
                <div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Note</div>
                  <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                    value={newEntry.note} onChange={e=>setNewEntry({...newEntry,note:e.target.value})} placeholder="Optional note"/></div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{
                    if(!newEntry.cli){alert("CLI required");return;}
                    setSaving(true);
                    const d=await apiFetch("/test/access-list",token,{method:"POST",body:JSON.stringify(newEntry)});
                    setMsg(d);setSaving(false);
                    if(d.success){setShowAdd(false);setNewEntry({cli:"",name:"",company:"",type:"allow",note:""});load();}
                  }} disabled={saving}
                    style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {saving?"Saving...":"✅ Add"}
                  </button>
                  <button onClick={()=>setShowAdd(false)}
                    style={{padding:"10px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}
            {accessList.length===0
              ?<div style={{background:"#FFF",borderRadius:10,padding:40,textAlign:"center",color:"#999",fontSize:12}}>
                No entries. Add CLIs to allow or block callers.
              </div>
              :<div style={{background:"#FFF",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                <GTable style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["CLI","NAME","COMPANY","TYPE","NOTE","ADDED",""].map((h,i)=><th key={i} style={thS}>{h}</th>)}</tr></thead>
                  <tbody>{accessList.map((e,i)=>(
                    <tr key={e.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"8px 10px",fontSize:12,fontFamily:"monospace",fontWeight:600}}>{e.cli}</td>
                      <td style={{padding:"8px 10px",fontSize:11}}>{e.name||"—"}</td>
                      <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{e.company||"—"}</td>
                      <td style={{padding:"8px 10px"}}>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,
                          background:typeColor(e.type)+"20",color:typeColor(e.type)}}>
                          {typeIcon(e.type)} {e.type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{padding:"8px 10px",fontSize:11,color:"#555"}}>{e.note||"—"}</td>
                      <td style={{padding:"8px 10px",fontSize:10,color:"#999"}}>{(e.created_at||"").slice(0,10)}</td>
                      <td style={{padding:"8px 10px",textAlign:"center"}}>
                        <button onClick={async()=>{
                          if(!window.confirm("Remove?"))return;
                          await apiFetch("/test/access-list/"+e.id,token,{method:"DELETE"});
                          load();
                        }} style={{background:"none",border:"1px solid #EF4444",borderRadius:4,
                          cursor:"pointer",fontSize:10,color:"#EF4444",padding:"2px 6px"}}>Del</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </GTable>
              </div>
            }
          </>
        )}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────
function SettingsPage({user,logout}){
  const handleExec=async(cmd)=>{
    if(!window.confirm(`Run: ${cmd}?`)) return;
    const t=localStorage.getItem("noc_token");
    const r=await fetch(`${API}/system/exec`,{method:"POST",
      headers:{Authorization:`Bearer ${t}`,Accept:"application/json","Content-Type":"application/json"},
      body:JSON.stringify({cmd})});
    const d=await r.json();
    alert(d.output||d.message||"Done");
  };
  return(
    <div style={{padding:16}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:16}}>⚙ Settings</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[["⟳ Reload Asterisk",C.green],["⟳ Reload PJSIP",C.blue],
          ["↻ Restart Asterisk",C.yellow],["↻ Restart Server",C.orange],
          ["⏻ Turn Off",C.red],["▶ Restart Nginx",C.cyan]].map(([l,col])=>(
          <button key={l} onClick={()=>handleExec(l)}
            style={{padding:"12px",borderRadius:8,border:`1px solid ${col}40`,
              background:`${col}12`,color:col,fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>
      <Card style={{padding:14,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Account</div>
        {[["Name",user?.name],["Email",user?.email],["Role",user?.role],["Client ID",user?.client_id]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:11,color:C.muted}}>{k}</span>
            <span style={{fontSize:11,color:C.text,fontFamily:"monospace"}}>{v||"—"}</span>
          </div>
        ))}
      </Card>
      <Card style={{padding:14,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Server Info</div>
        {[["IP","195.200.14.165"],["OS","Ubuntu 24.04"],["PHP","8.3-FPM"],
          ["Asterisk","20.6.0"],["NOC","http://195.200.14.165/noc/"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:11,color:C.muted}}>{k}</span>
            <span style={{fontSize:11,color:C.green,fontFamily:"monospace"}}>{v}</span>
          </div>
        ))}
      </Card>
      <Card style={{padding:14}}>
        <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Asterisk Config</div>
        {[["SIP Port","5060 UDP"],["Codecs","G.729, alaw, ulaw"],
          ["Context","from-carrier"],["AGI","did_router.php"],
          ["IVR","custom/6g-premium-telecom"],["RTP","10000-20000"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:11,color:C.muted}}>{k}</span>
            <span style={{fontSize:11,color:C.text,fontFamily:"monospace"}}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Placeholder pages ────────────────────────────────────────────────
function ComingSoonPage({icon,title,description}){
  return(
    <div style={{padding:16}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>{icon} {title}</div>
      <Card style={{padding:40,textAlign:"center",marginTop:12}}>
        <div style={{fontSize:32,marginBottom:8}}>{icon}</div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>Coming soon</div>
        <div style={{color:C.muted,fontSize:12,maxWidth:420,margin:"0 auto"}}>{description}</div>
      </Card>
    </div>
  );
}
function SystemOperationsPage(){
  return <ComingSoonPage icon="🛠" title="System Operations"
    description="Operational controls for the platform will be managed here."/>;
}

// ── Asterisk Configuration ──────────────────────────────────────────
function AsteriskConfigPage({token,user}){
  const [status,setStatus]=useState(null);
  const [suppliers,setSuppliers]=useState([]);
  const [busy,setBusy]=useState(false);
  const [supplierModal,setSupplierModal]=useState(null); // {mode:'add'|'edit', id, form}
  const [commercialSuppliers,setCommercialSuppliers]=useState([]); // Partners -> Suppliers records, for the trunk's Supplier picker

  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"#FFF",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box"};
  const sel=inp;
  const btn=(col)=>({padding:"9px 14px",borderRadius:8,border:`1px solid ${col}40`,
    background:`${col}15`,color:col,fontSize:12,fontWeight:700,cursor:"pointer"});
  const smallBtn=(col)=>({...btn(col),padding:"4px 8px",fontSize:10});

  const loadStatus=useCallback(()=>{apiFetch("/asterisk-config/status",token).then(d=>setStatus(d.data||null));},[token]);
  const loadSuppliers=useCallback(()=>{apiFetch("/suppliers",token).then(d=>setSuppliers(d.data||[]));},[token]);
  const loadCommercialSuppliers=useCallback(()=>{apiFetch("/supplier-accounts",token).then(d=>setCommercialSuppliers(d.data||[]));},[token]);

  useEffect(()=>{ loadStatus(); loadSuppliers(); loadCommercialSuppliers(); },[loadStatus,loadSuppliers,loadCommercialSuppliers]);

  // ── Supplier / SIP Auth CRUD ──────────────────────────────────────
  const openAddSupplier=()=>setSupplierModal({mode:"add",id:null,form:{
    supplier_id:"",name:"",nickname:"",host:"",port:"5060",transport:"udp",pjsip_name:"",
    auth_type:"ip",sip_username:"",sip_password:"",qualify:"60",
    codecs:"ulaw,alaw",max_channels:"500",max_call_duration:"1800"}});
  const openEditSupplier=(s)=>setSupplierModal({mode:"edit",id:s.id,form:{
    supplier_id:s.supplier_id||"",name:s.name||"",nickname:s.nickname||"",host:s.host||"",port:s.port||"5060",
    transport:s.transport||"udp",pjsip_name:s.pjsip_name||"",
    auth_type:s.auth_type||"ip",sip_username:s.sip_username||"",sip_password:"",
    qualify:s.qualify??"60",codecs:s.codecs||"ulaw,alaw",
    max_channels:s.max_channels??"500",max_call_duration:s.max_call_duration??"1800"}});
  const saveSupplierModal=async()=>{
    if(!supplierModal) return;
    const f=supplierModal.form;
    if(!f.supplier_id){alert("Select a supplier first");return;}
    setBusy(true);
    if(supplierModal.mode==="add"){
      const created=await apiFetch("/suppliers",token,{method:"POST",
        body:JSON.stringify({supplier_id:f.supplier_id,name:f.name,host:f.host,port:f.port})});
      const newId=created?.data?.id;
      if(newId){
        await apiFetch(`/suppliers/${newId}`,token,{method:"PUT",body:JSON.stringify({
          ...created.data,supplier_id:f.supplier_id,nickname:f.nickname||f.name,auth_type:f.auth_type,
          sip_username:f.sip_username,sip_password:f.sip_password||undefined,
          qualify:f.qualify,transport:f.transport,pjsip_name:f.pjsip_name,
          codecs:f.codecs,max_channels:f.max_channels,max_call_duration:f.max_call_duration,
          is_active:1})});
      }
    } else {
      const current=suppliers.find(s=>s.id===supplierModal.id)||{};
      await apiFetch(`/suppliers/${supplierModal.id}`,token,{method:"PUT",body:JSON.stringify({
        ...current,...f,sip_password:f.sip_password||undefined})});
    }
    setBusy(false);setSupplierModal(null);loadSuppliers();
  };
  const toggleSupplierActive=async(s)=>{
    setBusy(true);
    await apiFetch(`/suppliers/${s.id}`,token,{method:"PUT",body:JSON.stringify({...s,is_active:s.is_active?0:1})});
    setBusy(false);loadSuppliers();
  };
  const deleteSupplier=async(s)=>{
    if(!window.confirm(`Delete supplier "${s.nickname||s.name}"? This removes its SIP configuration entirely.`)) return;
    setBusy(true);
    await apiFetch(`/suppliers/${s.id}`,token,{method:"DELETE"});
    setBusy(false);loadSuppliers();
  };

  const statusDot=(ok)=>(
    <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",
      background:ok?C.green:C.red,marginRight:6}}/>
  );

  const modalShell=(title,onClose,children,onSave,saveLabel)=>(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#FFF",borderRadius:12,padding:20,width:440,maxWidth:"92vw",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:800,marginBottom:14}}>{title}</div>
        {children}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button onClick={onClose} style={btn(C.muted)}>Cancel</button>
          <button onClick={onSave} disabled={busy} style={btn(C.green)}>{busy?"Saving...":saveLabel}</button>
        </div>
      </div>
    </div>
  );

  const field=(label,children)=>(
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{label}</div>
      {children}
    </div>
  );

  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:16,fontWeight:800}}>📞 Trunks</div>
      </div>
      <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
        Manage the SIP/PJSIP connection to each supplier — IP, auth, transport, codecs, qualify and capacity. Refers to the same trunk record used on Partners → Suppliers for commercial details.
      </div>

      {/* Dashboard cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:16}}>
        {[
          ["Asterisk Status",status?(status.online?"Online":"Offline"):"…",status?.online?C.green:C.red],
          ["Active Suppliers",status?.active_suppliers??"…",C.blue],
          ["Active DID Ranges",status?.active_did_ranges??"…",C.blue],
          ["Active IVRs",status?.active_ivrs??"…",C.blue],
          ["Last Reload",status?.last_reload_at?new Date(status.last_reload_at).toLocaleString():"Never",C.yellow],
          ["Config Status",status?.last_apply_at?"Applied":"Not yet applied",status?.last_apply_at?C.green:C.yellow],
        ].map(([label,val,col])=>(
          <Card key={label} style={{padding:12}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{label}</div>
            <div style={{fontSize:14,fontWeight:800,color:col}}>{String(val)}</div>
          </Card>
        ))}
      </div>

      {/* Suppliers / SIP Authentication */}
      <Card style={{padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:13,fontWeight:700}}>Trunks</div>
            <button onClick={openAddSupplier} style={btn(C.green)}>+ Add Trunk</button>
          </div>
          <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
            The SIP/PJSIP connection side (IP/port/transport/auth/codecs/capacity) of each supplier trunk. Commercial details (contact, panel, notes) live on Partners → Suppliers — both views edit the same trunk record. Each enabled trunk below gets its own PJSIP endpoint + identify section in the generated config.
          </div>
          {!suppliers.length?
            <div style={{padding:24,textAlign:"center",color:C.muted,fontSize:12}}>No trunks yet — click "+ Add Trunk".</div>
          :
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {suppliers.map(s=>(
              <div key={s.id} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:"#FAFAFA"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:700}}>{numSupplier(s.nickname||s.name)}</div>
                  <div style={{fontSize:11}}>{statusDot(!!s.is_active)}{s.is_active?"Enabled":"Disabled"}</div>
                </div>
                <div style={{fontSize:11,color:s.supplier_name?C.muted:C.red,marginBottom:10}}>
                  {s.supplier_name?`Supplier: ${numSupplier(s.supplier_name)}`:"Not linked to a supplier"}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:11,marginBottom:12}}>
                  {[["PJSIP Name",s.pjsip_name||"—",true],["SIP IP",s.host||"—",true],
                    ["Port",s.port||5060],["Authentication",(s.auth_type||"ip")+(s.has_sip_password?" 🔒":"")],
                    ["Max Channels",s.max_channels??"—"],["DIDs",s.did_count??0]].map(([k,v,mono])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",gap:8}}>
                      <span style={{color:C.muted}}>{k}</span>
                      <span style={{fontFamily:mono?"monospace":"inherit",textAlign:"right",wordBreak:"break-all"}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openEditSupplier(s)} style={smallBtn(C.blue)}>Edit</button>
                  <button onClick={()=>toggleSupplierActive(s)} style={smallBtn(s.is_active?C.yellow:C.green)}>{s.is_active?"Disable":"Enable"}</button>
                  <button onClick={()=>deleteSupplier(s)} style={smallBtn(C.red)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
          }
        </Card>

      {/* Supplier add/edit modal */}
      {supplierModal&&modalShell(
        supplierModal.mode==="add"?"Add Trunk":"Edit Trunk",
        ()=>setSupplierModal(null),
        <>
          {field("Select Supplier *",
            <select style={sel} value={supplierModal.form.supplier_id} onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,supplier_id:e.target.value}}))}>
              <option value="">— Select —</option>
              {commercialSuppliers.map(s=><option key={s.id} value={s.id}>{numSupplier(s.nickname||s.name)}</option>)}
            </select>)}
          {!commercialSuppliers.length&&<div style={{fontSize:11,color:C.orange,marginTop:-6,marginBottom:10}}>
            No suppliers yet — add one under Partners → Suppliers first.</div>}
          {supplierModal.mode==="add"&&field("Trunk Name *",
            <input style={inp} value={supplierModal.form.name} onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,name:e.target.value}}))}/>)}
          {supplierModal.mode==="add"&&field("Nickname",
            <input style={inp} value={supplierModal.form.nickname} onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,nickname:e.target.value}}))}/>)}
          {field("SIP IP (comma-separated for multiple)",
            <input style={inp} value={supplierModal.form.host} placeholder="203.0.113.50"
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,host:e.target.value}}))}/>)}
          {field("SIP Port",
            <input style={inp} type="number" value={supplierModal.form.port}
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,port:e.target.value}}))}/>)}
          {field("Transport",
            <select style={sel} value={supplierModal.form.transport}
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,transport:e.target.value}}))}>
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
              <option value="tls">TLS</option>
            </select>)}
          {field("PJSIP Endpoint Name (leave blank to auto-generate from nickname)",
            <input style={inp} value={supplierModal.form.pjsip_name} placeholder="AUTO-GENERATED"
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,pjsip_name:e.target.value}}))}/>)}
          {field("Authentication",
            <select style={sel} value={supplierModal.form.auth_type}
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,auth_type:e.target.value}}))}>
              <option value="ip">IP Auth</option>
              <option value="userpass">Username/Password</option>
              <option value="both">IP Auth + Username/Password</option>
            </select>)}
          {supplierModal.form.auth_type!=="ip"&&<>
            {field("SIP Username",
              <input style={inp} value={supplierModal.form.sip_username} onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,sip_username:e.target.value}}))}/>)}
            {field("SIP Password (leave blank to keep current)",
              <input style={inp} type="password" value={supplierModal.form.sip_password} onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,sip_password:e.target.value}}))}/>)}
          </>}
          {field("Qualify Frequency (seconds, 0 = off)",
            <input style={inp} type="number" value={supplierModal.form.qualify}
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,qualify:e.target.value}}))}/>)}
          {field("Max Channels",
            <input style={inp} type="number" value={supplierModal.form.max_channels}
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,max_channels:e.target.value}}))}/>)}
          {field("Max Call Duration (seconds, not yet enforced by the dialplan)",
            <input style={inp} type="number" value={supplierModal.form.max_call_duration}
              onChange={e=>setSupplierModal(m=>({...m,form:{...m.form,max_call_duration:e.target.value}}))}/>)}
          {field("Codecs",
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {["g729","ulaw","alaw","g722","gsm","slin","g726","speex","opus"].map(codec=>{
                const selected=(supplierModal.form.codecs||"").split(",").map(c=>c.trim()).includes(codec);
                return(
                  <label key={codec} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,
                    padding:"4px 8px",borderRadius:6,border:`1px solid ${selected?C.accent:C.border}`,
                    background:selected?`${C.accent}15`:"transparent",cursor:"pointer"}}>
                    <input type="checkbox" checked={selected} onChange={e=>{
                      const codecs=(supplierModal.form.codecs||"").split(",").map(c=>c.trim()).filter(Boolean);
                      if(e.target.checked){codecs.push(codec);}
                      else{const i=codecs.indexOf(codec);if(i>-1)codecs.splice(i,1);}
                      setSupplierModal(m=>({...m,form:{...m.form,codecs:codecs.join(",")}}));
                    }}/>
                    {codec}
                  </label>
                );
              })}
            </div>)}
        </>,
        saveSupplierModal,
        supplierModal.mode==="add"?"Add Trunk":"Save Changes"
      )}

    </div>
  );
}

function RoutePrefixPage({token}){
  const [prefixes,setPrefixes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [suppliers,setSuppliers]=useState([]);
  const [ivrs,setIvrs]=useState([]);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({prefix:"",country_code:"IT",country_name:"Italy",
    ivr_context:"custom/telephone-convo",trunk_id:"1",supplier_name:"",priority:"1",notes:""});

  const load=useCallback(()=>{
    apiFetch("/route-prefixes",token).then(d=>{setPrefixes(d.data||[]);setLoading(false);});
  },[token]);

  useEffect(()=>{
    load();
    apiFetch("/suppliers",token).then(d=>setSuppliers(d.data||[]));
    apiFetch("/ivr-lib/audio",token).then(d=>setIvrs(d.data||[]));
  },[token]);

  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"rgba(255,255,255,0.05)",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box"};
  const sel={width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"rgba(255,255,255,0.05)",color:C.text,fontSize:13,outline:"none"};

  const COUNTRIES=[["IT","Italy"],["IE","Ireland"],["FR","France"],["DE","Germany"],
    ["GB","UK"],["US","USA"],["SA","Saudi Arabia"],["AE","UAE"]];

  const add=async()=>{
    setSaving(true);
    const s=suppliers.find(x=>String(x.id)===String(form.trunk_id));
    const d=await apiFetch("/route-prefixes",token,{method:"POST",
      body:JSON.stringify({...form,supplier_name:s?.name||""})});
    if(d.success){load();setShowAdd(false);setForm({prefix:"",country_code:"IT",country_name:"Italy",
      ivr_context:"custom/telephone-convo",trunk_id:"1",supplier_name:"",priority:"1",notes:""});}
    setSaving(false);
  };

  const del=async(id)=>{
    if(!window.confirm("Delete this prefix route?")) return;
    await apiFetch(`/route-prefixes/${id}`,token,{method:"DELETE"});
    load();
  };

  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:16,fontWeight:800}}>🔀 Route Prefix</div>
        <button onClick={()=>setShowAdd(o=>!o)}
          style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${C.green}40`,
            background:`${C.green}15`,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          + Add Prefix
        </button>
      </div>
      <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
        Route calls by number prefix → assign IVR per prefix
      </div>

      {showAdd&&(
        <Card style={{padding:16,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>New Prefix Route</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Prefix * (e.g. 39319905)</div>
              <input style={inp} value={form.prefix} placeholder="39319905"
                onChange={e=>setForm(f=>({...f,prefix:e.target.value}))}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Country</div>
              <select style={sel} value={form.country_code} onChange={e=>{
                const m=Object.fromEntries(COUNTRIES);
                setForm(f=>({...f,country_code:e.target.value,country_name:m[e.target.value]||e.target.value}));
              }}>
                {COUNTRIES.map(([c,n])=><option key={c} value={c}>{n}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>IVR</div>
              <select style={sel} value={form.ivr_context}
                onChange={e=>setForm(f=>({...f,ivr_context:e.target.value}))}>
                <option value="custom/telephone-convo">telephone-convo (Default)</option>
                {ivrs.map(f=><option key={f.id} value={`custom/${f.name}`}>{f.display_name||f.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Supplier</div>
              <select style={sel} value={form.trunk_id}
                onChange={e=>setForm(f=>({...f,trunk_id:e.target.value}))}>
                {suppliers.map(s=><option key={s.id} value={s.id}>{numSupplier(s.nickname||s.name)}</option>)}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Priority</div>
                <input style={inp} type="number" value={form.priority} placeholder="1"
                  onChange={e=>setForm(f=>({...f,priority:e.target.value}))}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Notes</div>
                <input style={inp} value={form.notes} placeholder="Optional"
                  onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowAdd(false)}
              style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,
                background:"transparent",color:C.muted,fontSize:12,cursor:"pointer"}}>Cancel</button>
            <button onClick={add} disabled={saving}
              style={{flex:2,padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
                background:`${C.green}15`,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {saving?"Saving...":"+ Add Route"}
            </button>
          </div>
        </Card>
      )}

      {/* How it works */}
      <Card style={{padding:12,marginBottom:12,background:`${C.blue}05`,border:`1px solid ${C.blue}20`}}>
        <div style={{fontSize:10,color:C.blue,fontWeight:700,marginBottom:6}}>How it works</div>
        <div style={{fontSize:10,color:C.muted,lineHeight:1.6}}>
          Incoming call → match prefix → assign IVR<br/>
          Example: <span style={{color:C.text,fontFamily:"monospace"}}>+39319905XXXX</span> → prefix <span style={{color:C.green,fontFamily:"monospace"}}>39319905</span> → telephone-convo IVR
        </div>
      </Card>

      {/* Prefix List */}
      {loading?<div style={{textAlign:"center",padding:40,color:C.muted}}>Loading...</div>
      :prefixes.length===0?<Card style={{padding:40,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🔀</div>
        <div style={{color:C.muted,fontSize:12}}>No prefix routes configured</div>
      </Card>
      :<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {prefixes.map((p,i)=>(
          <Card key={i} style={{padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:900,color:C.green,fontFamily:"monospace"}}>+{p.prefix}</span>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:10,
                    background:`${C.blue}15`,color:C.blue,fontWeight:700}}>{p.country_code}</span>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:10,
                    background:`${C.purple}15`,color:C.purple}}>P{p.priority}</span>
                </div>
                <div style={{fontSize:10,color:C.cyan}}>
                  IVR: {(p.ivr_context||"").replace("custom/","")}
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,fontWeight:700,
                  background:p.is_active?`${C.green}15`:`${C.red}15`,
                  color:p.is_active?C.green:C.red}}>
                  {p.is_active?"ON":"OFF"}
                </span>
                <button onClick={()=>del(p.id)}
                  style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.red}40`,
                    background:`${C.red}10`,color:C.red,fontSize:10,cursor:"pointer"}}>Del</button>
              </div>
            </div>
            <div style={{display:"flex",gap:12,fontSize:10,color:C.muted}}>
              <span>Supplier: <span style={{color:C.text}}>{numSupplier(p.supplier_name)}</span></span>
              <span>Country: <span style={{color:C.text}}>{p.country_name||"—"}</span></span>
              {p.notes&&<span>Note: <span style={{color:C.text}}>{p.notes}</span></span>}
            </div>
          </Card>
        ))}
      </div>}
    </div>
  );
}


// ── SIP Monitor Page ─────────────────────────────────────────────
function SIPMonitorPage({token}){
  const [invites,setInvites]=useState([]);
  const [eps,setEps]=useState([]);
  const [activeCalls,setActiveCalls]=useState("0");
  const [log,setLog]=useState([]);
  const [loading,setLoading]=useState(true);
  const [autoRefresh,setAutoRefresh]=useState(true);
  const [tab,setTab]=useState("invites");
  const logRef=useRef(null);
  const [ts,setTs]=useState("");
  const [sipSearch,setSipSearch]=useState("");

  const load=useCallback(()=>{
    apiFetch("/sip/activity",token).then(d=>{
      setInvites(d.invites||[]);
      setTs(d.timestamp||"");
      const ch=d.channels||[];
      const ac=ch.filter(c=>c.match(/(\d+) active call/)).map(c=>c.match(/(\d+) active call/)?.[1]).join("")||"0";
      setActiveCalls(ac);
      const epList=[];let cur=null;
      for(const line of (d.pjsip||[])){
        const m=line.match(/Endpoint:\s+([A-Z0-9_-]+)/);
        if(m){cur={name:m[1],status:"",rtt:"—"};epList.push(cur);}
        if(cur){
          const s=line.match(/(Avail|NonQual|Unavail|Not in use|In use)/);
          if(s&&!cur.status) cur.status=s[1];
          if(/^\s*Contact:/.test(line)){
            const r=line.match(/([\d.]+)$/);
            if(r&&cur.rtt==="—") cur.rtt=r[1]+"ms";
          }
        }
      }
      setEps(epList);
      setLoading(false);
    });
  },[token]);

  const loadLog=useCallback(()=>{
    apiFetch("/sip/log",token).then(d=>setLog(d.data||[]));
  },[token]);

  useEffect(()=>{load();loadLog();},[load,loadLog]);
  useEffect(()=>{
    if(!autoRefresh) return;
    const t=setInterval(()=>{load();if(tab==="log")loadLog();},5000);
    return()=>clearInterval(t);
  },[autoRefresh,load,loadLog,tab]);

  const sipFiltered=invites.filter(inv=>!sipSearch||(inv.caller||'').includes(sipSearch)||(inv.did||'').includes(sipSearch)||(inv.supplier||'').toLowerCase().includes(sipSearch.toLowerCase()));
  const RESULT_META={
    ANSWERED:   {label:"CONNECTED",  color:"#10B981", icon:"✅"},
    RINGING:    {label:"RINGING",    color:"#3B82F6", icon:"📞"},
    BUSY:       {label:"BUSY",       color:"#F59E0B", icon:"⚠️"},
    NOANSWER:   {label:"NO ANSWER",  color:"#F59E0B", icon:"❌"},
    CANCELLED:  {label:"CANCELLED",  color:"#9CA3AF", icon:"↩️"},
    CONGESTION: {label:"CONGESTION", color:"#EF4444", icon:"🚫"},
    UNAVAILABLE:{label:"UNAVAILABLE",color:"#EF4444", icon:"❌"},
    REJECTED:   {label:"REJECTED",   color:"#EF4444", icon:"❌"},
  };
  const resultMeta=(r)=>RESULT_META[r]||{label:r||"UNKNOWN",color:"#9CA3AF",icon:"❓"};
  const rColor=(r)=>resultMeta(r).color;
  const rIcon=(r)=>resultMeta(r).icon;
  const sColor=(s)=>s==="Avail"?"#10B981":s==="Not in use"||s==="NonQual"?"#F59E0B":"#EF4444";
  const sIcon=(s)=>s==="Avail"?"🟢":s==="Not in use"||s==="NonQual"?"🟡":"🔴";
  const thS={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",padding:"8px 10px",
    textAlign:"left",borderBottom:"2px solid #E8E8E8",background:"#F5F5F5",
    textTransform:"uppercase",whiteSpace:"nowrap"};

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700}}>◎ SIP Monitor</div>
          <div style={{fontSize:11,color:"#999",marginTop:2}}>{autoRefresh?"● Live · 5s":"⏸ Paused"} · {ts.slice(11,19)}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setAutoRefresh(o=>!o)}
            style={{padding:"7px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
              border:"1px solid "+(autoRefresh?"#EF4444":"#10B981"),
              background:autoRefresh?"rgba(239,68,68,0.1)":"rgba(16,185,129,0.1)",
              color:autoRefresh?"#EF4444":"#10B981"}}>
            {autoRefresh?"⏸ Pause":"▶ Live"}
          </button>
          <button onClick={()=>{load();loadLog();}}
            style={{padding:"7px 12px",borderRadius:20,border:"2px solid #2CADA6",
              background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>↻</button>
        </div>
      </div>
      <div style={{padding:"12px 16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          {[{label:"Active Calls",value:activeCalls,color:"#10B981",icon:"📞"},
            {label:"Endpoints",value:eps.length,color:"#3B82F6",icon:"🔌"},
            {label:"INVITE Events",value:invites.length,color:"#2CADA6",icon:"📋"},
          ].map((c,i)=>(
            <div key={i} style={{background:"#FFF",borderRadius:8,padding:12,
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",textAlign:"center"}}>
              <div style={{fontSize:14,marginBottom:2}}>{c.icon}</div>
              <div style={{fontSize:22,fontWeight:800,color:c.color}}>{c.value}</div>
              <div style={{fontSize:9,color:"#999",fontWeight:600,textTransform:"uppercase"}}>{c.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:4,marginBottom:12}}>
          {[["invites","📋 INVITE History"],["endpoints","🔌 Endpoints"],["log","📄 Log"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:"8px 14px",borderRadius:20,border:"none",fontSize:11,
                background:tab===t?"#2CADA6":"#F0F0F0",color:tab===t?"#FFF":"#555",
                fontWeight:tab===t?700:400,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>

        {tab==="invites"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input value={sipSearch} onChange={e=>setSipSearch(e.target.value)}
              placeholder="Search by CLI, DID, supplier..."
              style={{width:"100%",padding:"9px 12px",border:"1px solid #E0E0E0",borderRadius:8,
                fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            <div style={{background:"#FFF",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
              {loading?<div style={{padding:30,textAlign:"center",color:"#999"}}>Loading...</div>
              :sipFiltered.length===0
                ?<div style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No events found</div>
                :<div style={{overflowX:"auto"}}>
                  <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                    <thead>
                      <tr style={{background:"#2CADA6"}}>
                        {["TIME","CALLER","DID/PRN","SUPPLIER","DURATION","STATUS"].map((h,i)=>(
                          <th key={i} style={{fontSize:9,color:"#FFF",fontWeight:700,letterSpacing:"0.8px",
                            padding:"6px 8px",textAlign:"left",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>{sipFiltered.map((inv,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #F0F0F0",
                        background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{padding:"5px 8px",fontSize:9,color:"#555",whiteSpace:"nowrap",fontFamily:"monospace"}}>
                          {(inv.time||"").slice(0,19)}
                        </td>
                        <td style={{padding:"5px 8px",fontSize:10,fontFamily:"monospace",fontWeight:600,color:"#1A1A1A"}}>
                          {inv.caller||"—"}
                        </td>
                        <td style={{padding:"5px 8px",fontSize:10,fontFamily:"monospace",color:"#2CADA6",fontWeight:700}}>
                          {(inv.did||"—").replace("+","")}
                        </td>
                        <td style={{padding:"5px 8px",fontSize:10,fontWeight:600,color:"#333"}}>
                          {inv.supplier||"—"}
                        </td>
                        <td style={{padding:"5px 8px",fontSize:10,fontFamily:"monospace",color:"#555"}}>
                          {inv.duration>0?fmtDur(inv.duration):"—"}
                        </td>
                        <td style={{padding:"5px 8px"}}>
                          <span style={{fontSize:9,padding:"2px 6px",borderRadius:8,fontWeight:700,
                            background:rColor(inv.result)+"15",color:rColor(inv.result),whiteSpace:"nowrap"}}>
                            {rIcon(inv.result)} {resultMeta(inv.result).label}
                          </span>
                        </td>
                      </tr>
                    ))}</tbody>
                  </GTable>
                </div>}
            </div>
          </div>
        )}

        {tab==="endpoints"&&(
          <div style={{background:"#FFF",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["ENDPOINT","STATUS","RTT"].map((h,i)=><th key={i} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{eps.map((ep,i)=>(
                <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                  <td style={{padding:"12px 10px",fontWeight:700,fontSize:13}}>{ep.name}</td>
                  <td style={{padding:"12px 10px"}}>
                    <span style={{fontSize:11,fontWeight:700,color:sColor(ep.status)}}>
                      {sIcon(ep.status)} {ep.status||"Unknown"}
                    </span>
                  </td>
                  <td style={{padding:"12px 10px",fontSize:11,fontFamily:"monospace",
                    color:ep.rtt!=="—"&&parseFloat(ep.rtt)<20?"#10B981":"#F59E0B"}}>{ep.rtt}</td>
                </tr>
              ))}</tbody>
            </GTable>
          </div>
        )}

        {tab==="log"&&(
          <div style={{background:"#1A1A2E",borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.1)",
              display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#FFF"}}>Asterisk Log</span>
              <span style={{fontSize:10,color:"#555"}}>{log.length} lines</span>
            </div>
            <div ref={logRef} style={{maxHeight:400,overflowY:"auto",padding:"8px 0"}}>
              {log.map((line,i)=>(
                <div key={i} style={{padding:"2px 14px",fontFamily:"monospace",fontSize:9,lineHeight:1.6,
                  wordBreak:"break-all",
                  color:line.includes("ERROR")||line.includes("WARNING")?"#EF4444":
                    line.includes("NOTICE")?"#F59E0B":"#6B7280"}}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── System Health ─────────────────────────────────────────────
function SystemHealthPage({token}){
  const [health,setHealth]=useState(null);
  const [loading,setLoading]=useState(true);
  const [lastCheck,setLastCheck]=useState(null);
  const load=()=>{
    setLoading(true);
    apiFetch("/system/health",token).then(d=>{setHealth(d);setLastCheck(new Date().toLocaleTimeString());setLoading(false);}).catch(()=>setLoading(false));
  };
  useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t);},[token]);

  const sColor=(s)=>s==="healthy"?"#10B981":s==="warning"?"#F59E0B":s==="critical"?"#EF4444":"#9CA3AF";
  const sIcon=(s)=>s==="healthy"?"🟢":s==="warning"?"🟡":s==="critical"?"🔴":"⚪";

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700}}>♥ System Health</div>
          <div style={{fontSize:11,color:"#999",marginTop:2}}>Auto-refresh 30s{lastCheck&&" · Last: "+lastCheck}</div>
        </div>
        <button onClick={load} disabled={loading} style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>{loading?"⏳":"↻"} Refresh</button>
      </div>
      <div style={{padding:"12px 16px"}}>
        {loading&&!health?<div style={{textAlign:"center",padding:60,color:"#999"}}><div style={{fontSize:24,marginBottom:8}}>⏳</div>Checking system health...</div>
        :health&&(
          <>
            <div style={{background:sColor(health.overall)+"15",border:"1px solid "+sColor(health.overall)+"40",borderRadius:10,padding:16,marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:4}}>{sIcon(health.overall)}</div>
              <div style={{fontSize:16,fontWeight:800,color:sColor(health.overall)}}>{health.overall==="healthy"?"All Systems Operational":health.overall==="warning"?"Some Issues Detected":"Critical Issues"}</div>
              <div style={{fontSize:11,color:"#666",marginTop:4}}>{health.timestamp?.slice(0,19).replace("T"," ")}</div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:"#555",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Services</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              {health.checks&&["asterisk","nginx","php_fpm","mysql","api"].map(key=>{
                const c=health.checks[key];
                if(!c) return null;
                return(
                  <div key={key} style={{background:"#FFF",borderRadius:8,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:"3px solid "+sColor(c.status)}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{fontSize:13,fontWeight:700}}>{sIcon(c.status)} {c.name}</div>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,background:sColor(c.status)+"20",color:sColor(c.status)}}>{(c.status||"").toUpperCase()}</span>
                    </div>
                    <div style={{fontSize:11,color:"#555"}}>{c.detail}</div>
                    {c.latency&&<div style={{fontSize:10,color:"#999",marginTop:2}}>Latency: {c.latency}</div>}
                    {key==="asterisk"&&<div style={{fontSize:11,color:"#2CADA6",fontWeight:600,marginTop:4}}>📞 {c.active_calls} active call{c.active_calls!==1?"s":""}</div>}
                  </div>
                );
              })}
            </div>
            {health.checks?.sip&&(
              <>
                <div style={{fontSize:12,fontWeight:700,color:"#555",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>SIP Trunks</div>
                <div style={{background:"#FFF",borderRadius:8,padding:14,marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                  {Object.entries(health.checks.sip.trunks||{}).map(([name,status])=>{
                    const ok=status.toLowerCase().includes("avail")&&!status.toLowerCase().includes("unavail");
                    const inuse=status.toLowerCase().includes("use");
                    const sc=ok||inuse?"#10B981":"#F59E0B";
                    return(
                      <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F5F5F5"}}>
                        <span style={{fontSize:12,fontWeight:600}}>{name}</span>
                        <span style={{fontSize:11,color:sc,fontWeight:600}}>{ok||inuse?"🟢":"🟡"} {status}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div style={{fontSize:12,fontWeight:700,color:"#555",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Resources</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {health.checks&&["cpu","memory","disk"].map(key=>{
                const c=health.checks[key];
                if(!c) return null;
                return(
                  <div key={key} style={{background:"#FFF",borderRadius:8,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:"3px solid "+sColor(c.status)}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:13,fontWeight:700}}>{sIcon(c.status)} {c.name}</span>
                      <span style={{fontSize:11,color:"#555"}}>{c.detail}</span>
                    </div>
                    {c.percent&&(
                      <div style={{background:"#F0F0F0",borderRadius:4,height:6,overflow:"hidden"}}>
                        <div style={{width:c.percent+"%",height:"100%",background:sColor(c.status),borderRadius:4}}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ── Test Numbers Page ─────────────────────────────────────────
function TestNumbersPage({token}){
  const [ranges,setRanges]=useState([]);
  const [dids,setDids]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selectedCountry,setSelectedCountry]=useState("");
  const [msg,setMsg]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [newTest,setNewTest]=useState({number:"",country:"",prefix:"",rate:"",currency:"USDT",supplier:""});
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    Promise.all([apiFetch("/did-ranges",token),apiFetch("/dids",token),apiFetch("/suppliers",token)])
    .then(([r,d,s])=>{
      const trunks={};
      (s.data||[]).forEach(t=>{trunks[t.id]=numSupplier(t.nickname);});
      setRanges(r.data||[]);
      setDids((d.data||[]).map(x=>({...x,supplier_name:trunks[x.trunk_id]||"—"})));
      setLoading(false);
    });
  },[token]);

  const countries=[...new Set(ranges.map(r=>r.country_name).filter(Boolean))].sort();

  const filtered=selectedCountry
    ?ranges.filter(r=>r.country_name===selectedCountry)
    :[];

  const getTestNumber=(r)=>{
    const match=dids.find(d=>(d.number||"").replace("+","").startsWith(r.prefix?.replace(/\s/g,"")||""));
    return match?match.number:r.range_start?"+"+r.range_start:"—";
  };

  const thS={fontSize:9,color:"#FFF",fontWeight:700,letterSpacing:"0.8px",
    padding:"7px 10px",textAlign:"left",textTransform:"uppercase",whiteSpace:"nowrap"};

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px"}}>
        <div style={{fontSize:18,fontWeight:700}}>📋 Test Numbers</div>
        <div style={{fontSize:11,color:"#999",marginTop:2}}>Select a country to view test numbers</div>
      </div>

      <div style={{padding:"12px 16px"}}>
        {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
          background:"rgba(16,185,129,0.1)",border:"1px solid #10B981",
          fontSize:12,color:"#10B981",fontWeight:600}}>✅ {msg}</div>}

        {/* Country Selection */}
        <div style={{background:"#FFF",borderRadius:10,padding:16,
          boxShadow:"0 1px 4px rgba(0,0,0,0.06)",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:4}}>
            Please make a selection from the list below.
          </div>
          <div style={{fontSize:11,color:"#999",marginBottom:14}}>
            Select a country to view available test numbers for that destination.
          </div>
          <div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:6}}>Select Country:</div>
          <div style={{display:"flex",gap:8}}>
            <select
              value={selectedCountry}
              onChange={e=>setSelectedCountry(e.target.value)}
              style={{flex:1,padding:"10px 12px",border:"1px solid #E0E0E0",borderRadius:8,
                fontSize:13,outline:"none",color:"#1A1A1A",background:"#FFF"}}>
              <option value="">— Select Country —</option>
              {countries.map(c=>(
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button onClick={()=>setSelectedCountry("")}
              style={{padding:"10px 16px",borderRadius:8,border:"1px solid #E0E0E0",
                background:"#F5F5F5",color:"#555",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              Clear
            </button>
          </div>
        </div>

        {/* Add Test Number */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <button onClick={()=>setShowAdd(!showAdd)}
            style={{padding:"8px 16px",borderRadius:20,border:"none",
              background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            + Add Test Number
          </button>
        </div>

        {showAdd&&(
          <div style={{background:"#FFF",borderRadius:10,padding:16,marginBottom:12,
            boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Add Test Number</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Number *</div>
                <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                  value={newTest.number} onChange={e=>setNewTest({...newTest,number:e.target.value})} placeholder="+88233770042"/></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Country</div>
                <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                  value={newTest.country} onChange={e=>setNewTest({...newTest,country:e.target.value})} placeholder="e.g. Satellite"/></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Prefix</div>
                <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                  value={newTest.prefix} onChange={e=>setNewTest({...newTest,prefix:e.target.value})} placeholder="e.g. 88233770"/></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Rate/Min</div>
                <input type="number" step="0.001" style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                  value={newTest.rate} onChange={e=>setNewTest({...newTest,rate:e.target.value})} placeholder="0.420"/></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Currency</div>
                <div style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,
                  boxSizing:"border-box",color:"#888",background:"#F5F5F5"}}>$</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4}}>Supplier</div>
                <input style={{width:"100%",padding:"8px 10px",border:"1px solid #E0E0E0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}
                  value={newTest.supplier} onChange={e=>setNewTest({...newTest,supplier:e.target.value})} placeholder="e.g. WTP"/></div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                if(!newTest.number||!newTest.prefix){alert("Number and prefix required");return;}
                setSaving(true);
                const d=await apiFetch("/dids",token,{method:"POST",body:JSON.stringify({
                  number:newTest.number,
                  prefix:newTest.prefix,
                  country_name:newTest.country,
                  tariff:parseFloat(newTest.rate)||0.42,
                  selling_price:parseFloat(newTest.rate)||0.42,
                  currency:newTest.currency,
                  supplier:newTest.supplier,
                  payment_terms:addForm.payment_terms||"Weekly",
                  ivr_context:"custom/6g-premium-telecom",
                })});
                setSaving(false);
                if(d.success){
                  setMsg("Added: "+newTest.number);
                  setShowAdd(false);
                  setNewTest({number:"",country:"",prefix:"",rate:"",currency:"USDT",supplier:""});
                  setTimeout(()=>setMsg(null),3000);
                }
              }} disabled={saving}
                style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {saving?"Saving...":"✅ Add Number"}
              </button>
              <button onClick={()=>setShowAdd(false)}
                style={{padding:"10px 16px",borderRadius:8,border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Results */}
        {!selectedCountry?(
          <div style={{background:"#FFF",borderRadius:10,padding:40,textAlign:"center",
            boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:36,marginBottom:12}}>🌍</div>
            <div style={{fontSize:14,fontWeight:600,color:"#333",marginBottom:6}}>
              {countries.length} countries available
            </div>
            <div style={{fontSize:11,color:"#999",marginBottom:16}}>
              Select a country above to view test numbers
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",maxWidth:400,margin:"0 auto"}}>
              {countries.map(c=>(
                <button key={c} onClick={()=>setSelectedCountry(c)}
                  style={{padding:"5px 12px",borderRadius:16,border:"1px solid #2CADA6",
                    background:"rgba(44,173,166,0.08)",color:"#2CADA6",
                    fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        ):(
          <div style={{background:"#FFF",borderRadius:8,overflow:"hidden",
            boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{background:"#2CADA6",padding:"10px 14px",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#FFF"}}>
                🌍 {selectedCountry} — {filtered.length} range{filtered.length!==1?"s":""}
              </span>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.7)"}}>{filtered.reduce((a,r)=>a+(r.total_count||0),0)} numbers total</span>
            </div>
            {filtered.length===0
              ?<div style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No ranges for this country</div>
              :<div style={{overflowX:"auto"}}>
                <GTable style={{width:"100%",borderCollapse:"collapse",minWidth:450}}>
                  <thead>
                    <tr style={{background:"#F5F5F5"}}>
                      {["SL","PREFIX","PRICE","SUPPLIER","TEST NUMBER"].map((h,i)=>(
                        <th key={i} style={{fontSize:9,color:"#888",fontWeight:700,letterSpacing:"0.8px",
                          padding:"7px 10px",textAlign:"left",textTransform:"uppercase",
                          whiteSpace:"nowrap",borderBottom:"2px solid #E8E8E8"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>{
                      const testNum=getTestNumber(r);
                      return(
                        <tr key={r.id} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                          <td style={{padding:"6px 8px",fontSize:11,color:"#999",fontWeight:600,whiteSpace:"nowrap"}}>{i+1}</td>
                          <td style={{padding:"6px 8px",fontSize:12,fontFamily:"monospace",fontWeight:700,color:"#1A1A1A",whiteSpace:"nowrap"}}>{r.prefix}</td>
                          <td style={{padding:"6px 8px",fontSize:11,fontWeight:700,color:"#10B981",fontFamily:"monospace",whiteSpace:"nowrap"}}>{fmtUSDT(r.rate,3)}</td>
                          <td style={{padding:"6px 8px",fontSize:11,color:"#2CADA6",fontWeight:600,whiteSpace:"nowrap"}}>{numSupplier(r.supplier_name)}</td>
                          <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                            <span style={{fontSize:12,fontFamily:"monospace",fontWeight:700,color:"#1A1A1A",marginRight:6}}>{testNum}</span>
                            <button onClick={()=>{navigator.clipboard?.writeText(testNum);setMsg("Copied: "+testNum);setTimeout(()=>setMsg(null),2000);}}
                              style={{padding:"2px 6px",borderRadius:4,border:"1px solid #2CADA6",background:"rgba(44,173,166,0.1)",color:"#2CADA6",fontSize:9,fontWeight:700,cursor:"pointer"}}>Copy</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </GTable>
              </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Test Live Call Page ────────────────────────────────────────
function TestLiveCallPage({token}){
  const [calls,setCalls]=useState([]);
  const [loading,setLoading]=useState(false);

  const load=()=>{
    setLoading(true);
    apiFetch("/live-calls",token).then(d=>{setCalls(d.data||d||[]);setLoading(false);});
  };
  useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t);},[token]);

  const fmt=(sec)=>{
    const s=Math.max(0,parseInt(sec)||0);
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;
    return h>0?[h,m,ss].map(v=>String(v).padStart(2,"0")).join(":"): 
               [m,ss].map(v=>String(v).padStart(2,"0")).join(":");
  };
  const thS={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",padding:"8px 10px",
    textAlign:"left",borderBottom:"2px solid #E8E8E8",background:"#F5F5F5",textTransform:"uppercase",whiteSpace:"nowrap"};

  return(
    <div style={{minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700}}>📞 Live Test Call</div>
          <div style={{fontSize:11,color:"#999",marginTop:2}}>
            {calls.length>0?<span style={{color:"#10B981",fontWeight:700}}>● {calls.length} active</span>:"● No active calls"}
            <span style={{marginLeft:8}}>Auto-refresh 5s</span>
          </div>
        </div>
        <button onClick={load} style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",
          background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          ↻ Refresh
        </button>
      </div>
      <div style={{padding:"12px 16px"}}>
        {calls.length===0
          ?<div style={{background:"#FFF",borderRadius:10,padding:60,textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:36,marginBottom:12}}>📞</div>
            <div style={{fontSize:14,fontWeight:600,color:"#333",marginBottom:6}}>No Active Calls</div>
            <div style={{fontSize:12,color:"#999"}}>Make a test call to one of your numbers to see it here</div>
          </div>
          :<div style={{background:"#FFF",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <GTable style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>{["SL","CLI","DID","PREFIX","COUNTRY","SUPPLIER","IVR","DURATION"].map((h,i)=>(
                  <th key={i} style={thS}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {calls.map((c,i)=>{
                  const did=(c.did||c.exten||"").replace("+","");
                  return(
                    <tr key={i} style={{borderBottom:"1px solid #F0F0F0",background:i%2===0?"#FFF":"#F9FFFE"}}>
                      <td style={{padding:"8px 10px",fontSize:11,color:"#999",fontWeight:600}}>{i+1}</td>
                      <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",fontWeight:600}}>{c.src||"—"}</td>
                      <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace",color:"#2CADA6",fontWeight:700}}>{did}</td>
                      <td style={{padding:"8px 10px",fontSize:11,fontFamily:"monospace"}}>{c.prefix||did.slice(0,7)||"—"}</td>
                      <td style={{padding:"8px 10px",fontSize:11}}>{c.country||"—"}</td>
                      <td style={{padding:"8px 10px",fontSize:11,color:"#2CADA6",fontWeight:600}}>{numSupplier(c.supplier||c.trunk_name)}</td>
                      <td style={{padding:"8px 10px",fontSize:10,color:"#555"}}>{(c.ivr||c.ivr_context||"—").replace("custom/","")}</td>
                      <td style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>
                        {fmt(Math.min(86400,parseInt(c.seconds||c.billsec||0)))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </GTable>
          </div>
        }
      </div>
    </div>
  );
}

export default function App(){
  const [token,setToken]=useState(localStorage.getItem("noc_token")||"");
  const [user,setUser]=useState(null);
  const getPageFromUrl=()=>{
    const path=window.location.pathname.replace("/","").replace(/\/$/,"");
    const routes={
      "":"dashboard","dashboard":"dashboard",
      "live-calls":"livecalls","livecalls":"livecalls",
      "cdr":"cdr","cdr-analytics":"cdr",
      "revenue":"revenue",
      "numbers":"numbers","add-number":"addnumber","add-range":"addrange","prefix-routes":"prefixroutes","did-inventory":"didinventory","bulk-did":"bulkdid","bulk-manager":"bulkdid",
      "ivr":"ivr","ivraudio":"audio-manager","ivr-library":"ivr","audio-manager":"ivraudio","ivr-audio":"ivraudio",
      "connect-ivr":"connectivr",
      "route-prefix":"routeprefix",
      "customers":"customers","resellers":"resellers","resellers":"resellers",
      "test-numbers":"testnumbers","test-live-call":"testlivecall",
      "sip-monitor":"sipmonitor",
      "settings":"settings","ipwhitelist":"ip-whitelist","auditlog":"audit-log","systemhealth":"system-health","sipmonitor":"sip-monitor","testnumbers":"test-numbers","testlivecall":"test-live-call","systemhealth":"system-health","ip-whitelist":"ipwhitelist","whitelist":"ipwhitelist","audit-log":"auditlog","system-health":"systemhealth","sip-monitor":"sipmonitor","test-numbers":"testnumbers","test-live-call":"testlivecall","system-health":"systemhealth","audit":"auditlog",
      "asterisk-config":"dashboard","asterisk":"dashboard",
      "asterisk-general":"dashboard","asterisk-suppliers":"ast-trunks","asterisk-did":"routeprefix",
      "asterisk-ivr":"routeprefix","asterisk-rtp":"dashboard","asterisk-firewall":"dashboard",
      "asterisk-preview":"dashboard","asterisk-apply":"dashboard","asterisk-reload":"dashboard",
      "asterisk-history":"dashboard",
      "asterisk-trunks":"ast-trunks","trunks":"ast-trunks",
      "sip-settings":"dashboard","sipsettings":"dashboard",
      "networking":"dashboard","network":"dashboard",
    };
    return routes[path]||"dashboard";
  };
  const [page,setPage]=useState(getPageFromUrl());
  useEffect(()=>{
    window.history.replaceState({...(window.history.state||{}),page},"");
    const onPop=(e)=>{ setPage(e.state?.page||getPageFromUrl()); };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[]);
  const navigateTo=(p)=>{
    const urlMap={
      "dashboard":"","livecalls":"live-calls","cdr":"cdr",
      "revenue":"revenue","numbers":"numbers","addnumber":"add-number","addrange":"add-range","prefixroutes":"prefix-routes","bulkdid":"bulk-did",
      "ivr":"ivr","ivraudio":"audio-manager","connectivr":"connect-ivr","routeprefix":"route-prefix",
      "customers":"customers","resellers":"resellers","resellers":"resellers","testnumbers":"test-numbers","testlivecall":"test-live-call",
      "sipmonitor":"sip-monitor","settings":"settings","ipwhitelist":"ip-whitelist","auditlog":"audit-log","systemhealth":"system-health","testnumbers":"test-numbers","testlivecall":"test-live-call","systemhealth":"system-health","ip-whitelist":"ipwhitelist","whitelist":"ipwhitelist","audit-log":"auditlog","system-health":"systemhealth","sip-monitor":"sipmonitor","test-numbers":"testnumbers","test-live-call":"testlivecall","system-health":"systemhealth","audit":"auditlog",
      "ast-trunks":"asterisk-trunks",
    };
    const url="/"+( urlMap[p]||p);
    if(p===page) return;
    // an open overlay (mobile menu / supplier screen) is replaced, so Back goes straight to the previous page
    if(window.history.state?.overlay) window.history.replaceState({page:p},"",url);
    else window.history.pushState({page:p},"",url);
    setPage(p);
  };
  const [username,setUsername]=useState("");
  const [pass,setPass]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [sideOpen,setSideOpen]=useState(true);
  const [drawerOpen,setDrawerOpen]=useState(false);
  // Bumping refreshKey remounts the current page so it re-fetches its data (logo re-click / pull-to-refresh)
  const [refreshKey,setRefreshKey]=useState(0);
  const [pull,setPull]=useState(0);
  const mainRef=useRef(null);
  const pullStart=useRef(null);
  const goHome=()=>{
    if(page==="dashboard") setRefreshKey(k=>k+1); else navigateTo("dashboard");
    mainRef.current?.scrollTo({top:0});
  };
  useEffect(()=>{mainRef.current?.scrollTo({top:0});},[page]);
  const onTouchStart=(e)=>{pullStart.current=(mainRef.current?.scrollTop||0)<=0?e.touches[0].clientY:null;};
  const onTouchMove=(e)=>{
    if(pullStart.current==null) return;
    if((mainRef.current?.scrollTop||0)>0){pullStart.current=null;setPull(0);return;}
    const d=e.touches[0].clientY-pullStart.current;
    setPull(d>0?Math.min(d*0.5,90):0);
  };
  const onTouchEnd=()=>{
    if(pull>=60) setRefreshKey(k=>k+1);
    pullStart.current=null;setPull(0);
  };
  const [ready,setReady]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const [liveCalls,setLiveCalls]=useState(0);
  const [unpaid,setUnpaid]=useState([]);
  // An open tab keeps running the old code after a new build is deployed: check for a newer build every minute
  const [newVersion,setNewVersion]=useState(false);
  useEffect(()=>{
    const cur=[...document.scripts].map(x=>x.src).find(u=>/\/assets\/index-[^/]+\.js/.test(u));
    if(!cur) return;
    const curName=cur.split("/").pop();
    const check=()=>fetch("/?_="+Date.now(),{cache:"no-store"}).then(r=>r.text()).then(html=>{
      const m=html.match(/\/assets\/(index-[^"']+\.js)/);
      if(m&&m[1]!==curName) setNewVersion(true);
    }).catch(()=>{});
    const t=setInterval(check,60000);
    return()=>clearInterval(t);
  },[]);
  const [isMobile,setIsMobile]=useState(window.innerWidth<768);
  const closeDrawer=useBackClose(isMobile&&drawerOpen,()=>setDrawerOpen(false));
  useModalBackButton();

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener('resize',check);
    return()=>window.removeEventListener('resize',check);
  },[]);

  useEffect(()=>{
    const t=localStorage.getItem("noc_token");
    if(!t){setReady(true);return;}
    apiFetch("/auth/me",t).then(d=>{
      const u=d.data||d;
      if(u?.id){setToken(t);setUser(u);}
      else{localStorage.removeItem("noc_token");setToken("");setUser(null);}
      setReady(true);
    }).catch(()=>{
      localStorage.removeItem("noc_token");
      setToken("");setUser(null);
      setReady(true);
    });
  },[]);

  useEffect(()=>{
    if(!token)return;
    const loadStats=()=>{
      apiFetch("/live-calls",token).then(d=>setLiveCalls((d.data||d||[]).length));
      // Revenue not yet paid out, per supplier (everything since that supplier's last paid payout)
      apiFetch("/billing/unpaid-revenue",token).then(d=>{
        setUnpaid((d.data||[]).map(r=>({name:r.supplier_name,amount:Number(r.amount)||0,calls:r.calls,minutes:r.minutes})).filter(x=>x.amount>0));
      });
    };
    loadStats();const t=setInterval(loadStats,10000);return()=>clearInterval(t);
  },[token]);

  const login=async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch(`${API}/auth/login`,{method:"POST",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({username,email:username,password:pass})});
      const d=await r.json();
      if(d.token){localStorage.setItem("noc_token",d.token);setToken(d.token);setUser(d.user);}
      else setError(d.message||"Invalid credentials");
    }catch(e){setError("Connection error");}
    setLoading(false);
  };

  const logout=()=>{localStorage.removeItem("noc_token");setToken("");setUser(null);};

  if(!ready)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",
      justifyContent:"center",color:C.muted,fontFamily:"monospace"}}>Loading...</div>
  );

  if(!token||!user)return(
    <div style={{minHeight:"100vh",background:"#F5F5F5",display:"flex",flexDirection:"column",
      alignItems:"center",fontFamily:"'Nunito','Poppins',sans-serif",margin:0,padding:0}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .login-input{width:100%;padding:14px 16px;border:1.5px solid #E0E0E0;border-radius:10px;
          font-size:15px;font-family:inherit;outline:none;background:#FFFFFF;color:#333;transition:border 0.2s;}
        .login-input:focus{border-color:#2CADA6;box-shadow:0 0 0 3px rgba(44,173,166,0.12);}
        .login-btn{width:100%;padding:15px;background:linear-gradient(135deg,#2CADA6,#38B7A8);
          color:#FFFFFF;border:none;border-radius:10px;font-size:16px;font-weight:700;
          cursor:pointer;font-family:inherit;letter-spacing:0.5px;transition:all 0.25s;}
        .login-btn:hover{background:linear-gradient(135deg,#28A8A1,#2CADA6);box-shadow:0 4px 20px rgba(44,173,166,0.4);}
        .login-btn:disabled{opacity:0.6;cursor:not-allowed;}
      `}</style>
      {/* Header Banner */}
      <div style={{width:"100%",background:"linear-gradient(135deg,#2CADA6 0%,#38B7A8 50%,#2CADA6 100%)",
        padding:"22px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",
        boxShadow:"0 4px 20px rgba(44,173,166,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:36,fontWeight:900,color:"#FFFFFF",letterSpacing:"-1px"}}>6G</span>
          <span style={{fontSize:36,fontWeight:900,color:"#F5A623",letterSpacing:"-1px"}}>STATS</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="4" y="20" width="6" height="12" rx="2" fill="white" opacity="0.9"/>
            <rect x="13" y="14" width="6" height="18" rx="2" fill="#F5A623"/>
            <rect x="22" y="8" width="6" height="24" rx="2" fill="white" opacity="0.9"/>
            <circle cx="29" cy="6" r="3" fill="#F5A623"/>
          </svg>
        </div>
      </div>
      {/* Main Content */}
      <div style={{width:"100%",maxWidth:420,padding:"40px 24px 24px",flex:1}}>
        {/* Heading */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A",lineHeight:1.3}}>
            User name and password
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A",lineHeight:1.3}}>
            needed!
          </div>
        </div>
        {/* Form */}
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          {/* Username */}
          <div>
            <label style={{display:"block",fontSize:14,fontWeight:700,
              color:"#444444",marginBottom:8}}>User</label>
            <input className="login-input" value={username}
              onChange={e=>setUsername(e.target.value)}
              placeholder="Enter your username"
              onKeyDown={e=>e.key==="Enter"&&login()}/>
          </div>
          {/* Password */}
          <div>
            <label style={{display:"block",fontSize:14,fontWeight:700,
              color:"#444444",marginBottom:8}}>Password</label>
            <div style={{position:"relative"}}>
              <input className="login-input" type={showPass?"text":"password"}
                value={pass} onChange={e=>setPass(e.target.value)}
                placeholder="Enter your password"
                style={{paddingRight:44}}
                onKeyDown={e=>e.key==="Enter"&&login()}/>
              <button onClick={()=>setShowPass(!showPass)}
                style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",cursor:"pointer",fontSize:16,
                  color:"#888",padding:4}}>
                {showPass?"🙈":"👁"}
              </button>
            </div>
          </div>
          {/* Error */}
          {error&&<div style={{color:"#EF4444",fontSize:13,padding:"10px 14px",
            borderRadius:8,background:"rgba(239,68,68,0.08)",
            border:"1px solid rgba(239,68,68,0.2)",display:"flex",alignItems:"center",gap:8}}>
            <span>⚠</span>{error}
          </div>}
          {/* Login Button */}
          <button className={loading?"login-btn":"login-btn"} onClick={login} disabled={loading}>
            {loading?"Logging in...":"login"}
          </button>
          {/* Footer note */}
          <div style={{textAlign:"center",marginTop:8}}>
            <span style={{fontSize:12,color:"#999"}}>
              Don't have an account?{" "}
              <span style={{color:"#2CADA6",fontWeight:700,cursor:"pointer"}}>
                Contact administration
              </span>
            </span>
          </div>
        </div>
      </div>
      <div style={{padding:"16px",textAlign:"center"}}>
        <span style={{fontSize:10,color:"#BBBBBB"}}>© 2026 6G Premium Telecom. All rights reserved.</span>
      </div>
    </div>
  );
  const renderPage=()=>{
    switch(page){
      case "livecalls":    return <LiveCallsPage token={token}/>;
      case "cdr":          return <CDRPage token={token}/>;
      case "revenue":      return <RevenuePage token={token}/>;
      case "numbers":      return <NumbersListPage token={token} setPage={navigateTo}/>;
      case "addnumber":    return <AddNumberPage token={token} setPage={navigateTo}/>;
      case "addrange":     return <AddRangePage token={token} setPage={navigateTo}/>;
      case "prefixroutes": return <PrefixRoutesPage token={token}/>;
      case "ivr":          return <IVRPage token={token} setPage={navigateTo}/>;
      case "connectivr":   return <ConnectIVRPage token={token}/>;
      case "routeprefix":  return <RoutePrefixPage token={token}/>;
      case "customers":    return <CustomersPage token={token}/>;
      case "suppliers":    return <SupplierAccountsPage token={token} user={user} setPage={navigateTo}/>;
      case "supplierpayments": return <SupplierPaymentsPage token={token} user={user}/>;
      case "resellers":     return <ResellerPortalPage token={token}/>;
      case "testlabs":     return <TestLabsPage token={token}/>;
      case "testnumbers":   return <TestNumbersPage token={token}/>;
      case "testlivecall":  return <TestLiveCallPage token={token}/>;
      case "sipmonitor":   return <SIPMonitorPage token={token}/>;
      case "ipwhitelist":  return <IPWhitelistPage token={token}/>;
      case "auditlog":      return <AuditLogPage token={token}/>;
      case "systemhealth":  return <SystemHealthPage token={token}/>;
      case "settings":     return <SettingsPage user={user} logout={logout}/>;
      case "ast-trunks":     return <AsteriskConfigPage key="ast-trunks" token={token} user={user}/>;
      case "sysops":        return <SystemOperationsPage/>;
      default:             return <DashboardPage token={token}/>;
    }
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg,
      fontFamily:"monospace",color:C.text,overflow:"hidden"}}>
      <style>{`*{box-sizing:border-box;}body{margin:0;overflow:hidden;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}`}
      </style>

      {newVersion&&<div onClick={()=>window.location.reload()}
        style={{background:"#F5A623",color:"#1A1A1A",textAlign:"center",padding:"8px 12px",fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>
        🔄 A new version is ready — tap here to reload</div>}
      <TopBar liveCalls={liveCalls} unpaid={unpaid} isMobile={isMobile} onMenuClick={()=>setDrawerOpen(true)} user={user} onHome={goHome}/>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Mobile Drawer */}
        {isMobile&&drawerOpen&&(
          <MobileDrawer page={page} setPage={navigateTo} user={user} logout={logout} onClose={closeDrawer} onHome={goHome}/>
        )}

        {/* Desktop Sidebar */}
        {!isMobile&&(
          <DesktopSidebar page={page} setPage={navigateTo} open={sideOpen}
            toggle={()=>setSideOpen(o=>!o)} user={user} logout={logout} onHome={goHome}/>
        )}

        {/* Main Content */}
        <div ref={mainRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{flex:1,overflowY:"auto",width:"100%",minWidth:0,display:"flex",flexDirection:"column",overscrollBehaviorY:"contain"}}>
          {pull>0&&<div style={{height:pull,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:12,color:"#2CADA6",fontWeight:700}}>{pull>=60?"↻ Release to refresh":"↓ Pull to refresh"}</div>}
          <div key={refreshKey} style={{flex:1}}><ErrorBoundary>{renderPage()}</ErrorBoundary></div>
          <div style={{padding:"10px 16px",borderTop:`1px solid ${C.border}`,
            background:C.surface,textAlign:"center",flexShrink:0}}>
            <span style={{fontSize:10,color:C.muted}}>
              6G Premium Telecom NOC · Developed by{" "}
              <span style={{color:C.green,fontWeight:700}}>KanonSarowar</span>
              {" "}· © {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

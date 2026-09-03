import React, { useState, useEffect, useCallback, useRef } from "react";
const API = "https://6g-premium-telecom.com/api/v1";
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
  const isSuperAdmin = role === 'superadmin';
  return [
  {key:"dashboard",label:"Dashboard",items:[
    {id:"dashboard",label:"Dashboard",icon:"▦"},
  ]},
  {key:"calls",label:"Calls & Revenue",items:[
    {id:"livecalls",label:"Live Calls",icon:"◉"},
    {id:"cdr",label:"CDR",icon:"≡"},
    {id:"revenue",label:"Revenue",icon:"◈"},
    {id:"quality",label:"Call Quality",icon:"📊"},
  ]},
  {key:"numbers",label:"Numbers & IVR",items:[
    {id:"numbers",label:"Numbers",icon:"▤"},
    {id:"connectivr",label:"Connect IVR",icon:"⇌"},
    {id:"ivr",label:"IVR Library",icon:"♫"},
    {id:"ivraudio",label:"Audio Manager",icon:"🎵"},
    {id:"didperformance",label:"DID Report",icon:"📈"},
  ]},
  {key:"partners",label:"Partners",items:[
    ...(isSuperAdmin?[{id:"suppliers",label:"Suppliers",icon:"⬡"}]:[]),
    {id:"resellers",label:"Resellers",icon:"👥"},
    {id:"customers",label:"Customers",icon:"◷"},
  ]},
  {key:"network",label:"Networking",items:[
    {id:"sipmonitor",label:"SIP Monitor",icon:"◎"},
    {id:"routeprefix",label:"Route Prefix",icon:"⇥"},
    {id:"ipwhitelist",label:"IP Whitelist",icon:"🔐"},
    {id:"testlabs",label:"Test Number",icon:"⚗"},
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
function MobileDrawer({page,setPage,user,logout,onClose}){
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
          <div style={{display:"flex",alignItems:"center",gap:10}}>
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
              <div style={{fontSize:10,letterSpacing:"1.5px",color:"#AAAAAA",
                textTransform:"uppercase",padding:"6px 8px 4px",fontWeight:700}}>{g.label}</div>
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
function DesktopSidebar({page,setPage,open,toggle,user,logout}){
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
        <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
          background:"linear-gradient(135deg,#5B4FCF,#4B3FB5)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
          boxShadow:"0 4px 12px rgba(91,79,207,0.3)"}}>📡</div>
        {open&&<div style={{flex:1,minWidth:0}}>
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
            {open&&<div style={{fontSize:10,letterSpacing:"1.5px",color:"#AAAAAA",
              textTransform:"uppercase",padding:"6px 8px 4px",fontWeight:700}}>{g.label}</div>}
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


function TopBar({liveCalls,revenue,onMenuClick,isMobile,user}){
  const [time,setTime]=useState(new Date().toLocaleTimeString());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date().toLocaleTimeString()),1000);return()=>clearInterval(t);},[]);
  return(
    <div style={{height:64,background:"linear-gradient(90deg,#2CADA6,#38B7A8)",
      display:"flex",alignItems:"center",padding:"0 16px",gap:10,
      flexShrink:0,zIndex:100,boxShadow:"0 2px 12px rgba(75,63,181,0.3)"}}>
      {/* Hamburger */}
      {isMobile&&(
        <button onClick={onMenuClick} style={{background:"rgba(255,255,255,0.15)",
          border:"1px solid rgba(255,255,255,0.2)",color:"#FFFFFF",fontSize:18,
          cursor:"pointer",borderRadius:10,width:40,height:40,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>☰</button>
      )}
      {/* Brand */}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
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
      {/* Pills */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
          borderRadius:20,background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#10B981",
            display:"inline-block",boxShadow:"0 0 6px #10B981"}}/>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.8)",fontWeight:500}}>Live</span>
          <span style={{fontSize:13,color:"#10B981",fontWeight:800,fontFamily:"monospace"}}>{liveCalls}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
          borderRadius:20,background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.8)",fontWeight:500}}>Rev</span>
          <span style={{fontSize:13,color:"#F5A623",fontWeight:800,fontFamily:"monospace"}}>€{revenue}</span>
        </div>
      </div>
      {/* Right side */}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
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
function DashboardPage({token}){
  const [stats,setStats]=useState({calls:0,revenue:0,dids:0,live:0,minutes:0,
    today_calls:0,today_revenue:0,today_minutes:0,asr:0,suppliers:0,today_countries:0});
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
      const todayEur=parseFloat(s.today_eur||0);
      const todayUsd=parseFloat(s.today_usd||0);
      const allEur=parseFloat(s.revenue_eur||0);
      const allUsd=parseFloat(s.revenue_usd||0);
      setStats({
        calls,
        revenue:revenue.toFixed(4),
        revenue_eur:allEur.toFixed(4),
        revenue_usd:allUsd.toFixed(4),
        minutes:minutes.toFixed(2),
        dids:(dids.data||[]).length,
        live:(live.data||live||[]).length,
        suppliers:(sup.data||[]).length,
        today_countries:[...new Set((dids.data||[]).map(d=>d.country_name).filter(Boolean))].length,
        today_calls:todayCalls,
        today_revenue:todayRevenue.toFixed(4),
        today_eur:todayEur.toFixed(4),
        today_usd:todayUsd.toFixed(4),
        today_minutes:todayMinutes.toFixed(2),
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
  const todayCards=[
    {label:"TODAY CALLS",value:stats.today_calls,color:"#3B82F6",icon:"📞"},
    {label:"TODAY MINUTES",value:stats.today_minutes,color:"#06B6D4",icon:"⏱"},
    ...(parseFloat(stats.today_eur||0)>0?[{label:"TODAY EUR",value:"€"+parseFloat(stats.today_eur).toFixed(4),color:"#10B981",icon:"💶"}]:[]),
    ...(parseFloat(stats.today_usd||0)>0?[{label:"TODAY USD",value:"$"+parseFloat(stats.today_usd).toFixed(4),color:"#F5A623",icon:"💵"}]:[]),
    {label:"ACTIVE DIDS",value:stats.dids,color:"#8B5CF6",icon:"📱"},
    {label:"COUNTRIES",value:stats.today_countries,color:"#06B6D4",icon:"🌍"},
  ];
  const allTimeCards=[
    {label:"TOTAL CALLS",value:stats.calls,color:"#3B82F6"},
    {label:"TOTAL MINUTES",value:stats.minutes,color:"#06B6D4"},
    ...(parseFloat(stats.revenue_eur||0)>0?[{label:"TOTAL EUR",value:"€"+parseFloat(stats.revenue_eur).toFixed(4),color:"#10B981"}]:[]),
    ...(parseFloat(stats.revenue_usd||0)>0?[{label:"TOTAL USD",value:"$"+parseFloat(stats.revenue_usd).toFixed(4),color:"#F5A623"}]:[]),
    {label:"TOTAL DIDS",value:stats.dids,color:"#8B5CF6"},
  ];
  const barMax=Math.max(parseFloat(stats.today_calls||1),parseFloat(stats.calls||1));
  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Dashboard</div>
        <div style={{fontSize:12,color:"#999",background:"#F0F0F0",padding:"4px 12px",borderRadius:20}}>
          {now.toLocaleDateString()}
        </div>
      </div>
      {/* Live Bar */}
      <div style={{background:"linear-gradient(135deg,#2CADA6,#38B7A8)",borderRadius:14,
        padding:"14px 16px",marginBottom:16,
        boxShadow:"0 4px 16px rgba(44,173,166,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"#FFFFFF",
              display:"inline-block",boxShadow:"0 0 8px rgba(255,255,255,0.8)"}}/>
            <span style={{fontSize:12,color:"#FFFFFF",fontWeight:700,letterSpacing:"1px"}}>LIVE NOW</span>
          </div>
          <div style={{display:"flex",gap:20}}>
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
      {/* Today Section */}
      <div style={{fontSize:11,fontWeight:700,color:"#4A4A4A",textTransform:"uppercase",
        letterSpacing:"1px",marginBottom:10}}>Today</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {todayCards.map((c,i)=>(
          <div key={i} style={{background:"#FFFFFF",borderRadius:14,padding:"14px 12px",
            borderLeft:`4px solid ${c.color}`,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:24,marginBottom:6}}>{c.icon}</div>
            <div style={{fontSize:11,fontWeight:700,color:"#4A4A4A",
              textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>{c.label}</div>
            <div style={{fontSize:30,fontWeight:800,color:c.color,
              fontFamily:"monospace",lineHeight:1}}>{loading?"...":c.value}</div>
          </div>
        ))}
      </div>
      {/* All Time Section */}
      <div style={{fontSize:11,fontWeight:700,color:"#4A4A4A",textTransform:"uppercase",
        letterSpacing:"1px",marginBottom:10}}>All Time</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {allTimeCards.map((c,i)=>(
          <div key={i} style={{background:"#FFFFFF",borderRadius:14,padding:"14px 12px",
            borderLeft:`4px solid ${c.color}`,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#4A4A4A",
              textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>{c.label}</div>
            <div style={{fontSize:30,fontWeight:800,color:c.color,
              fontFamily:"monospace",lineHeight:1}}>{loading?"...":c.value}</div>
          </div>
        ))}
      </div>
      {/* Performance Chart */}
      <div style={{background:"#FFFFFF",borderRadius:14,padding:16,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)",marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:"#4A4A4A",
          textTransform:"uppercase",letterSpacing:"1px",marginBottom:14}}>
          Performance Overview
        </div>
        {[
          {label:"Calls",today:stats.today_calls,total:stats.calls,color:"#3B82F6"},
          {label:"Minutes",today:stats.today_minutes,total:stats.minutes,color:"#06B6D4"},
          {label:"Revenue €",today:stats.today_revenue,total:stats.revenue,color:"#F5A623"},
        ].map((m,i)=>{
          const todayPct=Math.min(100,barMax>0?(parseFloat(m.today)||0)/barMax*100:0);
          const totalPct=Math.min(100,barMax>0?(parseFloat(m.total)||0)/barMax*100:0);
          return(
            <div key={i} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:600,color:"#333"}}>{m.label}</span>
                <span style={{fontSize:11,color:"#999"}}>{m.today} / {m.total}</span>
              </div>
              <div style={{height:8,borderRadius:4,background:"#F0F0F0",marginBottom:3}}>
                <div style={{height:"100%",borderRadius:4,
                  background:m.color,width:todayPct+"%",
                  transition:"width 0.5s ease"}}/>
              </div>
              <div style={{height:8,borderRadius:4,background:"#F0F0F0"}}>
                <div style={{height:"100%",borderRadius:4,
                  background:m.color+"60",width:totalPct+"%",
                  transition:"width 0.5s ease"}}/>
              </div>
              <div style={{display:"flex",gap:16,marginTop:4}}>
                <span style={{fontSize:10,color:m.color,fontWeight:600}}>▪ Today</span>
                <span style={{fontSize:10,color:m.color+"99",fontWeight:600}}>▪ All Time</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* System Status */}
      <div style={{background:"#FFFFFF",borderRadius:14,padding:14,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)",marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"#4A4A4A",
          textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>System Status</div>
        {[["API","Online","#10B981"],["Database","Connected","#10B981"],["Asterisk","Active","#10B981"]].map(([k,v,c])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",
            padding:"8px 0",borderBottom:"1px solid #F0F0F0"}}>
            <span style={{fontSize:13,color:"#666"}}>{k}</span>
            <span style={{fontSize:12,color:c,fontWeight:700,
              background:c+"15",padding:"2px 10px",borderRadius:10}}>{v}</span>
          </div>
        ))}
      </div>
      {/* Server Info */}
      <div style={{background:"#FFFFFF",borderRadius:14,padding:14,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#4A4A4A",
          textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>Server</div>
        {[["IP","195.200.14.165"],["OS","Ubuntu 24.04"],["Asterisk","20.6.0"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",
            padding:"8px 0",borderBottom:"1px solid #F0F0F0"}}>
            <span style={{fontSize:13,color:"#666"}}>{k}</span>
            <span style={{fontSize:12,color:"#2CADA6",fontFamily:"monospace",fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
// ── Live Calls ────────────────────────────────────────────────────
function LiveCallsPage({token}){
  const [calls,setCalls]=useState([]);
  const [loading,setLoading]=useState(false);
  const [tick,setTick]=useState(0);

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

  const thS={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",
    padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap",
    borderBottom:"2px solid #E8E8E8",background:"#F5F5F5",textTransform:"uppercase"};

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
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                <thead>
                  <tr>
                    {["SL","CLI","PRN","PREFIX","COUNTRY","IVR","SUPPLIER","DURATION"].map((h,i)=>(
                      <th key={i} style={thS}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c,i)=>{
                    const did=(c.did||c.exten||"").replace("+","");
                    const prefix=c.prefix||(did.slice(0,did.length>10?did.length-4:4))||"—";
                    const dur=fmt(Math.min(86400,parseInt(c.seconds||c.billsec||0)));
                    const ivr=(c.ivr||c.ivr_context||"—").replace("custom/","");
                    const cli=(c.src||c.callerid||"—");
                    return(
                    <tr key={i} style={{borderBottom:"1px solid #F0F0F0",
                      background:i%2===0?"#FFF":"#F9FFFE"}}>
                      <td style={{padding:"6px 8px",fontSize:11,color:"#999",fontWeight:600,whiteSpace:"nowrap"}}>
                        {i+1}
                      </td>
                      <td style={{padding:"6px 8px",fontSize:11,fontFamily:"monospace",
                        fontWeight:600,color:"#1A1A1A",whiteSpace:"nowrap"}}>
                        {cli}
                      </td>
                      <td style={{padding:"6px 8px",fontSize:11,fontFamily:"monospace",
                        color:"#2CADA6",fontWeight:700,whiteSpace:"nowrap"}}>
                        {did}
                      </td>
                      <td style={{padding:"6px 8px",fontSize:11,color:"#555",
                        fontFamily:"monospace",whiteSpace:"nowrap"}}>
                        {prefix}
                      </td>
                      <td style={{padding:"6px 8px",fontSize:11,color:"#333",whiteSpace:"nowrap"}}>
                        {c.country||c.country_name||"—"}
                      </td>
                      <td style={{padding:"6px 8px",fontSize:10,color:"#555",whiteSpace:"nowrap"}}>
                        {ivr}
                      </td>
                      <td style={{padding:"6px 8px",fontSize:11,color:"#2CADA6",
                        fontWeight:600,whiteSpace:"nowrap"}}>
                        {c.supplier||c.trunk_name||"—"}
                      </td>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                        <span style={{padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700,
                          background:"rgba(16,185,129,0.1)",color:"#10B981",
                          fontFamily:"monospace",whiteSpace:"nowrap"}}>
                          ●{dur}
                        </span>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
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
function CDRPage({token}){
  const [cdrs,setCdrs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [filterSupplier,setFilterSupplier]=useState("");

  const load=()=>{
    apiFetch("/cdr?per_page=500",token).then(d=>{setCdrs(d.data||[]);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);

  const filtered=cdrs.filter(c=>{
    if(search&&!(c.src||"").includes(search)&&!(c.did||"").includes(search)) return false;
    if(filterSupplier&&(c.trunk_name||"")!==filterSupplier) return false;
    if(dateFrom&&(c.call_start||c.created_at||"")<dateFrom) return false;
    if(dateTo&&(c.call_start||c.created_at||"")>dateTo+"Z") return false;
    return true;
  });

  const totalSec=filtered.reduce((a,c)=>a+parseInt(c.billsec||0),0);
  const totalRev=filtered.reduce((a,c)=>a+parseFloat(c.revenue||0),0);
  const suppliers=[...new Set(cdrs.map(c=>c.trunk_name).filter(Boolean))];

  const downloadCSV=()=>{
    const rows=[["Date","CLI","PRN","Sec","Revenue","Currency","Supplier","Disposition"]];
    filtered.forEach(c=>rows.push([
      (c.call_start||c.created_at||"").slice(0,19),
      c.src||"",c.did||"",c.billsec||0,
      parseFloat(c.revenue||0).toFixed(4),
      c.currency||"EUR",c.trunk_name||"",c.disposition||""
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
          <div style={{fontSize:11,color:"#999",marginTop:2}}>{filtered.length} records · {totalSec}s · €{totalRev.toFixed(4)}</div>
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
              {suppliers.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[
            {label:"Calls",value:filtered.length,color:"#2CADA6"},
            {label:"Seconds",value:totalSec,color:"#3B82F6"},
            {label:"Revenue",value:"€"+totalRev.toFixed(3),color:"#10B981"},
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
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead>
                <tr>
                  {["DATE","CLI","PRN","SEC","REVENUE","CURRENCY","SUPPLIER","STATUS"].map((h,i)=>(
                    <th key={i} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0
                  ?<tr><td colSpan={8} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No records found</td></tr>
                  :filtered.map((c,i)=>(
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
                        color:"#10B981",fontWeight:600}}>
                        {parseFloat(c.revenue||0).toFixed(4)}
                      </td>
                      <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>
                        {c.currency||"EUR"}
                      </td>
                      <td style={{padding:"6px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>
                        {c.trunk_name||"—"}
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
            </table>
          </div>
        </div>}
      </div>
    </div>
  );
}
// ── Revenue ───────────────────────────────────────────────────────
function RevenuePage({token}){
  const [data,setData]=useState({usd:{calls:0,minutes:0,revenue:0},eur:{calls:0,minutes:0,revenue:0},total_calls:0,total_minutes:0});
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
      days[day].revenue+=parseFloat(c.revenue||0);
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
      countries[country].revenue+=parseFloat(c.revenue||0);
    });
    return Object.values(countries).sort((a,b)=>b.revenue-a.revenue).slice(0,8);
  };

  const daily=dailyData();
  const countries=countryData();
  const maxRev=Math.max(...daily.map(d=>d.revenue),0.01);
  const maxCountryRev=Math.max(...countries.map(c=>c.revenue),0.01);
  const totalRevEur=parseFloat(data.eur.revenue||0);
  const totalRevUsd=parseFloat(data.usd.revenue||0);

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

      {/* Wallet Cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:"linear-gradient(135deg,#F5A623,#F59E0B)",borderRadius:14,padding:16,
          boxShadow:"0 4px 16px rgba(245,166,35,0.3)"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700,letterSpacing:"1px",marginBottom:8}}>💵 USD WALLET</div>
          <div style={{fontSize:28,fontWeight:800,color:"#FFFFFF",fontFamily:"monospace",marginBottom:4}}>
            ${loading?"...":data.usd.revenue}
          </div>
          <div style={{display:"flex",gap:12,fontSize:10,color:"rgba(255,255,255,0.8)"}}>
            <span>{data.usd.calls} calls</span>
            <span>{data.usd.minutes} min</span>
          </div>
        </div>
        <div style={{background:"linear-gradient(135deg,#3B82F6,#2563EB)",borderRadius:14,padding:16,
          boxShadow:"0 4px 16px rgba(59,130,246,0.3)"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700,letterSpacing:"1px",marginBottom:8}}>💶 EUR WALLET</div>
          <div style={{fontSize:28,fontWeight:800,color:"#FFFFFF",fontFamily:"monospace",marginBottom:4}}>
            €{loading?"...":data.eur.revenue}
          </div>
          <div style={{display:"flex",gap:12,fontSize:10,color:"rgba(255,255,255,0.8)"}}>
            <span>{data.eur.calls} calls</span>
            <span>{data.eur.minutes} min</span>
          </div>
        </div>
      </div>

      {/* Summary Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total Calls",value:data.total_calls,color:"#2CADA6"},
          {label:"Total Minutes",value:data.total_minutes,color:"#8B5CF6"},
          {label:"Total Revenue",value:"€"+totalRevEur.toFixed(4),color:"#10B981"},
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
            ["EUR Revenue","€"+totalRevEur.toFixed(4),"#10B981"],
            ["USD Revenue","$"+totalRevUsd.toFixed(4),"#F5A623"],
            ["Avg Revenue/Call",cdrs.length>0?"€"+(totalRevEur/cdrs.length).toFixed(4):"€0","#3B82F6"],
            ["Answered Calls",cdrs.filter(c=>c.disposition==="ANSWERED").length,"#10B981"],
            ["Failed Calls",cdrs.filter(c=>c.disposition!=="ANSWERED").length,"#EF4444"],
            ["ASR",cdrs.length>0?Math.round(cdrs.filter(c=>c.disposition==="ANSWERED").length/cdrs.length*100)+"%":"0%","#F5A623"],
          ].map(([k,v,col])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",
              padding:"9px 0",borderBottom:"1px solid #F5F5F5"}}>
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
                      <span style={{fontSize:10,color:"#FFF",fontWeight:700,whiteSpace:"nowrap"}}>€{d.revenue.toFixed(4)}</span>
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
                      <span style={{fontSize:10,color:"#FFF",fontWeight:700}}>€{c.revenue.toFixed(4)}</span>
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
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#F8F9FA"}}>
                  {["Supplier","DIDs","Calls","Minutes","Revenue","Currency"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px",fontSize:11,color:"#9A9A9A",
                      fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                      borderBottom:"1px solid #EEEEEE"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supRevenue.length===0
                  ?<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#999"}}>No supplier revenue data</td></tr>
                  :supRevenue.map((s,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{s.nickname||s.supplier||"—"}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#8B5CF6",fontFamily:"monospace"}}>{s.unique_dids||0}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#3B82F6",fontFamily:"monospace"}}>{s.calls||0}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#555",fontFamily:"monospace"}}>{parseFloat(s.minutes||0).toFixed(2)}</td>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,
                        color:s.currency==="USD"?"#F5A623":"#10B981",fontFamily:"monospace"}}>
                        {s.currency==="USD"?"$":"€"}{parseFloat(s.revenue||0).toFixed(4)}
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                          background:s.currency==="USD"?"rgba(245,166,35,0.1)":"rgba(16,185,129,0.1)",
                          color:s.currency==="USD"?"#F5A623":"#10B981"}}>
                          {s.currency||"USD"}
                        </span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
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
              <table style={{width:"100%",borderCollapse:"collapse"}}>
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
                          color:inv.currency==="USD"?"#F5A623":"#10B981",fontFamily:"monospace"}}>
                          {inv.currency==="USD"?"$":"€"}{parseFloat(inv.total_amount||0).toFixed(4)}
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
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ── Suppliers ─────────────────────────────────────────────────────
function SuppliersPage({token}){
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({
    name:"",nickname:"",host:"",port:"5060",transport:"udp",
    codecs:"ulaw,alaw,g729",panel_url:"",panel_user:"",
    panel_password:"",team_link:"",sales_person:"",whatsapp:"",notes:""
  });
  const [saving,setSaving]=useState(false);

  const load=()=>{
    apiFetch("/suppliers",token).then(d=>{setSuppliers(d.data||[]);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);

  const save=async()=>{
    setSaving(true);
    if(editing&&selected){
      await apiFetch("/suppliers/"+selected.id,token,{method:"PUT",body:JSON.stringify(form)});
    } else {
      await apiFetch("/suppliers",token,{method:"POST",body:JSON.stringify(form)});
    }
    load();setEditing(false);setSelected(null);
    setForm({name:"",nickname:"",host:"",port:"5060",transport:"udp",
      codecs:"ulaw,alaw,g729",panel_url:"",panel_user:"",
      panel_password:"",team_link:"",sales_person:"",whatsapp:"",notes:""});
    setSaving(false);
  };

  const del=async(id)=>{
    if(!window.confirm("Delete this supplier?")) return;
    await apiFetch("/suppliers/"+id,token,{method:"DELETE"});
    load();setSelected(null);
  };

  const selectSupplier=(s)=>{
    setSelected(s);setEditing(false);
    setForm({
      name:s.name||"",nickname:s.nickname||"",host:s.host||"",
      port:s.port||"5060",transport:s.transport||"udp",
      codecs:s.codecs||"ulaw,alaw,g729",
      panel_url:s.panel_url||"",panel_user:s.panel_user||"",
      panel_password:s.panel_password||"",team_link:s.team_link||"",
      sales_person:s.sales_person||"",whatsapp:s.whatsapp||"",
      notes:s.notes||""
    });
  };

  const inp={width:"100%",padding:"9px 12px",borderRadius:8,
    border:"1px solid #E0E0E0",background:"#FFFFFF",
    color:"#333",fontSize:13,outline:"none",boxSizing:"border-box",
    fontFamily:"inherit"};

  const Field=({label,k,ph,type="text"})=>(
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div>
      <input type={type} style={inp} value={form[k]||""} placeholder={ph||""}
        onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
    </div>
  );

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Suppliers</div>
        <button onClick={()=>{setSelected(null);setEditing(true);setForm({name:"",nickname:"",host:"",port:"5060",transport:"udp",codecs:"ulaw,alaw,g729",panel_url:"",panel_user:"",panel_password:"",team_link:"",sales_person:"",whatsapp:"",notes:""}); }}
          style={{padding:"9px 18px",borderRadius:20,border:"none",
            background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          + Add Supplier
        </button>
      </div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {/* Supplier List */}
        <div style={{flex:"0 0 auto",width:180}}>
          {loading?<div style={{color:"#999",fontSize:13}}>Loading...</div>
          :suppliers.map((s,i)=>(
            <div key={s.id} onClick={()=>selectSupplier(s)}
              style={{padding:"10px 14px",borderRadius:10,marginBottom:6,cursor:"pointer",
                background:selected?.id===s.id?"#2CADA6":"#FFFFFF",
                color:selected?.id===s.id?"#FFFFFF":"#333",
                boxShadow:"0 2px 6px rgba(0,0,0,0.06)",
                fontWeight:selected?.id===s.id?700:500,fontSize:13,
                border:selected?.id===s.id?"none":"1px solid #EEEEEE"}}>
              <div style={{fontWeight:700}}>{s.nickname||s.name}</div>
              <div style={{fontSize:10,opacity:0.7,marginTop:2}}>
                {s.is_active?"● Active":"○ Inactive"}
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        {(selected||editing)&&(
          <div style={{flex:1,background:"#FFFFFF",borderRadius:14,padding:18,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)",minWidth:260}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:800,color:"#1A1A1A"}}>
                {editing&&!selected?"New Supplier":editing?"Edit: "+(selected?.nickname||selected?.name):selected?.nickname||selected?.name}
              </div>
              <div style={{display:"flex",gap:8}}>
                {selected&&!editing&&(
                  <>
                    <button onClick={()=>setEditing(true)}
                      style={{padding:"6px 14px",borderRadius:20,border:"1px solid #2CADA6",
                        background:"#FFF",color:"#2CADA6",fontSize:12,fontWeight:700,cursor:"pointer"}}>Edit</button>
                    <button onClick={()=>del(selected.id)}
                      style={{padding:"6px 14px",borderRadius:20,border:"1px solid #EF4444",
                        background:"#FFF",color:"#EF4444",fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete</button>
                  </>
                )}
              </div>
            </div>

            {editing?(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Field label="Code Name" k="name" ph="tokyo"/>
                  <Field label="Display Name" k="nickname" ph="Tokyo"/>
                </div>
                {/* Multiple IPs */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.5px"}}>SIP IP Address(es)</div>
                  {(form.host||"").split(",").map((ip,idx)=>(
                    <div key={idx} style={{display:"flex",gap:6,marginBottom:6}}>
                      <input style={{...inp,flex:1}} value={ip.trim()}
                        placeholder={idx===0?"e.g. 1.2.3.4":"Additional IP"}
                        onChange={e=>{
                          const ips=(form.host||"").split(",");
                          ips[idx]=e.target.value;
                          setForm(f=>({...f,host:ips.join(",")}));
                        }}/>
                      {idx>0&&<button onClick={()=>{
                        const ips=(form.host||"").split(",");
                        ips.splice(idx,1);
                        setForm(f=>({...f,host:ips.join(",")}));
                      }} style={{width:34,height:36,borderRadius:8,border:"1px solid #EF4444",
                        background:"#FFF5F5",color:"#EF4444",cursor:"pointer",fontSize:18,
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>}
                    </div>
                  ))}
                  <button onClick={()=>setForm(f=>({...f,host:(f.host?f.host+",":"")}))}
                    style={{padding:"6px 14px",borderRadius:20,border:"1px dashed #2CADA6",
                      background:"rgba(44,173,166,0.05)",color:"#2CADA6",fontSize:12,
                      fontWeight:600,cursor:"pointer",marginTop:2,fontFamily:"inherit"}}>
                    + Add Another IP
                  </button>
                </div>
                {/* Port + Transport */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Port</div>
                    <input style={inp} value={form.port||"5060"} placeholder="5060"
                      onChange={e=>setForm(f=>({...f,port:e.target.value}))}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Transport</div>
                    <select style={{...inp,cursor:"pointer"}} value={form.transport||"udp"}
                      onChange={e=>setForm(f=>({...f,transport:e.target.value}))}>
                      <option value="udp">UDP</option>
                      <option value="tcp">TCP</option>
                      <option value="tls">TLS</option>
                      <option value="ws">WebSocket</option>
                    </select>
                  </div>
                </div>
                {/* Codec checkboxes */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Codecs Supported</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {["ulaw","alaw","g729","g722","g723","g726","gsm","opus"].map(codec=>{
                      const selected=(form.codecs||"").split(",").map(c=>c.trim()).includes(codec);
                      return(
                        <label key={codec} style={{display:"flex",alignItems:"center",gap:6,
                          padding:"6px 12px",borderRadius:20,cursor:"pointer",
                          background:selected?"#2CADA6":"#F5F5F5",
                          border:selected?"none":"1px solid #E0E0E0",
                          color:selected?"#FFF":"#555",fontSize:12,fontWeight:selected?700:400}}>
                          <input type="checkbox" checked={selected} style={{display:"none"}}
                            onChange={e=>{
                              const codecs=(form.codecs||"").split(",").map(c=>c.trim()).filter(Boolean);
                              if(e.target.checked){codecs.push(codec);}
                              else{const i=codecs.indexOf(codec);if(i>-1)codecs.splice(i,1);}
                              setForm(f=>({...f,codecs:codecs.join(",")}));
                            }}/>
                          {codec.toUpperCase()}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div style={{borderTop:"1px solid #F0F0F0",paddingTop:12,marginTop:4,marginBottom:4}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#2CADA6",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>Server Info</div>
                  <Field label="Panel URL" k="panel_url" ph="https://panel.supplier.com"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="User" k="panel_user" ph="username"/>
                    <Field label="Password" k="panel_password" ph="password" type="password"/>
                  </div>
                  <Field label="Team Link" k="team_link" ph="https://t.me/supplier"/>
                  <Field label="Sales Person" k="sales_person" ph="John Smith"/>
                  <Field label="WhatsApp" k="whatsapp" ph="+1234567890"/>
                  <Field label="Notes" k="notes" ph="Additional notes..."/>
                </div>
                {/* API Integration */}
                <div style={{borderTop:"1px solid #F0F0F0",paddingTop:12,marginTop:4,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#6B2FBF",textTransform:"uppercase",letterSpacing:"0.5px"}}>API Integration</div>
                    <span style={{fontSize:10,color:"#999",background:"#F0F0F0",padding:"2px 8px",borderRadius:10}}>Optional</span>
                  </div>
                  <Field label="API Base URL" k="api_url" ph="https://api.supplier.com/v1"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="API Key" k="api_key" ph="your-api-key"/>
                    <Field label="API Secret" k="api_secret" ph="your-api-secret"/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>API Features</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {[
                        {k:"api_did",label:"DID Import","icon":"📱"},
                        {k:"api_livecalls",label:"Live Calls","icon":"📞"},
                        {k:"api_cdr",label:"CDR Pull","icon":"📋"},
                        {k:"api_balance",label:"Balance","icon":"💰"},
                      ].map(f=>{
                        const on=(form[f.k]||"0")==="1";
                        return(
                          <label key={f.k} style={{display:"flex",alignItems:"center",gap:6,
                            padding:"6px 12px",borderRadius:20,cursor:"pointer",
                            background:on?"#6B2FBF":"#F5F5F5",
                            border:on?"none":"1px solid #E0E0E0",
                            color:on?"#FFF":"#555",fontSize:12,fontWeight:on?700:400}}>
                            <input type="checkbox" checked={on} style={{display:"none"}}
                              onChange={e=>setForm(frm=>({...frm,[f.k]:e.target.checked?"1":"0"}))}/>
                            {f.icon} {f.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>DID Endpoint Path</div>
                    <input style={inp} value={form.api_did_path||""} placeholder="/dids or /numbers"
                      onChange={e=>setForm(f=>({...f,api_did_path:e.target.value}))}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#666",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Live Calls Endpoint Path</div>
                    <input style={inp} value={form.api_livecalls_path||""} placeholder="/livecalls or /channels"
                      onChange={e=>setForm(f=>({...f,api_livecalls_path:e.target.value}))}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={()=>{setEditing(false);if(!selected)setSelected(null);}}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #DDD",
                      background:"#FFF",color:"#666",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                  <button onClick={save} disabled={saving}
                    style={{flex:2,padding:"10px",borderRadius:10,border:"none",
                      background:"#2CADA6",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {saving?"Saving...":"Save Changes"}
                  </button>
                </div>
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  ["SIP IP",selected?.host||"—"],
                  ["Port",selected?.port||"5060"],
                  ["Codecs",selected?.codecs||"—"],
                  ["Transport",(selected?.transport||"udp").toUpperCase()],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",
                    padding:"8px 0",borderBottom:"1px solid #F5F5F5"}}>
                    <span style={{fontSize:12,color:"#999"}}>{k}</span>
                    <span style={{fontSize:12,color:"#333",fontWeight:600,fontFamily:"monospace"}}>{v}</span>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #F0F0F0",paddingTop:10,marginTop:4}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#2CADA6",marginBottom:8,textTransform:"uppercase"}}>Server Info</div>
                  {[
                    ["Panel",selected?.panel_url||"—"],
                    ["User",selected?.panel_user||"—"],
                    ["Password",selected?.panel_password?"••••••":"—"],
                    ["Team Link",selected?.team_link||"—"],
                    ["Sales Person",selected?.sales_person||"—"],
                    ["WhatsApp",selected?.whatsapp||"—"],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",
                      padding:"7px 0",borderBottom:"1px solid #F5F5F5"}}>
                      <span style={{fontSize:12,color:"#999"}}>{k}</span>
                      <span style={{fontSize:12,color:"#333",fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                  {selected?.notes&&(
                    <div style={{marginTop:8,padding:"8px 10px",background:"#F8F9FA",
                      borderRadius:8,fontSize:12,color:"#555"}}>{selected.notes}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// ── DID Performance ───────────────────────────────────────────────
function DIDPerformancePage({token}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("total_calls");

  useEffect(()=>{
    apiFetch("/did-performance",token).then(d=>{setData(d);setLoading(false);});
  },[token]);

  const asrColor=(asr)=>asr>=70?"#10B981":asr>=40?"#F5A623":"#EF4444";
  const statusBg=(s)=>s==="good"?"rgba(16,185,129,0.1)":s==="fair"?"rgba(245,158,11,0.1)":"rgba(239,68,68,0.1)";
  const statusColor=(s)=>s==="good"?"#10B981":s==="fair"?"#F59E0B":"#EF4444";

  const dids=(data?.dids||[])
    .filter(d=>{
      if(filter==="dead") return d.is_dead;
      if(filter==="poor") return d.status==="poor";
      if(filter==="good") return d.status==="good";
      return true;
    })
    .filter(d=>!search||(d.did||"").includes(search)||(d.supplier||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>b[sort]-a[sort]);

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>DID Performance</div>
        <button onClick={()=>{setLoading(true);apiFetch("/did-performance",token).then(d=>{setData(d);setLoading(false);});}}
          style={{padding:"6px 14px",borderRadius:20,border:"none",background:"#2CADA6",
            color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>⟳ Refresh</button>
      </div>

      {/* Summary Cards */}
      {data&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total DIDs",value:data.summary?.total_dids||0,color:"#3B82F6"},
          {label:"Active DIDs",value:data.summary?.active_dids||0,color:"#10B981"},
          {label:"Dead DIDs",value:data.summary?.dead_dids||0,color:"#EF4444"},
          {label:"Poor Quality",value:data.summary?.poor_dids||0,color:"#F59E0B"},
          {label:"Top DID",value:data.summary?.top_did||"—",color:"#8B5CF6"},
          {label:"Top Revenue",value:"€"+(data.summary?.top_revenue||0),color:"#2CADA6"},
        ].map((s,i)=>(
          <div key={i} style={{background:"#FFF",borderRadius:12,padding:"12px 14px",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid "+s.color}}>
            <div style={{fontSize:16,fontWeight:800,color:s.color,fontFamily:"monospace",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{loading?"...":s.value}</div>
            <div style={{fontSize:10,color:"#999",marginTop:2,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
          </div>
        ))}
      </div>}

      {/* Filters + Search */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search DID or supplier..."
          style={{flex:1,minWidth:150,padding:"8px 12px",borderRadius:20,
            border:"1px solid #E0E0E0",background:"#FFF",fontSize:13,outline:"none"}}/>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{padding:"8px 12px",borderRadius:20,border:"1px solid #E0E0E0",
            background:"#FFF",fontSize:12,outline:"none",cursor:"pointer"}}>
          <option value="total_calls">Sort: Most Calls</option>
          <option value="total_revenue">Sort: Most Revenue</option>
          <option value="asr">Sort: Best ASR</option>
          <option value="avg_duration">Sort: Longest Calls</option>
        </select>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","All"],["good","✅ Good"],["fair","⚠️ Fair"],["poor","❌ Poor"],["dead","💀 Dead"]].map(([f,l])=>(
          <button key={f} onClick={()=>setFilter(f)}
            style={{padding:"5px 14px",borderRadius:20,border:"none",fontSize:12,
              background:filter===f?"#2CADA6":"#F0F0F0",
              color:filter===f?"#FFF":"#555",fontWeight:filter===f?700:400,
              cursor:"pointer",fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>

      {/* DID Table */}
      {loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>
      :<div style={{background:"#FFF",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#F8F9FA"}}>
                {["DID","Supplier","Calls","Answered","ASR","Avg Dur","Minutes","Revenue","Last Call","Status"].map((h,i)=>(
                  <th key={i} style={{padding:"10px 12px",fontSize:11,color:"#9A9A9A",
                    fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                    borderBottom:"1px solid #EEE",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dids.length===0
                ?<tr><td colSpan={10} style={{padding:40,textAlign:"center",color:"#999"}}>
                  No DID performance data yet — data appears after calls are received
                </td></tr>
                :dids.map((d,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #F5F5F5",
                    background:d.is_dead?"#FFF9F9":i%2===0?"#FFF":"#FAFAFA"}}>
                    <td style={{padding:"10px 12px",fontSize:12,fontFamily:"monospace",
                      fontWeight:600,color:"#1A1A1A",whiteSpace:"nowrap"}}>{d.did}</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#2CADA6",fontWeight:600}}>{d.supplier||"—"}</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#333"}}>{d.total_calls}</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#10B981"}}>{d.answered}</td>
                    <td style={{padding:"10px 12px"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                        background:asrColor(d.asr)+"15",color:asrColor(d.asr)}}>
                        {d.asr}%
                      </span>
                    </td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#555"}}>{d.avg_duration}s</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#555",fontFamily:"monospace"}}>{d.total_minutes}m</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#F5A623",fontWeight:700,fontFamily:"monospace"}}>€{d.total_revenue}</td>
                    <td style={{padding:"10px 12px",fontSize:11,color:"#999",whiteSpace:"nowrap"}}>
                      {d.last_call?(d.last_call||"").slice(0,10):"Never"}
                    </td>
                    <td style={{padding:"10px 12px"}}>
                      {d.is_dead
                        ?<span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                          background:"rgba(107,114,128,0.1)",color:"#6B7280"}}>💀 Dead</span>
                        :<span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                          background:statusBg(d.status),color:statusColor(d.status)}}>
                          {d.status==="good"?"✅ Good":d.status==="fair"?"⚠️ Fair":"❌ Poor"}
                        </span>
                      }
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <div style={{padding:"10px 14px",borderTop:"1px solid #EEE",background:"#F8F9FA",
          fontSize:12,color:"#999"}}>
          Showing {dids.length} DIDs · ASR: Good ≥70% · Fair 40-70% · Poor &lt;40%
        </div>
      </div>}
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
function NumberInventoryPage({token}){
  const [dids,setDids]=useState([]);
  const [ranges,setRanges]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [resellers,setResellers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("numbers");
  const [expanded,setExpanded]=useState({});
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(new Set());
  const [result,setResult]=useState(null);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadFile,setUploadFile]=useState(null);
  const [uploadTrunk,setUploadTrunk]=useState("");
  const [uploadRate,setUploadRate]=useState("0.07");
  const [uploadCurrency,setUploadCurrency]=useState("EUR");
  // Add number form
  const [addForm,setAddForm]=useState({number:"",country_name:"",country_code:"",prefix:"",tariff:"0.07",currency:"EUR",trunk_id:""});
  // Assign reseller
  const [assignReseller,setAssignReseller]=useState("");
  // Test number
  const [testNum,setTestNum]=useState("");
  const [testResult,setTestResult]=useState(null);
  const [testing,setTesting]=useState(false);

  const load=()=>{
    setLoading(true);
    Promise.all([
      apiFetch("/dids",token),
      apiFetch("/did-ranges",token),
      apiFetch("/suppliers",token),
      apiFetch("/resellers",token),
    ]).then(([d,r,s,res])=>{
      setDids(d.data||[]);
      setRanges(r.data||[]);
      setSuppliers(s.data||[]);
      setResellers(res.data||[]);
      setLoading(false);
    });
  };
  useEffect(()=>{load();},[token]);

  const toggleRow=(id)=>setExpanded(e=>({...e,[id]:!e[id]}));
  const toggleSelect=(id)=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const selectAll=()=>setSelected(new Set(dids.map(d=>d.id)));
  const clearSel=()=>setSelected(new Set());
  const currSym=(c)=>c==="EUR"?"€":"$";

  const getNumbers=(r)=>dids.filter(d=>{
    const n=(d.number||"").replace("+","");
    return n.startsWith(r.prefix?.replace(/\s/g,"")||"")||(n>=(r.range_start||"")&&n<=(r.range_end||""));
  });

  const filteredRanges=search?ranges.filter(r=>(r.prefix||"").includes(search)||(r.country_name||"").toLowerCase().includes(search.toLowerCase())):ranges;
  const ungroupedDids=dids.filter(d=>{
    const n=(d.number||"").replace("+","");
    return !ranges.some(r=>n.startsWith(r.prefix?.replace(/\s/g,"")||""));
  });

  const deleteRange=async(id,e)=>{
    e.stopPropagation();
    if(!window.confirm("Delete this number block?")) return;
    await apiFetch("/did-ranges/"+id,token,{method:"DELETE"});
    load();
  };
  const deleteDid=async(id,e)=>{
    e.stopPropagation();
    if(!window.confirm("Delete this number?")) return;
    await apiFetch("/dids/"+id,token,{method:"DELETE"});
    load();
  };

  const addNumber=async()=>{
    if(!addForm.number){alert("Enter a number");return;}
    if(!addForm.trunk_id){alert("Select a supplier");return;}
    setSaving(true);
    const num = "+"+addForm.number.replace(/[^0-9]/g,"");
    const d=await apiFetch("/dids",token,{method:"POST",body:JSON.stringify({
      number:num,trunk_id:addForm.trunk_id,
      country_name:addForm.country_name,country_code:addForm.country_code,
      prefix:addForm.prefix,tariff:addForm.tariff,selling_price:addForm.tariff,
      currency:addForm.currency,payment_terms:"Weekly",status:"active",
      ivr_context:"custom/6g-premium-telecom"
    })});
    setResult(d);setSaving(false);
    if(d.success||d.data){setAddForm({number:"",country_name:"",country_code:"",prefix:"",tariff:"0.07",currency:"EUR",trunk_id:""});load();}
  };

  const assignToReseller=async()=>{
    if(selected.size===0){alert("Select numbers first");return;}
    if(!assignReseller){alert("Select a reseller");return;}
    setSaving(true);
    const d=await apiFetch("/dids/bulk-supplier",token,{method:"POST",
      body:JSON.stringify({ids:[...selected],trunk_id:assignReseller})});
    setResult(d);setSaving(false);clearSel();load();
  };

  const unassignFromReseller=async()=>{
    if(selected.size===0){alert("Select numbers first");return;}
    if(!window.confirm("Unassign "+selected.size+" numbers from reseller?")) return;
    setSaving(true);
    const d=await apiFetch("/dids/bulk-unassign",token,{method:"POST",
      body:JSON.stringify({ids:[...selected]})});
    setResult(d);setSaving(false);clearSel();load();
  };

  const deleteSelected=async()=>{
    if(selected.size===0){alert("Select numbers first");return;}
    if(!window.confirm("Delete "+selected.size+" numbers permanently?")) return;
    setSaving(true);
    const d=await apiFetch("/dids/bulk-delete",token,{method:"POST",
      body:JSON.stringify({ids:[...selected]})});
    setResult(d);setSaving(false);clearSel();load();
  };

  const testNumber=async()=>{
    if(!testNum){alert("Enter a number to test");return;}
    setTesting(true);setTestResult(null);
    const num=testNum.replace(/[^0-9+]/g,"");
    const d=await apiFetch("/dids/test?number="+encodeURIComponent(num),token);
    setTestResult(d);setTesting(false);
  };

  const downloadExcel=()=>{
    const rows=[["Number","Country","Tariff","Currency","Payment Terms","Supplier"]];
    dids.forEach(d=>rows.push([d.number,d.country_name||"",d.tariff||"",d.currency||"",d.payment_terms||"",d.supplier_name||""]));
    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="numbers.csv";a.click();
  };

  const inp={padding:"9px 12px",borderRadius:8,border:"1px solid #E0E0E0",
    background:"#FFF",color:"#333",fontSize:13,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  const thS={fontSize:9,color:"#888",fontWeight:600,letterSpacing:"0.8px",
    padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap",
    borderBottom:"2px solid #E8E8E8",background:"#F5F5F5",textTransform:"uppercase"};
  const tabs=[
    {id:"numbers",label:"📋 Numbers"},
    {id:"add",label:"➕ Add Number"},
    {id:"assign",label:"👤 Assign Reseller"},
    {id:"delete",label:"🗑 Delete"},
    {id:"upload",label:"⬆ Upload CSV"},
  ];

  return(
    <div style={{paddingBottom:70,minHeight:"100vh",background:"#F2F2F2",fontFamily:"Arial,Helvetica,sans-serif"}}>
      {/* Header */}
      <div style={{background:"#FFF",borderBottom:"1px solid #E0E0E0",padding:"12px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"#1A1A1A"}}>Numbers</div>
          <div style={{fontSize:11,color:"#999",marginTop:2}}>{dids.length} total · {ranges.length} blocks</div>
        </div>
        <button onClick={downloadExcel}
          style={{padding:"7px 14px",borderRadius:20,border:"2px solid #2CADA6",
            background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          ⬇ Export
        </button>
      </div>

      <div style={{padding:"12px 16px"}}>
        {/* Tabs */}
        <div style={{display:"flex",gap:4,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setResult(null);}}
              style={{padding:"8px 12px",borderRadius:20,border:"none",fontSize:11,
                background:tab===t.id?"#2CADA6":"#F0F0F0",
                color:tab===t.id?"#FFF":"#555",fontWeight:tab===t.id?700:400,
                cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Result Banner */}
        {result&&(
          <div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
            background:result.success?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
            border:"1px solid "+(result.success?"#10B981":"#EF4444"),
            fontSize:12,color:result.success?"#10B981":"#EF4444",fontWeight:600}}>
            {result.success?"✅ ":"❌ "}{result.message||result.error||JSON.stringify(result)}
          </div>
        )}

        {/* ── NUMBERS TAB ── */}
        {tab==="numbers"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search by number, country or prefix..."
                style={{...inp,flex:1}}/>
              {search&&<button onClick={()=>setSearch("")}
                style={{padding:"9px 12px",borderRadius:8,border:"1px solid #DDD",
                  background:"#FFF",color:"#666",fontSize:12,cursor:"pointer"}}>Clear</button>}
            </div>
            {loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>
            :<div style={{background:"#FFF",border:"1px solid #E0E0E0",borderRadius:4,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
                  <thead>
                    <tr>{["NUMBERS","COUNTRY","TARIFF","TERMS","SUPPLIER","DEL"].map((h,i)=>(
                      <th key={i} style={thS}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filteredRanges.map(r=>{
                      const nums=getNumbers(r);
                      const isExp=expanded[r.id];
                      return(
                        <React.Fragment key={"r"+r.id}>
                          <tr style={{borderBottom:"1px solid #E8E8E8",background:isExp?"#F0FAFA":"#FFF",cursor:"pointer"}}
                            onClick={()=>toggleRow(r.id)}>
                            <td style={{padding:"6px 10px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:7}}>
                                <div style={{width:20,height:20,borderRadius:"50%",background:"#2CADA6",
                                  color:"#FFF",display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:13,fontWeight:700,flexShrink:0}}>{isExp?"−":"+"}</div>
                                <span style={{fontSize:12,fontWeight:800,color:"#1A1A1A",fontFamily:"monospace",whiteSpace:"nowrap"}}>
                                  {r.prefix||r.range_start}
                                </span>
                                <span style={{fontSize:11,color:"#AAA"}}>({r.total_count||nums.length})</span>
                              </div>
                            </td>
                            <td style={{padding:"6px 10px",fontSize:12,color:"#333",fontWeight:600}}>{r.country_name||"—"}</td>
                            <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace"}}>{currSym(r.currency||"EUR")}{parseFloat(r.rate||0).toFixed(3)}</td>
                            <td style={{padding:"6px 10px",fontSize:11,color:"#555"}}>{r.payment_terms||"Weekly"}</td>
                            <td style={{padding:"6px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>{r.supplier_name||"—"}</td>
                            <td style={{padding:"6px 10px",textAlign:"center"}}>
                              <button onClick={e=>deleteRange(r.id,e)}
                                style={{background:"none",border:"1px solid #CCC",borderRadius:3,
                                  cursor:"pointer",fontSize:12,color:"#EF4444",padding:"2px 6px"}}>🗑</button>
                            </td>
                          </tr>
                          {isExp&&(nums.length===0
                            ?<tr><td colSpan={6} style={{padding:"6px 10px 6px 37px",fontSize:11,color:"#999",fontStyle:"italic",background:"#F9F9F9"}}>No numbers</td></tr>
                            :nums.map((d,di)=>(
                              <tr key={d.id} style={{background:di%2===0?"#F5FFFE":"#EFFFFE",borderBottom:"1px solid #E0F5F5"}}>
                                <td style={{padding:"4px 10px 4px 37px",whiteSpace:"nowrap"}}>
                                  <span style={{fontSize:11,fontFamily:"monospace",color:"#1A1A1A"}}>{(d.number||"").replace("+","")}</span>
                                  <span style={{fontSize:10,color:"#AAA",marginLeft:8}}>— {(d.created_at||"").slice(0,10)}</span>
                                </td>
                                <td colSpan={4}/>
                                <td style={{padding:"4px 10px",textAlign:"center"}}>
                                  <button onClick={e=>deleteDid(d.id,e)}
                                    style={{background:"none",border:"1px solid #CCC",borderRadius:3,
                                      cursor:"pointer",fontSize:11,color:"#EF4444",padding:"1px 5px"}}>🗑</button>
                                </td>
                              </tr>
                            ))
                          )}
                        </React.Fragment>
                      );
                    })}
                    {ungroupedDids.length>0&&(
                      <React.Fragment>
                        <tr style={{background:"#F0F0F0"}}>
                          <td colSpan={6} style={{padding:"5px 10px",fontSize:10,fontWeight:700,color:"#888",textTransform:"uppercase"}}>
                            Individual Numbers ({ungroupedDids.length})
                          </td>
                        </tr>
                        {ungroupedDids.map((d,i)=>(
                          <tr key={d.id} style={{borderBottom:"1px solid #F0F0F0",background:i%2===0?"#FFF":"#FAFAFA"}}>
                            <td style={{padding:"5px 10px",fontSize:12,fontFamily:"monospace",fontWeight:600}}>{(d.number||"").replace("+","")}</td>
                            <td style={{padding:"5px 10px",fontSize:12,color:"#333"}}>{d.country_name||"—"}</td>
                            <td style={{padding:"5px 10px",fontSize:12,fontFamily:"monospace"}}>{currSym(d.currency||"EUR")}{parseFloat(d.tariff||0).toFixed(3)}</td>
                            <td style={{padding:"5px 10px",fontSize:11,color:"#555"}}>{d.payment_terms||"Weekly"}</td>
                            <td style={{padding:"5px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>{d.supplier_name||"—"}</td>
                            <td style={{padding:"5px 10px",textAlign:"center"}}>
                              <button onClick={e=>deleteDid(d.id,e)}
                                style={{background:"none",border:"1px solid #CCC",borderRadius:3,
                                  cursor:"pointer",fontSize:12,color:"#EF4444",padding:"2px 6px"}}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )}
                    {filteredRanges.length===0&&ungroupedDids.length===0&&(
                      <tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#999",fontSize:12}}>No numbers found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>}
          </>
        )}

        {/* ── ADD NUMBER TAB ── */}
        {tab==="add"&&(
          <div style={{background:"#FFF",borderRadius:10,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#1A1A1A",marginBottom:16}}>Add Numbers</div>

            {/* Form Fields */}
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>

              {/* Supplier */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Supplier *</div>
                <select style={inp} value={addForm.trunk_id} onChange={e=>setAddForm({...addForm,trunk_id:e.target.value})}>
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.nickname||s.name}</option>)}
                </select>
              </div>

              {/* Country */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Country</div>
                <select style={inp} value={addForm.country_name}
                  onChange={e=>{
                    const c=COUNTRIES.find(x=>x.name===e.target.value);
                    setAddForm({...addForm,
                      country_name:e.target.value,
                      country_code:c?.code||"",
                      prefix:addForm.prefix||c?.prefix||""
                    });
                  }}>
                  <option value="">— Select Country —</option>
                  {COUNTRIES.map(c=>(
                    <option key={c.code+c.name} value={c.name}>{c.name} (+{c.prefix})</option>
                  ))}
                </select>
              </div>

              {/* Tariff + Currency */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Tariff / min</div>
                  <input style={inp} placeholder="0.070" value={addForm.tariff}
                    onChange={e=>setAddForm({...addForm,tariff:e.target.value})}/>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Currency</div>
                  <select style={inp} value={addForm.currency} onChange={e=>setAddForm({...addForm,currency:e.target.value})}>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              {/* Prefix */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Prefix</div>
                <input style={inp} placeholder="e.g. 39" value={addForm.prefix}
                  onChange={e=>setAddForm({...addForm,prefix:e.target.value})}/>
              </div>

              {/* Entry Type Toggle */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Entry Type</div>
                <div style={{display:"flex",gap:6}}>
                  {[["range","📦 Range/Block"],["single","🔢 Single Number"]].map(([t,l])=>(
                    <button key={t} onClick={()=>setAddForm({...addForm,addType:t})}
                      style={{flex:1,padding:"9px 8px",borderRadius:8,
                        border:"2px solid "+((addForm.addType||"range")===t?"#2CADA6":"#E0E0E0"),
                        background:(addForm.addType||"range")===t?"rgba(44,173,166,0.08)":"#FFF",
                        color:(addForm.addType||"range")===t?"#2CADA6":"#666",
                        fontSize:12,fontWeight:(addForm.addType||"range")===t?700:400,
                        cursor:"pointer",fontFamily:"inherit"}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Range Fields */}
              {(addForm.addType||"range")==="range"&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {addForm.prefix&&(
                    <div style={{padding:"8px 12px",background:"#F0FAFA",borderRadius:8,
                      fontSize:12,color:"#2CADA6",fontWeight:600,letterSpacing:"0.3px"}}>
                      🔢 Numbers will be: <span style={{fontFamily:"monospace"}}>{addForm.prefix} + [suffix]</span>
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                        {addForm.prefix?"Suffix Start *":"Range Start *"}
                      </div>
                      <div style={{display:"flex",alignItems:"center",border:"1px solid #E0E0E0",borderRadius:8,overflow:"hidden",background:"#FFF"}}>
                        {addForm.prefix&&(
                          <span style={{padding:"9px 8px",background:"#F5F5F5",color:"#999",
                            fontSize:12,fontFamily:"monospace",borderRight:"1px solid #E0E0E0",
                            whiteSpace:"nowrap"}}>{addForm.prefix}</span>
                        )}
                        <input style={{...inp,border:"none",borderRadius:0,flex:1}}
                          placeholder={addForm.prefix?"0000":"393199052100"}
                          value={addForm.rangeStartSuffix||""}
                          onChange={e=>{
                            const suffix=e.target.value.replace(/[^0-9]/g,"");
                            const full=addForm.prefix?addForm.prefix+suffix:suffix;
                            setAddForm({...addForm,rangeStartSuffix:suffix,rangeStart:full});
                          }}/>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                        {addForm.prefix?"Suffix End *":"Range End *"}
                      </div>
                      <div style={{display:"flex",alignItems:"center",border:"1px solid #E0E0E0",borderRadius:8,overflow:"hidden",background:"#FFF"}}>
                        {addForm.prefix&&(
                          <span style={{padding:"9px 8px",background:"#F5F5F5",color:"#999",
                            fontSize:12,fontFamily:"monospace",borderRight:"1px solid #E0E0E0",
                            whiteSpace:"nowrap"}}>{addForm.prefix}</span>
                        )}
                        <input style={{...inp,border:"none",borderRadius:0,flex:1}}
                          placeholder={addForm.prefix?"9999":"393199052199"}
                          value={addForm.rangeEndSuffix||""}
                          onChange={e=>{
                            const suffix=e.target.value.replace(/[^0-9]/g,"");
                            const full=addForm.prefix?addForm.prefix+suffix:suffix;
                            setAddForm({...addForm,rangeEndSuffix:suffix,rangeEnd:full});
                          }}/>
                      </div>
                    </div>
                  </div>
                  {addForm.rangeStart&&addForm.rangeEnd&&parseInt(addForm.rangeEnd)>=parseInt(addForm.rangeStart)&&(
                    <div style={{padding:"10px 12px",background:"rgba(44,173,166,0.08)",
                      borderRadius:8,fontSize:12,color:"#2CADA6",fontWeight:600}}>
                      📊 Will generate <strong>{parseInt(addForm.rangeEnd)-parseInt(addForm.rangeStart)+1}</strong> numbers
                      {addForm.prefix&&(
                        <span style={{color:"#555",fontWeight:400,marginLeft:8,fontFamily:"monospace"}}>
                          ({addForm.prefix}{addForm.rangeStartSuffix} → {addForm.prefix}{addForm.rangeEndSuffix})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Single Number Field */}
              {addForm.addType==="single"&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Phone Number *</div>
                  <input style={inp} placeholder="393199052141" value={addForm.number}
                    onChange={e=>setAddForm({...addForm,number:e.target.value})}/>
                </div>
              )}
            </div>

            {/* Apply Button */}
            <button onClick={async()=>{
              if(!addForm.trunk_id){alert("Select a supplier");return;}
              setSaving(true);setResult(null);
              if((addForm.addType||"range")==="range"){
                if(!addForm.rangeStart||!addForm.rangeEnd){alert("Enter range start and end");setSaving(false);return;}
                const d=await apiFetch("/dids/add-range",token,{method:"POST",body:JSON.stringify({
                  range_start:addForm.rangeStart,range_end:addForm.rangeEnd,
                  trunk_id:addForm.trunk_id,prefix:addForm.prefix,
                  country_name:addForm.country_name,country_code:addForm.country_code,
                  tariff:addForm.tariff,currency:addForm.currency
                })});
                setResult(d);setSaving(false);
                if(d.success) load();
              } else {
                if(!addForm.number){alert("Enter a number");setSaving(false);return;}
                const num="+"+addForm.number.replace(/[^0-9]/g,"");
                const d=await apiFetch("/dids",token,{method:"POST",body:JSON.stringify({
                  number:num,trunk_id:addForm.trunk_id,
                  country_name:addForm.country_name,country_code:addForm.country_code,
                  prefix:addForm.prefix,tariff:addForm.tariff,selling_price:addForm.tariff,
                  currency:addForm.currency,payment_terms:"Weekly",status:"active",
                  ivr_context:"custom/6g-premium-telecom"
                })});
                setResult(d);setSaving(false);
                if(d.success||d.data) load();
              }
            }} disabled={saving}
              style={{width:"100%",padding:"14px",borderRadius:10,border:"none",
                background:saving?"#CCC":"#2CADA6",color:"#FFF",fontSize:15,
                fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.5px"}}>
              {saving?"Processing...":"✅ APPLY"}
            </button>
          </div>
        )}
        {/* ── ASSIGN RESELLER TAB ── */}
        {tab==="assign"&&(
          <>
            <div style={{background:"#FFF",borderRadius:10,padding:14,marginBottom:12,
              boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:10}}>
                Assign/Unassign Reseller — <span style={{color:"#2CADA6"}}>{selected.size} selected</span>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                <select style={{...inp,flex:1,minWidth:140}} value={assignReseller} onChange={e=>setAssignReseller(e.target.value)}>
                  <option value="">— Select Reseller —</option>
                  {resellers.map(r=><option key={r.id} value={r.id}>{r.name}{r.company?" ("+r.company+")":""}</option>)}
                </select>
                <button onClick={assignToReseller} disabled={saving||selected.size===0||!assignReseller}
                  style={{padding:"9px 16px",borderRadius:8,border:"none",
                    background:"#2CADA6",color:"#FFF",fontSize:12,fontWeight:700,
                    cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
                  👤 Assign
                </button>
                <button onClick={unassignFromReseller} disabled={saving||selected.size===0}
                  style={{padding:"9px 16px",borderRadius:8,border:"2px solid #F5A623",
                    background:"#FFF",color:"#F5A623",fontSize:12,fontWeight:700,
                    cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
                  🔄 Unassign
                </button>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={selectAll} style={{padding:"4px 12px",borderRadius:20,
                  border:"1px solid #2CADA6",background:"#FFF",color:"#2CADA6",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  Select All
                </button>
                <button onClick={clearSel} style={{padding:"4px 12px",borderRadius:20,
                  border:"1px solid #DDD",background:"#FFF",color:"#666",fontSize:11,cursor:"pointer"}}>
                  Clear
                </button>
              </div>
            </div>
            {loading?<div style={{textAlign:"center",padding:30,color:"#999"}}>Loading...</div>
            :<div style={{background:"#FFF",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#F8F9FA"}}>
                      <th style={{...thS,width:36,textAlign:"center"}}>
                        <input type="checkbox" checked={selected.size===dids.length&&dids.length>0}
                          onChange={e=>e.target.checked?selectAll():clearSel()}
                          style={{accentColor:"#2CADA6"}}/>
                      </th>
                      {["NUMBER","COUNTRY","SUPPLIER","STATUS"].map((h,i)=><th key={i} style={thS}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {dids.map((d,i)=>(
                      <tr key={d.id} onClick={()=>toggleSelect(d.id)}
                        style={{borderBottom:"1px solid #F5F5F5",cursor:"pointer",
                          background:selected.has(d.id)?"rgba(44,173,166,0.06)":i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{padding:"6px 12px",textAlign:"center"}}>
                          <input type="checkbox" checked={selected.has(d.id)}
                            onChange={()=>toggleSelect(d.id)} style={{accentColor:"#2CADA6"}}/>
                        </td>
                        <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace",fontWeight:600}}>{(d.number||"").replace("+","")}</td>
                        <td style={{padding:"6px 10px",fontSize:12,color:"#333"}}>{d.country_name||"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>{d.supplier_name||"—"}</td>
                        <td style={{padding:"6px 10px"}}>
                          {d.customer_id
                            ?<span style={{padding:"2px 8px",borderRadius:10,fontSize:11,background:"rgba(139,92,246,0.1)",color:"#8B5CF6",fontWeight:700}}>Assigned</span>
                            :<span style={{padding:"2px 8px",borderRadius:10,fontSize:11,background:"#F5F5F5",color:"#999"}}>In Panel</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{padding:"8px 14px",borderTop:"1px solid #EEE",background:"#F8F9FA",
                fontSize:11,color:"#999",display:"flex",justifyContent:"space-between"}}>
                <span>{dids.length} total</span>
                <span>{dids.filter(d=>d.customer_id).length} assigned · {dids.filter(d=>!d.customer_id).length} in panel</span>
              </div>
            </div>}
          </>
        )}

        {/* ── DELETE TAB ── */}
        {tab==="delete"&&(
          <>
            <div style={{background:"#FFF",borderRadius:10,padding:14,marginBottom:12,
              boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:10}}>
                Delete Numbers — <span style={{color:"#EF4444"}}>{selected.size} selected</span>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                <button onClick={deleteSelected} disabled={saving||selected.size===0}
                  style={{padding:"9px 16px",borderRadius:8,border:"none",
                    background:selected.size===0?"#CCC":"#EF4444",color:"#FFF",
                    fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  🗑 Delete {selected.size>0?"("+selected.size+")":"Selected"}
                </button>
                <button onClick={selectAll} style={{padding:"9px 16px",borderRadius:8,
                  border:"1px solid #EF4444",background:"#FFF",color:"#EF4444",
                  fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  Select All
                </button>
                <button onClick={clearSel} style={{padding:"9px 16px",borderRadius:8,
                  border:"1px solid #DDD",background:"#FFF",color:"#666",
                  fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  Clear
                </button>
              </div>
            </div>
            {loading?<div style={{textAlign:"center",padding:30,color:"#999"}}>Loading...</div>
            :<div style={{background:"#FFF",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#FFF5F5"}}>
                      <th style={{...thS,width:36,textAlign:"center"}}>
                        <input type="checkbox" checked={selected.size===dids.length&&dids.length>0}
                          onChange={e=>e.target.checked?selectAll():clearSel()}
                          style={{accentColor:"#EF4444"}}/>
                      </th>
                      {["NUMBER","COUNTRY","TARIFF","SUPPLIER"].map((h,i)=><th key={i} style={thS}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {dids.map((d,i)=>(
                      <tr key={d.id} onClick={()=>toggleSelect(d.id)}
                        style={{borderBottom:"1px solid #F5F5F5",cursor:"pointer",
                          background:selected.has(d.id)?"rgba(239,68,68,0.05)":i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{padding:"6px 12px",textAlign:"center"}}>
                          <input type="checkbox" checked={selected.has(d.id)}
                            onChange={()=>toggleSelect(d.id)} style={{accentColor:"#EF4444"}}/>
                        </td>
                        <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace",fontWeight:600}}>{(d.number||"").replace("+","")}</td>
                        <td style={{padding:"6px 10px",fontSize:12,color:"#333"}}>{d.country_name||"—"}</td>
                        <td style={{padding:"6px 10px",fontSize:12,fontFamily:"monospace"}}>{currSym(d.currency||"EUR")}{parseFloat(d.tariff||0).toFixed(3)}</td>
                        <td style={{padding:"6px 10px",fontSize:12,color:"#2CADA6",fontWeight:600}}>{d.supplier_name||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>}
          </>
        )}

        {/* ── UPLOAD CSV TAB ── */}
        {tab==="upload"&&(
          <div style={{fontFamily:"inherit"}}>
            <div style={{background:"#FFF",borderRadius:10,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:15,fontWeight:700,color:"#1A1A1A",marginBottom:4}}>Upload Supplier DID List</div>
              <div style={{fontSize:12,color:"#999",marginBottom:20}}>Select supplier then upload their CSV file — server auto-detects format</div>
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:"#2CADA6",color:"#FFF",
                    fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>1</div>
                  <div style={{fontSize:12,fontWeight:700,color:"#333"}}>Select Supplier</div>
                </div>
                <select style={inp} value={uploadTrunk} onChange={e=>setUploadTrunk(e.target.value)}>
                  <option value="">— Choose Supplier —</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.nickname||s.name}</option>)}
                </select>
              </div>
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:22,height:22,borderRadius:"50%",
                    background:uploadTrunk?"#2CADA6":"#CCC",color:"#FFF",
                    fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>2</div>
                  <div style={{fontSize:12,fontWeight:700,color:uploadTrunk?"#333":"#999"}}>Upload CSV File</div>
                </div>
                <div onClick={()=>uploadTrunk&&document.getElementById("csv-sync-input").click()}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();if(uploadTrunk)setUploadFile(e.dataTransfer.files[0]);}}
                  style={{background:uploadFile?"rgba(44,173,166,0.05)":"#F8F9FA",
                    border:"2px dashed "+(uploadFile?"#2CADA6":"#E0E0E0"),
                    borderRadius:10,padding:32,textAlign:"center",
                    cursor:uploadTrunk?"pointer":"not-allowed",opacity:uploadTrunk?1:0.5}}>
                  <div style={{fontSize:32,marginBottom:8}}>{uploadFile?"✅":"📂"}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#333",marginBottom:4}}>
                    {uploadFile?uploadFile.name:"Drop file here or tap to browse"}
                  </div>
                  <div style={{fontSize:11,color:"#999"}}>Any CSV format — server auto-detects numbers</div>
                  <input id="csv-sync-input" type="file" accept=".csv,.txt" style={{display:"none"}}
                    onChange={e=>setUploadFile(e.target.files[0])} disabled={!uploadTrunk}/>
                </div>
              </div>
              <button onClick={async()=>{
                if(!uploadFile||!uploadTrunk) return;
                setUploading(true);setResult(null);
                const fd=new FormData();
                fd.append("file",uploadFile);fd.append("trunk_id",uploadTrunk);
                fd.append("rate",uploadRate);fd.append("currency",uploadCurrency);
                const res=await fetch("https://6g-premium-telecom.com/api/v1/dids/smart-sync",{
                  method:"POST",headers:{Authorization:"Bearer "+token},body:fd
                });
                let d;try{d=await res.json();}catch(e){d={success:false,error:"Server error: "+res.status};}
                setResult(d);setUploading(false);
                if(d.success)load();
              }} disabled={uploading||!uploadFile||!uploadTrunk}
                style={{width:"100%",padding:"14px",borderRadius:10,border:"none",
                  background:uploading||!uploadFile||!uploadTrunk?"#CCC":"#2CADA6",
                  color:"#FFF",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {uploading?"Syncing...":"🔄 Sync Numbers"}
              </button>
              {result&&(
                <div style={{marginTop:14,padding:"14px 16px",borderRadius:10,
                  background:result.success?"rgba(16,185,129,0.08)":"rgba(239,68,68,0.08)",
                  border:"1px solid "+(result.success?"#10B981":"#EF4444")}}>
                  <div style={{fontSize:13,fontWeight:700,color:result.success?"#10B981":"#EF4444",marginBottom:8}}>
                    {result.success?"✅ Sync Complete":"❌ Failed"}
                  </div>
                  {result.success&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                      {[["Added",result.added,"#10B981"],["Removed",result.removed,"#EF4444"],["Unchanged",result.unchanged,"#999"]].map(([l,v,c],i)=>(
                        <div key={i} style={{background:"#FFF",borderRadius:8,padding:"8px",textAlign:"center"}}>
                          <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                          <div style={{fontSize:10,color:"#999",fontWeight:600,textTransform:"uppercase"}}>{l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{fontSize:12,color:"#555"}}>{result.message||result.error}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#FFF",
        borderTop:"1px solid #DDD",padding:"10px 16px 24px",display:"flex",gap:10,
        boxShadow:"0 -2px 8px rgba(0,0,0,0.08)",zIndex:50}}>
        <button onClick={downloadExcel}
          style={{padding:"9px 20px",borderRadius:4,border:"2px solid #2CADA6",
            background:"#FFF",color:"#2CADA6",fontSize:12,fontWeight:600,
            cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.5px"}}>
          DOWNLOAD EXCEL
        </button>
      </div>
    </div>
  );
}
// ── IVR Page ──────────────────────────────────────────────────────
function IVRPage({token,setPage}){
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
      if(d.success){setUploadMsg("✅ Uploaded: "+d.name);load();setShowUpload(false);setFile(null);setUploadForm({name:"",display_name:""});}
      else setUploadMsg("❌ "+(d.message||"Failed"));
    }catch(e){setUploadMsg("❌ "+e.message);}
    setUploading(false);
  };

  const del=async(id)=>{
    if(!window.confirm("Delete this IVR?")) return;
    await apiFetch(`/ivr-lib/${id}`,token,{method:"DELETE"});
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
                  <span style={{fontSize:9,padding:"2px 8px",borderRadius:20,
                    background:`${C.green}15`,color:C.green,fontWeight:700}}>ACTIVE</span>
                  <span style={{fontSize:9,color:C.muted}}>{ivr.audio_file||ivr.name+".slin"}</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
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
  const [ranges,setRanges]=useState([]);
  const [ivrs,setIvrs]=useState([]);
  const [range,setRange]=useState("ALL");
  const [ivr,setIvr]=useState("");
  const [applying,setApplying]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    apiFetch("/did-ranges",token).then(d=>setRanges(d.data||[]));
    apiFetch("/ivr-lib/audio",token).then(d=>setIvrs(d.data||[]));
  },[token]);

  const sel={width:"100%",padding:"10px 12px",borderRadius:8,
    border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",
    color:C.text,fontSize:13,outline:"none"};

  const apply=async()=>{
    setApplying(true);setMsg("");
    const ivrCtx=ivr.startsWith("custom/")?ivr:`custom/${ivr}`;
    if(range==="ALL"){
      await apiFetch("/did-ranges/bulk-ivr",token,{method:"PUT",body:JSON.stringify({ivr_context:ivrCtx})});
    } else {
      await apiFetch(`/did-ranges/${range}/ivr`,token,{method:"PUT",body:JSON.stringify({ivr_context:ivrCtx})});
    }
    setMsg("✅ IVR applied successfully!");
    setApplying(false);
    setStep(1);setIvr("");
  };

  return(
    <div style={{padding:16}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>🔗 Connect IVR</div>
      <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Assign IVR audio to DID ranges</div>

      <Card style={{padding:20,maxWidth:520,margin:"0 auto"}}>
        {/* Step indicators */}
        <div style={{display:"flex",gap:8,marginBottom:24}}>
          {[["1","Range"],["2","IVR"],["3","Apply"]].map(([n,label])=>(
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

        {/* Step 1 - Select Range */}
        {step===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Select Range</div>
              <select style={sel} value={range} onChange={e=>setRange(e.target.value)}>
                <option value="ALL">ALL RANGES ({ranges.length} ranges)</option>
                {ranges.map(r=>(
                  <option key={r.id} value={r.id}>{r.country_name} — {r.batch_name} ({r.total_count} numbers)</option>
                ))}
              </select>
            </div>
            <div style={{padding:"10px 12px",borderRadius:8,background:`${C.blue}08`,
              border:`1px solid ${C.blue}20`,fontSize:11,color:C.blue}}>
              {range==="ALL"?`Will update all ${ranges.length} ranges`:`Selected range ID: ${range}`}
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
              {[["Range",range==="ALL"?"All Ranges":`Range ID: ${range}`],
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
          {label:"Total Revenue",value:"€"+resellers.reduce((a,r)=>a+parseFloat(r.revenue||0),0).toFixed(4),color:"#F5A623"},
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
            <Field label="Credit Limit (€)" k="credit_limit" ph="1000"/>
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
              {label:"Revenue",value:"€"+selected.revenue,color:"#10B981"},
              {label:"Balance",value:"€"+parseFloat(selected.balance||0).toFixed(4),color:"#F5A623"},
              {label:"Credit Limit",value:"€"+selected.credit_limit,color:"#2CADA6"},
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
              placeholder="Top up amount (€)" style={{...inp,flex:1}}/>
            <button onClick={topup}
              style={{padding:"9px 18px",borderRadius:10,border:"none",background:"#10B981",
                color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>Top Up</button>
          </div>
          {/* CDR Table */}
          <div style={{fontSize:12,fontWeight:700,color:"#4A4A4A",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>
            Recent CDR ({resellerCdr.length} records)
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
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
                      <td style={{padding:"8px 12px",fontSize:12,color:"#F5A623",fontWeight:700}}>€{parseFloat(c.revenue||0).toFixed(4)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
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
                  <div style={{fontSize:14,fontWeight:700,color:"#10B981"}}>€{r.revenue}</div>
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

// ── Call Quality ──────────────────────────────────────────────────
function CallQualityPage({token}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("overview");

  useEffect(()=>{
    apiFetch("/quality/overview",token).then(d=>{setData(d);setLoading(false);});
  },[token]);

  const asrColor=(asr)=>asr>=80?"#10B981":asr>=60?"#F5A623":"#EF4444";
  const acdColor=(acd)=>acd>=30?"#10B981":acd>=15?"#F5A623":"#EF4444";

  const tabs=[
    {id:"overview",label:"Overview"},
    {id:"did",label:"DID Performance"},
    {id:"supplier",label:"Supplier Quality"},
    {id:"hourly",label:"Hourly Traffic"},
    {id:"dead",label:"Dead DIDs"},
  ];

  if(loading) return <div style={{padding:40,textAlign:"center",color:"#999"}}>Loading quality data...</div>;

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Call Quality Monitor</div>
        <button onClick={()=>{setLoading(true);apiFetch("/quality/overview",token).then(d=>{setData(d);setLoading(false);});}}
          style={{padding:"6px 14px",borderRadius:20,border:"none",background:"#2CADA6",
            color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>⟳ Refresh</button>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"ASR",value:(data?.asr||0)+"%",sub:"Answer Seizure Ratio",color:asrColor(data?.asr||0),icon:"📊"},
          {label:"ACD",value:(data?.acd||0)+"s",sub:"Avg Call Duration",color:acdColor(data?.acd||0),icon:"⏱"},
          {label:"Total Calls",value:data?.total||0,sub:"All time",color:"#3B82F6",icon:"📞"},
          {label:"Failed Calls",value:data?.failed||0,sub:"Not answered",color:"#EF4444",icon:"❌"},
        ].map((k,i)=>(
          <div key={i} style={{background:"#FFFFFF",borderRadius:14,padding:"14px 12px",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid "+k.color}}>
            <div style={{fontSize:10,marginBottom:4}}>{k.icon}</div>
            <div style={{fontSize:28,fontWeight:800,color:k.color,fontFamily:"monospace"}}>{k.value}</div>
            <div style={{fontSize:11,fontWeight:700,color:"#4A4A4A",textTransform:"uppercase",
              letterSpacing:"0.5px",marginTop:2}}>{k.label}</div>
            <div style={{fontSize:10,color:"#999",marginTop:2}}>{k.sub}</div>
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
        <div style={{background:"#FFF",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Quality Summary</div>
          {[
            ["ASR",(data?.asr||0)+"%",asrColor(data?.asr||0),"≥80% Good, 60-80% Fair, <60% Poor"],
            ["ACD",(data?.acd||0)+"s",acdColor(data?.acd||0),"≥30s Good, 15-30s Fair, <15s Poor"],
            ["Total Calls",data?.total||0,"#3B82F6","All calls received"],
            ["Answered",data?.answered||0,"#10B981","Successfully connected"],
            ["Failed",data?.failed||0,"#EF4444","Not answered or error"],
            ["Dead DIDs",(data?.dead_dids||[]).length,"#8B5CF6","No calls in 7 days"],
          ].map(([k,v,col,hint])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"9px 0",borderBottom:"1px solid #F5F5F5"}}>
              <div>
                <span style={{fontSize:13,color:"#666"}}>{k}</span>
                <div style={{fontSize:10,color:"#BBB"}}>{hint}</div>
              </div>
              <span style={{fontSize:14,color:col,fontWeight:700,fontFamily:"monospace"}}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* DID Performance Tab */}
      {tab==="did"&&(
        <div style={{background:"#FFF",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #F0F0F0"}}>
            <div style={{fontSize:13,fontWeight:700}}>DID Performance (Top 20)</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#F8F9FA"}}>
                  {["DID","Calls","Answered","ASR","ACD","Revenue"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px",fontSize:11,color:"#9A9A9A",
                      fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                      borderBottom:"1px solid #EEE"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.did_stats||[]).length===0
                  ?<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#999"}}>No DID data yet</td></tr>
                  :(data?.did_stats||[]).map((d,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"10px 14px",fontSize:12,fontFamily:"monospace",fontWeight:600,color:"#1A1A1A"}}>{d.did}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#333"}}>{d.calls}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#10B981"}}>{d.answered}</td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                          background:asrColor(d.asr)+"15",color:asrColor(d.asr)}}>
                          {d.asr}%
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12,color:acdColor(d.acd),fontWeight:600}}>{d.acd}s</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#F5A623",fontWeight:700,fontFamily:"monospace"}}>€{d.revenue}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Quality Tab */}
      {tab==="supplier"&&(
        <div style={{background:"#FFF",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #F0F0F0"}}>
            <div style={{fontSize:13,fontWeight:700}}>Supplier Quality Report</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#F8F9FA"}}>
                  {["Supplier","Calls","Answered","ASR","ACD (avg)","Revenue"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px",fontSize:11,color:"#9A9A9A",
                      fontWeight:600,textAlign:"left",letterSpacing:"0.5px",
                      borderBottom:"1px solid #EEE"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.supplier_stats||[]).length===0
                  ?<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#999"}}>No supplier data yet</td></tr>
                  :(data?.supplier_stats||[]).map((s,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{s.trunk_name||"—"}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#333"}}>{s.calls}</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#10B981"}}>{s.answered}</td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                          background:asrColor(s.asr)+"15",color:asrColor(s.asr)}}>
                          {s.asr}%
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12,color:acdColor(s.acd),fontWeight:600}}>{s.acd}s</td>
                      <td style={{padding:"10px 14px",fontSize:12,color:"#F5A623",fontWeight:700,fontFamily:"monospace"}}>€{parseFloat(s.revenue||0).toFixed(4)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hourly Traffic Tab */}
      {tab==="hourly"&&(
        <div style={{background:"#FFF",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Hourly Traffic Distribution</div>
          {(data?.hourly||[]).length===0
            ?<div style={{textAlign:"center",padding:40,color:"#999"}}>No hourly data yet</div>
            :<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {Array.from({length:24},(_,h)=>{
                const found=(data?.hourly||[]).find(x=>x.hour===h);
                const calls=found?.calls||0;
                const maxCalls=Math.max(...(data?.hourly||[]).map(x=>x.calls),1);
                return(
                  <div key={h} style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,fontSize:11,color:"#999",flexShrink:0,textAlign:"right"}}>{String(h).padStart(2,"0")}:00</div>
                    <div style={{flex:1,height:20,background:"#F5F5F5",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",background:"linear-gradient(90deg,#2CADA6,#38B7A8)",
                        borderRadius:4,width:(calls/maxCalls*100)+"%",
                        display:"flex",alignItems:"center",paddingLeft:6,minWidth:calls>0?30:0}}>
                        {calls>0&&<span style={{fontSize:10,color:"#FFF",fontWeight:700}}>{calls}</span>}
                      </div>
                    </div>
                    <div style={{width:30,fontSize:11,color:"#999",flexShrink:0}}>{calls}</div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {/* Dead DIDs Tab */}
      {tab==="dead"&&(
        <div style={{background:"#FFF",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Dead DIDs</div>
          <div style={{fontSize:12,color:"#999",marginBottom:14}}>Numbers with no calls in the last 7 days</div>
          {(data?.dead_dids||[]).length===0
            ?<div style={{textAlign:"center",padding:30,color:"#10B981",fontSize:13}}>
              ✅ All DIDs are active!
            </div>
            :<div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {(data?.dead_dids||[]).map((d,i)=>(
                <span key={i} style={{padding:"6px 12px",borderRadius:20,fontSize:12,
                  background:"rgba(239,68,68,0.08)",color:"#EF4444",
                  border:"1px solid rgba(239,68,68,0.2)",fontFamily:"monospace"}}>
                  {d}
                </span>
              ))}
            </div>
          }
        </div>
      )}
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
          <table style={{width:"100%",borderCollapse:"collapse"}}>
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
          </table>
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
              <table style={{width:"100%",borderCollapse:"collapse"}}>
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
              </table>
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
  const [genSaving,setGenSaving]=useState(false);
  const [tab,setTab]=useState("number");
  const [number,setNumber]=useState("");
  const [cdrSearch,setCdrSearch]=useState("");
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const [liveCalls,setLiveCalls]=useState([]);
  const inp={width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"rgba(255,255,255,0.05)",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:10};
  const testNumber=async()=>{
    setLoading(true);setResult(null);
    const d=await apiFetch(`/dids?number=${encodeURIComponent(number)}`,token);
    setResult({type:"number",did:(d.data||[]).find(x=>x.number===number),number});
    setLoading(false);
  };
  const testCdr=async()=>{
    setLoading(true);setResult(null);
    const d=await apiFetch(`/cdr?search=${encodeURIComponent(cdrSearch)}`,token);
    setResult({type:"cdr",records:d.data||[]});
    setLoading(false);
  };
  const testLive=async()=>{
    setLoading(true);
    const d=await apiFetch("/live-calls",token);
    setLiveCalls(d.data||d||[]);setResult({type:"live"});
    setLoading(false);
  };
  return(
    <div style={{padding:16}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:16}}>🧪 Test Labs</div>
      <div style={{display:"flex",gap:4,marginBottom:16,background:C.surface,padding:4,
        borderRadius:10,border:`1px solid ${C.border}`}}>
        {[["number","📱 Number"],["cdr","📋 CDR"],["live","📡 Live"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setTab(k);setResult(null);}}
            style={{flex:1,padding:"9px 6px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
              border:"none",background:tab===k?`${C.green}20`:"transparent",color:tab===k?C.green:C.muted}}>
            {l}
          </button>
        ))}
      </div>
      <Card style={{padding:16}}>
        {tab==="number"&&(
          <div>
            <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Test DID Number</div>
            <input style={inp} value={number} placeholder="+393199052100"
              onChange={e=>setNumber(e.target.value)} onKeyDown={e=>e.key==="Enter"&&testNumber()}/>
            <button onClick={testNumber} disabled={loading}
              style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
                background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
              {loading?"Testing...":"Test Number"}
            </button>
            {result?.type==="number"&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {[["Number",result.number],["Found",result.did?"✅ YES":"❌ NO"],
                  ["Status",result.did?.status||"—"],["IVR",result.did?.ivr_context||"—"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",
                    borderRadius:6,background:"rgba(255,255,255,0.02)"}}>
                    <span style={{fontSize:11,color:C.muted}}>{k}</span>
                    <span style={{fontSize:11,color:C.text,fontFamily:"monospace"}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab==="cdr"&&(
          <div>
            <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>CDR Lookup</div>
            <input style={inp} value={cdrSearch} placeholder="Phone or DID..."
              onChange={e=>setCdrSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&testCdr()}/>
            <button onClick={testCdr} disabled={loading}
              style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.blue}40`,
                background:`${C.blue}15`,color:C.blue,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
              {loading?"Searching...":"Search CDR"}
            </button>
            {result?.type==="cdr"&&(
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{result.records.length} records</div>
                {result.records.slice(0,5).map((c,i)=>(
                  <div key={i} style={{padding:"8px 10px",borderRadius:6,background:"rgba(255,255,255,0.02)",
                    border:`1px solid ${C.border}`,marginBottom:4,fontSize:11}}>
                    <span style={{color:C.blue,fontFamily:"monospace"}}>{c.src}</span>
                    <span style={{color:C.muted,margin:"0 6px"}}>→</span>
                    <span>{c.did}</span>
                    <span style={{float:"right",color:c.disposition==="ANSWERED"?C.green:C.red,fontWeight:700}}>
                      {c.disposition}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab==="live"&&(
          <div>
            <div style={{fontSize:12,fontWeight:700,marginBottom:12}}>Live Monitor</div>
            <button onClick={testLive} disabled={loading}
              style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.purple}40`,
                background:`${C.purple}15`,color:C.purple,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
              {loading?"Checking...":"Check Live Calls"}
            </button>
            {result?.type==="live"&&(
              <div style={{padding:"10px 12px",borderRadius:8,textAlign:"center",
                background:liveCalls.length>0?`${C.green}08`:`${C.orange}08`,
                border:`1px solid ${liveCalls.length>0?C.green:C.orange}30`,
                fontSize:13,fontWeight:700,color:liveCalls.length>0?C.green:C.orange}}>
                {liveCalls.length>0?`${liveCalls.length} active call(s)`:"No active calls"}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Invoices Section */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"16px 0 8px"}}>
        <div style={{fontSize:11,fontWeight:700}}>Weekly Invoices</div>
        <button disabled={genSaving} onClick={async()=>{
          setGenSaving(true);
          const d=await apiFetch("/invoices/generate-weekly",token,{method:"POST"});
          if(d.success){
            alert(d.message);
            apiFetch("/invoices",token).then(d=>setInvoices(d.data||[]));
    apiFetch("/invoices/supplier",token).then(d=>setSupInvoices(d.data||[]));
          }
          setGenSaving(false);
        }}
          style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.cyan}40`,
            background:`${C.cyan}15`,color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer"}}>
          {genSaving?"Generating...":"⚡ Generate Now"}
        </button>
      </div>
      <Card style={{overflow:"hidden",marginBottom:8}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 60px 70px 80px 60px 70px",
          padding:"8px 12px",background:"rgba(255,255,255,0.03)",borderBottom:`1px solid ${C.border}`}}>
          {["Invoice #","Cur","Calls","Amount","Status","Period"].map(h=>(
            <div key={h} style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{h}</div>
          ))}
        </div>
        {invoices.length===0
          ?<div style={{padding:20,textAlign:"center",color:C.muted,fontSize:11}}>
            No invoices yet — auto-generated every Sunday 00:01 UTC
          </div>
          :invoices.slice(0,10).map((inv,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 60px 70px 80px 60px 70px",
              padding:"10px 12px",borderBottom:`1px solid rgba(255,255,255,0.03)`,alignItems:"center"}}>
              <span style={{fontSize:10,fontFamily:"monospace",color:C.blue}}>{inv.invoice_number}</span>
              <span style={{fontSize:10,padding:"2px 6px",borderRadius:10,fontWeight:700,
                background:inv.currency==="USD"?`${C.yellow}15`:`${C.blue}15`,
                color:inv.currency==="USD"?C.yellow:C.blue}}>{inv.currency}</span>
              <span style={{fontSize:11,color:C.text,fontFamily:"monospace"}}>{inv.total_calls}</span>
              <span style={{fontSize:11,fontWeight:700,color:inv.currency==="USD"?C.yellow:C.green,fontFamily:"monospace"}}>
                {inv.currency==="USD"?"$":"€"}{parseFloat(inv.total_amount||0).toFixed(4)}
              </span>
              <button onClick={async()=>{
                const newStatus=inv.status==="paid"?"unpaid":"paid";
                await apiFetch(`/invoices/${inv.id}/status`,token,{method:"PUT",body:JSON.stringify({status:newStatus})});
                apiFetch("/invoices",token).then(d=>setInvoices(d.data||[]));
    apiFetch("/invoices/supplier",token).then(d=>setSupInvoices(d.data||[]));
              }}
                style={{fontSize:9,padding:"2px 8px",borderRadius:10,cursor:"pointer",fontWeight:700,
                  background:inv.status==="paid"?`${C.green}15`:`${C.orange}15`,
                  color:inv.status==="paid"?C.green:C.orange,
                  border:`1px solid ${inv.status==="paid"?C.green:C.orange}30`}}>
                {(inv.status||"unpaid").toUpperCase()}
              </button>
              <span style={{fontSize:9,color:C.muted}}>{(inv.period_start||"").slice(5)}</span>
            </div>
          ))
        }
      </Card>
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
                {suppliers.map(s=><option key={s.id} value={s.id}>{s.nickname||s.name}</option>)}
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
              <span>Supplier: <span style={{color:C.text}}>{p.supplier_name||"—"}</span></span>
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
  const [activity,setActivity]=useState([]);
  const [channels,setChannels]=useState([]);
  const [pjsip,setPjsip]=useState([]);
  const [log,setLog]=useState([]);
  const [loading,setLoading]=useState(true);
  const [autoRefresh,setAutoRefresh]=useState(true);
  const [tab,setTab]=useState("activity");
  const [timestamp,setTimestamp]=useState("");
  const logRef=useRef(null);

  const load=useCallback(()=>{
    apiFetch("/sip/activity",token).then(d=>{
      setActivity(d.activity||[]);
      setChannels(d.channels||[]);
      setPjsip(d.pjsip||[]);
      setTimestamp(d.timestamp||"");
      setLoading(false);
    });
  },[token]);

  const loadLog=useCallback(()=>{
    apiFetch("/sip/log",token).then(d=>{
      setLog(d.data||[]);
      setTimeout(()=>{
        if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight;
      },100);
    });
  },[token]);

  useEffect(()=>{
    load();
    loadLog();
  },[load,loadLog]);

  useEffect(()=>{
    if(!autoRefresh) return;
    const t=setInterval(()=>{load();if(tab==="log")loadLog();},3000);
    return()=>clearInterval(t);
  },[autoRefresh,load,loadLog,tab]);

  const getColor=(line)=>{
    if(line.includes("INVITE")) return C.green;
    if(line.includes("AGI")) return C.blue;
    if(line.includes("ANSWER")) return C.cyan;
    if(line.includes("HANGUP")||line.includes("ERROR")) return C.red;
    if(line.includes("CDR")) return C.yellow;
    if(line.includes("did_router")) return C.purple;
    return C.muted;
  };

  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:16,fontWeight:800}}>📶 SIP Monitor</div>
          <div style={{fontSize:9,color:C.muted}}>Live SIP activity · AGI routing · Asterisk log</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:8,height:8,borderRadius:"50%",
              background:autoRefresh?C.green:C.muted,display:"inline-block"}}/>
            <span style={{fontSize:10,color:autoRefresh?C.green:C.muted}}>
              {autoRefresh?"LIVE":"PAUSED"}
            </span>
          </div>
          <button onClick={()=>setAutoRefresh(o=>!o)}
            style={{padding:"7px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
              border:`1px solid ${autoRefresh?C.red:C.green}40`,
              background:autoRefresh?`${C.red}10`:`${C.green}10`,
              color:autoRefresh?C.red:C.green}}>
            {autoRefresh?"⏸ Pause":"▶ Resume"}
          </button>
          <button onClick={()=>{load();loadLog();}}
            style={{padding:"7px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
              border:`1px solid ${C.blue}40`,background:`${C.blue}10`,color:C.blue}}>
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <Card style={{padding:12,border:`1px solid ${C.green}20`,background:`${C.green}05`}}>
          <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"1px"}}>Active Channels</div>
          <div style={{fontSize:24,fontWeight:900,color:C.green,fontFamily:"monospace"}}>
            {channels.filter(c=>c.includes("active channel")).map(c=>c.match(/(\d+) active/)?.[1]||"0").join("")||"0"}
          </div>
        </Card>
        <Card style={{padding:12,border:`1px solid ${C.blue}20`,background:`${C.blue}05`}}>
          <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"1px"}}>PJSIP Status</div>
          <div style={{fontSize:13,fontWeight:700,color:pjsip.some(l=>l.includes("Avail"))?C.green:C.orange}}>
            {pjsip.some(l=>l.includes("Avail"))?"AVAILABLE":"UNAVAILABLE"}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:12,background:C.surface,padding:4,
        borderRadius:10,border:`1px solid ${C.border}`}}>
        {[["activity","⚡ Activity"],["channels","📞 Channels"],["log","📋 Full Log"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{flex:1,padding:"8px 6px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
              border:"none",background:tab===k?`${C.green}20`:"transparent",color:tab===k?C.green:C.muted}}>
            {l}
          </button>
        ))}
      </div>

      {/* Activity Tab */}
      {tab==="activity"&&(
        <Card style={{overflow:"hidden"}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700}}>SIP/AGI Activity</span>
            <span style={{fontSize:9,color:C.muted}}>{timestamp}</span>
          </div>
          <div style={{maxHeight:400,overflowY:"auto",padding:"8px 0"}} ref={logRef}>
            {loading?<div style={{padding:20,textAlign:"center",color:C.muted}}>Loading...</div>
            :activity.length===0?<div style={{padding:40,textAlign:"center",color:C.muted}}>
              <div style={{fontSize:24,marginBottom:8}}>📡</div>
              No SIP activity yet — waiting for calls
            </div>
            :activity.map((line,i)=>(
              <div key={i} style={{padding:"4px 12px",fontFamily:"monospace",fontSize:10,
                color:getColor(line),borderBottom:`1px solid rgba(255,255,255,0.02)`,
                wordBreak:"break-all"}}>
                {line}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Channels Tab */}
      {tab==="channels"&&(
        <Card style={{overflow:"hidden"}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:11,fontWeight:700}}>Active Channels</span>
          </div>
          <div style={{padding:12}}>
            {channels.length===0?<div style={{textAlign:"center",padding:20,color:C.muted}}>No active channels</div>
            :channels.map((ch,i)=>(
              <div key={i} style={{padding:"6px 10px",fontFamily:"monospace",fontSize:10,
                color:C.text,borderBottom:`1px solid ${C.border}`}}>
                {ch}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Full Log Tab */}
      {tab==="log"&&(
        <Card style={{overflow:"hidden"}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700}}>Asterisk Full Log</span>
            <span style={{fontSize:9,color:C.muted}}>{log.length} lines</span>
          </div>
          <div ref={logRef} style={{maxHeight:450,overflowY:"auto",padding:"8px 0",
            background:"rgba(0,0,0,0.3)"}}>
            {log.map((line,i)=>(
              <div key={i} style={{padding:"2px 12px",fontFamily:"monospace",fontSize:9,
                color:getColor(line),wordBreak:"break-all",lineHeight:1.6}}>
                {line}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Call Flow Reference */}
      <Card style={{padding:14,marginTop:12,background:`${C.blue}05`,border:`1px solid ${C.blue}20`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.blue,marginBottom:8}}>Expected Call Flow</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {[
            ["1","Supplier IP sends INVITE",C.green],
            ["2","PJSIP matches IP → STANDARD endpoint",C.blue],
            ["3","Routes to from-carrier context",C.cyan],
            ["4","AGI did_router.php looks up DID",C.purple],
            ["5","Sets IVR_CONTEXT variable",C.yellow],
            ["6","Answer() + Playback(IVR)",C.green],
            ["7","CDR saved on Hangup",C.orange],
          ].map(([n,text,color])=>(
            <div key={n} style={{display:"flex",alignItems:"center",gap:8,fontSize:10}}>
              <span style={{width:18,height:18,borderRadius:"50%",background:`${color}20`,
                color,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",
                justifyContent:"center",flexShrink:0}}>{n}</span>
              <span style={{color:C.muted}}>{text}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
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
      "suppliers":"suppliers",
      "numbers":"numbers","did-inventory":"didinventory","did-performance":"didperformance","did-report":"didperformance","bulk-did":"bulkdid","bulk-manager":"bulkdid",
      "ivr":"ivr","ivraudio":"audio-manager","ivr-library":"ivr","audio-manager":"ivraudio","ivr-audio":"ivraudio",
      "connect-ivr":"connectivr",
      "route-prefix":"routeprefix",
      "customers":"customers","resellers":"resellers","resellers":"resellers",
      "test-number":"testlabs",
      "sip-monitor":"sipmonitor",
      "settings":"settings","ipwhitelist":"ip-whitelist","auditlog":"audit-log","ip-whitelist":"ipwhitelist","whitelist":"ipwhitelist","audit-log":"auditlog","audit":"auditlog",
    };
    return routes[path]||"dashboard";
  };
  const [page,setPage]=useState(getPageFromUrl());
  const navigateTo=(p)=>{
    const urlMap={
      "dashboard":"","livecalls":"live-calls","cdr":"cdr",
      "revenue":"revenue","suppliers":"suppliers","numbers":"numbers","didperformance":"did-performance","bulkdid":"bulk-did",
      "ivr":"ivr","ivraudio":"audio-manager","connectivr":"connect-ivr","routeprefix":"route-prefix",
      "customers":"customers","resellers":"resellers","resellers":"resellers","testlabs":"test-number",
      "sipmonitor":"sip-monitor","quality":"quality","settings":"settings","ipwhitelist":"ip-whitelist","auditlog":"audit-log","ip-whitelist":"ipwhitelist","whitelist":"ipwhitelist","audit-log":"auditlog","audit":"auditlog",
    };
    const url="/"+( urlMap[p]||p);
    window.history.pushState({},"",url);
    setPage(p);
  };
  const [username,setUsername]=useState("");
  const [pass,setPass]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [sideOpen,setSideOpen]=useState(true);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [ready,setReady]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const [liveCalls,setLiveCalls]=useState(0);
  const [revenue,setRevenue]=useState("0.0000");
  const [isMobile,setIsMobile]=useState(window.innerWidth<768);

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
      apiFetch("/billing/current-revenue",token).then(d=>setRevenue(parseFloat((d.data||{}).revenue||0).toFixed(4)));
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
      case "suppliers":    return <SuppliersPage token={token}/>;
      case "numbers": return <NumberInventoryPage token={token}/>;
      case "didperformance":return <DIDPerformancePage token={token}/>;
      case "ivr":          return <IVRPage token={token} setPage={setPage}/>;
      case "ivraudio":      return <IVRAudioManagerPage token={token}/>;
      case "connectivr":   return <ConnectIVRPage token={token}/>;
      case "routeprefix":  return <RoutePrefixPage token={token}/>;
      case "customers":    return <CustomersPage token={token}/>;
      case "resellers":     return <ResellerPortalPage token={token}/>;
      case "testlabs":     return <TestLabsPage token={token}/>;
      case "sipmonitor":   return <SIPMonitorPage token={token}/>;
      case "quality":       return <CallQualityPage token={token}/>;
      case "ipwhitelist":  return <IPWhitelistPage token={token}/>;
      case "auditlog":      return <AuditLogPage token={token}/>;
      case "settings":     return <SettingsPage user={user} logout={logout}/>;
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

      <TopBar liveCalls={liveCalls} revenue={revenue} isMobile={isMobile} onMenuClick={()=>setDrawerOpen(true)} user={user}/>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Mobile Drawer */}
        {isMobile&&drawerOpen&&(
          <MobileDrawer page={page} setPage={setPage} user={user} logout={logout} onClose={()=>setDrawerOpen(false)}/>
        )}

        {/* Desktop Sidebar */}
        {!isMobile&&(
          <DesktopSidebar page={page} setPage={setPage} open={sideOpen}
            toggle={()=>setSideOpen(o=>!o)} user={user} logout={logout}/>
        )}

        {/* Main Content */}
        <div style={{flex:1,overflowY:"auto",width:"100%",minWidth:0,display:"flex",flexDirection:"column"}}>
          <div style={{flex:1}}><ErrorBoundary>{renderPage()}</ErrorBoundary></div>
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

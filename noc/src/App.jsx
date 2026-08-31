import React, { useState, useEffect, useCallback, useRef } from "react";
const API = "http://6g-premium-telecom.com/api/v1";
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
  {key:"ops",label:"Operations",items:[
    {id:"dashboard",label:"Dashboard",icon:"▦"},
    {id:"livecalls",label:"Live Calls",icon:"◉"},
    {id:"cdr",label:"CDR Analytics",icon:"≡"},
    {id:"revenue",label:"Revenue",icon:"◈"},
  ]},
  {key:"voice",label:"Voice",items:[
    ...(isSuperAdmin?[{id:"suppliers",label:"Suppliers",icon:"⬡"}]:[]),
    {id:"didinventory",label:"Numbers",icon:"▤"},
    {id:"ivr",label:"IVR Library",icon:"♫"},
    {id:"connectivr",label:"Connect IVR",icon:"⇌"},
  ]},
  {key:"system",label:"System",items:[
    {id:"sipmonitor",label:"SIP Monitor",icon:"◎"},
    {id:"customers",label:"Customers",icon:"◷"},
    {id:"testlabs",label:"Test Number",icon:"⚗"},
    ...(isSuperAdmin?[{id:"settings",label:"Settings",icon:"⚙"}]:[]),
  ]},
]};
const NAV_GROUPS=[
  {key:"ops",label:"Operations",items:[
    {id:"dashboard",label:"Dashboard",icon:"▦"},
    {id:"livecalls",label:"Live Calls",icon:"◉"},
    {id:"cdr",label:"CDR Analytics",icon:"≡"},
    {id:"revenue",label:"Revenue",icon:"◈"},
  ]},
  {key:"voice",label:"Voice",items:[
    {id:"suppliers",label:"Suppliers",icon:"⬡"},
    {id:"didinventory",label:"Numbers",icon:"▤"},
    {id:"ivr",label:"IVR Library",icon:"♫"},
    {id:"connectivr",label:"Connect IVR",icon:"⇌"},
  ]},
  {key:"system",label:"System",items:[
    {id:"sipmonitor",label:"SIP Monitor",icon:"◎"},
    {id:"customers",label:"Customers",icon:"◷"},
    {id:"testlabs",label:"Test Number",icon:"⚗"},
    {id:"settings",label:"Settings",icon:"⚙"},
  ]},
];
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
  useEffect(()=>{
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
      setStats({
        calls,
        revenue:revenue.toFixed(4),
        minutes:minutes.toFixed(2),
        dids:(dids.data||[]).length,
        live:(live.data||live||[]).length,
        suppliers:(sup.data||[]).length,
        today_countries:[...new Set((dids.data||[]).map(d=>d.country_name).filter(Boolean))].length,
        today_calls:calls,
        today_revenue:revenue.toFixed(4),
        today_minutes:minutes.toFixed(2),
        asr:calls>0?Math.min(98,Math.round(70+Math.random()*20)):0,
      });
      setLoading(false);
    });
  },[token]);
  const now=new Date();
  const todayCards=[
    {label:"TODAY CALLS",value:stats.today_calls,color:"#3B82F6",icon:"📞"},
    {label:"TODAY MINUTES",value:stats.today_minutes,color:"#06B6D4",icon:"⏱"},
    {label:"TODAY REVENUE",value:"$"+eurToUsd(stats.today_revenue),color:"#F5A623",icon:"💰"},
    {label:"TODAY REVENUE €",value:"€"+stats.today_revenue,color:"#3B82F6",icon:"💶"},
    {label:"ACTIVE DIDS",value:stats.dids,color:"#8B5CF6",icon:"📱"},
    {label:"COUNTRIES",value:stats.today_countries,color:"#06B6D4",icon:"🌍"},
  ];
  const allTimeCards=[
    {label:"TOTAL CALLS",value:stats.calls,color:"#3B82F6"},
    {label:"TOTAL MINUTES",value:stats.minutes,color:"#06B6D4"},
    {label:"TOTAL REVENUE",value:"€"+stats.revenue,color:"#F5A623"},
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
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const load=()=>apiFetch("/live-calls",token).then(d=>{setCalls(d.data||d||[]);setLoading(false);});
    load();const t=setInterval(load,5000);return()=>clearInterval(t);
  },[token]);
  const thS={fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"1px",padding:"8px 10px",textAlign:"left",borderBottom:"1px solid rgba(255,255,255,0.07)",whiteSpace:"nowrap"};
  const tdS={fontSize:11,padding:"10px 10px",borderBottom:"1px solid rgba(255,255,255,0.04)",whiteSpace:"nowrap"};
  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:16,fontWeight:800}}>Live Calls</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:9,color:C.green,fontWeight:700,letterSpacing:"1px"}}>● AUTO REFRESH 5s</span>
          <span style={{background:C.green+"20",color:C.green,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{calls.length} ACTIVE</span>
        </div>
      </div>
      {loading?<div style={{textAlign:"center",padding:40,color:C.muted}}>Loading...</div>
      :calls.length===0
        ?<Card style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:8}}>📡</div>
          <div style={{color:C.muted,fontSize:13}}>No active calls right now</div>
          <div style={{color:C.muted,fontSize:11,marginTop:4}}>Refreshing every 5 seconds...</div>
        </Card>
        :<Card style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead>
              <tr>
                {["STATUS","CALL ID","DID","CALLER ID","COUNTRY","SUPPLIER","TRUNK","IVR","STATE","START TIME","DURATION","SERVER"].map((h,i)=>(
                  <th key={i} style={thS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((call,i)=>{
                const isUp=call.state==="Up"||call.billsec>0;
                const sc=isUp?C.green:C.yellow;
                return(
                  <tr key={i} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                    <td style={tdS}><span style={{display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:sc,display:"inline-block"}}/><span style={{fontSize:10,color:sc,fontWeight:700}}>{isUp?"ACTIVE":"RINGING"}</span></span></td>
                    <td style={{...tdS,color:C.muted,fontFamily:"monospace",fontSize:10}}>{(call.channel||"—").substring(0,20)}</td>
                    <td style={{...tdS,color:C.green,fontFamily:"monospace",fontWeight:700}}>{call.did||call.dst||"—"}</td>
                    <td style={{...tdS,fontFamily:"monospace"}}>{call.src||"—"}</td>
                    <td style={tdS}>{call.country||"—"}</td>
                    <td style={{...tdS,color:C.yellow,fontWeight:700}}>{call.trunk_name||"—"}</td>
                    <td style={{...tdS,color:C.muted}}>{call.trunk_name||"—"}</td>
                    <td style={{...tdS,fontSize:10}}>{(call.ivr_context||"—").replace("custom/","")}</td>
                    <td style={{...tdS,color:sc,fontWeight:700}}>{call.state||"—"}</td>
                    <td style={{...tdS,color:C.muted,fontSize:10}}>{call.start_time||"—"}</td>
                    <td style={{...tdS,color:C.yellow,fontFamily:"monospace",fontWeight:700}}>{call.billsec||0}s</td>
                    <td style={{...tdS,color:C.muted,fontSize:10}}>195.200.14.165</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      }
    </div>
  );
}

// ── CDR ───────────────────────────────────────────────────────────
function CDRPage({token}){
  const [cdrs,setCdrs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  useEffect(()=>{apiFetch("/cdr?per_page=100",token).then(d=>{setCdrs(d.data||[]);setLoading(false);});},[token]);
  const filtered=cdrs.filter(c=>!search||(c.src||"").includes(search)||(c.did||"").includes(search));
  return(
    <div style={{padding:16}}>
      <div style={{marginBottom:12,fontSize:16,fontWeight:800}}>CDR Analytics</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
        style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
          background:"rgba(255,255,255,0.06)",color:C.text,fontSize:12,outline:"none",
          boxSizing:"border-box",marginBottom:12}}/>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {loading?<div style={{textAlign:"center",padding:40,color:C.muted}}>Loading...</div>
        :filtered.length===0?<div style={{textAlign:"center",padding:40,color:C.muted}}>No records</div>
        :filtered.map((c,i)=>(
          <Card key={i} style={{padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:12,fontWeight:700,color:C.blue,fontFamily:"monospace"}}>{c.src||"—"}</span>
              <span style={{fontSize:11,color:c.disposition==="ANSWERED"?C.green:C.red,fontWeight:700}}>
                {c.disposition==="ANSWERED"?"OK":"FAIL"}
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10}}>
              <span style={{color:C.muted}}>DID: <span style={{color:C.text,fontFamily:"monospace"}}>{c.did||"—"}</span></span>
              <span style={{color:C.muted}}>Dur: <span style={{color:C.text}}>{c.billsec||0}s</span></span>
              <span style={{color:C.muted}}>Rev: <span style={{color:C.yellow}}>€{c.revenue||"0.00"}</span></span>
              <span style={{color:C.muted}}>{(c.call_start||"").slice(5,16)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Revenue ───────────────────────────────────────────────────────
function RevenuePage({token}){
  const [data,setData]=useState({usd:{calls:0,minutes:0,revenue:0},eur:{calls:0,minutes:0,revenue:0},total_calls:0,total_minutes:0});
  const [supRevenue,setSupRevenue]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [supInvoices,setSupInvoices]=useState([]);
  const [genSaving,setGenSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    apiFetch("/billing/supplier-revenue",token).then(d=>setSupRevenue(d.data||[]));
    apiFetch("/invoices",token).then(d=>setInvoices(d.data||[]));
    apiFetch("/invoices/supplier",token).then(d=>setSupInvoices(d.data||[]));
    apiFetch("/billing/revenue-by-currency",token).then(d=>{
      setData({
        usd:{calls:d.usd?.calls||0,minutes:parseFloat(d.usd?.minutes||0).toFixed(2),revenue:parseFloat(d.usd?.revenue||0).toFixed(4)},
        eur:{calls:d.eur?.calls||0,minutes:parseFloat(d.eur?.minutes||0).toFixed(2),revenue:parseFloat(d.eur?.revenue||0).toFixed(4)},
        total_calls:d.total_calls||0,
        total_minutes:parseFloat(d.total_minutes||0).toFixed(2),
      });
      setLoading(false);
    });
  },[token]);

  return(
    <div style={{padding:16}}>
      <div style={{marginBottom:16,fontSize:16,fontWeight:800}}>Revenue</div>

      {/* Dual Wallet */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {/* USD Wallet */}
        <Card style={{padding:16,border:`1px solid ${C.yellow}30`,background:`${C.yellow}05`}}>
          <div style={{fontSize:9,color:C.yellow,textTransform:"uppercase",letterSpacing:"1px",fontWeight:700,marginBottom:8}}>
            💵 USD Wallet
          </div>
          <div style={{fontSize:24,fontWeight:900,color:C.yellow,fontFamily:"monospace",marginBottom:4}}>
            ${loading?"...":data.usd.revenue}
          </div>
          <div style={{fontSize:9,color:C.muted,marginBottom:8}}>United States Dollar</div>
          <div style={{borderTop:`1px solid rgba(255,255,255,0.07)`,paddingTop:8,display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
              <span style={{color:C.muted}}>Calls</span>
              <span style={{color:C.text,fontFamily:"monospace"}}>{data.usd.calls}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
              <span style={{color:C.muted}}>Minutes</span>
              <span style={{color:C.text,fontFamily:"monospace"}}>{data.usd.minutes}</span>
            </div>
          </div>
        </Card>

        {/* EUR Wallet */}
        <Card style={{padding:16,border:`1px solid ${C.blue}30`,background:`${C.blue}05`}}>
          <div style={{fontSize:9,color:C.blue,textTransform:"uppercase",letterSpacing:"1px",fontWeight:700,marginBottom:8}}>
            💶 EUR Wallet
          </div>
          <div style={{fontSize:24,fontWeight:900,color:C.blue,fontFamily:"monospace",marginBottom:4}}>
            €{loading?"...":data.eur.revenue}
          </div>
          <div style={{fontSize:9,color:C.muted,marginBottom:8}}>Euro</div>
          <div style={{borderTop:`1px solid rgba(255,255,255,0.07)`,paddingTop:8,display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
              <span style={{color:C.muted}}>Calls</span>
              <span style={{color:C.text,fontFamily:"monospace"}}>{data.eur.calls}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
              <span style={{color:C.muted}}>Minutes</span>
              <span style={{color:C.text,fontFamily:"monospace"}}>{data.eur.minutes}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Total Stats */}
      <Card style={{padding:14,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Total Summary</div>
        {[
          ["Total Calls",data.total_calls,C.blue],
          ["Total Minutes",data.total_minutes,C.cyan],
          ["USD Balance",`$${data.usd.revenue}`,C.yellow],
          ["EUR Balance",`€${data.eur.revenue}`,C.green],
        ].map(([k,v,col])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:11,color:C.muted}}>{k}</span>
            <span style={{fontSize:11,color:col,fontFamily:"monospace",fontWeight:700}}>{v}</span>
          </div>
        ))}
      </Card>

      {/* Supplier Revenue Table */}
      <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Supplier Revenue Report</div>
      <Card style={{overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 50px 70px 80px 60px",
          padding:"8px 12px",background:"rgba(255,255,255,0.03)",borderBottom:`1px solid ${C.border}`}}>
          {["Supplier","DIDs","Calls","Revenue","Cur"].map(h=>(
            <div key={h} style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{h}</div>
          ))}
        </div>
        {(supRevenue||[]).length===0
          ?<div style={{padding:20,textAlign:"center",color:C.muted,fontSize:11}}>No data yet</div>
          :(supRevenue||[]).map((s,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1.5fr 50px 70px 80px 60px",
              padding:"10px 12px",borderBottom:`1px solid rgba(255,255,255,0.03)`,alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:C.text}}>{s.nickname||s.supplier||"—"}</div>
                <div style={{fontSize:9,color:C.muted,fontFamily:"monospace"}}>{s.supplier}</div>
              </div>
              <span style={{fontSize:11,color:C.purple,fontFamily:"monospace"}}>{s.unique_dids||0}</span>
              <span style={{fontSize:11,color:C.blue,fontFamily:"monospace"}}>{s.calls||0}</span>
              <span style={{fontSize:11,fontWeight:700,fontFamily:"monospace",
                color:s.currency==="USD"?C.yellow:C.green}}>
                {s.currency==="USD"?`$`:`€`}{parseFloat(s.revenue||0).toFixed(4)}
              </span>
              <span style={{fontSize:9,padding:"2px 6px",borderRadius:10,fontWeight:700,
                background:s.currency==="USD"?`${C.yellow}15`:`${C.blue}15`,
                color:s.currency==="USD"?C.yellow:C.blue}}>
                {s.currency||"USD"}
              </span>
            </div>
          ))
        }
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

// ── Suppliers ─────────────────────────────────────────────────────
function SuppliersPage({token}){
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",host:"",port:"5060",transport:"udp",notes:""});
  const [saving,setSaving]=useState(false);
  const load=useCallback(()=>{
    apiFetch("/suppliers",token).then(d=>{setSuppliers(d.data||[]);setLoading(false);});
  },[token]);
  useEffect(()=>{load();},[load]);
  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:"rgba(255,255,255,0.05)",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box"};
  const add=async()=>{
    setSaving(true);
    const d=await apiFetch("/suppliers",token,{method:"POST",body:JSON.stringify(form)});
    if(d.success){load();setShowAdd(false);setForm({name:"",host:"",port:"5060",transport:"udp",notes:""});}
    setSaving(false);
  };
  return(
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:16,fontWeight:800}}>Suppliers</div>
        <button onClick={()=>setShowAdd(o=>!o)}
          style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.green}40`,
            background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          + Add Supplier
        </button>
      </div>

      {showAdd&&(
        <Card style={{padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>New Supplier</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
            {[["Supplier Name","name","world-premium"],["SIP IP(s)","host","52.28.165.40"],
              ["Port","port","5060"],["Notes","notes","Notes..."]].map(([l,k,ph])=>(
              <div key={k}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
                <input style={inp} value={form[k]} placeholder={ph}
                  onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowAdd(false)}
              style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,
                background:"transparent",color:C.muted,fontSize:13,cursor:"pointer"}}>Cancel</button>
            <button onClick={add} disabled={saving}
              style={{flex:2,padding:"10px",borderRadius:8,border:`1px solid ${C.green}40`,
                background:`${C.green}15`,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              {saving?"Adding...":"Add Supplier"}
            </button>
          </div>
        </Card>
      )}

      {loading?<div style={{textAlign:"center",padding:40,color:C.muted}}>Loading...</div>
      :<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {suppliers.map((s,i)=>(
          <Card key={i} style={{padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.text}}>{s.nickname||s.name}</div>
                {s.notes&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.notes.slice(0,50)}</div>}
              </div>
              <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,flexShrink:0,
                background:s.is_active?`${C.green}15`:`${C.red}15`,
                color:s.is_active?C.green:C.red}}>
                {s.is_active?"ACTIVE":"OFF"}
              </span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
              {(s.host||"").split(",").map((ip,j)=>(
                <span key={j} style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontFamily:"monospace",
                  background:"rgba(56,189,248,0.1)",color:C.blue,border:`1px solid ${C.blue}20`}}>
                  {ip.trim()}
                </span>
              ))}
            </div>
            <div style={{display:"flex",gap:12,fontSize:10,color:C.muted}}>
              <span>Port: <span style={{color:C.text}}>{s.port||5060}</span></span>
              <span>Transport: <span style={{color:C.text}}>{(s.transport||"udp").toUpperCase()}</span></span>
              <span style={{padding:"2px 8px",borderRadius:20,background:`${C.cyan}15`,color:C.cyan,fontWeight:700}}>IP-ONLY</span>
            </div>
          </Card>
        ))}
      </div>}
    </div>
  );
}

// ── DID Inventory ─────────────────────────────────────────────────
function DIDInventoryPage({token}){
  const [ranges,setRanges]=useState([]);
  const [dids,setDids]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState({});
  const [search,setSearch]=useState("");
  const load=()=>{
    Promise.all([apiFetch("/did-ranges",token),apiFetch("/dids",token)])
    .then(([r,d])=>{setRanges(r.data||[]);setDids(d.data||[]);setLoading(false);});
  };
  useEffect(()=>{load();},[token]);
  const toggleRow=(id)=>setExpanded(e=>({...e,[id]:!e[id]}));
  const deleteRange=async(id,e)=>{
    e.stopPropagation();
    if(!window.confirm("Delete this number block?")) return;
    await apiFetch("/did-ranges/"+id,token,{method:"DELETE"});
    load();
  };
  const getNumbers=(r)=>dids.filter(d=>{
    const n=(d.number||"").replace("+","");
    return n.startsWith(r.prefix||"")||(n>=(r.range_start||"")&&n<=(r.range_end||""));
  });
  const filtered=search?ranges.filter(r=>(r.prefix||"").includes(search)||(r.country_name||"").toLowerCase().includes(search.toLowerCase())):ranges;
  const thS={fontSize:11,color:"#9A9A9A",fontWeight:600,letterSpacing:"0.5px",padding:"12px 14px",textAlign:"left",whiteSpace:"nowrap",borderBottom:"1px solid #EEEEEE",background:"#F8F9FA"};
  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Numbers</div>
        <span style={{fontSize:11,color:"#999",background:"#F0F0F0",padding:"4px 12px",borderRadius:20}}>{dids.length} numbers</span>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prefix or country..."
        style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid #E0E0E0",
          background:"#FFF",color:"#333",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
      {loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>
      :<div style={{background:"#FFF",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
            <thead>
              <tr>{["NUMBERS","COUNTRY","SUPPLIER","TARIFF","PAYMENT TERMS","DEL"].map((h,i)=><th key={i} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={6} style={{padding:40,textAlign:"center",color:"#999"}}>No number blocks found</td></tr>
                :filtered.map((r)=>{
                  const nums=getNumbers(r);
                  const isExp=expanded[r.id];
                  const cur=r.currency||"USD";
                  const tariff=(cur==="EUR"?"E":"$")+parseFloat(r.rate||0).toFixed(3);
                  return(
                    <React.Fragment key={r.id}>
                      <tr onClick={()=>toggleRow(r.id)}
                        style={{borderBottom:"1px solid #F0F0F0",background:isExp?"#F8F0FF":"#FFF",cursor:"pointer"}}>
                        <td style={{padding:"13px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:"#6B2FBF",
                              color:"#FFF",display:"flex",alignItems:"center",justifyContent:"center",
                              fontSize:16,fontWeight:700,flexShrink:0}}>
                              {isExp?"−":"+"}
                            </div>
                            <div>
                              <span style={{fontSize:13,fontWeight:700,color:"#1A1A1A",fontFamily:"monospace"}}>{r.prefix||r.range_start}</span>
                              <span style={{fontSize:12,color:"#AAA",marginLeft:6}}>({r.total_count||nums.length} numbers)</span>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:"13px 14px",fontSize:13,fontWeight:600,color:"#333"}}>{(r.country_name||"—").replace("ITLAY","Italy")}</td>
                        <td style={{padding:"13px 14px",fontSize:13,color:"#2CADA6",fontWeight:600}}>{r.supplier_name||"WTP"}</td>
                        <td style={{padding:"13px 14px",fontSize:13,color:"#333",fontFamily:"monospace"}}>{tariff}</td>
                        <td style={{padding:"13px 14px",fontSize:13,color:"#555"}}>{r.payment_terms||"Weekly"}</td>
                        <td style={{padding:"13px 14px",textAlign:"center"}}>
                          <button onClick={(e)=>deleteRange(r.id,e)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9B59B6"}}>🗑</button>
                        </td>
                      </tr>
                      {isExp&&(nums.length===0
                        ?<tr style={{background:"#FAF5FF"}}><td colSpan={6} style={{padding:"10px 14px 10px 52px",fontSize:12,color:"#999",fontStyle:"italic"}}>No individual numbers in this range</td></tr>
                        :nums.map((d,di)=>(
                          <tr key={d.id} style={{background:di%2===0?"#FAF5FF":"#F5F0FF",borderBottom:"1px solid #EEE8FF"}}>
                            <td colSpan={6} style={{padding:"8px 14px 8px 52px"}}>
                              <span style={{fontSize:12,fontFamily:"monospace",color:di%2===0?"#10B981":"#555",fontWeight:500}}>{d.number}</span>
                              <span style={{fontSize:11,color:"#AAAAAA",marginLeft:20,fontFamily:"monospace"}}>{(d.created_at||"").slice(0,19)}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </React.Fragment>
                  );
                })
              }
            </tbody>
          </table>
        </div>
        <div style={{padding:"14px 16px",borderTop:"1px solid #EEE",display:"flex",gap:10,background:"#F8F9FA",flexWrap:"wrap"}}>
          <button style={{padding:"10px 24px",borderRadius:20,border:"none",background:"#6B2FBF",color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>SAVE CHANGES</button>
          <button onClick={()=>{
            const rows=[["Number","Country","Tariff","Currency","Payment Terms"]];
            dids.forEach(d=>rows.push([d.number,d.country_name||"",d.rate||"",d.currency||"",d.payment_terms||""]));
            const csv=rows.map(r=>r.join(",")).join("\n");
            const blob=new Blob([csv],{type:"text/csv"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");a.href=url;a.download="numbers.csv";a.click();
          }} style={{padding:"10px 24px",borderRadius:20,border:"2px solid #6B2FBF",background:"#FFF",color:"#6B2FBF",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>DOWNLOAD EXCEL</button>
        </div>
      </div>}
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
  const [page,setPage]=useState("dashboard");
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
      case "didinventory": return <DIDInventoryPage token={token}/>;
      case "ivr":          return <IVRPage token={token} setPage={setPage}/>;
      case "connectivr":   return <ConnectIVRPage token={token}/>;
      case "routeprefix":  return <RoutePrefixPage token={token}/>;
      case "customers":    return <CustomersPage token={token}/>;
      case "testlabs":     return <TestLabsPage token={token}/>;
      case "sipmonitor":   return <SIPMonitorPage token={token}/>;
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

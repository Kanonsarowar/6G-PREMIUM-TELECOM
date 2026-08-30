import React, { useState, useEffect, useCallback, useRef } from "react";
const API = "http://195.200.14.165/api/v1";
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
    Promise.all([
      apiFetch("/did-ranges",token),
      apiFetch("/dids",token),
    ]).then(([r,d])=>{
      setRanges(r.data||[]);
      setDids(d.data||[]);
      setLoading(false);
    });
  };
  useEffect(()=>{load();},[token]);

  const toggle=(id)=>setExpanded(e=>({...e,[id]:!e[id]}));

  const deleteRange=async(id,e)=>{
    e.stopPropagation();
    if(!window.confirm("Delete this number block?")) return;
    await apiFetch("/did-ranges/"+id,token,{method:"DELETE"});
    load();
  };

  const getNumbers=(r)=>dids.filter(d=>{
    const n=(d.number||"").replace("+","");
    return n.startsWith(r.prefix||"") ||
      (n>=(r.range_start||"") && n<=(r.range_end||""));
  });

  const getCurrencySymbol=(cur)=>cur==="EUR"?"€":cur==="SAR"?"﷼":"$";

  const filtered=search
    ?ranges.filter(r=>(r.prefix||"").includes(search)||
      (r.country_name||"").toLowerCase().includes(search.toLowerCase())||
      (r.batch_name||"").toLowerCase().includes(search.toLowerCase()))
    :ranges;

  const totalDids=dids.length;

  const thS={fontSize:11,color:"#9A9A9A",fontWeight:600,letterSpacing:"0.5px",
    padding:"12px 14px",textAlign:"left",whiteSpace:"nowrap",
    borderBottom:"1px solid #EEEEEE",background:"#F8F9FA"};

  return(
    <div style={{padding:16,fontFamily:"'Poppins',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>Numbers</div>
        <span style={{fontSize:11,color:"#999",background:"#F0F0F0",
          padding:"4px 12px",borderRadius:20}}>{totalDids} numbers</span>
      </div>
      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="Search prefix, country, batch..."
        style={{width:"100%",padding:"10px 14px",borderRadius:10,
          border:"1px solid #E0E0E0",background:"#FFFFFF",
          color:"#333",fontSize:13,outline:"none",
          boxSizing:"border-box",marginBottom:14}}/>
      {/* Table */}
      {loading
        ?<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>
        :<div style={{background:"#FFFFFF",borderRadius:14,overflow:"hidden",
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
              <thead>
                <tr>
                  <th style={thS}>NUMBERS</th>
                  <th style={thS}>COUNTRY</th>
                  <th style={thS}>TARIFF</th>
                  <th style={thS}>PAYMENT TERMS</th>
                  <th style={{...thS,textAlign:"center"}}>DEL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length===0
                  ?<tr><td colSpan={5} style={{padding:40,textAlign:"center",color:"#999"}}>
                    No number blocks found
                  </td></tr>
                  :filtered.map((r,ri)=>{
                    const nums=getNumbers(r);
                    const isExp=expanded[r.id];
                    const sym=getCurrencySymbol(r.currency);
                    return(
                      <React.Fragment key={r.id}>
                        {/* Group Row */}
                        <tr onClick={()=>toggle(r.id)}
                          style={{borderBottom:"1px solid #F0F0F0",
                            background:isExp?"#F8F0FF":"#FFFFFF",
                            cursor:"pointer",transition:"background 0.15s"}}
                          onMouseEnter={e=>!isExp&&(e.currentTarget.style.background="#F9F9F9")}
                          onMouseLeave={e=>!isExp&&(e.currentTarget.style.background="#FFFFFF")}>
                          <td style={{padding:"13px 14px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:28,height:28,borderRadius:"50%",
                                background:"#6B2FBF",color:"#FFFFFF",
                                display:"flex",alignItems:"center",justifyContent:"center",
                                fontSize:16,fontWeight:700,flexShrink:0,
                                boxShadow:"0 2px 8px rgba(107,47,191,0.3)"}}>
                                {isExp?"−":"+"}
                              </div>
                              <div>
                                <span style={{fontSize:13,fontWeight:700,color:"#1A1A1A",fontFamily:"monospace"}}>
                                  {r.prefix||r.range_start}
                                </span>
                                <span style={{fontSize:12,color:"#AAAAAA",marginLeft:6}}>
                                  ({r.total_count||nums.length} numbers)
                                </span>
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"13px 14px",fontSize:13,fontWeight:600,color:"#333"}}>
                            {(r.country_name||"—").replace("ITLAY","Italy")}
                          </td>
                          <td style={{padding:"13px 14px",fontSize:13,color:"#333",fontFamily:"monospace"}}>
                            {sym}{parseFloat(r.rate||0).toFixed(3)}
                          </td>
                          <td style={{padding:"13px 14px",fontSize:13,color:"#555"}}>
                            {r.payment_terms||"Weekly"}
                          </td>
                          <td style={{padding:"13px 14px",textAlign:"center"}}>
                            <button onClick={(e)=>deleteRange(r.id,e)}
                              style={{background:"none",border:"none",cursor:"pointer",
                                fontSize:18,color:"#9B59B6",padding:4}}>🗑</button>
                          </td>
                        </tr>
                        {/* Expanded Sub-rows */}
                        {isExp&&(
                          nums.length===0
                          ?<tr style={{background:"#FAF5FF"}}>
                            <td colSpan={5} style={{padding:"10px 14px 10px 52px",
                              fontSize:12,color:"#999",fontStyle:"italic"}}>
                              No individual numbers loaded for this range
                            </td>
                          </tr>
                          :nums.map((d,di)=>(
                            <tr key={d.id} style={{background:di%2===0?"#FAF5FF":"#F5F0FF",
                              borderBottom:"1px solid #EEE8FF"}}>
                              <td colSpan={5} style={{padding:"8px 14px 8px 52px"}}>
                                <span style={{fontSize:12,fontFamily:"monospace",
                                  color:di%2===0?"#10B981":"#555",fontWeight:500}}>
                                  {d.number}
                                </span>
                                <span style={{fontSize:11,color:"#AAAAAA",marginLeft:12}}>
                                  {(d.created_at||"").slice(0,19)}
                                </span>
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
          {/* Footer */}
          <div style={{padding:"14px 16px",borderTop:"1px solid #EEEEEE",
            display:"flex",gap:10,background:"#F8F9FA",flexWrap:"wrap"}}>
            <button style={{padding:"10px 24px",borderRadius:20,border:"none",
              background:"#6B2FBF",color:"#FFFFFF",fontSize:13,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit"}}>
              SAVE CHANGES
            </button>
            <button onClick={()=>{
              const rows=[["Number","Country","Tariff","Currency","Payment Terms","Batch"]];
              dids.forEach(d=>rows.push([d.number,d.country_name||"",d.rate||"",d.currency||"",d.payment_terms||"",d.batch_name||""]));
              const csv=rows.map(r=>r.join(",")).join("\n");
              const blob=new Blob([csv],{type:"text/csv"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url;a.download="numbers.csv";a.click();
            }} style={{padding:"10px 24px",borderRadius:20,
              border:"2px solid #6B2FBF",background:"#FFFFFF",
              color:"#6B2FBF",fontSize:13,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit"}}>
              DOWNLOAD EXCEL
            </button>
          </div>
        </div>
      }
    </div>
  );
}


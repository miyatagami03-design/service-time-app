(() => {
"use strict";

const STEP_DEFS=[
  ["来店","arrival_at"],["説明","explanation_at"],["前菜","starter_at"],["鍋温め","pot_warm_at"],
  ["鍋作り終わり","pot_finish_at"],["山椒","sansho_at"],["あく取り・スープ","soup_at"],
  ["〆の発注","closing_order_at"],["〆作り終わり","closing_finish_at"],["あがりおしぼり","oshibori_at"],["会計","checkout_at"]
];
const COL_TO_LABEL=Object.fromEntries(STEP_DEFS.map(([l,c])=>[c,l]));
const STORAGE_KEY="service-time-local-v2";
const timeFmt=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hour12:false});
const dateFmt=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"long",day:"numeric",weekday:"short"});
const JST_DATE=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

let state=loadState();
let linkRepresentative=null;
let linkSelected=new Set();

function blankGroup(n){
  return {
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+n+"-"+Math.random(),
    representative_table:n,linked_tables:[n],reservation_time:null,
    arrival_at:null,explanation_at:null,starter_at:null,pot_warm_at:null,pot_finish_at:null,
    sansho_at:null,soup_at:null,closing_order_at:null,closing_finish_at:null,oshibori_at:null,checkout_at:null
  };
}
function freshState(){
  return {date:JST_DATE(),groups:Array.from({length:9},(_,i)=>blankGroup(i+1)),history:[]};
}
function loadState(){
  try{
    const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    if(x&&x.date===JST_DATE()&&Array.isArray(x.groups)) return x;
  }catch{}
  const x=freshState();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(x));
  return x;
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function fmtTime(v){return v?timeFmt.format(new Date(v)):""}
function elapsedFrom(v){
  if(!v)return"--:--:--";
  const sec=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/1000));
  return String(Math.floor(sec/3600)).padStart(2,"0")+":"+String(Math.floor(sec%3600/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");
}
function groupForTable(n){return state.groups.find(g=>(g.linked_tables||[]).includes(n))}
function hasService(g){return STEP_DEFS.some(([,c])=>!!g[c])}
function isLate(g){
  if(!g?.reservation_time||g.arrival_at||g.checkout_at)return false;
  const [h,m]=String(g.reservation_time).slice(0,5).split(":").map(Number);
  const now=new Date();
  const jp=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Tokyo"}));
  const r=new Date(jp);r.setHours(h,m,0,0);
  return jp>=r;
}
function potWarn(g){return !!(g?.pot_warm_at&&!g.pot_finish_at&&!g.checkout_at&&(Date.now()-new Date(g.pot_warm_at).getTime()>=330000))}
function twoHour(g){return !!(g?.arrival_at&&!g.checkout_at&&(Date.now()-new Date(g.arrival_at).getTime()>=7200000))}
function labelHtml(step){
  return step.replace("鍋作り終わり","鍋作り<br>終わり")
    .replace("あく取り・スープ","あく取り<br>・スープ")
    .replace("〆作り終わり","〆作り<br>終わり")
    .replace("あがりおしぼり","あがり<br>おしぼり");
}
function tableLabel(g){return [...g.linked_tables].sort((a,b)=>a-b).join("・")+"卓"}

function recordStep(g,col){
  if(g[col]){
    const label=COL_TO_LABEL[col];
    if(!confirm("「"+label+"」の記録を取り消しますか？"))return;
    g[col]=null;
  }else{
    g[col]=new Date().toISOString();
  }
  save();render();
}
let reservationTarget=null;
function openReservation(g){
  if(!g)return;
  reservationTarget=g;
  const dlg=document.getElementById("reservationDialog");
  document.getElementById("reservationTitle").textContent=tableLabel(g)+"の予約時間";
  const current=g.reservation_time?String(g.reservation_time).slice(0,5):"";
  let [hh,mm]=current?current.split(":"):["18","00"];
  document.getElementById("reservationHour").value=hh;
  document.getElementById("reservationMinute").value=mm;
  dlg.showModal();
}
function saveReservation(){
  if(!reservationTarget)return;
  const h=document.getElementById("reservationHour").value;
  const m=document.getElementById("reservationMinute").value;
  reservationTarget.reservation_time=h+":"+m;
  save();
  document.getElementById("reservationDialog").close();
  reservationTarget=null;
  render();
}
function clearReservation(){
  if(!reservationTarget)return;
  reservationTarget.reservation_time=null;
  save();
  document.getElementById("reservationDialog").close();
  reservationTarget=null;
  render();
}
function nextGroup(g){
  if(!confirm(tableLabel(g)+"を次の組に切り替えますか？\n現在の記録は履歴に保存されます。"))return;
  const hasAny=!!g.reservation_time||hasService(g);
  if(hasAny){
    state.history.unshift({...JSON.parse(JSON.stringify(g)),archived_at:new Date().toISOString()});
  }
  const tables=[...g.linked_tables];
  state.groups=state.groups.filter(x=>x.id!==g.id);
  for(const n of tables)state.groups.push(blankGroup(n));
  state.groups.sort((a,b)=>a.representative_table-b.representative_table);
  save();render();
}
function resetToday(){
  if(!confirm("今日のすべての記録をリセットしますか？\n1〜9卓の記録と当日履歴が削除されます。"))return;
  state=freshState();save();render();
}

function render(){
  document.getElementById("dateLabel").textContent=dateFmt.format(new Date());
  const body=document.getElementById("body");
  body.innerHTML="";
  for(let n=1;n<=9;n++){
    const g=groupForTable(n);
    const tr=document.createElement("tr");
    const seat=document.createElement("td");seat.className="seatcell";seat.textContent=n;tr.appendChild(seat);

    if(g && g.representative_table!==n){
      const td=document.createElement("td");td.colSpan=14;td.className="linked-placeholder";
      td.textContent=g.representative_table+"卓と連結中（"+tableLabel(g)+"）";
      tr.appendChild(td);body.appendChild(tr);continue;
    }

    const tdRes=document.createElement("td");
    const rb=document.createElement("button");rb.type="button";rb.className="timeinput-btn"+(g?.reservation_time?"":" empty");
    rb.textContent=g?.reservation_time?String(g.reservation_time).slice(0,5):"";
    rb.onclick=()=>openReservation(g);tdRes.appendChild(rb);tr.appendChild(tdRes);

    const tdEl=document.createElement("td");
    const sp=document.createElement("span");sp.className="elapsed"+(twoHour(g)?" danger":"");sp.textContent=elapsedFrom(g?.arrival_at);
    tdEl.appendChild(sp);tr.appendChild(tdEl);

    for(const [label,col] of STEP_DEFS){
      const td=document.createElement("td");
      if(label==="来店"&&isLate(g))td.classList.add("late");
      if(label==="鍋作り終わり")td.classList.add("milestone30");
      if(label==="〆の発注")td.classList.add("milestone60");
      const b=document.createElement("button");b.type="button";
      b.className="step"+(g?.[col]?" done":"")+(col==="pot_finish_at"&&potWarn(g)?" warn":"");
      b.innerHTML="<span>"+labelHtml(label)+"</span>"+(g?.[col]?"<span class='t'>"+fmtTime(g[col])+"</span>":"");
      b.onclick=()=>recordStep(g,col);td.appendChild(b);tr.appendChild(td);
    }

    const tdN=document.createElement("td");
    const nb=document.createElement("button");nb.type="button";nb.className="next";nb.textContent="次の組";nb.onclick=()=>nextGroup(g);
    tdN.appendChild(nb);tr.appendChild(tdN);
    body.appendChild(tr);
  }
}

function renderHistory(){
  const box=document.getElementById("historyContent");box.innerHTML="";
  if(!state.history.length){box.textContent="まだ履歴はありません。";return}
  for(const h of state.history){
    const card=document.createElement("div");card.className="history-card";
    const res=h.reservation_time?String(h.reservation_time).slice(0,5):"—";
    const arr=fmtTime(h.arrival_at)||"—",co=fmtTime(h.checkout_at)||"—";
    card.innerHTML="<button type='button'><div class='history-title'>"+tableLabel(h)+"　予約 "+res+"</div><div class='history-sub'>来店 "+arr+"　→　会計 "+co+"</div><div class='history-detail' style='display:none'></div></button>";
    const detail=card.querySelector(".history-detail");
    detail.innerHTML=STEP_DEFS.map(([l,c])=>h[c]?l+" "+fmtTime(h[c]):"").filter(Boolean).join(" ｜ ")||"記録なし";
    card.querySelector("button").onclick=()=>detail.style.display=detail.style.display==="none"?"block":"none";
    box.appendChild(card);
  }
}

function openLinkDialog(){
  linkRepresentative=null;linkSelected=new Set();renderLinkChoices();document.getElementById("linkDialog").showModal();
}
function renderLinkChoices(){
  const box=document.getElementById("linkChoices");box.innerHTML="";
  for(let n=1;n<=9;n++){
    const g=groupForTable(n),b=document.createElement("button");
    b.type="button";b.className="choice";b.textContent=n+"卓";
    const selected=linkSelected.has(n) || (linkRepresentative&&g?.id===linkRepresentative);
    if(selected)b.classList.add("selected");
    b.onclick=()=>{
      if(!linkRepresentative){
        if(!g||g.linked_tables.length>1||hasService(g))return alert("この卓は現在連結できません。");
        linkRepresentative=g.id;linkSelected=new Set([n]);
      }else{
        const rep=state.groups.find(x=>x.id===linkRepresentative);
        if(g?.id===rep?.id)return;
        if(!g||g.linked_tables.length>1||hasService(g))return alert("この卓は現在連結できません。");
        if(linkSelected.has(n))linkSelected.delete(n);else linkSelected.add(n);
      }
      renderLinkChoices();
    };
    box.appendChild(b);
  }
  const rep=state.groups.find(x=>x.id===linkRepresentative);
  document.getElementById("linkInstructions").textContent=rep?("代表卓："+rep.representative_table+"卓　連結する卓を選択"):"最初に代表卓を選んでください。";
  const warnings=[];
  if(rep){
    for(const n of linkSelected){
      const g=groupForTable(n);
      if(g&&g.id!==rep.id&&g.reservation_time)warnings.push(n+"卓の予約 "+String(g.reservation_time).slice(0,5)+" は使用されなくなります。");
    }
  }
  document.getElementById("linkWarning").textContent=warnings.join(" ");
}
function confirmLink(){
  const rep=state.groups.find(x=>x.id===linkRepresentative);
  if(!rep||linkSelected.size<2)return alert("連結する卓を2卓以上選んでください。");
  const targets=[...linkSelected].sort((a,b)=>a-b);
  const groupsToRemove=[];
  for(const n of targets){
    const g=groupForTable(n);
    if(g&&g.id!==rep.id&&!groupsToRemove.includes(g))groupsToRemove.push(g);
  }
  let msg=targets.join("・")+"卓を連結します。\n代表卓："+rep.representative_table+"卓";
  for(const g of groupsToRemove){
    if(g.reservation_time)msg+="\n"+g.representative_table+"卓の予約 "+String(g.reservation_time).slice(0,5)+" は使用されなくなります。";
  }
  if(!confirm(msg))return;
  rep.linked_tables=targets;
  state.groups=state.groups.filter(g=>!groupsToRemove.some(x=>x.id===g.id));
  save();document.getElementById("linkDialog").close();render();
}

document.getElementById("historyBtn").onclick=()=>{renderHistory();document.getElementById("historyDialog").showModal()};
document.getElementById("linkBtn").onclick=openLinkDialog;
document.getElementById("resetBtn").onclick=resetToday;
document.getElementById("versionBtn").onclick=()=>document.getElementById("versionDialog").showModal();
document.getElementById("confirmLinkBtn").onclick=confirmLink;
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());

setInterval(()=>{
  const today=JST_DATE();
  if(today!==state.date){state=freshState();save()}
  render();
},1000);

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
      await reg.update();
      let reloading=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(reloading)return;
        reloading=true;
        location.reload();
      });
    }catch(err){
      console.warn("Service Worker update failed:",err);
    }
  });
}
(function initReservationPicker(){
  const hs=document.getElementById("reservationHour");
  const ms=document.getElementById("reservationMinute");
  for(let h=0;h<24;h++){const o=document.createElement("option");o.value=String(h).padStart(2,"0");o.textContent=o.value;hs.appendChild(o)}
  for(let m=0;m<60;m+=5){const o=document.createElement("option");o.value=String(m).padStart(2,"0");o.textContent=o.value;ms.appendChild(o)}
  document.getElementById("reservationSaveBtn").onclick=saveReservation;
  document.getElementById("reservationClearBtn").onclick=clearReservation;
})();

render();
})();

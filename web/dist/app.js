"use strict";(()=>{var Y=class extends Error{status;code;details;constructor(t,n,a,l){super(a),this.name="ApiError",this.status=t,this.code=n,this.details=l}get field(){return this.details?.field}};function B(e){return e instanceof Y?e:e instanceof Error?new Y(0,"internal_error",e.message):new Y(0,"internal_error","An unexpected error occurred.")}function Ce(e){return typeof e=="object"&&e!==null}function Ft(e){if(!Ce(e)||!Ce(e.error))return null;let t=e.error;if(typeof t.code!="string"||typeof t.message!="string")return null;let n;if(Ce(t.details)){n={};for(let[a,l]of Object.entries(t.details))typeof l=="string"&&(n[a]=l)}return{code:t.code,message:t.message,details:n}}var tt="admin";function Se(e){tt=e}async function z(e,t){let n,a={...t,headers:{...t?.headers??{},"X-Actor":tt}};try{n=await fetch(e,a)}catch(p){let L=p instanceof Error?p.message:"Network request failed.";throw new Y(0,"network_error",L)}let l=await n.text(),c=null;if(l.length>0)try{c=JSON.parse(l)}catch{c=null}if(!n.ok){let p=Ft(c);throw new Y(n.status,p?.code??"internal_error",p?.message??`Request failed with HTTP ${n.status}.`,p?.details)}return c}function J(e,t,n){return z(e,{method:t,headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}function nt(){return z("/api/catalog")}function at(e){let t=new URLSearchParams;return e.status&&t.set("status",e.status),e.productId&&t.set("productId",e.productId),t.set("limit","200"),z(`/api/visits?${t.toString()}`)}function rt(e){return z(`/api/visits/${encodeURIComponent(e)}`)}function it(e){return J("/api/visits","POST",e)}function ot(e,t){return J(`/api/visits/${encodeURIComponent(e)}/checkin`,"POST",t)}function lt(e,t){return J(`/api/visits/${encodeURIComponent(e)}/checkout`,"POST",t)}function st(e,t){return J(`/api/visits/${encodeURIComponent(e)}/report`,"PUT",t)}function dt(e,t){return J(`/api/visits/${encodeURIComponent(e)}/cancel`,"POST",{reason:t})}function ct(e,t){return J(`/api/visits/${encodeURIComponent(e)}/void`,"POST",{reason:t})}function ut(e){return z(`/api/visits/${encodeURIComponent(e)}`,{method:"DELETE"})}function pt(){return z("/api/admin/rules")}function mt(e){return J("/api/admin/rules","PUT",e)}function ft(e=6){return z(`/api/dashboard/monthly?months=${e}`)}function i(e,t){let n=e.querySelector(t);if(n===null)throw new Error(`Missing required element: ${t}`);return n}function d(e,t,n){let a=document.createElement(e);return t&&(a.className=t),n!==void 0&&(a.textContent=n),a}function ee(e,t){let n=document.createElement("option");return n.value=e,n.textContent=t,n}function Ot(){return{catalog:null,actor:"",rules:null,ruleHistory:[],visits:[],selected:null,dashboard:null,filters:{status:"",productId:""},loading:{catalog:!1,visits:!1,selected:!1,dashboard:!1,mutation:!1},errors:{catalog:null,list:null,detail:null,dashboard:null,plan:null,checkin:null,checkout:null,report:null,terminal:null,rules:null}}}function bt(){let e=Ot(),t=new Set;return{getState:()=>e,update:n=>{e=n(e);for(let a of t)a(e)},subscribe:n=>(t.add(n),()=>t.delete(n))}}var qt=["1\u6708","2\u6708","3\u6708","4\u6708","5\u6708","6\u6708","7\u6708","8\u6708","9\u6708","10\u6708","11\u6708","12\u6708"],ge=e=>String(e).padStart(2,"0"),Bt={PLANNED:"\u5DF2\u8BA1\u5212",CHECKED_IN:"\u5DF2\u7B7E\u5230",CHECKED_OUT:"\u5DF2\u7B7E\u9000",REPORTED:"\u5DF2\u5B8C\u6210",CANCELLED:"\u5DF2\u53D6\u6D88",VOIDED:"\u5DF2\u4F5C\u5E9F",DELETED:"\u5DF2\u5220\u9664"};function he(e){return Bt[e]}function He(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${we(e)} ${De(e)}`}function we(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${t.getFullYear()}-${ge(t.getMonth()+1)}-${ge(t.getDate())}`}function De(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${ge(t.getHours())}:${ge(t.getMinutes())}`}function gt(e){let t=/^(\d{4})-(\d{2})$/.exec(e);if(!t)return e;let n=Number(t[1]),a=Number(t[2])-1;return!Number.isInteger(n)||a<0||a>11?e:`${qt[a]} ${n}`}function ht(e){if(!Number.isFinite(e))return"\u2014";let t=Math.max(0,Math.floor(e)),n=Math.floor(t/3600),a=Math.floor(t%3600/60),l=t%60;return n>0?`${n} \u5C0F\u65F6 ${a} \u5206 ${l} \u79D2`:a>0?`${a} \u5206 ${l} \u79D2`:`${l} \u79D2`}function ve(e){if(!Number.isFinite(e)||e<=0)return"0%";let t=e*100,n=Math.round(t*10)/10;return n<1?"<1%":n>=100?"100%":Number.isInteger(n)?`${n}%`:`${n.toFixed(1)}%`}function $e(e){return Number.isFinite(e)?`${Math.round(Math.max(0,e))} m`:"\u2014"}function Ie(e){return Number.isFinite(e)?e.toFixed(6):"\u2014"}function O(e){return String(e).padStart(2,"0")}function _t(e){return`${e.getFullYear()}-${O(e.getMonth()+1)}-${O(e.getDate())}T${O(e.getHours())}:${O(e.getMinutes())}`}function Ve(e=new Date){let t=new Date(e.getFullYear(),e.getMonth(),e.getDate()+1,10,0,0,0);return _t(t)}function vt(e){let t=-e.getTimezoneOffset(),n=t>=0?"+":"-",a=Math.abs(t);return`${e.getFullYear()}-${O(e.getMonth()+1)}-${O(e.getDate())}T${O(e.getHours())}:${O(e.getMinutes())}:${O(e.getSeconds())}${n}${O(Math.floor(a/60))}:${O(a%60)}`}function Re(e){return e==="PLANNED"||e==="CHECKED_IN"||e==="CHECKED_OUT"||e==="REPORTED"||e==="CANCELLED"||e==="VOIDED"||e==="DELETED"}function Et(e,t,n){switch(e){case"forbidden":return n==="mrId"?"\u53EA\u80FD\u7ED9\u81EA\u5DF1\u521B\u5EFA\u62DC\u8BBF\u8BA1\u5212\u3002":"\u6CA1\u6709\u6743\u9650\u6267\u884C\u8FD9\u4E2A\u64CD\u4F5C\u3002";case"not_found":return"\u8FD9\u6761\u8BB0\u5F55\u4E0D\u5B58\u5728\uFF0C\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\u3002";case"invalid_state":return t.includes("cancel")?"\u5F53\u524D\u72B6\u6001\u4E0D\u80FD\u53D6\u6D88\uFF0C\u53EA\u6709\u300C\u5DF2\u8BA1\u5212\u300D\u7684\u62DC\u8BBF\u53EF\u4EE5\u53D6\u6D88\u3002":t.includes("void")?"\u5F53\u524D\u72B6\u6001\u4E0D\u80FD\u4F5C\u5E9F\uFF1A\u4F5C\u5E9F\u53EA\u5BF9\u300C\u5DF2\u7B7E\u5230\u300D\u5F00\u653E\u3002":t.includes("delete")?t.includes("window")?"\u5220\u9664\u7A97\u53E3\u5DF2\u5173\u95ED\uFF1A\u53EA\u80FD\u5728\u521B\u5EFA\u540E 1 \u5C0F\u65F6\u5185\u3001\u4E14\u8DDD\u5F00\u59CB\u8D85\u8FC7 1 \u5C0F\u65F6\u65F6\u5220\u9664\uFF0C\u8BF7\u6539\u4E3A\u53D6\u6D88\u3002":"\u5F53\u524D\u72B6\u6001\u4E0D\u80FD\u5220\u9664\u3002":t.includes("check")?"\u5F53\u524D\u72B6\u6001\u4E0D\u5141\u8BB8\u7B7E\u5230\u6216\u7B7E\u9000\u3002":t.includes("report")?"\u5F53\u524D\u72B6\u6001\u4E0D\u80FD\u63D0\u4EA4\u8BB0\u5F55\uFF0C\u8BF7\u5148\u7B7E\u9000\u3002":"\u8FD9\u6B21\u64CD\u4F5C\u4E0E\u62DC\u8BBF\u7684\u5F53\u524D\u72B6\u6001\u51B2\u7A81\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002";case"conflict":return t.includes("already checked in")?"\u4F60\u8FD8\u6709\u4E00\u6761\u672A\u7B7E\u9000\u7684\u62DC\u8BBF\uFF0C\u8BF7\u5148\u7B7E\u9000\u3002":"\u8FD9\u6761\u62DC\u8BBF\u521A\u88AB\u5176\u4ED6\u4EBA\u4FEE\u6539\u8FC7\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002";case"validation_failed":return t.startsWith("a reason is required")?"\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002":t;case"network_error":return"\u7F51\u7EDC\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002";default:return t}}function P(){let e=document.createElement("div");e.className="error-banner",e.dataset.testid="error-banner",e.setAttribute("role","alert"),e.hidden=!0;let t=document.createElement("code");t.className="error-code";let n=document.createElement("span");n.className="error-field";let a=document.createElement("span");a.className="error-message",e.append(t,n,a);let l=null;function c(p,L,y,u){if(p!==l){if(l=p,p===null){e.hidden=!0,t.textContent="",n.textContent="",a.textContent="";return}e.hidden=!1,t.hidden=L==="",t.textContent=L,n.hidden=y==="",n.textContent=y,a.textContent=u}}return{element:e,show:p=>{if(p===null){c(null,"","","");return}let L=p.field?`field: ${p.field}`:"",y=Et(p.code,p.message,p.field);c(`api:${p.code}:${L}:${y}`,p.code,L,y)},showText:p=>{c(`text:${p}`,"","",p)},clear:()=>c(null,"","","")}}var Kt=`
  <section class="card dashboard-card" aria-labelledby="dashboard-heading">
    <div class="card-head">
      <div>
        <h2 id="dashboard-heading">\u6309\u4EA7\u54C1\u7684\u6708\u5EA6\u62DC\u8BBF</h2>
        <p class="hint">\u6708\u4EFD\u6765\u81EA\u670D\u52A1\u7AEF\u3002\u6BCF\u683C\u4E3A\u62DC\u8BBF\u6B21\u6570\uFF08\u62EC\u53F7\u5185\u4E3A\u5F02\u5E38\u5360\u6BD4\uFF09\u3002</p>
      </div>
      <button class="btn btn-small" type="button" data-testid="dashboard-refresh" data-dashboard-refresh>\u5237\u65B0</button>
    </div>
    <div data-dashboard-banner></div>
    <div data-dashboard-content></div>
  </section>
`;function Ut(e){let t=new Map;for(let E of e.rows){let b=t.get(E.productId);b===void 0&&(b={productId:E.productId,productName:E.productName,byMonth:new Map},t.set(E.productId,b)),b.byMonth.set(E.month,E)}let n=[...t.values()].sort((E,b)=>E.productName.localeCompare(b.productName)),a=d("div","table-wrap"),l=d("table","dashboard-table");l.dataset.testid="dashboard-table";let c=d("thead"),p=d("tr"),L=d("th",void 0,"\u836F\u54C1");L.scope="col",p.append(L);for(let E of e.months){let b=d("th",void 0,gt(E));b.scope="col",b.title=E,p.append(b)}c.append(p);let y=new Map;for(let E of e.months)y.set(E,{visits:0,done:0,cancelled:0,voided:0,abnormal:0});let u=d("tbody");for(let E of n){let b=d("tr"),S=d("th","row-heading",E.productName);S.scope="row",b.append(S);for(let s of e.months){let h=E.byMonth.get(s),g=h?.visits??0,x=h?.abnormal??0,R=h?.abnormalShare??0,w=h?.done??0,o=h?.cancelled??0,v=h?.voided??0,k=y.get(s);k&&(k.visits+=g,k.done+=w,k.cancelled+=o,k.voided+=v,k.abnormal+=x);let $=d("td","dashboard-cell",`${w} / ${ve(R)}`);R>0&&$.classList.add("has-abnormal"),$.title=`${s}\uFF1A\u5B8C\u6210 ${w}\uFF08\u6709\u6548 ${h?.effective??0} \xB7 \u5F02\u5E38 ${x}\uFF09 \xB7 \u53D6\u6D88 ${o} \xB7 \u4F5C\u5E9F ${v}`,$.dataset.month=s,$.dataset.visits=String(g),$.dataset.abnormal=String(x),b.append($)}u.append(b)}let C=d("tfoot"),T=d("tr","total-row"),N=d("th",void 0,"\u5408\u8BA1");N.scope="row",T.append(N);for(let E of e.months){let b=y.get(E)??{visits:0,done:0,cancelled:0,voided:0,abnormal:0},S=b.done>0?b.abnormal/b.done:0,s=d("td","dashboard-cell",`${b.done} / ${ve(S)}`);S>0&&s.classList.add("has-abnormal"),s.title=`${E}\uFF1A\u5B8C\u6210 ${b.done} \xB7 \u5F02\u5E38 ${b.abnormal} \xB7 \u53D6\u6D88 ${b.cancelled} \xB7 \u4F5C\u5E9F ${b.voided}`,T.append(s)}return C.append(T),l.append(c,u,C),a.append(l),a}function Lt(e,t){e.innerHTML=Kt;let n=i(e,".dashboard-card"),a=i(e,"[data-dashboard-content]"),l=i(e,"[data-dashboard-refresh]"),c=P();i(e,"[data-dashboard-banner]").append(c.element);let p=null;l.addEventListener("click",()=>t.onRefresh());function L(u){let C=d("div","empty-state");C.append(d("p",void 0,u)),a.replaceChildren(C)}function y(u){if(u.rows.length===0){L("No check-ins recorded in the last 6 months.");return}let C=u.totalDone>0?u.totalAbnormal/u.totalDone:0,T=d("p","totals-line");T.append(document.createTextNode(`\u8FD1 ${u.months.length} \u4E2A\u6708 \xB7 \u5B8C\u6210 ${u.totalDone}\uFF08\u6709\u6548 ${u.totalEffective} \xB7 \u5F02\u5E38 ${u.totalAbnormal}\uFF09\xB7 \u53D6\u6D88 ${u.totalCancelled} \xB7 \u4F5C\u5E9F ${u.totalVoided} \xB7 \u5F02\u5E38\u7387 `),d("strong",void 0,ve(C)),document.createTextNode("\uFF08\u5220\u9664\u4E0D\u8BA1\u5165\u4EFB\u4F55\u4E00\u9879\uFF09")),a.replaceChildren(Ut(u),T)}return{update(u){if(n.setAttribute("aria-busy",String(u.loading.dashboard)),l.disabled=u.loading.dashboard,c.show(u.errors.dashboard),u.dashboard===null){u.loading.dashboard?L("Loading monthly dashboard\u2026"):u.errors.dashboard?L("\u770B\u677F\u6570\u636E\u52A0\u8F7D\u5931\u8D25\u3002"):L("\u6682\u65E0\u770B\u677F\u6570\u636E\u3002"),p=null;return}u.dashboard!==p&&(p=u.dashboard,y(u.dashboard))}}}var jt=`
  <section class="card rules-card" data-rules-card hidden aria-labelledby="rules-heading">
    <div class="card-head">
      <div>
        <h2 id="rules-heading">\u5408\u89C4\u89C4\u5219</h2>
        <p class="hint">\u6539\u9608\u503C\u4F1A\u751F\u6210\u65B0\u7248\u672C\uFF0C\u53EA\u5F71\u54CD\u4E4B\u540E\u7684\u5224\u5B9A\uFF1B\u5386\u53F2\u5224\u5B9A\u4E0D\u56DE\u6EAF\u3002</p>
      </div>
      <span class="badge" data-rules-version></span>
    </div>
    <form class="rules-form" data-rules-form>
      <div class="field">
        <label for="rules-min">\u6700\u77ED\u505C\u7559\u65F6\u957F\uFF08\u79D2\uFF09</label>
        <input id="rules-min" data-testid="rules-min" type="number" min="30" step="1" required>
      </div>
      <div class="field">
        <label for="rules-max">\u6700\u5927\u504F\u79BB\u8DDD\u79BB\uFF08\u7C73\uFF09</label>
        <input id="rules-max" data-testid="rules-max" type="number" min="50" step="1" required>
      </div>
      <div class="field">
        <label for="rules-timeout">\u60AC\u6302\u8D85\u65F6\uFF08\u5C0F\u65F6\uFF09</label>
        <input id="rules-timeout" data-testid="rules-timeout" type="number" min="1" step="1" required>
      </div>
      <div class="field">
        <label for="rules-report">\u8865\u8BB0\u5F55\u65F6\u9650\uFF08\u5C0F\u65F6\uFF09</label>
        <input id="rules-report" data-testid="rules-report" type="number" min="1" step="1" required>
      </div>
      <div class="field">
        <label for="rules-note">\u53D8\u66F4\u8BF4\u660E</label>
        <input id="rules-note" data-testid="rules-note" type="text" maxlength="200" placeholder="\u4E3A\u4EC0\u4E48\u6539\uFF1F">
      </div>
      <div data-rules-banner></div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit" data-testid="rules-submit">\u4FDD\u5B58\u5E76\u751F\u6548</button>
        <span class="hint" data-rules-hint></span>
      </div>
    </form>
    <table class="rules-history" data-rules-history hidden>
      <thead><tr><th>\u7248\u672C</th><th>\u505C\u7559</th><th>\u8DDD\u79BB</th><th>\u60AC\u6302</th><th>\u8865\u8BB0\u5F55</th><th>\u751F\u6548\u65F6\u95F4</th><th>\u64CD\u4F5C\u4EBA</th></tr></thead>
      <tbody data-rules-history-rows></tbody>
    </table>
  </section>
`;function Wt(e){let t=new Date(e);if(Number.isNaN(t.getTime()))return"\u2014";let n=a=>String(a).padStart(2,"0");return`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())} ${n(t.getHours())}:${n(t.getMinutes())}`}function Tt(e,t){e.innerHTML=jt;let n=i(e,"[data-rules-card]"),a=i(e,"[data-rules-form]"),l=i(e,"[data-rules-version]"),c=i(e,"#rules-min"),p=i(e,"#rules-max"),L=i(e,"#rules-timeout"),y=i(e,"#rules-report"),u=i(e,"#rules-note"),C=i(e,'[data-testid="rules-submit"]'),T=i(e,"[data-rules-hint]"),N=i(e,"[data-rules-history]"),E=i(e,"[data-rules-history-rows]"),b=P();i(e,"[data-rules-banner]").append(b.element);let S="";function s(g){c.value=String(g.minDurationSeconds),p.value=String(g.maxDistanceMeters),L.value=String(g.timeoutHours),y.value=String(g.reportTimeoutHours),l.textContent=`\u5F53\u524D ${g.version}`,S=g.version}function h(g){if(g.length<=1){N.hidden=!0;return}N.hidden=!1,E.replaceChildren();for(let x of g){let R=document.createElement("tr");for(let w of[x.version,`${x.minDurationSeconds} \u79D2`,`${x.maxDistanceMeters} \u7C73`,`${x.timeoutHours} \u5C0F\u65F6`,`${x.reportTimeoutHours} \u5C0F\u65F6`,Wt(x.createdAt),x.createdBy||"\u2014"]){let o=document.createElement("td");o.textContent=w,R.append(o)}E.append(R)}}return a.addEventListener("submit",g=>{g.preventDefault(),a.reportValidity()&&(b.clear(),t.onSave({minDurationSeconds:Number(c.value),maxDistanceMeters:Number(p.value),timeoutHours:Number(L.value),reportTimeoutHours:Number(y.value),note:u.value.trim()}))}),{update(g){let x=g.actor==="";if(n.hidden=!x,!x)return;let R=g.errors.rules;R?b.showText(R.message):b.clear(),C.disabled=g.loading.mutation;let w=g.rules;if(!w){T.textContent="\u6B63\u5728\u52A0\u8F7D\u89C4\u5219\u2026";return}S!==w.version&&(s(w),u.value=""),T.textContent=`\u5F53\u524D\u751F\u6548 ${w.version}\uFF1A${w.minDurationSeconds} \u79D2 / ${w.maxDistanceMeters} \u7C73 / \u60AC\u6302 ${w.timeoutHours} \u5C0F\u65F6 / \u8865\u8BB0\u5F55 ${w.reportTimeoutHours} \u5C0F\u65F6`,h(g.ruleHistory)}}}var Yt=63710088e-1,de=500;function Ae(e,t){if(![e.lat,e.lng,t.lat,t.lng].every(C=>Number.isFinite(C)))return Number.NaN;let a=e.lat*Math.PI/180,l=t.lat*Math.PI/180,c=(t.lat-e.lat)*Math.PI/180,p=(t.lng-e.lng)*Math.PI/180,L=Math.sin(c/2),y=Math.sin(p/2),u=L*L+Math.cos(a)*Math.cos(l)*y*y;return u>1&&(u=1),2*Yt*Math.asin(Math.sqrt(u))}var zt=[{value:"slide",label:"Slide"},{value:"reprint",label:"\u91CD\u5370\u4EF6"},{value:"document",label:"\u6587\u732E"},{value:"other",label:"Other"}],Jt=["\u8BA1\u5212","\u7B7E\u5230","\u5B66\u672F\u6C9F\u901A","\u7B7E\u9000","\u53CD\u9988\u8BB0\u5F55"],Xt={PLANNED:["done","current","pending","pending","pending"],CHECKED_IN:["done","done","current","pending","pending"],CHECKED_OUT:["done","done","done","done","current"],REPORTED:["done","done","done","done","done"],CANCELLED:["done","pending","pending","pending","pending"],VOIDED:["done","done","pending","pending","pending"],DELETED:["done","pending","pending","pending","pending"]},Gt=`
  <section class="card detail-card" data-testid="visit-detail" aria-labelledby="detail-heading">
    <div data-detail-banner></div>
    <div class="detail-empty" data-detail-empty>
      <p data-detail-empty-text>\u4ECE\u5DE6\u4FA7\u5217\u8868\u9009\u62E9\u4E00\u6761\u62DC\u8BBF\uFF0C\u67E5\u770B\u8BE6\u60C5\u4E0E\u5408\u89C4\u8BC1\u636E\u3002</p>
    </div>
    <div class="detail-body" data-detail-body hidden>
      <header class="detail-head">
        <div class="detail-title">
          <p class="eyebrow">\u62DC\u8BBF\u8BE6\u60C5</p>
          <h2 id="detail-heading" data-detail-hcp></h2>
          <p class="detail-subtitle" data-detail-subtitle></p>
        </div>
        <span class="pill" data-status-pill data-testid="status-pill"></span>
      </header>

      <div class="abnormal-panel" data-abnormal hidden aria-labelledby="abnormal-heading">
        <div class="abnormal-head">
          <h3 id="abnormal-heading">\u5F02\u5E38\u62DC\u8BBF</h3>
          <span class="badge badge-abnormal">\u5F02\u5E38</span>
        </div>
        <p class="abnormal-intro">\u670D\u52A1\u7AEF\u5728\u7B7E\u9000\u65F6\u547D\u4E2D\u4EE5\u4E0B\u5408\u89C4\u89C4\u5219\uFF0C\u5168\u90E8\u5217\u51FA\u3002</p>
        <ul class="flag-list" data-flag-list data-testid="flag-list"></ul>
      </div>

      <p class="compliance-note" data-compliance-note hidden></p>
      <ol class="timeline" data-timeline aria-label="Visit steps"></ol>
      <p class="meta-line" data-meta></p>

      <section class="step" aria-labelledby="checkin-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">\u7B2C 2 \u6B65</p>
            <h3 id="checkin-heading">\u7B7E\u5230</h3>
          </div>
        </div>
        <p class="hint">\u5750\u6807\u4E0E\u533B\u9662\u767B\u8BB0\u57FA\u51C6\u70B9\u6BD4\u5BF9\uFF08\u9608\u503C 500 \u7C73\uFF09\u3002\u65F6\u95F4\u6233\u7531\u670D\u52A1\u7AEF\u751F\u6210\u3002</p>
        <p class="record" data-checkin-record hidden></p>
        <form class="geo-form" data-checkin-form data-testid="checkin-form">
          <div class="field">
            <label for="checkin-lat">\u7EAC\u5EA6</label>
            <input id="checkin-lat" data-testid="checkin-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkin-distance">
          </div>
          <div class="field">
            <label for="checkin-lng">\u7ECF\u5EA6</label>
            <input id="checkin-lng" data-testid="checkin-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkin-distance">
          </div>
          <p class="distance-hint" id="checkin-distance" data-checkin-distance data-testid="distance-hint" aria-live="polite"></p>
          <div data-checkin-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkin-submit">\u7B7E\u5230</button>
            <span class="hint" data-checkin-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="checkout-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">\u7B2C 4 \u6B65</p>
            <h3 id="checkout-heading">\u7B7E\u9000</h3>
          </div>
        </div>
        <p class="hint">\u7B7E\u9000\u7ED3\u675F\u672C\u6B21\u505C\u7559\u3002\u670D\u52A1\u7AEF\u8BA1\u7B97\u65F6\u957F\uFF0C\u5E76\u91CD\u65B0\u6821\u9A8C\u7B7E\u5230\u70B9\u4E0E\u7B7E\u9000\u70B9\u3002</p>
        <p class="record" data-checkout-record hidden></p>
        <p class="duration-line">\u670D\u52A1\u7AEF\u8BA1\u7B97\u65F6\u957F\uFF1A<strong class="duration-value" data-duration-value data-testid="duration-value">\u2014</strong> <span class="hint" data-duration-note></span></p>
        <form class="geo-form" data-checkout-form data-testid="checkout-form">
          <div class="field">
            <label for="checkout-lat">\u7EAC\u5EA6</label>
            <input id="checkout-lat" data-testid="checkout-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkout-distance">
          </div>
          <div class="field">
            <label for="checkout-lng">\u7ECF\u5EA6</label>
            <input id="checkout-lng" data-testid="checkout-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkout-distance">
          </div>
          <p class="distance-hint" id="checkout-distance" data-checkout-distance data-testid="checkout-distance-hint" aria-live="polite"></p>
          <div data-checkout-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkout-submit">\u7B7E\u9000</button>
            <span class="hint" data-checkout-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="report-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">\u7B2C 5 \u6B65</p>
            <h3 id="report-heading">\u62DC\u8BBF\u8BB0\u5F55</h3>
          </div>
        </div>
        <form class="report-form" data-report-form data-testid="report-form">
          <div class="field">
            <label for="report-talking-points">\u8C08\u8BDD\u8981\u70B9</label>
            <textarea id="report-talking-points" data-testid="report-talking-points" rows="3" maxlength="4000"></textarea>
          </div>
          <div class="field">
            <label for="report-feedback">\u533B\u751F\u53CD\u9988</label>
            <textarea id="report-feedback" data-testid="report-feedback" rows="3" maxlength="4000"></textarea>
          </div>
          <label class="checkbox">
            <input type="checkbox" data-testid="report-materials-distributed" data-materials-distributed>
            <span>\u5DF2\u6D3E\u53D1\u8D44\u6599</span>
          </label>
          <div class="materials" data-materials-block hidden>
            <div class="materials-head">
              <span class="materials-title">\u8D44\u6599</span>
              <button class="btn btn-small" type="button" data-testid="report-material-add" data-material-add>\u6DFB\u52A0\u8D44\u6599</button>
            </div>
            <div class="materials-list" data-material-rows></div>
          </div>
          <div data-report-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="report-submit">\u63D0\u4EA4\u62DC\u8BBF\u8BB0\u5F55</button>
            <span class="hint" data-report-hint></span>
          </div>
        </form>
      </section>

      <section class="card detail-card" data-terminal-card aria-labelledby="terminal-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">\u63D0\u524D\u7ED3\u675F\u8FD9\u6B21\u62DC\u8BBF</p>
            <h3 id="terminal-heading">\u53D6\u6D88\u6216\u4F5C\u5E9F</h3>
          </div>
        </div>
        <p class="hint" data-terminal-hint></p>
        <div class="field">
          <label for="terminal-reason">\u539F\u56E0\uFF08\u53D6\u6D88\u4E0E\u4F5C\u5E9F\u5FC5\u586B\uFF09</label>
          <textarea id="terminal-reason" data-testid="terminal-reason" rows="2" maxlength="500"></textarea>
        </div>
        <div data-terminal-banner></div>
        <div class="form-actions">
          <button class="btn btn-small" type="button" data-testid="cancel-submit" data-cancel-submit>\u53D6\u6D88\u8BA1\u5212</button>
          <button class="btn btn-small" type="button" data-testid="void-submit" data-void-submit>\u4F5C\u5E9F\u62DC\u8BBF</button>
          <button class="btn btn-small btn-danger" type="button" data-testid="delete-submit" data-delete-submit>\u5220\u9664\u8BA1\u5212</button>
        </div>
      </section>
    </div>
  </section>
`;function Qt(e){return e==="slide"||e==="reprint"||e==="document"||e==="other"}function yt(e,t){let n=Number.parseFloat(e.value),a=Number.parseFloat(t.value);return!Number.isFinite(n)||!Number.isFinite(a)||n<-90||n>90||a<-180||a>180?null:{lat:n,lng:a}}function Zt(e,t,n){if(e.value.trim()===""||t.value.trim()==="")return"\u586B\u5165\u7ECF\u7EAC\u5EA6\u540E\u663E\u793A\u4E0E\u533B\u9662\u57FA\u51C6\u70B9\u7684\u8DDD\u79BB\u3002";let a=Number.parseFloat(e.value),l=Number.parseFloat(t.value);if(!Number.isFinite(a)||!Number.isFinite(l))return"\u586B\u5165\u5408\u6CD5\u6570\u5B57\u540E\u663E\u793A\u8DDD\u79BB\u3002";if(!Number.isFinite(n.baseLat)||!Number.isFinite(n.baseLng))return"\u533B\u9662\u57FA\u51C6\u5750\u6807\u4E0D\u53EF\u7528\u3002";let c=Ae({lat:a,lng:l},{lat:n.baseLat,lng:n.baseLng});return c>de?`Distance from hospital base: ${$e(c)} \u2014 outside the ${de} m limit.`:`Distance from hospital base: ${$e(c)} \u2014 within the ${de} m limit.`}function Mt(e,t){e.innerHTML=Gt;let n=i(e,".detail-card"),a=i(e,"[data-detail-empty]"),l=i(e,"[data-detail-empty-text]"),c=i(e,"[data-detail-body]"),p=i(e,"[data-detail-hcp]"),L=i(e,"[data-detail-subtitle]"),y=i(e,"[data-status-pill]"),u=i(e,"[data-abnormal]"),C=i(e,"[data-flag-list]"),T=i(e,"[data-compliance-note]"),N=i(e,"[data-timeline]"),E=i(e,"[data-meta]"),b=i(e,"[data-checkin-form]"),S=i(e,"#checkin-lat"),s=i(e,"#checkin-lng"),h=i(e,'[data-testid="checkin-submit"]'),g=i(e,"[data-checkin-record]"),x=i(e,"[data-checkin-distance]"),R=i(e,"[data-checkin-hint]"),w=i(e,"[data-checkout-form]"),o=i(e,"#checkout-lat"),v=i(e,"#checkout-lng"),k=i(e,'[data-testid="checkout-submit"]'),$=i(e,"[data-checkout-record]"),G=i(e,"[data-checkout-distance]"),ne=i(e,"[data-checkout-hint]"),pe=i(e,"[data-duration-value]"),ae=i(e,"[data-duration-note]"),_=i(e,"[data-report-form]"),F=i(e,'[data-testid="report-talking-points"]'),re=i(e,'[data-testid="report-feedback"]'),ie=i(e,"[data-materials-distributed]"),It=i(e,"[data-materials-block]"),me=i(e,"[data-material-rows]"),Te=i(e,"[data-material-add]"),Vt=i(e,'[data-testid="report-submit"]'),ye=i(e,"[data-report-hint]"),oe=i(e,'[data-testid="terminal-reason"]'),Ue=i(e,"[data-cancel-submit]"),je=i(e,"[data-void-submit]"),We=i(e,"[data-delete-submit]"),j=i(e,"[data-terminal-hint]"),Ye=P();i(e,"[data-detail-banner]").append(Ye.element);let le=P();i(e,"[data-checkin-banner]").append(le.element);let se=P();i(e,"[data-checkout-banner]").append(se.element);let Q=P();i(e,"[data-terminal-banner]").append(Q.element);let W=P();i(e,"[data-report-banner]").append(W.element);let M=null,Me=null,A=!1,ze=null,Je=null,Xe=null,K=[],ke=0;function Z(r,f,H,I){let V=Zt(r,f,I);H.textContent=V;let D=Ae({lat:Number.parseFloat(r.value),lng:Number.parseFloat(f.value)},{lat:I.baseLat,lng:I.baseLng});H.classList.toggle("warn",Number.isFinite(D)&&D>de)}function fe(){me.replaceChildren(),K.forEach((r,f)=>{let H=d("div","material-row");ke+=1;let I=`material-name-${ke}`,V=`material-kind-${ke}`,D=d("label","sr-only",`Material ${f+1} name`);D.htmlFor=I;let q=d("input");q.id=I,q.type="text",q.value=r.name,q.placeholder="Name",q.dataset.testid="report-material-name",q.addEventListener("input",()=>{r.name=q.value});let Ze=d("label","sr-only",`Material ${f+1} kind`);Ze.htmlFor=V;let U=d("select");U.id=V,U.dataset.testid="report-material-kind";for(let et of zt){let xe=document.createElement("option");xe.value=et.value,xe.textContent=et.label,U.append(xe)}U.value=r.kind,U.addEventListener("change",()=>{r.kind=Qt(U.value)?U.value:"document"});let be=d("button","btn btn-small","Remove");be.type="button",be.setAttribute("aria-label",`Remove material ${f+1}`),be.addEventListener("click",()=>{K.splice(f,1),fe(),Te.focus()}),H.append(D,q,Ze,U,be),me.append(H)})}function Rt(){W.clear(),K.push({name:"",kind:"document"}),fe();let r=me.querySelectorAll('[data-testid="report-material-name"]'),f=r.item(r.length-1);f&&f.focus()}function Ge(){It.hidden=!ie.checked,ie.checked&&K.length===0&&(K.push({name:"",kind:"document"}),fe())}ie.addEventListener("change",Ge),Te.addEventListener("click",Rt);function At(r){S.value=String(r.checkin?.lat??r.baseLat),s.value=String(r.checkin?.lng??r.baseLng),o.value=String(r.checkout?.lat??r.baseLat),v.value=String(r.checkout?.lng??r.baseLng),Z(S,s,x,r),Z(o,v,G,r),F.value=r.talkingPoints,re.value=r.hcpFeedback,ie.checked=r.materialsDistributed,K=r.materials.map(f=>({name:f.name,kind:f.kind})),fe(),Ge(),le.clear(),se.clear(),W.clear()}function Pt(r){N.replaceChildren();let f=Xt[r];Jt.forEach((H,I)=>{let V=f[I]??"pending",D=d("li",`timeline-step is-${V}`);D.append(d("span","timeline-index",String(I+1))),D.append(d("span","timeline-label",H));let q=V==="done"?"completed":V==="current"?"current":"pending";D.append(d("span","sr-only",`: ${q}`)),V==="current"&&D.setAttribute("aria-current","step"),N.append(D)})}function Qe(r,f,H){r.hidden=!1,r.textContent=`${f} ${He(H.at)} at ${Ie(H.lat)}, ${Ie(H.lng)}.`}function Nt(r){if(p.textContent=r.hcpName,L.textContent=`${r.productName} \xB7 ${r.hospitalName} \xB7 ${r.department}`,y.className=`pill pill-${r.status.toLowerCase().replaceAll("_","-")}`,y.textContent=he(r.status),u.hidden=!r.abnormal,C.replaceChildren(),r.abnormal)if(r.flags.length===0){let f=d("li","flag-item");f.append(d("span","flag-detail","\u670D\u52A1\u7AEF\u628A\u8FD9\u6B21\u62DC\u8BBF\u6807\u8BB0\u4E3A\u5F02\u5E38\u3002")),C.append(f)}else for(let f of r.flags){let H=d("li","flag-item");H.append(d("code","flag-code",f.code)),H.append(d("span","flag-detail",f.detail)),C.append(H)}if(r.abnormal?(T.hidden=!0,T.textContent="",T.className="compliance-note"):r.status==="CHECKED_OUT"||r.status==="REPORTED"?(T.hidden=!1,T.className="compliance-note ok",T.textContent="\u7B7E\u9000\u65F6\u672A\u547D\u4E2D\u4EFB\u4F55\u5408\u89C4\u89C4\u5219\u3002"):(T.hidden=!1,T.className="compliance-note",T.textContent="\u5408\u89C4\u5224\u5B9A\u5728\u7B7E\u9000\u65F6\u6267\u884C\u3002"),Pt(r.status),E.textContent=`Planned ${He(r.plannedAt)} \xB7 MR ${r.mrName}`,r.checkin?Qe(g,"\u5DF2\u7B7E\u5230",r.checkin):(g.hidden=!0,g.textContent=""),r.checkout?(Qe($,"\u5DF2\u7B7E\u9000",r.checkout),pe.textContent=ht(r.durationSeconds??0),ae.textContent="computed by the server"):($.hidden=!0,$.textContent="",pe.textContent="\u5C1A\u672A\u4EA7\u751F",ae.textContent="derived at check-out"),S.disabled=!r.capabilities.canCheckIn,s.disabled=!r.capabilities.canCheckIn,o.disabled=!r.capabilities.canCheckOut,v.disabled=!r.capabilities.canCheckOut,h.disabled=!r.capabilities.canCheckIn||A,k.disabled=!r.capabilities.canCheckOut||A,Vt.disabled=!r.capabilities.canReport||A,Ue.disabled=!r.capabilities.canCancel||A,je.disabled=!r.capabilities.canVoid||A,We.disabled=!r.capabilities.canDelete||A,oe.disabled=!(r.capabilities.canCancel||r.capabilities.canVoid)||A,r.capabilities.canCheckIn?R.textContent="Uses the server clock; coordinates are stored as entered.":r.checkin?R.textContent="\u5DF2\u8BB0\u5F55\u7B7E\u5230\u3002":R.textContent="\u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u7B7E\u5230\u3002",r.capabilities.canCheckOut?ne.textContent="Uses the server clock; duration is derived server-side.":r.checkout?ne.textContent="\u5DF2\u8BB0\u5F55\u7B7E\u9000\u3002":ne.textContent="\u7B7E\u5230\u540E\u53EF\u7528\u3002",r.evaluation){let f=r.evaluation,H=[f.distanceInM===null?null:`\u7B7E\u5230 ${Math.round(f.distanceInM)} \u7C73`,f.distanceOutM===null?null:`\u7B7E\u9000 ${Math.round(f.distanceOutM)} \u7C73`].filter(V=>V!==null).join(" \xB7 "),I=[`\u89C4\u5219 ${f.ruleVersion}`,`\u9608\u503C ${f.thresholds.minDurationSec} \u79D2 / ${f.thresholds.maxDistanceM} \u7C73`];H!==""&&I.push(H),T.textContent=`${I.join(" \xB7 ")}\uFF08${f.source==="void_backfill"?"\u4F5C\u5E9F\u8865\u5224":"\u7B7E\u9000\u5224\u5B9A"}\uFF09`}r.reportOverdue&&(j.textContent="\u8BB0\u5F55\u7F3A\u5931\uFF1A\u7B7E\u9000\u540E\u8D85\u8FC7\u8865\u8BB0\u5F55\u65F6\u9650\u4ECD\u672A\u63D0\u4EA4\u62DC\u8BBF\u8BB0\u5F55\u3002"),r.capabilities.canReport?ye.textContent="Submitting files the report and marks the visit REPORTED.":r.status==="REPORTED"?ye.textContent="Report filed.":ye.textContent="\u7B7E\u9000\u540E\u53EF\u7528\u3002",r.capabilities.canCancel?j.textContent="\u53D6\u6D88\u9700\u8981\u586B\u5199\u539F\u56E0\uFF0C\u5E76\u8BA1\u5165\u53D6\u6D88\u7EDF\u8BA1\uFF1B\u5220\u9664\u53EA\u7528\u4E8E\u5F55\u5165\u9519\u8BEF\uFF0C\u4E14\u4EC5\u5728\u521B\u5EFA\u540E\u77ED\u65F6\u95F4\u5185\u53EF\u7528\u3002":r.capabilities.canVoid?j.textContent="\u4F5C\u5E9F\u4FDD\u7559\u7B7E\u5230\u8BC1\u636E\u5E76\u91CD\u8DD1\u4F4D\u7F6E\u89C4\u5219\uFF0C\u5F02\u5E38\u4E0D\u4F1A\u88AB\u62B9\u6389\u3002":r.status==="VOIDED"&&r.voidReason?j.textContent=`\u5DF2\u4F5C\u5E9F\uFF1A${r.voidReason}`:r.status==="CANCELLED"&&r.cancelReason?j.textContent=`\u5DF2\u53D6\u6D88\uFF1A${r.cancelReason}`:r.status==="DELETED"?j.textContent="\u5DF2\u5220\u9664\uFF1A\u6570\u636E\u4ECD\u5728\u5E93\u4E2D\uFF0C\u4F46\u4E0D\u8FDB\u4EFB\u4F55\u7EDF\u8BA1\u3002":j.textContent="\u5F53\u524D\u72B6\u6001\u6CA1\u6709\u53EF\u6267\u884C\u7684\u53D6\u6D88/\u4F5C\u5E9F/\u5220\u9664\u64CD\u4F5C\u3002"}return S.addEventListener("input",()=>{M&&Z(S,s,x,M)}),s.addEventListener("input",()=>{M&&Z(S,s,x,M)}),o.addEventListener("input",()=>{M&&Z(o,v,G,M)}),v.addEventListener("input",()=>{M&&Z(o,v,G,M)}),b.addEventListener("submit",r=>{if(r.preventDefault(),M===null||A||!M.capabilities.canCheckIn||!b.reportValidity())return;let f=yt(S,s);if(f===null){le.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),S.focus();return}le.clear(),t.onCheckIn(M.id,f)}),w.addEventListener("submit",r=>{if(r.preventDefault(),M===null||A||!M.capabilities.canCheckOut||!w.reportValidity())return;let f=yt(o,v);if(f===null){se.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),o.focus();return}se.clear(),t.onCheckOut(M.id,f)}),Ue.addEventListener("click",()=>{if(M===null||A||!M.capabilities.canCancel)return;let r=oe.value.trim();if(r===""){Q.showText("\u53D6\u6D88\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002"),oe.focus();return}Q.clear(),t.onCancel(M.id,r)}),je.addEventListener("click",()=>{if(M===null||A||!M.capabilities.canVoid)return;let r=oe.value.trim();if(r===""){Q.showText("\u4F5C\u5E9F\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002"),oe.focus();return}Q.clear(),t.onVoid(M.id,r)}),We.addEventListener("click",()=>{M===null||A||!M.capabilities.canDelete||(Q.clear(),t.onDelete(M.id))}),_.addEventListener("submit",r=>{if(r.preventDefault(),M===null||A||!M.capabilities.canReport||!_.reportValidity())return;let f=ie.checked,H=[];if(f){if(K.length===0){W.showText("\u81F3\u5C11\u6DFB\u52A0\u4E00\u6761\u8D44\u6599\uFF0C\u6216\u53D6\u6D88\u52FE\u9009\u300C\u5DF2\u6D3E\u53D1\u8D44\u6599\u300D\u3002"),Te.focus();return}let I=K.map(D=>({name:D.name.trim(),kind:D.kind})),V=I.findIndex(D=>D.name==="");if(V>=0){W.showText(`Material ${V+1} needs a name, or remove that row.`),me.querySelectorAll('[data-testid="report-material-name"]').item(V)?.focus();return}H=I}W.clear(),t.onSubmitReport(M.id,{talkingPoints:F.value.trim(),hcpFeedback:re.value.trim(),materialsDistributed:f,materials:H})}),{update(r){if(A=r.loading.mutation||r.loading.selected,M=r.selected,n.setAttribute("aria-busy",String(r.loading.selected)),Ye.show(r.errors.detail),r.errors.checkin!==ze&&(ze=r.errors.checkin,le.show(r.errors.checkin)),r.errors.checkout!==Je&&(Je=r.errors.checkout,se.show(r.errors.checkout)),r.errors.report!==Xe&&(Xe=r.errors.report,W.show(r.errors.report)),r.selected===null){Me=null,a.hidden=!1,c.hidden=!0,l.textContent=r.loading.selected?"Loading visit\u2026":r.errors.detail?"\u8BE5\u62DC\u8BBF\u52A0\u8F7D\u5931\u8D25\u3002":"\u4ECE\u5DE6\u4FA7\u5217\u8868\u9009\u62E9\u4E00\u6761\u62DC\u8BBF\uFF0C\u67E5\u770B\u8BE6\u60C5\u4E0E\u5408\u89C4\u8BC1\u636E\u3002";return}a.hidden=!0,c.hidden=!1,Nt(r.selected),r.selected.id!==Me&&(Me=r.selected.id,At(r.selected))}}}var en=`
  <section class="card list-card" aria-labelledby="visits-heading">
    <div class="card-head">
      <div>
        <h2 id="visits-heading">\u62DC\u8BBF</h2>
        <p class="hint">\u6309\u8BA1\u5212\u65F6\u95F4\u5012\u5E8F\u3002</p>
      </div>
      <span class="count" data-count data-testid="visit-count"></span>
    </div>
    <div class="filters">
      <div class="field">
        <label for="filter-status">\u72B6\u6001</label>
        <select id="filter-status" data-status-filter data-testid="visit-filter-status">
          <option value="">\u5168\u90E8\u72B6\u6001</option>
          <option value="PLANNED">\u5DF2\u8BA1\u5212</option>
          <option value="CHECKED_IN">\u5DF2\u7B7E\u5230</option>
          <option value="CHECKED_OUT">\u5DF2\u7B7E\u9000</option>
          <option value="REPORTED">\u5DF2\u5B8C\u6210</option>
          <option value="CANCELLED">\u5DF2\u53D6\u6D88</option>
          <option value="VOIDED">\u5DF2\u4F5C\u5E9F</option>
          <option value="DELETED">\u5DF2\u5220\u9664</option>
        </select>
      </div>
      <div class="field">
        <label for="filter-product">\u836F\u54C1</label>
        <select id="filter-product" data-product-filter data-testid="visit-filter-product">
          <option value="">\u5168\u90E8\u836F\u54C1</option>
        </select>
      </div>
      <button class="btn btn-small filter-clear" type="button" data-clear hidden>\u6E05\u9664\u7B5B\u9009</button>
    </div>
    <div data-list-banner></div>
    <div class="table-wrap" data-table-wrap>
      <table class="visits-table" data-testid="visit-table">
        <thead>
          <tr>
            <th scope="col">\u5DF2\u8BA1\u5212</th>
            <th scope="col">\u533B\u751F</th>
            <th scope="col">\u533B\u9662</th>
            <th scope="col">\u836F\u54C1</th>
            <th scope="col">\u72B6\u6001</th>
            <th scope="col">\u5F02\u5E38</th>
          </tr>
        </thead>
        <tbody data-rows></tbody>
      </table>
    </div>
    <div class="empty-state" data-empty hidden>
      <p data-empty-title></p>
      <button class="btn btn-small" type="button" data-empty-clear hidden>\u6E05\u9664\u7B5B\u9009</button>
    </div>
  </section>
`;function tn(e){return e.toLowerCase().replaceAll("_","-")}function nn(e){return e.map(t=>`${t.id}:${t.status}:${t.abnormal}:${t.updatedAt}`).join("|")}function kt(e,t){e.innerHTML=en;let n=i(e,"[data-status-filter]"),a=i(e,"[data-product-filter]"),l=i(e,"[data-clear]"),c=i(e,"[data-empty-clear]"),p=P();i(e,"[data-list-banner]").append(p.element);let L=i(e,"[data-rows]"),y=i(e,"[data-table-wrap]"),u=i(e,"[data-empty]"),C=i(e,"[data-empty-title]"),T=i(e,"[data-count]"),N=i(e,".list-card"),E=null,b="";function S(o){return o.filters.status!==""||o.filters.productId!==""}function s(){t.onFiltersChange({status:"",productId:""}),n.focus()}l.addEventListener("click",s),c.addEventListener("click",s),n.addEventListener("change",()=>{let o=n.value;t.onFiltersChange({status:Re(o)?o:"",productId:a.value})}),a.addEventListener("change",()=>{t.onFiltersChange({status:Re(n.value)?n.value:"",productId:a.value})});function h(o){let v=a.value;a.replaceChildren(ee("","\u5168\u90E8\u836F\u54C1"));for(let k of o?.products??[])a.append(ee(k.id,k.name));[...a.options].some(k=>k.value===v)&&(a.value=v)}function g(o){t.onSelect(o)}function x(o){let v=d("tr","visit-row");v.dataset.visitId=o.id,v.dataset.testid="visit-row",v.tabIndex=0,v.addEventListener("click",()=>g(o.id)),v.addEventListener("keydown",F=>{(F.key==="Enter"||F.key===" ")&&(F.preventDefault(),g(o.id))});let k=d("td","planned-cell"),$=d("time");$.dateTime=o.plannedAt,$.append(d("span","planned-date",we(o.plannedAt)),d("span","planned-time",De(o.plannedAt))),k.append($);let G=d("td");G.append(d("span","cell-primary",o.hcpName),d("span","cell-secondary",o.department));let ne=d("td",void 0,o.hospitalName),pe=d("td",void 0,o.productName),ae=d("td");ae.append(d("span",`pill pill-${tn(o.status)}`,he(o.status)));let _=d("td");if(o.abnormal){let F=d("span","badge badge-abnormal","\u5F02\u5E38");F.title=o.flags.map(re=>`${re.code}: ${re.detail}`).join(`
`),_.append(F)}else o.status==="CHECKED_OUT"||o.status==="REPORTED"?_.append(d("span","badge badge-ok","\u5408\u89C4")):_.append(d("span","cell-muted","\u2014"));if(o.reportOverdue){let F=d("span","badge badge-warn","\u8BB0\u5F55\u7F3A\u5931");F.title="\u7B7E\u9000\u540E\u8D85\u8FC7\u8865\u8BB0\u5F55\u65F6\u9650\u4ECD\u672A\u63D0\u4EA4\u62DC\u8BBF\u8BB0\u5F55",_.append(F)}return v.append(k,G,ne,pe,ae,_),v}function R(o){for(let v of L.querySelectorAll("tr[data-visit-id]")){let k=v.dataset.visitId===o.selected?.id;v.classList.toggle("is-selected",k),k?v.setAttribute("aria-current","true"):v.removeAttribute("aria-current")}}function w(o){let v=o.visits.length>0;y.hidden=!v,u.hidden=v;let k=S(o);if(l.hidden=!k,c.hidden=!k,v){C.textContent="";return}o.loading.visits?C.textContent="\u6B63\u5728\u52A0\u8F7D\u62DC\u8BBF\u2026":o.errors.list?C.textContent="\u62DC\u8BBF\u5217\u8868\u52A0\u8F7D\u5931\u8D25\u3002":k?C.textContent="\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u62DC\u8BBF\u3002":C.textContent="\u8FD8\u6CA1\u6709\u62DC\u8BBF\u8BB0\u5F55\u3002\u5148\u5728\u5DE6\u4FA7\u521B\u5EFA\u4E00\u4E2A\u8BA1\u5212\u3002"}return{update(o){o.catalog!==E&&(E=o.catalog,h(o.catalog)),n.value=o.filters.status,([...a.options].some($=>$.value===o.filters.productId)||o.filters.productId==="")&&(a.value=o.filters.productId),N.setAttribute("aria-busy",String(o.loading.visits)),T.textContent=o.loading.visits?"Loading\u2026":`\u5171 ${o.visits.length} \u6761`,p.show(o.errors.list);let k=nn(o.visits);k!==b&&(b=k,L.replaceChildren(...o.visits.map(x))),R(o),w(o)}}}var an=`
  <section class="card plan-card" aria-labelledby="plan-heading">
    <div class="card-head">
      <div>
        <h2 id="plan-heading">\u65B0\u5EFA\u62DC\u8BBF\u8BA1\u5212</h2>
        <p class="hint">\u7B2C 1 \u6B65 \u2014\u2014 \u7EA6\u89C1\u533B\u751F\u3002</p>
      </div>
    </div>
    <form class="plan-form" data-plan-form data-testid="plan-form">
      <div class="field">
        <label for="plan-mr">\u533B\u836F\u4EE3\u8868</label>
        <select id="plan-mr" name="mrId" data-testid="plan-mr" required>
          <option value="">\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-hcp">\u533B\u751F</label>
        <select id="plan-hcp" name="hcpId" data-testid="plan-hcp" required>
          <option value="">\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-product">\u836F\u54C1</label>
        <select id="plan-product" name="productId" data-testid="plan-product" required>
          <option value="">\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-at">\u8BA1\u5212\u65F6\u95F4</label>
        <input id="plan-at" name="plannedAt" data-testid="plan-planned-at" type="datetime-local" step="60" required>
      </div>
      <div class="plan-actions">
        <button class="btn btn-primary" type="submit" data-testid="plan-submit" disabled>\u521B\u5EFA\u8BA1\u5212</button>
      </div>
      <div class="plan-error" data-plan-banner></div>
    </form>
  </section>
`;function Pe(e,t,n){let a=e.value;e.replaceChildren(ee("",t));for(let l of n)e.append(ee(l.value,l.label));e.value=n.some(l=>l.value===a)?a:""}function xt(e,t){e.innerHTML=an;let n=i(e,"[data-plan-form]"),a=i(e,"#plan-mr"),l=i(e,"#plan-hcp"),c=i(e,"#plan-product"),p=i(e,"#plan-at"),L=i(e,'button[type="submit"]'),y=P();i(e,"[data-plan-banner]").append(y.element),p.value=Ve();let u=null,C;function T(){let s=u!==null&&u.catalog!==null&&!u.loading.mutation&&a.value!==""&&l.value!==""&&c.value!==""&&p.value!=="";L.disabled=!s}function N(s){Pe(a,s===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u4EE3\u8868\u2026",(s?.mrs??[]).map(h=>({value:h.id,label:`${h.name} \u2014 ${h.region}`}))),Pe(l,s===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u533B\u751F\u2026",(s?.hcps??[]).map(h=>({value:h.id,label:`${h.name} \u2014 ${h.hospitalName}`}))),Pe(c,s===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u836F\u54C1\u2026",(s?.products??[]).map(h=>({value:h.id,label:`${h.name} (${h.code})`}))),l.disabled=s===null,c.disabled=s===null,T()}function E(){let s=u===null?"":u.actor,h=u!==null&&u.catalog!==null&&s!=="";if(a.disabled=u===null||u.catalog===null||s!=="",h){a.value!==s&&(a.value=s);let g=Array.from(a.options).find(x=>x.value===s);g!==void 0&&(g.textContent=`${g.textContent?.replace("\uFF08\u6211\uFF09","")??""}\uFF08\u6211\uFF09`)}T()}function b(){a.value="",l.value="",c.value="",p.value=Ve(),y.clear(),T()}function S(){let s=a.value,h=l.value,g=c.value;if(s===""||h===""||g===""||p.value==="")return null;let x=new Date(p.value);return Number.isNaN(x.getTime())?null:{mrId:s,hcpId:h,productId:g,plannedAt:vt(x)}}n.addEventListener("submit",s=>{if(s.preventDefault(),!n.reportValidity())return;let h=S();if(h===null){y.showText("\u8BF7\u9009\u62E9\u4EE3\u8868\u3001\u533B\u751F\u3001\u836F\u54C1\u4E0E\u8BA1\u5212\u65F6\u95F4\u3002");return}t.onCreate(h).then(g=>{g&&b()})});for(let s of[a,l,c,p])s.addEventListener("input",T),s.addEventListener("change",T);return{update(s){u=s,s.catalog!==C&&(C=s.catalog,N(s.catalog)),n.setAttribute("aria-busy",String(s.loading.catalog)),y.show(s.errors.plan??s.errors.catalog),E()},reset:b}}var m=bt(),rn=i(document,"#plan-root"),on=i(document,"#list-root"),ln=i(document,"#detail-root"),sn=i(document,"#dashboard-root"),_e=i(document,"#refresh"),dn=xt(rn,{onCreate:kn}),cn=kt(on,{onSelect:vn,onFiltersChange:En}),un=Mt(ln,{onCheckIn:Ln,onCheckOut:Tn,onSubmitReport:yn,onCancel:(e,t)=>ue("terminal",e,()=>dt(e,t)),onVoid:(e,t)=>ue("terminal",e,()=>ct(e,t)),onDelete:e=>Mn(e)}),pn=i(document,"#rules-root"),mn=Tt(pn,{onSave:gn}),fn=Lt(sn,{onRefresh:()=>{te()}}),Ne=0,Fe=0,Oe=0,qe=0,Ct=[{key:"11111111-1111-1111-1111-111111111111",label:"\u5F20\u4F1F",role:"\u533B\u836F\u4EE3\u8868",badge:"MR"},{key:"11111111-1111-1111-1111-111111111112",label:"\u674E\u5A1C",role:"\u533B\u836F\u4EE3\u8868",badge:"MR"},{key:"admin",label:"\u738B\u654F",role:"\u7CFB\u7EDF\u7BA1\u7406\u5458",badge:"AD"}],ce="admin",St=i(document,"#identity-list"),bn=i(document,"#actor-note");function wt(){St.replaceChildren();for(let t of Ct){let n=document.createElement("button");n.type="button",n.className="rail-button",t.key===ce&&n.classList.add("is-active"),n.dataset.actor=t.key,n.title=`${t.role} \xB7 ${t.label}`;let a=document.createElement("span");a.className="rail-badge",a.textContent=t.badge;let l=document.createElement("span");l.className="rail-name",l.textContent=t.label;let c=document.createElement("span");c.className="rail-role",c.textContent=t.role,n.append(a,l,c),n.addEventListener("click",()=>{hn(t.key)}),St.append(n)}let e=Ct.find(t=>t.key===ce);bn.textContent=e===void 0?"":`${e.role} \xB7 ${e.label}`}var Be=0;async function Ke(){let e=++Be;try{let t=await pt();if(e!==Be)return;let{history:n,...a}=t;m.update(l=>({...l,rules:a,ruleHistory:n??[a],errors:{...l.errors,rules:null}}))}catch(t){if(e!==Be)return;let n=B(t);if(n.status===403)return;m.update(a=>({...a,errors:{...a.errors,rules:n}}))}}async function gn(e){if(!m.getState().loading.mutation){m.update(t=>({...t,loading:{...t.loading,mutation:!0},errors:{...t.errors,rules:null}}));try{await mt(e),await Ke()}catch(t){m.update(n=>({...n,errors:{...n.errors,rules:B(t)}}))}finally{m.update(t=>({...t,loading:{...t.loading,mutation:!1}}))}}}async function hn(e){e!==ce&&(ce=e,Se(e),m.update(t=>({...t,actor:e==="admin"?"":e})),wt(),m.update(t=>({...t,selected:null})),await Promise.all([X(),te(),Ke()]))}function Dt(e){dn.update(e),cn.update(e),un.update(e),mn.update(e),fn.update(e),_e.disabled=e.loading.mutation,_e.setAttribute("aria-busy",String(e.loading.catalog||e.loading.visits||e.loading.dashboard||e.loading.selected))}async function $t(){let e=++Ne;m.update(t=>({...t,loading:{...t.loading,catalog:!0},errors:{...t.errors,catalog:null}}));try{let t=await nt();if(e!==Ne)return;m.update(n=>({...n,catalog:t,loading:{...n.loading,catalog:!1}}))}catch(t){if(e!==Ne)return;m.update(n=>({...n,loading:{...n.loading,catalog:!1},errors:{...n.errors,catalog:B(t)}}))}}async function X(){let e=++Fe,t=m.getState().filters;m.update(n=>({...n,loading:{...n.loading,visits:!0},errors:{...n.errors,list:null}}));try{let n=await at(t);if(e!==Fe)return;m.update(a=>({...a,visits:n.visits,loading:{...a.loading,visits:!1}}))}catch(n){if(e!==Fe)return;m.update(a=>({...a,loading:{...a.loading,visits:!1},errors:{...a.errors,list:B(n)}}))}}async function te(){let e=++qe;m.update(t=>({...t,loading:{...t.loading,dashboard:!0},errors:{...t.errors,dashboard:null}}));try{let t=await ft();if(e!==qe)return;m.update(n=>({...n,dashboard:t,loading:{...n.loading,dashboard:!1}}))}catch(t){if(e!==qe)return;m.update(n=>({...n,loading:{...n.loading,dashboard:!1},errors:{...n.errors,dashboard:B(t)}}))}}async function Le(e,t){let n=++Oe;m.update(a=>({...a,selected:t?.id===e?t:a.selected?.id===e?a.selected:null,loading:{...a.loading,selected:!0},errors:{...a.errors,detail:null}}));try{let a=await rt(e);if(n!==Oe)return;m.update(l=>({...l,selected:a,loading:{...l.loading,selected:!1}}))}catch(a){if(n!==Oe)return;let l=B(a);m.update(c=>({...c,selected:l.code==="not_found"?null:c.selected,loading:{...c.loading,selected:!1},errors:{...c.errors,detail:l}}))}}function vn(e){let t=m.getState().visits.find(n=>n.id===e);m.update(n=>({...n,errors:{...n.errors,checkin:null,checkout:null,report:null}})),Le(e,t)}function En(e){let t=m.getState().filters;t.status===e.status&&t.productId===e.productId||(m.update(n=>({...n,filters:e})),X())}function Ee(e,t,n){return{...e,[t]:n}}async function Ht(e){let t=[X(),te()];m.getState().selected?.id===e&&t.push(Le(e)),await Promise.all(t)}async function ue(e,t,n){if(!m.getState().loading.mutation){m.update(a=>({...a,loading:{...a.loading,mutation:!0},errors:Ee(a.errors,e,null)}));try{await n()}catch(a){let l=B(a);m.update(c=>({...c,errors:Ee(c.errors,e,l)})),(l.code==="invalid_state"||l.code==="conflict"||l.code==="not_found")&&await Ht(t),m.update(c=>({...c,loading:{...c.loading,mutation:!1}}));return}await Ht(t),m.update(a=>({...a,loading:{...a.loading,mutation:!1}}))}}function Ln(e,t){return ue("checkin",e,()=>ot(e,t))}function Tn(e,t){return ue("checkout",e,()=>lt(e,t))}function yn(e,t){return ue("report",e,()=>st(e,t))}async function Mn(e){if(!m.getState().loading.mutation){m.update(t=>({...t,loading:{...t.loading,mutation:!0},errors:Ee(t.errors,"terminal",null)}));try{await ut(e)}catch(t){let n=B(t);m.update(a=>({...a,errors:Ee(a.errors,"terminal",n),loading:{...a.loading,mutation:!1}}));return}m.update(t=>({...t,selected:null})),await Promise.all([X(),te()]),m.update(t=>({...t,loading:{...t.loading,mutation:!1}}))}}async function kn(e){if(m.getState().loading.mutation)return!1;m.update(n=>({...n,loading:{...n.loading,mutation:!0},errors:{...n.errors,plan:null}}));let t;try{t=await it(e)}catch(n){return m.update(a=>({...a,loading:{...a.loading,mutation:!1},errors:{...a.errors,plan:B(n)}})),!1}return await X(),await Le(t.id),m.update(n=>({...n,loading:{...n.loading,mutation:!1}})),!0}async function xn(){if(m.getState().loading.mutation)return;let e=[$t(),X(),te()],t=m.getState().selected?.id;t!==void 0&&e.push(Le(t)),await Promise.all(e)}_e.addEventListener("click",()=>{xn()});m.update(e=>({...e,loading:{...e.loading,catalog:!0,visits:!0,dashboard:!0}}));m.subscribe(Dt);Dt(m.getState());wt();Se(ce);Promise.all([$t(),X(),te(),Ke()]);})();

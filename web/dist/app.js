"use strict";(()=>{var J=class extends Error{status;code;details;constructor(t,n,i,l){super(i),this.name="ApiError",this.status=t,this.code=n,this.details=l}get field(){return this.details?.field}};function K(e){return e instanceof J?e:e instanceof Error?new J(0,"internal_error",e.message):new J(0,"internal_error","An unexpected error occurred.")}function Se(e){return typeof e=="object"&&e!==null}function xt(e){if(!Se(e)||!Se(e.error))return null;let t=e.error;if(typeof t.code!="string"||typeof t.message!="string")return null;let n;if(Se(t.details)){n={};for(let[i,l]of Object.entries(t.details))typeof l=="string"&&(n[i]=l)}return{code:t.code,message:t.message,details:n}}async function Q(e,t){let n;try{n=await fetch(e,t)}catch(d){let u=d instanceof Error?d.message:"Network request failed.";throw new J(0,"network_error",u)}let i=await n.text(),l=null;if(i.length>0)try{l=JSON.parse(i)}catch{l=null}if(!n.ok){let d=xt(l);throw new J(n.status,d?.code??"internal_error",d?.message??`Request failed with HTTP ${n.status}.`,d?.details)}return l}function X(e,t,n){return Q(e,{method:t,headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}function Xe(){return Q("/api/catalog")}function Ze(e){let t=new URLSearchParams;return e.status&&t.set("status",e.status),e.productId&&t.set("productId",e.productId),t.set("limit","200"),Q(`/api/visits?${t.toString()}`)}function et(e){return Q(`/api/visits/${encodeURIComponent(e)}`)}function tt(e){return X("/api/visits","POST",e)}function nt(e,t){return X(`/api/visits/${encodeURIComponent(e)}/checkin`,"POST",t)}function at(e,t){return X(`/api/visits/${encodeURIComponent(e)}/checkout`,"POST",t)}function it(e,t){return X(`/api/visits/${encodeURIComponent(e)}/report`,"PUT",t)}function rt(e,t){return X(`/api/visits/${encodeURIComponent(e)}/cancel`,"POST",{reason:t})}function ot(e,t){return X(`/api/visits/${encodeURIComponent(e)}/void`,"POST",{reason:t})}function lt(e){return Q(`/api/visits/${encodeURIComponent(e)}`,{method:"DELETE"})}function st(e=6){return Q(`/api/dashboard/monthly?months=${e}`)}function r(e,t){let n=e.querySelector(t);if(n===null)throw new Error(`Missing required element: ${t}`);return n}function s(e,t,n){let i=document.createElement(e);return t&&(i.className=t),n!==void 0&&(i.textContent=n),i}function Z(e,t){let n=document.createElement("option");return n.value=e,n.textContent=t,n}function Ht(){return{catalog:null,visits:[],selected:null,dashboard:null,filters:{status:"",productId:""},loading:{catalog:!1,visits:!1,selected:!1,dashboard:!1,mutation:!1},errors:{catalog:null,list:null,detail:null,dashboard:null,plan:null,checkin:null,checkout:null,report:null,terminal:null}}}function dt(){let e=Ht(),t=new Set;return{getState:()=>e,update:n=>{e=n(e);for(let i of t)i(e)},subscribe:n=>(t.add(n),()=>t.delete(n))}}var wt=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],he=e=>String(e).padStart(2,"0"),Dt={PLANNED:"Planned",CHECKED_IN:"Checked in",CHECKED_OUT:"Checked out",REPORTED:"Reported",CANCELLED:"Cancelled",VOIDED:"Voided",DELETED:"Deleted"};function ge(e){return Dt[e]}function xe(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${He(e)} ${we(e)}`}function He(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${t.getFullYear()}-${he(t.getMonth()+1)}-${he(t.getDate())}`}function we(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${he(t.getHours())}:${he(t.getMinutes())}`}function ct(e){let t=/^(\d{4})-(\d{2})$/.exec(e);if(!t)return e;let n=Number(t[1]),i=Number(t[2])-1;return!Number.isInteger(n)||i<0||i>11?e:`${wt[i]} ${n}`}function ut(e){if(!Number.isFinite(e))return"\u2014";let t=Math.max(0,Math.floor(e)),n=Math.floor(t/3600),i=Math.floor(t%3600/60),l=t%60;return n>0?`${n}h ${i}m ${l}s`:i>0?`${i}m ${l}s`:`${l}s`}function ve(e){if(!Number.isFinite(e)||e<=0)return"0%";let t=e*100,n=Math.round(t*10)/10;return n<1?"<1%":n>=100?"100%":Number.isInteger(n)?`${n}%`:`${n.toFixed(1)}%`}function De(e){return Number.isFinite(e)?`${Math.round(Math.max(0,e))} m`:"\u2014"}function Ve(e){return Number.isFinite(e)?e.toFixed(6):"\u2014"}function ee(e,t,n=`${t}s`){return`${e} ${e===1?t:n}`}function A(e){return String(e).padStart(2,"0")}function Vt(e){return`${e.getFullYear()}-${A(e.getMonth()+1)}-${A(e.getDate())}T${A(e.getHours())}:${A(e.getMinutes())}`}function Pe(e=new Date){let t=new Date(e.getFullYear(),e.getMonth(),e.getDate()+1,10,0,0,0);return Vt(t)}function pt(e){let t=-e.getTimezoneOffset(),n=t>=0?"+":"-",i=Math.abs(t);return`${e.getFullYear()}-${A(e.getMonth()+1)}-${A(e.getDate())}T${A(e.getHours())}:${A(e.getMinutes())}:${A(e.getSeconds())}${n}${A(Math.floor(i/60))}:${A(i%60)}`}function Ae(e){return e==="PLANNED"||e==="CHECKED_IN"||e==="CHECKED_OUT"||e==="REPORTED"||e==="CANCELLED"||e==="VOIDED"||e==="DELETED"}function P(){let e=document.createElement("div");e.className="error-banner",e.dataset.testid="error-banner",e.setAttribute("role","alert"),e.hidden=!0;let t=document.createElement("code");t.className="error-code";let n=document.createElement("span");n.className="error-field";let i=document.createElement("span");i.className="error-message",e.append(t,n,i);let l=null;function d(u,k,C,p){if(u!==l){if(l=u,u===null){e.hidden=!0,t.textContent="",n.textContent="",i.textContent="";return}e.hidden=!1,t.hidden=k==="",t.textContent=k,n.hidden=C==="",n.textContent=C,i.textContent=p}}return{element:e,show:u=>{if(u===null){d(null,"","","");return}let k=u.field?`field: ${u.field}`:"";d(`api:${u.code}:${k}:${u.message}`,u.code,k,u.message)},showText:u=>{d(`text:${u}`,"","",u)},clear:()=>d(null,"","","")}}var Pt=`
  <section class="card dashboard-card" aria-labelledby="dashboard-heading">
    <div class="card-head">
      <div>
        <h2 id="dashboard-heading">Monthly visits by product</h2>
        <p class="hint">Check-in months from the server. Each cell is visits (abnormal share).</p>
      </div>
      <button class="btn btn-small" type="button" data-testid="dashboard-refresh" data-dashboard-refresh>Refresh</button>
    </div>
    <div data-dashboard-banner></div>
    <div data-dashboard-content></div>
  </section>
`;function At(e){let t=new Map;for(let v of e.rows){let h=t.get(v.productId);h===void 0&&(h={productId:v.productId,productName:v.productName,byMonth:new Map},t.set(v.productId,h)),h.byMonth.set(v.month,v)}let n=[...t.values()].sort((v,h)=>v.productName.localeCompare(h.productName)),i=s("div","table-wrap"),l=s("table","dashboard-table");l.dataset.testid="dashboard-table";let d=s("thead"),u=s("tr"),k=s("th",void 0,"Product");k.scope="col",u.append(k);for(let v of e.months){let h=s("th",void 0,ct(v));h.scope="col",h.title=v,u.append(h)}d.append(u);let C=new Map;for(let v of e.months)C.set(v,{visits:0,abnormal:0});let p=s("tbody");for(let v of n){let h=s("tr"),c=s("th","row-heading",v.productName);c.scope="row",h.append(c);for(let m of e.months){let D=v.byMonth.get(m),x=D?.visits??0,$=D?.abnormal??0,O=D?.abnormalShare??0,B=C.get(m);B&&(B.visits+=x,B.abnormal+=$);let o=s("td","dashboard-cell",`${x} (${ve(O)})`);O>0&&o.classList.add("has-abnormal"),o.title=`${m}: ${ee(x,"visit")}, ${$} abnormal`,o.dataset.month=m,o.dataset.visits=String(x),o.dataset.abnormal=String($),h.append(o)}p.append(h)}let T=s("tfoot"),L=s("tr","total-row"),N=s("th",void 0,"Total");N.scope="row",L.append(N);for(let v of e.months){let h=C.get(v)??{visits:0,abnormal:0},c=h.visits>0?h.abnormal/h.visits:0,m=s("td","dashboard-cell",`${h.visits} (${ve(c)})`);c>0&&m.classList.add("has-abnormal"),m.title=`${v}: ${ee(h.visits,"visit")}, ${h.abnormal} abnormal`,L.append(m)}return T.append(L),l.append(d,p,T),i.append(l),i}function mt(e,t){e.innerHTML=Pt;let n=r(e,".dashboard-card"),i=r(e,"[data-dashboard-content]"),l=r(e,"[data-dashboard-refresh]"),d=P();r(e,"[data-dashboard-banner]").append(d.element);let u=null;l.addEventListener("click",()=>t.onRefresh());function k(p){let T=s("div","empty-state");T.append(s("p",void 0,p)),i.replaceChildren(T)}function C(p){if(p.rows.length===0){k("No check-ins recorded in the last 6 months.");return}let T=p.totalVisits>0?p.totalAbnormal/p.totalVisits:0,L=s("p","totals-line");L.append(document.createTextNode(`${p.months.length} months \xB7 ${ee(p.totalVisits,"visit")} \xB7 ${p.totalAbnormal} abnormal \xB7 overall abnormal share `),s("strong",void 0,ve(T)),document.createTextNode(".")),i.replaceChildren(At(p),L)}return{update(p){if(n.setAttribute("aria-busy",String(p.loading.dashboard)),l.disabled=p.loading.dashboard,d.show(p.errors.dashboard),p.dashboard===null){p.loading.dashboard?k("Loading monthly dashboard\u2026"):p.errors.dashboard?k("Dashboard data could not be loaded."):k("No dashboard data available."),u=null;return}p.dashboard!==u&&(u=p.dashboard,C(p.dashboard))}}}var It=63710088e-1,de=500;function Ie(e,t){if(![e.lat,e.lng,t.lat,t.lng].every(T=>Number.isFinite(T)))return Number.NaN;let i=e.lat*Math.PI/180,l=t.lat*Math.PI/180,d=(t.lat-e.lat)*Math.PI/180,u=(t.lng-e.lng)*Math.PI/180,k=Math.sin(d/2),C=Math.sin(u/2),p=k*k+Math.cos(i)*Math.cos(l)*C*C;return p>1&&(p=1),2*It*Math.asin(Math.sqrt(p))}var Nt=[{value:"slide",label:"Slide"},{value:"reprint",label:"Reprint"},{value:"document",label:"Document"},{value:"other",label:"Other"}],$t=["Plan","Check-in","Detailing","Check-out","Call report"],Rt={PLANNED:["done","current","pending","pending","pending"],CHECKED_IN:["done","done","current","pending","pending"],CHECKED_OUT:["done","done","done","done","current"],REPORTED:["done","done","done","done","done"],CANCELLED:["done","pending","pending","pending","pending"],VOIDED:["done","done","pending","pending","pending"],DELETED:["done","pending","pending","pending","pending"]},Ft=`
  <section class="card detail-card" data-testid="visit-detail" aria-labelledby="detail-heading">
    <div data-detail-banner></div>
    <div class="detail-empty" data-detail-empty>
      <p data-detail-empty-text>Select a visit from the list to see its details and compliance evidence.</p>
    </div>
    <div class="detail-body" data-detail-body hidden>
      <header class="detail-head">
        <div class="detail-title">
          <p class="eyebrow">Selected visit</p>
          <h2 id="detail-heading" data-detail-hcp></h2>
          <p class="detail-subtitle" data-detail-subtitle></p>
        </div>
        <span class="pill" data-status-pill data-testid="status-pill"></span>
      </header>

      <div class="abnormal-panel" data-abnormal hidden aria-labelledby="abnormal-heading">
        <div class="abnormal-head">
          <h3 id="abnormal-heading">Abnormal visit</h3>
          <span class="badge badge-abnormal">Flagged</span>
        </div>
        <p class="abnormal-intro">The server raised the following compliance flags at check-out. Every flag is listed.</p>
        <ul class="flag-list" data-flag-list data-testid="flag-list"></ul>
      </div>

      <p class="compliance-note" data-compliance-note hidden></p>
      <ol class="timeline" data-timeline aria-label="Visit steps"></ol>
      <p class="meta-line" data-meta></p>

      <section class="step" aria-labelledby="checkin-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">Step 2</p>
            <h3 id="checkin-heading">Check-in</h3>
          </div>
        </div>
        <p class="hint">Coordinates are compared with the hospital's registered base point (500 m limit). The timestamp comes from the server.</p>
        <p class="record" data-checkin-record hidden></p>
        <form class="geo-form" data-checkin-form data-testid="checkin-form">
          <div class="field">
            <label for="checkin-lat">Latitude</label>
            <input id="checkin-lat" data-testid="checkin-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkin-distance">
          </div>
          <div class="field">
            <label for="checkin-lng">Longitude</label>
            <input id="checkin-lng" data-testid="checkin-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkin-distance">
          </div>
          <p class="distance-hint" id="checkin-distance" data-checkin-distance data-testid="distance-hint" aria-live="polite"></p>
          <div data-checkin-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkin-submit">Check in</button>
            <span class="hint" data-checkin-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="checkout-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">Step 4</p>
            <h3 id="checkout-heading">Check-out</h3>
          </div>
        </div>
        <p class="hint">Check-out closes the stay. The server derives the duration and re-evaluates both locations.</p>
        <p class="record" data-checkout-record hidden></p>
        <p class="duration-line">Derived duration: <strong class="duration-value" data-duration-value data-testid="duration-value">\u2014</strong> <span class="hint" data-duration-note></span></p>
        <form class="geo-form" data-checkout-form data-testid="checkout-form">
          <div class="field">
            <label for="checkout-lat">Latitude</label>
            <input id="checkout-lat" data-testid="checkout-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkout-distance">
          </div>
          <div class="field">
            <label for="checkout-lng">Longitude</label>
            <input id="checkout-lng" data-testid="checkout-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkout-distance">
          </div>
          <p class="distance-hint" id="checkout-distance" data-checkout-distance data-testid="checkout-distance-hint" aria-live="polite"></p>
          <div data-checkout-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkout-submit">Check out</button>
            <span class="hint" data-checkout-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="report-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">Step 5</p>
            <h3 id="report-heading">Call report</h3>
          </div>
        </div>
        <form class="report-form" data-report-form data-testid="report-form">
          <div class="field">
            <label for="report-talking-points">Talking points</label>
            <textarea id="report-talking-points" data-testid="report-talking-points" rows="3" maxlength="4000"></textarea>
          </div>
          <div class="field">
            <label for="report-feedback">HCP feedback</label>
            <textarea id="report-feedback" data-testid="report-feedback" rows="3" maxlength="4000"></textarea>
          </div>
          <label class="checkbox">
            <input type="checkbox" data-testid="report-materials-distributed" data-materials-distributed>
            <span>Material distributed</span>
          </label>
          <div class="materials" data-materials-block hidden>
            <div class="materials-head">
              <span class="materials-title">Materials</span>
              <button class="btn btn-small" type="button" data-testid="report-material-add" data-material-add>Add material</button>
            </div>
            <div class="materials-list" data-material-rows></div>
          </div>
          <div data-report-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="report-submit">Submit call report</button>
            <span class="hint" data-report-hint></span>
          </div>
        </form>
      </section>

      <section class="card detail-card" data-terminal-card aria-labelledby="terminal-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">End the visit early</p>
            <h3 id="terminal-heading">Cancel or void</h3>
          </div>
        </div>
        <p class="hint" data-terminal-hint></p>
        <div class="field">
          <label for="terminal-reason">Reason (required for cancel and void)</label>
          <textarea id="terminal-reason" data-testid="terminal-reason" rows="2" maxlength="500"></textarea>
        </div>
        <div data-terminal-banner></div>
        <div class="form-actions">
          <button class="btn btn-small" type="button" data-testid="cancel-submit" data-cancel-submit>Cancel plan</button>
          <button class="btn btn-small" type="button" data-testid="void-submit" data-void-submit>Void visit</button>
          <button class="btn btn-small btn-danger" type="button" data-testid="delete-submit" data-delete-submit>Delete plan</button>
        </div>
      </section>
    </div>
  </section>
`;function Ot(e){return e==="slide"||e==="reprint"||e==="document"||e==="other"}function ft(e,t){let n=Number.parseFloat(e.value),i=Number.parseFloat(t.value);return!Number.isFinite(n)||!Number.isFinite(i)||n<-90||n>90||i<-180||i>180?null:{lat:n,lng:i}}function Bt(e,t,n){if(e.value.trim()===""||t.value.trim()==="")return"Enter both coordinates to see the distance from the hospital base.";let i=Number.parseFloat(e.value),l=Number.parseFloat(t.value);if(!Number.isFinite(i)||!Number.isFinite(l))return"Enter valid numeric coordinates to see the distance.";if(!Number.isFinite(n.baseLat)||!Number.isFinite(n.baseLng))return"Hospital base coordinates are unavailable.";let d=Ie({lat:i,lng:l},{lat:n.baseLat,lng:n.baseLng});return d>de?`Distance from hospital base: ${De(d)} \u2014 outside the ${de} m limit.`:`Distance from hospital base: ${De(d)} \u2014 within the ${de} m limit.`}function bt(e,t){e.innerHTML=Ft;let n=r(e,".detail-card"),i=r(e,"[data-detail-empty]"),l=r(e,"[data-detail-empty-text]"),d=r(e,"[data-detail-body]"),u=r(e,"[data-detail-hcp]"),k=r(e,"[data-detail-subtitle]"),C=r(e,"[data-status-pill]"),p=r(e,"[data-abnormal]"),T=r(e,"[data-flag-list]"),L=r(e,"[data-compliance-note]"),N=r(e,"[data-timeline]"),v=r(e,"[data-meta]"),h=r(e,"[data-checkin-form]"),c=r(e,"#checkin-lat"),m=r(e,"#checkin-lng"),D=r(e,'[data-testid="checkin-submit"]'),x=r(e,"[data-checkin-record]"),$=r(e,"[data-checkin-distance]"),O=r(e,"[data-checkin-hint]"),B=r(e,"[data-checkout-form]"),o=r(e,"#checkout-lat"),g=r(e,"#checkout-lng"),y=r(e,'[data-testid="checkout-submit"]'),R=r(e,"[data-checkout-record]"),z=r(e,"[data-checkout-distance]"),ne=r(e,"[data-checkout-hint]"),pe=r(e,"[data-duration-value]"),ae=r(e,"[data-duration-note]"),U=r(e,"[data-report-form]"),F=r(e,'[data-testid="report-talking-points"]'),ie=r(e,'[data-testid="report-feedback"]'),re=r(e,"[data-materials-distributed]"),Lt=r(e,"[data-materials-block]"),me=r(e,"[data-material-rows]"),Le=r(e,"[data-material-add]"),Tt=r(e,'[data-testid="report-submit"]'),Te=r(e,"[data-report-hint]"),oe=r(e,'[data-testid="terminal-reason"]'),qe=r(e,"[data-cancel-submit]"),_e=r(e,"[data-void-submit]"),Ke=r(e,"[data-delete-submit]"),Y=r(e,"[data-terminal-hint]"),Ue=P();r(e,"[data-detail-banner]").append(Ue.element);let le=P();r(e,"[data-checkin-banner]").append(le.element);let se=P();r(e,"[data-checkout-banner]").append(se.element);let W=P();r(e,"[data-terminal-banner]").append(W.element);let j=P();r(e,"[data-report-banner]").append(j.element);let E=null,Ce=null,H=!1,je=null,Je=null,ze=null,q=[],ye=0;function G(a,b,M,V){let w=Bt(a,b,V);M.textContent=w;let S=Ie({lat:Number.parseFloat(a.value),lng:Number.parseFloat(b.value)},{lat:V.baseLat,lng:V.baseLng});M.classList.toggle("warn",Number.isFinite(S)&&S>de)}function fe(){me.replaceChildren(),q.forEach((a,b)=>{let M=s("div","material-row");ye+=1;let V=`material-name-${ye}`,w=`material-kind-${ye}`,S=s("label","sr-only",`Material ${b+1} name`);S.htmlFor=V;let I=s("input");I.id=V,I.type="text",I.value=a.name,I.placeholder="Name",I.dataset.testid="report-material-name",I.addEventListener("input",()=>{a.name=I.value});let Ge=s("label","sr-only",`Material ${b+1} kind`);Ge.htmlFor=w;let _=s("select");_.id=w,_.dataset.testid="report-material-kind";for(let Qe of Nt){let Me=document.createElement("option");Me.value=Qe.value,Me.textContent=Qe.label,_.append(Me)}_.value=a.kind,_.addEventListener("change",()=>{a.kind=Ot(_.value)?_.value:"document"});let be=s("button","btn btn-small","Remove");be.type="button",be.setAttribute("aria-label",`Remove material ${b+1}`),be.addEventListener("click",()=>{q.splice(b,1),fe(),Le.focus()}),M.append(S,I,Ge,_,be),me.append(M)})}function Ct(){j.clear(),q.push({name:"",kind:"document"}),fe();let a=me.querySelectorAll('[data-testid="report-material-name"]'),b=a.item(a.length-1);b&&b.focus()}function Ye(){Lt.hidden=!re.checked,re.checked&&q.length===0&&(q.push({name:"",kind:"document"}),fe())}re.addEventListener("change",Ye),Le.addEventListener("click",Ct);function yt(a){c.value=String(a.checkin?.lat??a.baseLat),m.value=String(a.checkin?.lng??a.baseLng),o.value=String(a.checkout?.lat??a.baseLat),g.value=String(a.checkout?.lng??a.baseLng),G(c,m,$,a),G(o,g,z,a),F.value=a.talkingPoints,ie.value=a.hcpFeedback,re.checked=a.materialsDistributed,q=a.materials.map(b=>({name:b.name,kind:b.kind})),fe(),Ye(),le.clear(),se.clear(),j.clear()}function Mt(a){N.replaceChildren();let b=Rt[a];$t.forEach((M,V)=>{let w=b[V]??"pending",S=s("li",`timeline-step is-${w}`);S.append(s("span","timeline-index",String(V+1))),S.append(s("span","timeline-label",M));let I=w==="done"?"completed":w==="current"?"current":"pending";S.append(s("span","sr-only",`: ${I}`)),w==="current"&&S.setAttribute("aria-current","step"),N.append(S)})}function We(a,b,M){a.hidden=!1,a.textContent=`${b} ${xe(M.at)} at ${Ve(M.lat)}, ${Ve(M.lng)}.`}function St(a){if(u.textContent=a.hcpName,k.textContent=`${a.productName} \xB7 ${a.hospitalName} \xB7 ${a.department}`,C.className=`pill pill-${a.status.toLowerCase().replaceAll("_","-")}`,C.textContent=ge(a.status),p.hidden=!a.abnormal,T.replaceChildren(),a.abnormal)if(a.flags.length===0){let b=s("li","flag-item");b.append(s("span","flag-detail","The server marked this visit abnormal.")),T.append(b)}else for(let b of a.flags){let M=s("li","flag-item");M.append(s("code","flag-code",b.code)),M.append(s("span","flag-detail",b.detail)),T.append(M)}a.abnormal?(L.hidden=!0,L.textContent="",L.className="compliance-note"):a.status==="CHECKED_OUT"||a.status==="REPORTED"?(L.hidden=!1,L.className="compliance-note ok",L.textContent="No compliance flags were raised at check-out."):(L.hidden=!1,L.className="compliance-note",L.textContent="Compliance is evaluated when the visit is checked out."),Mt(a.status),v.textContent=`Planned ${xe(a.plannedAt)} \xB7 MR ${a.mrName}`,a.checkin?We(x,"Checked in",a.checkin):(x.hidden=!0,x.textContent=""),a.checkout?(We(R,"Checked out",a.checkout),pe.textContent=ut(a.durationSeconds??0),ae.textContent="computed by the server"):(R.hidden=!0,R.textContent="",pe.textContent="Not yet available",ae.textContent="derived at check-out"),c.disabled=!a.capabilities.canCheckIn,m.disabled=!a.capabilities.canCheckIn,o.disabled=!a.capabilities.canCheckOut,g.disabled=!a.capabilities.canCheckOut,D.disabled=!a.capabilities.canCheckIn||H,y.disabled=!a.capabilities.canCheckOut||H,Tt.disabled=!a.capabilities.canReport||H,qe.disabled=!a.capabilities.canCancel||H,_e.disabled=!a.capabilities.canVoid||H,Ke.disabled=!a.capabilities.canDelete||H,oe.disabled=!(a.capabilities.canCancel||a.capabilities.canVoid)||H,a.capabilities.canCheckIn?O.textContent="Uses the server clock; coordinates are stored as entered.":a.checkin?O.textContent="Check-in already recorded.":O.textContent="Check-in is unavailable in this state.",a.capabilities.canCheckOut?ne.textContent="Uses the server clock; duration is derived server-side.":a.checkout?ne.textContent="Check-out already recorded.":ne.textContent="Available after check-in.",a.capabilities.canReport?Te.textContent="Submitting files the report and marks the visit REPORTED.":a.status==="REPORTED"?Te.textContent="Report filed.":Te.textContent="Available after check-out.",a.capabilities.canCancel?Y.textContent="Cancelling keeps a reason and counts as cancelled; deleting is for mistakes and only works briefly after planning.":a.capabilities.canVoid?Y.textContent="Voiding keeps the check-in evidence and re-runs the location rule, so an abnormal visit stays abnormal.":a.status==="VOIDED"&&a.voidReason?Y.textContent=`Voided: ${a.voidReason}`:a.status==="CANCELLED"&&a.cancelReason?Y.textContent=`Cancelled: ${a.cancelReason}`:a.status==="DELETED"?Y.textContent="Deleted: the row is kept, the visit leaves every count.":Y.textContent="Nothing to cancel, void or delete in this state."}return c.addEventListener("input",()=>{E&&G(c,m,$,E)}),m.addEventListener("input",()=>{E&&G(c,m,$,E)}),o.addEventListener("input",()=>{E&&G(o,g,z,E)}),g.addEventListener("input",()=>{E&&G(o,g,z,E)}),h.addEventListener("submit",a=>{if(a.preventDefault(),E===null||H||!E.capabilities.canCheckIn||!h.reportValidity())return;let b=ft(c,m);if(b===null){le.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),c.focus();return}le.clear(),t.onCheckIn(E.id,b)}),B.addEventListener("submit",a=>{if(a.preventDefault(),E===null||H||!E.capabilities.canCheckOut||!B.reportValidity())return;let b=ft(o,g);if(b===null){se.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),o.focus();return}se.clear(),t.onCheckOut(E.id,b)}),qe.addEventListener("click",()=>{if(E===null||H||!E.capabilities.canCancel)return;let a=oe.value.trim();if(a===""){W.showText("A reason is required to cancel."),oe.focus();return}W.clear(),t.onCancel(E.id,a)}),_e.addEventListener("click",()=>{if(E===null||H||!E.capabilities.canVoid)return;let a=oe.value.trim();if(a===""){W.showText("A reason is required to void a visit."),oe.focus();return}W.clear(),t.onVoid(E.id,a)}),Ke.addEventListener("click",()=>{E===null||H||!E.capabilities.canDelete||(W.clear(),t.onDelete(E.id))}),U.addEventListener("submit",a=>{if(a.preventDefault(),E===null||H||!E.capabilities.canReport||!U.reportValidity())return;let b=re.checked,M=[];if(b){if(q.length===0){j.showText("Add at least one material, or untick \u201CMaterial distributed\u201D."),Le.focus();return}let V=q.map(S=>({name:S.name.trim(),kind:S.kind})),w=V.findIndex(S=>S.name==="");if(w>=0){j.showText(`Material ${w+1} needs a name, or remove that row.`),me.querySelectorAll('[data-testid="report-material-name"]').item(w)?.focus();return}M=V}j.clear(),t.onSubmitReport(E.id,{talkingPoints:F.value.trim(),hcpFeedback:ie.value.trim(),materialsDistributed:b,materials:M})}),{update(a){if(H=a.loading.mutation||a.loading.selected,E=a.selected,n.setAttribute("aria-busy",String(a.loading.selected)),Ue.show(a.errors.detail),a.errors.checkin!==je&&(je=a.errors.checkin,le.show(a.errors.checkin)),a.errors.checkout!==Je&&(Je=a.errors.checkout,se.show(a.errors.checkout)),a.errors.report!==ze&&(ze=a.errors.report,j.show(a.errors.report)),a.selected===null){Ce=null,i.hidden=!1,d.hidden=!0,l.textContent=a.loading.selected?"Loading visit\u2026":a.errors.detail?"This visit could not be loaded.":"Select a visit from the list to see its details and compliance evidence.";return}i.hidden=!0,d.hidden=!1,St(a.selected),a.selected.id!==Ce&&(Ce=a.selected.id,yt(a.selected))}}}var qt=`
  <section class="card list-card" aria-labelledby="visits-heading">
    <div class="card-head">
      <div>
        <h2 id="visits-heading">Visits</h2>
        <p class="hint">Newest planned first.</p>
      </div>
      <span class="count" data-count data-testid="visit-count"></span>
    </div>
    <div class="filters">
      <div class="field">
        <label for="filter-status">Status</label>
        <select id="filter-status" data-status-filter data-testid="visit-filter-status">
          <option value="">All statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="CHECKED_IN">Checked in</option>
          <option value="CHECKED_OUT">Checked out</option>
          <option value="REPORTED">Reported</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="VOIDED">Voided</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>
      <div class="field">
        <label for="filter-product">Product</label>
        <select id="filter-product" data-product-filter data-testid="visit-filter-product">
          <option value="">All products</option>
        </select>
      </div>
      <button class="btn btn-small filter-clear" type="button" data-clear hidden>Clear filters</button>
    </div>
    <div data-list-banner></div>
    <div class="table-wrap" data-table-wrap>
      <table class="visits-table" data-testid="visit-table">
        <thead>
          <tr>
            <th scope="col">Planned</th>
            <th scope="col">HCP</th>
            <th scope="col">Hospital</th>
            <th scope="col">Product</th>
            <th scope="col">Status</th>
            <th scope="col">Abnormal</th>
          </tr>
        </thead>
        <tbody data-rows></tbody>
      </table>
    </div>
    <div class="empty-state" data-empty hidden>
      <p data-empty-title></p>
      <button class="btn btn-small" type="button" data-empty-clear hidden>Clear filters</button>
    </div>
  </section>
`;function _t(e){return e.toLowerCase().replaceAll("_","-")}function Kt(e){return e.map(t=>`${t.id}:${t.status}:${t.abnormal}:${t.updatedAt}`).join("|")}function ht(e,t){e.innerHTML=qt;let n=r(e,"[data-status-filter]"),i=r(e,"[data-product-filter]"),l=r(e,"[data-clear]"),d=r(e,"[data-empty-clear]"),u=P();r(e,"[data-list-banner]").append(u.element);let k=r(e,"[data-rows]"),C=r(e,"[data-table-wrap]"),p=r(e,"[data-empty]"),T=r(e,"[data-empty-title]"),L=r(e,"[data-count]"),N=r(e,".list-card"),v=null,h="";function c(o){return o.filters.status!==""||o.filters.productId!==""}function m(){t.onFiltersChange({status:"",productId:""}),n.focus()}l.addEventListener("click",m),d.addEventListener("click",m),n.addEventListener("change",()=>{let o=n.value;t.onFiltersChange({status:Ae(o)?o:"",productId:i.value})}),i.addEventListener("change",()=>{t.onFiltersChange({status:Ae(n.value)?n.value:"",productId:i.value})});function D(o){let g=i.value;i.replaceChildren(Z("","All products"));for(let y of o?.products??[])i.append(Z(y.id,y.name));[...i.options].some(y=>y.value===g)&&(i.value=g)}function x(o){t.onSelect(o)}function $(o){let g=s("tr","visit-row");g.dataset.visitId=o.id,g.dataset.testid="visit-row",g.tabIndex=0,g.addEventListener("click",()=>x(o.id)),g.addEventListener("keydown",F=>{(F.key==="Enter"||F.key===" ")&&(F.preventDefault(),x(o.id))});let y=s("td","planned-cell"),R=s("time");R.dateTime=o.plannedAt,R.append(s("span","planned-date",He(o.plannedAt)),s("span","planned-time",we(o.plannedAt))),y.append(R);let z=s("td");z.append(s("span","cell-primary",o.hcpName),s("span","cell-secondary",o.department));let ne=s("td",void 0,o.hospitalName),pe=s("td",void 0,o.productName),ae=s("td");ae.append(s("span",`pill pill-${_t(o.status)}`,ge(o.status)));let U=s("td");if(o.abnormal){let F=s("span","badge badge-abnormal","Abnormal");F.title=o.flags.map(ie=>`${ie.code}: ${ie.detail}`).join(`
`),U.append(F)}else o.status==="CHECKED_OUT"||o.status==="REPORTED"?U.append(s("span","badge badge-ok","OK")):U.append(s("span","cell-muted","\u2014"));return g.append(y,z,ne,pe,ae,U),g}function O(o){for(let g of k.querySelectorAll("tr[data-visit-id]")){let y=g.dataset.visitId===o.selected?.id;g.classList.toggle("is-selected",y),y?g.setAttribute("aria-current","true"):g.removeAttribute("aria-current")}}function B(o){let g=o.visits.length>0;C.hidden=!g,p.hidden=g;let y=c(o);if(l.hidden=!y,d.hidden=!y,g){T.textContent="";return}o.loading.visits?T.textContent="Loading visits\u2026":o.errors.list?T.textContent="Visits could not be loaded.":y?T.textContent="No visits match the current filters.":T.textContent="No visits yet. Plan the first visit on the left."}return{update(o){o.catalog!==v&&(v=o.catalog,D(o.catalog)),n.value=o.filters.status,([...i.options].some(R=>R.value===o.filters.productId)||o.filters.productId==="")&&(i.value=o.filters.productId),N.setAttribute("aria-busy",String(o.loading.visits)),L.textContent=o.loading.visits?"Loading\u2026":ee(o.visits.length,"visit"),u.show(o.errors.list);let y=Kt(o.visits);y!==h&&(h=y,k.replaceChildren(...o.visits.map($))),O(o),B(o)}}}var Ut=`
  <section class="card plan-card" aria-labelledby="plan-heading">
    <div class="card-head">
      <div>
        <h2 id="plan-heading">Plan a visit</h2>
        <p class="hint">Step 1 \u2014 book the HCP call.</p>
      </div>
    </div>
    <form class="plan-form" data-plan-form data-testid="plan-form">
      <div class="field">
        <label for="plan-mr">MR</label>
        <select id="plan-mr" name="mrId" data-testid="plan-mr" required>
          <option value="">Loading catalog\u2026</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-hcp">HCP</label>
        <select id="plan-hcp" name="hcpId" data-testid="plan-hcp" required>
          <option value="">Loading catalog\u2026</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-product">Product</label>
        <select id="plan-product" name="productId" data-testid="plan-product" required>
          <option value="">Loading catalog\u2026</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-at">Planned at</label>
        <input id="plan-at" name="plannedAt" data-testid="plan-planned-at" type="datetime-local" step="60" required>
      </div>
      <div class="plan-actions">
        <button class="btn btn-primary" type="submit" data-testid="plan-submit" disabled>Plan visit</button>
      </div>
      <div class="plan-error" data-plan-banner></div>
    </form>
  </section>
`;function Ne(e,t,n){let i=e.value;e.replaceChildren(Z("",t));for(let l of n)e.append(Z(l.value,l.label));e.value=n.some(l=>l.value===i)?i:""}function gt(e,t){e.innerHTML=Ut;let n=r(e,"[data-plan-form]"),i=r(e,"#plan-mr"),l=r(e,"#plan-hcp"),d=r(e,"#plan-product"),u=r(e,"#plan-at"),k=r(e,'button[type="submit"]'),C=P();r(e,"[data-plan-banner]").append(C.element),u.value=Pe();let p=null,T;function L(){let c=p!==null&&p.catalog!==null&&!p.loading.mutation&&i.value!==""&&l.value!==""&&d.value!==""&&u.value!=="";k.disabled=!c}function N(c){Ne(i,c===null?"Loading catalog\u2026":"Select MR\u2026",(c?.mrs??[]).map(m=>({value:m.id,label:`${m.name} \u2014 ${m.region}`}))),Ne(l,c===null?"Loading catalog\u2026":"Select HCP\u2026",(c?.hcps??[]).map(m=>({value:m.id,label:`${m.name} \u2014 ${m.hospitalName}`}))),Ne(d,c===null?"Loading catalog\u2026":"Select product\u2026",(c?.products??[]).map(m=>({value:m.id,label:`${m.name} (${m.code})`}))),i.disabled=c===null,l.disabled=c===null,d.disabled=c===null}function v(){i.value="",l.value="",d.value="",u.value=Pe(),C.clear(),L()}function h(){let c=i.value,m=l.value,D=d.value;if(c===""||m===""||D===""||u.value==="")return null;let x=new Date(u.value);return Number.isNaN(x.getTime())?null:{mrId:c,hcpId:m,productId:D,plannedAt:pt(x)}}n.addEventListener("submit",c=>{if(c.preventDefault(),!n.reportValidity())return;let m=h();if(m===null){C.showText("Choose an MR, an HCP, a product and a planned time.");return}t.onCreate(m).then(D=>{D&&v()})});for(let c of[i,l,d,u])c.addEventListener("input",L),c.addEventListener("change",L);return{update(c){p=c,c.catalog!==T&&(T=c.catalog,N(c.catalog)),n.setAttribute("aria-busy",String(c.loading.catalog)),C.show(c.errors.plan??c.errors.catalog),L()},reset:v}}var f=dt(),jt=r(document,"#plan-root"),Jt=r(document,"#list-root"),zt=r(document,"#detail-root"),Yt=r(document,"#dashboard-root"),Be=r(document,"#refresh"),Wt=gt(jt,{onCreate:on}),Gt=ht(Jt,{onSelect:Zt,onFiltersChange:en}),Qt=bt(zt,{onCheckIn:tn,onCheckOut:nn,onSubmitReport:an,onCancel:(e,t)=>ce("terminal",e,()=>rt(e,t)),onVoid:(e,t)=>ce("terminal",e,()=>ot(e,t)),onDelete:e=>rn(e)}),Xt=mt(Yt,{onRefresh:()=>{ue()}}),$e=0,Re=0,Fe=0,Oe=0;function Et(e){Wt.update(e),Gt.update(e),Qt.update(e),Xt.update(e),Be.disabled=e.loading.mutation,Be.setAttribute("aria-busy",String(e.loading.catalog||e.loading.visits||e.loading.dashboard||e.loading.selected))}async function kt(){let e=++$e;f.update(t=>({...t,loading:{...t.loading,catalog:!0},errors:{...t.errors,catalog:null}}));try{let t=await Xe();if(e!==$e)return;f.update(n=>({...n,catalog:t,loading:{...n.loading,catalog:!1}}))}catch(t){if(e!==$e)return;f.update(n=>({...n,loading:{...n.loading,catalog:!1},errors:{...n.errors,catalog:K(t)}}))}}async function te(){let e=++Re,t=f.getState().filters;f.update(n=>({...n,loading:{...n.loading,visits:!0},errors:{...n.errors,list:null}}));try{let n=await Ze(t);if(e!==Re)return;f.update(i=>({...i,visits:n.visits,loading:{...i.loading,visits:!1}}))}catch(n){if(e!==Re)return;f.update(i=>({...i,loading:{...i.loading,visits:!1},errors:{...i.errors,list:K(n)}}))}}async function ue(){let e=++Oe;f.update(t=>({...t,loading:{...t.loading,dashboard:!0},errors:{...t.errors,dashboard:null}}));try{let t=await st();if(e!==Oe)return;f.update(n=>({...n,dashboard:t,loading:{...n.loading,dashboard:!1}}))}catch(t){if(e!==Oe)return;f.update(n=>({...n,loading:{...n.loading,dashboard:!1},errors:{...n.errors,dashboard:K(t)}}))}}async function ke(e,t){let n=++Fe;f.update(i=>({...i,selected:t?.id===e?t:i.selected?.id===e?i.selected:null,loading:{...i.loading,selected:!0},errors:{...i.errors,detail:null}}));try{let i=await et(e);if(n!==Fe)return;f.update(l=>({...l,selected:i,loading:{...l.loading,selected:!1}}))}catch(i){if(n!==Fe)return;let l=K(i);f.update(d=>({...d,selected:l.code==="not_found"?null:d.selected,loading:{...d.loading,selected:!1},errors:{...d.errors,detail:l}}))}}function Zt(e){let t=f.getState().visits.find(n=>n.id===e);f.update(n=>({...n,errors:{...n.errors,checkin:null,checkout:null,report:null}})),ke(e,t)}function en(e){let t=f.getState().filters;t.status===e.status&&t.productId===e.productId||(f.update(n=>({...n,filters:e})),te())}function Ee(e,t,n){return{...e,[t]:n}}async function vt(e){let t=[te(),ue()];f.getState().selected?.id===e&&t.push(ke(e)),await Promise.all(t)}async function ce(e,t,n){if(!f.getState().loading.mutation){f.update(i=>({...i,loading:{...i.loading,mutation:!0},errors:Ee(i.errors,e,null)}));try{await n()}catch(i){let l=K(i);f.update(d=>({...d,errors:Ee(d.errors,e,l)})),(l.code==="invalid_state"||l.code==="conflict"||l.code==="not_found")&&await vt(t),f.update(d=>({...d,loading:{...d.loading,mutation:!1}}));return}await vt(t),f.update(i=>({...i,loading:{...i.loading,mutation:!1}}))}}function tn(e,t){return ce("checkin",e,()=>nt(e,t))}function nn(e,t){return ce("checkout",e,()=>at(e,t))}function an(e,t){return ce("report",e,()=>it(e,t))}async function rn(e){if(!f.getState().loading.mutation){f.update(t=>({...t,loading:{...t.loading,mutation:!0},errors:Ee(t.errors,"terminal",null)}));try{await lt(e)}catch(t){let n=K(t);f.update(i=>({...i,errors:Ee(i.errors,"terminal",n),loading:{...i.loading,mutation:!1}}));return}f.update(t=>({...t,selected:null})),await Promise.all([te(),ue()]),f.update(t=>({...t,loading:{...t.loading,mutation:!1}}))}}async function on(e){if(f.getState().loading.mutation)return!1;f.update(n=>({...n,loading:{...n.loading,mutation:!0},errors:{...n.errors,plan:null}}));let t;try{t=await tt(e)}catch(n){return f.update(i=>({...i,loading:{...i.loading,mutation:!1},errors:{...i.errors,plan:K(n)}})),!1}return await te(),await ke(t.id),f.update(n=>({...n,loading:{...n.loading,mutation:!1}})),!0}async function ln(){if(f.getState().loading.mutation)return;let e=[kt(),te(),ue()],t=f.getState().selected?.id;t!==void 0&&e.push(ke(t)),await Promise.all(e)}Be.addEventListener("click",()=>{ln()});f.update(e=>({...e,loading:{...e.loading,catalog:!0,visits:!0,dashboard:!0}}));f.subscribe(Et);Et(f.getState());Promise.all([kt(),te(),ue()]);})();

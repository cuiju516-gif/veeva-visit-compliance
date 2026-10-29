"use strict";(()=>{var j=class extends Error{status;code;details;constructor(e,n,a,s){super(a),this.name="ApiError",this.status=e,this.code=n,this.details=s}get field(){return this.details?.field}};function J(t){return t instanceof j?t:t instanceof Error?new j(0,"internal_error",t.message):new j(0,"internal_error","An unexpected error occurred.")}function Lt(t){return typeof t=="object"&&t!==null}function ve(t){if(!Lt(t)||!Lt(t.error))return null;let e=t.error;if(typeof e.code!="string"||typeof e.message!="string")return null;let n;if(Lt(e.details)){n={};for(let[a,s]of Object.entries(e.details))typeof s=="string"&&(n[a]=s)}return{code:e.code,message:e.message,details:n}}async function at(t,e){let n;try{n=await fetch(t,e)}catch(d){let u=d instanceof Error?d.message:"Network request failed.";throw new j(0,"network_error",u)}let a=await n.text(),s=null;if(a.length>0)try{s=JSON.parse(a)}catch{s=null}if(!n.ok){let d=ve(s);throw new j(n.status,d?.code??"internal_error",d?.message??`Request failed with HTTP ${n.status}.`,d?.details)}return s}function ct(t,e,n){return at(t,{method:e,headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}function jt(){return at("/api/catalog")}function Jt(t){let e=new URLSearchParams;return t.status&&e.set("status",t.status),t.productId&&e.set("productId",t.productId),e.set("limit","200"),at(`/api/visits?${e.toString()}`)}function zt(t){return at(`/api/visits/${encodeURIComponent(t)}`)}function Yt(t){return ct("/api/visits","POST",t)}function Wt(t,e){return ct(`/api/visits/${encodeURIComponent(t)}/checkin`,"POST",e)}function Gt(t,e){return ct(`/api/visits/${encodeURIComponent(t)}/checkout`,"POST",e)}function Qt(t,e){return ct(`/api/visits/${encodeURIComponent(t)}/report`,"PUT",e)}function Xt(t=6){return at(`/api/dashboard/monthly?months=${t}`)}function r(t,e){let n=t.querySelector(e);if(n===null)throw new Error(`Missing required element: ${e}`);return n}function l(t,e,n){let a=document.createElement(t);return e&&(a.className=e),n!==void 0&&(a.textContent=n),a}function W(t,e){let n=document.createElement("option");return n.value=t,n.textContent=e,n}function Ee(){return{catalog:null,visits:[],selected:null,dashboard:null,filters:{status:"",productId:""},loading:{catalog:!1,visits:!1,selected:!1,dashboard:!1,mutation:!1},errors:{catalog:null,list:null,detail:null,dashboard:null,plan:null,checkin:null,checkout:null,report:null}}}function Zt(){let t=Ee(),e=new Set;return{getState:()=>t,update:n=>{t=n(t);for(let a of e)a(t)},subscribe:n=>(e.add(n),()=>e.delete(n))}}var ke=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],ut=t=>String(t).padStart(2,"0"),Le={PLANNED:"Planned",CHECKED_IN:"Checked in",CHECKED_OUT:"Checked out",REPORTED:"Reported"};function pt(t){return Le[t]}function Tt(t){let e=new Date(t);return Number.isNaN(e.getTime())?"\u2014":`${Mt(t)} ${yt(t)}`}function Mt(t){let e=new Date(t);return Number.isNaN(e.getTime())?"\u2014":`${e.getFullYear()}-${ut(e.getMonth()+1)}-${ut(e.getDate())}`}function yt(t){let e=new Date(t);return Number.isNaN(e.getTime())?"\u2014":`${ut(e.getHours())}:${ut(e.getMinutes())}`}function te(t){let e=/^(\d{4})-(\d{2})$/.exec(t);if(!e)return t;let n=Number(e[1]),a=Number(e[2])-1;return!Number.isInteger(n)||a<0||a>11?t:`${ke[a]} ${n}`}function ee(t){if(!Number.isFinite(t))return"\u2014";let e=Math.max(0,Math.floor(t)),n=Math.floor(e/3600),a=Math.floor(e%3600/60),s=e%60;return n>0?`${n}h ${a}m ${s}s`:a>0?`${a}m ${s}s`:`${s}s`}function mt(t){if(!Number.isFinite(t)||t<=0)return"0%";let e=t*100,n=Math.round(e*10)/10;return n<1?"<1%":n>=100?"100%":Number.isInteger(n)?`${n}%`:`${n.toFixed(1)}%`}function Ct(t){return Number.isFinite(t)?`${Math.round(Math.max(0,t))} m`:"\u2014"}function St(t){return Number.isFinite(t)?t.toFixed(6):"\u2014"}function G(t,e,n=`${e}s`){return`${t} ${t===1?e:n}`}function A(t){return String(t).padStart(2,"0")}function Te(t){return`${t.getFullYear()}-${A(t.getMonth()+1)}-${A(t.getDate())}T${A(t.getHours())}:${A(t.getMinutes())}`}function xt(t=new Date){let e=new Date(t.getFullYear(),t.getMonth(),t.getDate()+1,10,0,0,0);return Te(e)}function ne(t){let e=-t.getTimezoneOffset(),n=e>=0?"+":"-",a=Math.abs(e);return`${t.getFullYear()}-${A(t.getMonth()+1)}-${A(t.getDate())}T${A(t.getHours())}:${A(t.getMinutes())}:${A(t.getSeconds())}${n}${A(Math.floor(a/60))}:${A(a%60)}`}function Ht(t){return t==="PLANNED"||t==="CHECKED_IN"||t==="CHECKED_OUT"||t==="REPORTED"}function V(){let t=document.createElement("div");t.className="error-banner",t.dataset.testid="error-banner",t.setAttribute("role","alert"),t.hidden=!0;let e=document.createElement("code");e.className="error-code";let n=document.createElement("span");n.className="error-field";let a=document.createElement("span");a.className="error-message",t.append(e,n,a);let s=null;function d(u,E,T,p){if(u!==s){if(s=u,u===null){t.hidden=!0,e.textContent="",n.textContent="",a.textContent="";return}t.hidden=!1,e.hidden=E==="",e.textContent=E,n.hidden=T==="",n.textContent=T,a.textContent=p}}return{element:t,show:u=>{if(u===null){d(null,"","","");return}let E=u.field?`field: ${u.field}`:"";d(`api:${u.code}:${E}:${u.message}`,u.code,E,u.message)},showText:u=>{d(`text:${u}`,"","",u)},clear:()=>d(null,"","","")}}var Me=`
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
`;function ye(t){let e=new Map;for(let v of t.rows){let b=e.get(v.productId);b===void 0&&(b={productId:v.productId,productName:v.productName,byMonth:new Map},e.set(v.productId,b)),b.byMonth.set(v.month,v)}let n=[...e.values()].sort((v,b)=>v.productName.localeCompare(b.productName)),a=l("div","table-wrap"),s=l("table","dashboard-table");s.dataset.testid="dashboard-table";let d=l("thead"),u=l("tr"),E=l("th",void 0,"Product");E.scope="col",u.append(E);for(let v of t.months){let b=l("th",void 0,te(v));b.scope="col",b.title=v,u.append(b)}d.append(u);let T=new Map;for(let v of t.months)T.set(v,{visits:0,abnormal:0});let p=l("tbody");for(let v of n){let b=l("tr"),c=l("th","row-heading",v.productName);c.scope="row",b.append(c);for(let m of t.months){let w=v.byMonth.get(m),x=w?.visits??0,$=w?.abnormal??0,F=w?.abnormalShare??0,O=T.get(m);O&&(O.visits+=x,O.abnormal+=$);let o=l("td","dashboard-cell",`${x} (${mt(F)})`);F>0&&o.classList.add("has-abnormal"),o.title=`${m}: ${G(x,"visit")}, ${$} abnormal`,o.dataset.month=m,o.dataset.visits=String(x),o.dataset.abnormal=String($),b.append(o)}p.append(b)}let L=l("tfoot"),k=l("tr","total-row"),N=l("th",void 0,"Total");N.scope="row",k.append(N);for(let v of t.months){let b=T.get(v)??{visits:0,abnormal:0},c=b.visits>0?b.abnormal/b.visits:0,m=l("td","dashboard-cell",`${b.visits} (${mt(c)})`);c>0&&m.classList.add("has-abnormal"),m.title=`${v}: ${G(b.visits,"visit")}, ${b.abnormal} abnormal`,k.append(m)}return L.append(k),s.append(d,p,L),a.append(s),a}function ae(t,e){t.innerHTML=Me;let n=r(t,".dashboard-card"),a=r(t,"[data-dashboard-content]"),s=r(t,"[data-dashboard-refresh]"),d=V();r(t,"[data-dashboard-banner]").append(d.element);let u=null;s.addEventListener("click",()=>e.onRefresh());function E(p){let L=l("div","empty-state");L.append(l("p",void 0,p)),a.replaceChildren(L)}function T(p){if(p.rows.length===0){E("No check-ins recorded in the last 6 months.");return}let L=p.totalVisits>0?p.totalAbnormal/p.totalVisits:0,k=l("p","totals-line");k.append(document.createTextNode(`${p.months.length} months \xB7 ${G(p.totalVisits,"visit")} \xB7 ${p.totalAbnormal} abnormal \xB7 overall abnormal share `),l("strong",void 0,mt(L)),document.createTextNode(".")),a.replaceChildren(ye(p),k)}return{update(p){if(n.setAttribute("aria-busy",String(p.loading.dashboard)),s.disabled=p.loading.dashboard,d.show(p.errors.dashboard),p.dashboard===null){p.loading.dashboard?E("Loading monthly dashboard\u2026"):p.errors.dashboard?E("Dashboard data could not be loaded."):E("No dashboard data available."),u=null;return}p.dashboard!==u&&(u=p.dashboard,T(p.dashboard))}}}var Ce=63710088e-1,it=500;function wt(t,e){if(![t.lat,t.lng,e.lat,e.lng].every(L=>Number.isFinite(L)))return Number.NaN;let a=t.lat*Math.PI/180,s=e.lat*Math.PI/180,d=(e.lat-t.lat)*Math.PI/180,u=(e.lng-t.lng)*Math.PI/180,E=Math.sin(d/2),T=Math.sin(u/2),p=E*E+Math.cos(a)*Math.cos(s)*T*T;return p>1&&(p=1),2*Ce*Math.asin(Math.sqrt(p))}var Se=[{value:"slide",label:"Slide"},{value:"reprint",label:"Reprint"},{value:"document",label:"Document"},{value:"other",label:"Other"}],xe=["Plan","Check-in","Detailing","Check-out","Call report"],He={PLANNED:["done","current","pending","pending","pending"],CHECKED_IN:["done","done","current","pending","pending"],CHECKED_OUT:["done","done","done","done","current"],REPORTED:["done","done","done","done","done"]},we=`
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
    </div>
  </section>
`;function Pe(t){return t==="slide"||t==="reprint"||t==="document"||t==="other"}function ie(t,e){let n=Number.parseFloat(t.value),a=Number.parseFloat(e.value);return!Number.isFinite(n)||!Number.isFinite(a)||n<-90||n>90||a<-180||a>180?null:{lat:n,lng:a}}function Ae(t,e,n){if(t.value.trim()===""||e.value.trim()==="")return"Enter both coordinates to see the distance from the hospital base.";let a=Number.parseFloat(t.value),s=Number.parseFloat(e.value);if(!Number.isFinite(a)||!Number.isFinite(s))return"Enter valid numeric coordinates to see the distance.";if(!Number.isFinite(n.baseLat)||!Number.isFinite(n.baseLng))return"Hospital base coordinates are unavailable.";let d=wt({lat:a,lng:s},{lat:n.baseLat,lng:n.baseLng});return d>it?`Distance from hospital base: ${Ct(d)} \u2014 outside the ${it} m limit.`:`Distance from hospital base: ${Ct(d)} \u2014 within the ${it} m limit.`}function re(t,e){t.innerHTML=we;let n=r(t,".detail-card"),a=r(t,"[data-detail-empty]"),s=r(t,"[data-detail-empty-text]"),d=r(t,"[data-detail-body]"),u=r(t,"[data-detail-hcp]"),E=r(t,"[data-detail-subtitle]"),T=r(t,"[data-status-pill]"),p=r(t,"[data-abnormal]"),L=r(t,"[data-flag-list]"),k=r(t,"[data-compliance-note]"),N=r(t,"[data-timeline]"),v=r(t,"[data-meta]"),b=r(t,"[data-checkin-form]"),c=r(t,"#checkin-lat"),m=r(t,"#checkin-lng"),w=r(t,'[data-testid="checkin-submit"]'),x=r(t,"[data-checkin-record]"),$=r(t,"[data-checkin-distance]"),F=r(t,"[data-checkin-hint]"),O=r(t,"[data-checkout-form]"),o=r(t,"#checkout-lat"),g=r(t,"#checkout-lng"),M=r(t,'[data-testid="checkout-submit"]'),D=r(t,"[data-checkout-record]"),z=r(t,"[data-checkout-distance]"),Q=r(t,"[data-checkout-hint]"),ot=r(t,"[data-duration-value]"),X=r(t,"[data-duration-note]"),B=r(t,"[data-report-form]"),R=r(t,'[data-testid="report-talking-points"]'),Z=r(t,'[data-testid="report-feedback"]'),tt=r(t,"[data-materials-distributed]"),pe=r(t,"[data-materials-block]"),st=r(t,"[data-material-rows]"),bt=r(t,"[data-material-add]"),me=r(t,'[data-testid="report-submit"]'),gt=r(t,"[data-report-hint]"),Rt=V();r(t,"[data-detail-banner]").append(Rt.element);let et=V();r(t,"[data-checkin-banner]").append(et.element);let nt=V();r(t,"[data-checkout-banner]").append(nt.element);let K=V();r(t,"[data-report-banner]").append(K.element);let y=null,vt=null,U=!1,Ft=null,Ot=null,_t=null,_=[],Et=0;function Y(i,f,C,P){let H=Ae(i,f,P);C.textContent=H;let S=wt({lat:Number.parseFloat(i.value),lng:Number.parseFloat(f.value)},{lat:P.baseLat,lng:P.baseLng});C.classList.toggle("warn",Number.isFinite(S)&&S>it)}function lt(){st.replaceChildren(),_.forEach((i,f)=>{let C=l("div","material-row");Et+=1;let P=`material-name-${Et}`,H=`material-kind-${Et}`,S=l("label","sr-only",`Material ${f+1} name`);S.htmlFor=P;let I=l("input");I.id=P,I.type="text",I.value=i.name,I.placeholder="Name",I.dataset.testid="report-material-name",I.addEventListener("input",()=>{i.name=I.value});let Kt=l("label","sr-only",`Material ${f+1} kind`);Kt.htmlFor=H;let q=l("select");q.id=H,q.dataset.testid="report-material-kind";for(let Ut of Se){let kt=document.createElement("option");kt.value=Ut.value,kt.textContent=Ut.label,q.append(kt)}q.value=i.kind,q.addEventListener("change",()=>{i.kind=Pe(q.value)?q.value:"document"});let dt=l("button","btn btn-small","Remove");dt.type="button",dt.setAttribute("aria-label",`Remove material ${f+1}`),dt.addEventListener("click",()=>{_.splice(f,1),lt(),bt.focus()}),C.append(S,I,Kt,q,dt),st.append(C)})}function fe(){K.clear(),_.push({name:"",kind:"document"}),lt();let i=st.querySelectorAll('[data-testid="report-material-name"]'),f=i.item(i.length-1);f&&f.focus()}function qt(){pe.hidden=!tt.checked,tt.checked&&_.length===0&&(_.push({name:"",kind:"document"}),lt())}tt.addEventListener("change",qt),bt.addEventListener("click",fe);function he(i){c.value=String(i.checkin?.lat??i.baseLat),m.value=String(i.checkin?.lng??i.baseLng),o.value=String(i.checkout?.lat??i.baseLat),g.value=String(i.checkout?.lng??i.baseLng),Y(c,m,$,i),Y(o,g,z,i),R.value=i.talkingPoints,Z.value=i.hcpFeedback,tt.checked=i.materialsDistributed,_=i.materials.map(f=>({name:f.name,kind:f.kind})),lt(),qt(),et.clear(),nt.clear(),K.clear()}function be(i){N.replaceChildren();let f=He[i];xe.forEach((C,P)=>{let H=f[P]??"pending",S=l("li",`timeline-step is-${H}`);S.append(l("span","timeline-index",String(P+1))),S.append(l("span","timeline-label",C));let I=H==="done"?"completed":H==="current"?"current":"pending";S.append(l("span","sr-only",`: ${I}`)),H==="current"&&S.setAttribute("aria-current","step"),N.append(S)})}function Bt(i,f,C){i.hidden=!1,i.textContent=`${f} ${Tt(C.at)} at ${St(C.lat)}, ${St(C.lng)}.`}function ge(i){if(u.textContent=i.hcpName,E.textContent=`${i.productName} \xB7 ${i.hospitalName} \xB7 ${i.department}`,T.className=`pill pill-${i.status.toLowerCase().replaceAll("_","-")}`,T.textContent=pt(i.status),p.hidden=!i.abnormal,L.replaceChildren(),i.abnormal)if(i.flags.length===0){let f=l("li","flag-item");f.append(l("span","flag-detail","The server marked this visit abnormal.")),L.append(f)}else for(let f of i.flags){let C=l("li","flag-item");C.append(l("code","flag-code",f.code)),C.append(l("span","flag-detail",f.detail)),L.append(C)}i.abnormal?(k.hidden=!0,k.textContent="",k.className="compliance-note"):i.status==="CHECKED_OUT"||i.status==="REPORTED"?(k.hidden=!1,k.className="compliance-note ok",k.textContent="No compliance flags were raised at check-out."):(k.hidden=!1,k.className="compliance-note",k.textContent="Compliance is evaluated when the visit is checked out."),be(i.status),v.textContent=`Planned ${Tt(i.plannedAt)} \xB7 MR ${i.mrName}`,i.checkin?Bt(x,"Checked in",i.checkin):(x.hidden=!0,x.textContent=""),i.checkout?(Bt(D,"Checked out",i.checkout),ot.textContent=ee(i.durationSeconds??0),X.textContent="computed by the server"):(D.hidden=!0,D.textContent="",ot.textContent="Not yet available",X.textContent="derived at check-out"),c.disabled=!i.capabilities.canCheckIn,m.disabled=!i.capabilities.canCheckIn,o.disabled=!i.capabilities.canCheckOut,g.disabled=!i.capabilities.canCheckOut,w.disabled=!i.capabilities.canCheckIn||U,M.disabled=!i.capabilities.canCheckOut||U,me.disabled=!i.capabilities.canReport||U,i.capabilities.canCheckIn?F.textContent="Uses the server clock; coordinates are stored as entered.":i.checkin?F.textContent="Check-in already recorded.":F.textContent="Check-in is unavailable in this state.",i.capabilities.canCheckOut?Q.textContent="Uses the server clock; duration is derived server-side.":i.checkout?Q.textContent="Check-out already recorded.":Q.textContent="Available after check-in.",i.capabilities.canReport?gt.textContent="Submitting files the report and marks the visit REPORTED.":i.status==="REPORTED"?gt.textContent="Report filed.":gt.textContent="Available after check-out."}return c.addEventListener("input",()=>{y&&Y(c,m,$,y)}),m.addEventListener("input",()=>{y&&Y(c,m,$,y)}),o.addEventListener("input",()=>{y&&Y(o,g,z,y)}),g.addEventListener("input",()=>{y&&Y(o,g,z,y)}),b.addEventListener("submit",i=>{if(i.preventDefault(),y===null||U||!y.capabilities.canCheckIn||!b.reportValidity())return;let f=ie(c,m);if(f===null){et.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),c.focus();return}et.clear(),e.onCheckIn(y.id,f)}),O.addEventListener("submit",i=>{if(i.preventDefault(),y===null||U||!y.capabilities.canCheckOut||!O.reportValidity())return;let f=ie(o,g);if(f===null){nt.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),o.focus();return}nt.clear(),e.onCheckOut(y.id,f)}),B.addEventListener("submit",i=>{if(i.preventDefault(),y===null||U||!y.capabilities.canReport||!B.reportValidity())return;let f=tt.checked,C=[];if(f){if(_.length===0){K.showText("Add at least one material, or untick \u201CMaterial distributed\u201D."),bt.focus();return}let P=_.map(S=>({name:S.name.trim(),kind:S.kind})),H=P.findIndex(S=>S.name==="");if(H>=0){K.showText(`Material ${H+1} needs a name, or remove that row.`),st.querySelectorAll('[data-testid="report-material-name"]').item(H)?.focus();return}C=P}K.clear(),e.onSubmitReport(y.id,{talkingPoints:R.value.trim(),hcpFeedback:Z.value.trim(),materialsDistributed:f,materials:C})}),{update(i){if(U=i.loading.mutation||i.loading.selected,y=i.selected,n.setAttribute("aria-busy",String(i.loading.selected)),Rt.show(i.errors.detail),i.errors.checkin!==Ft&&(Ft=i.errors.checkin,et.show(i.errors.checkin)),i.errors.checkout!==Ot&&(Ot=i.errors.checkout,nt.show(i.errors.checkout)),i.errors.report!==_t&&(_t=i.errors.report,K.show(i.errors.report)),i.selected===null){vt=null,a.hidden=!1,d.hidden=!0,s.textContent=i.loading.selected?"Loading visit\u2026":i.errors.detail?"This visit could not be loaded.":"Select a visit from the list to see its details and compliance evidence.";return}a.hidden=!0,d.hidden=!1,ge(i.selected),i.selected.id!==vt&&(vt=i.selected.id,he(i.selected))}}}var Ve=`
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
`;function Ie(t){return t.toLowerCase().replaceAll("_","-")}function Ne(t){return t.map(e=>`${e.id}:${e.status}:${e.abnormal}:${e.updatedAt}`).join("|")}function oe(t,e){t.innerHTML=Ve;let n=r(t,"[data-status-filter]"),a=r(t,"[data-product-filter]"),s=r(t,"[data-clear]"),d=r(t,"[data-empty-clear]"),u=V();r(t,"[data-list-banner]").append(u.element);let E=r(t,"[data-rows]"),T=r(t,"[data-table-wrap]"),p=r(t,"[data-empty]"),L=r(t,"[data-empty-title]"),k=r(t,"[data-count]"),N=r(t,".list-card"),v=null,b="";function c(o){return o.filters.status!==""||o.filters.productId!==""}function m(){e.onFiltersChange({status:"",productId:""}),n.focus()}s.addEventListener("click",m),d.addEventListener("click",m),n.addEventListener("change",()=>{let o=n.value;e.onFiltersChange({status:Ht(o)?o:"",productId:a.value})}),a.addEventListener("change",()=>{e.onFiltersChange({status:Ht(n.value)?n.value:"",productId:a.value})});function w(o){let g=a.value;a.replaceChildren(W("","All products"));for(let M of o?.products??[])a.append(W(M.id,M.name));[...a.options].some(M=>M.value===g)&&(a.value=g)}function x(o){e.onSelect(o)}function $(o){let g=l("tr","visit-row");g.dataset.visitId=o.id,g.dataset.testid="visit-row",g.tabIndex=0,g.addEventListener("click",()=>x(o.id)),g.addEventListener("keydown",R=>{(R.key==="Enter"||R.key===" ")&&(R.preventDefault(),x(o.id))});let M=l("td","planned-cell"),D=l("time");D.dateTime=o.plannedAt,D.append(l("span","planned-date",Mt(o.plannedAt)),l("span","planned-time",yt(o.plannedAt))),M.append(D);let z=l("td");z.append(l("span","cell-primary",o.hcpName),l("span","cell-secondary",o.department));let Q=l("td",void 0,o.hospitalName),ot=l("td",void 0,o.productName),X=l("td");X.append(l("span",`pill pill-${Ie(o.status)}`,pt(o.status)));let B=l("td");if(o.abnormal){let R=l("span","badge badge-abnormal","Abnormal");R.title=o.flags.map(Z=>`${Z.code}: ${Z.detail}`).join(`
`),B.append(R)}else o.status==="CHECKED_OUT"||o.status==="REPORTED"?B.append(l("span","badge badge-ok","OK")):B.append(l("span","cell-muted","\u2014"));return g.append(M,z,Q,ot,X,B),g}function F(o){for(let g of E.querySelectorAll("tr[data-visit-id]")){let M=g.dataset.visitId===o.selected?.id;g.classList.toggle("is-selected",M),M?g.setAttribute("aria-current","true"):g.removeAttribute("aria-current")}}function O(o){let g=o.visits.length>0;T.hidden=!g,p.hidden=g;let M=c(o);if(s.hidden=!M,d.hidden=!M,g){L.textContent="";return}o.loading.visits?L.textContent="Loading visits\u2026":o.errors.list?L.textContent="Visits could not be loaded.":M?L.textContent="No visits match the current filters.":L.textContent="No visits yet. Plan the first visit on the left."}return{update(o){o.catalog!==v&&(v=o.catalog,w(o.catalog)),n.value=o.filters.status,([...a.options].some(D=>D.value===o.filters.productId)||o.filters.productId==="")&&(a.value=o.filters.productId),N.setAttribute("aria-busy",String(o.loading.visits)),k.textContent=o.loading.visits?"Loading\u2026":G(o.visits.length,"visit"),u.show(o.errors.list);let M=Ne(o.visits);M!==b&&(b=M,E.replaceChildren(...o.visits.map($))),F(o),O(o)}}}var $e=`
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
`;function Pt(t,e,n){let a=t.value;t.replaceChildren(W("",e));for(let s of n)t.append(W(s.value,s.label));t.value=n.some(s=>s.value===a)?a:""}function se(t,e){t.innerHTML=$e;let n=r(t,"[data-plan-form]"),a=r(t,"#plan-mr"),s=r(t,"#plan-hcp"),d=r(t,"#plan-product"),u=r(t,"#plan-at"),E=r(t,'button[type="submit"]'),T=V();r(t,"[data-plan-banner]").append(T.element),u.value=xt();let p=null,L;function k(){let c=p!==null&&p.catalog!==null&&!p.loading.mutation&&a.value!==""&&s.value!==""&&d.value!==""&&u.value!=="";E.disabled=!c}function N(c){Pt(a,c===null?"Loading catalog\u2026":"Select MR\u2026",(c?.mrs??[]).map(m=>({value:m.id,label:`${m.name} \u2014 ${m.region}`}))),Pt(s,c===null?"Loading catalog\u2026":"Select HCP\u2026",(c?.hcps??[]).map(m=>({value:m.id,label:`${m.name} \u2014 ${m.hospitalName}`}))),Pt(d,c===null?"Loading catalog\u2026":"Select product\u2026",(c?.products??[]).map(m=>({value:m.id,label:`${m.name} (${m.code})`}))),a.disabled=c===null,s.disabled=c===null,d.disabled=c===null}function v(){a.value="",s.value="",d.value="",u.value=xt(),T.clear(),k()}function b(){let c=a.value,m=s.value,w=d.value;if(c===""||m===""||w===""||u.value==="")return null;let x=new Date(u.value);return Number.isNaN(x.getTime())?null:{mrId:c,hcpId:m,productId:w,plannedAt:ne(x)}}n.addEventListener("submit",c=>{if(c.preventDefault(),!n.reportValidity())return;let m=b();if(m===null){T.showText("Choose an MR, an HCP, a product and a planned time.");return}e.onCreate(m).then(w=>{w&&v()})});for(let c of[a,s,d,u])c.addEventListener("input",k),c.addEventListener("change",k);return{update(c){p=c,c.catalog!==L&&(L=c.catalog,N(c.catalog)),n.setAttribute("aria-busy",String(c.loading.catalog)),T.show(c.errors.plan??c.errors.catalog),k()},reset:v}}var h=Zt(),De=r(document,"#plan-root"),Re=r(document,"#list-root"),Fe=r(document,"#detail-root"),Oe=r(document,"#dashboard-root"),$t=r(document,"#refresh"),_e=se(De,{onCreate:We}),qe=oe(Re,{onSelect:Ue,onFiltersChange:je}),Be=re(Fe,{onCheckIn:Je,onCheckOut:ze,onSubmitReport:Ye}),Ke=ae(Oe,{onRefresh:()=>{ft()}}),At=0,Vt=0,It=0,Nt=0;function ce(t){_e.update(t),qe.update(t),Be.update(t),Ke.update(t),$t.disabled=t.loading.mutation,$t.setAttribute("aria-busy",String(t.loading.catalog||t.loading.visits||t.loading.dashboard||t.loading.selected))}async function ue(){let t=++At;h.update(e=>({...e,loading:{...e.loading,catalog:!0},errors:{...e.errors,catalog:null}}));try{let e=await jt();if(t!==At)return;h.update(n=>({...n,catalog:e,loading:{...n.loading,catalog:!1}}))}catch(e){if(t!==At)return;h.update(n=>({...n,loading:{...n.loading,catalog:!1},errors:{...n.errors,catalog:J(e)}}))}}async function rt(){let t=++Vt,e=h.getState().filters;h.update(n=>({...n,loading:{...n.loading,visits:!0},errors:{...n.errors,list:null}}));try{let n=await Jt(e);if(t!==Vt)return;h.update(a=>({...a,visits:n.visits,loading:{...a.loading,visits:!1}}))}catch(n){if(t!==Vt)return;h.update(a=>({...a,loading:{...a.loading,visits:!1},errors:{...a.errors,list:J(n)}}))}}async function ft(){let t=++Nt;h.update(e=>({...e,loading:{...e.loading,dashboard:!0},errors:{...e.errors,dashboard:null}}));try{let e=await Xt();if(t!==Nt)return;h.update(n=>({...n,dashboard:e,loading:{...n.loading,dashboard:!1}}))}catch(e){if(t!==Nt)return;h.update(n=>({...n,loading:{...n.loading,dashboard:!1},errors:{...n.errors,dashboard:J(e)}}))}}async function ht(t,e){let n=++It;h.update(a=>({...a,selected:e?.id===t?e:a.selected?.id===t?a.selected:null,loading:{...a.loading,selected:!0},errors:{...a.errors,detail:null}}));try{let a=await zt(t);if(n!==It)return;h.update(s=>({...s,selected:a,loading:{...s.loading,selected:!1}}))}catch(a){if(n!==It)return;let s=J(a);h.update(d=>({...d,selected:s.code==="not_found"?null:d.selected,loading:{...d.loading,selected:!1},errors:{...d.errors,detail:s}}))}}function Ue(t){let e=h.getState().visits.find(n=>n.id===t);h.update(n=>({...n,errors:{...n.errors,checkin:null,checkout:null,report:null}})),ht(t,e)}function je(t){let e=h.getState().filters;e.status===t.status&&e.productId===t.productId||(h.update(n=>({...n,filters:t})),rt())}function le(t,e,n){return{...t,[e]:n}}async function de(t){let e=[rt(),ft()];h.getState().selected?.id===t&&e.push(ht(t)),await Promise.all(e)}async function Dt(t,e,n){if(!h.getState().loading.mutation){h.update(a=>({...a,loading:{...a.loading,mutation:!0},errors:le(a.errors,t,null)}));try{await n()}catch(a){let s=J(a);h.update(d=>({...d,errors:le(d.errors,t,s)})),(s.code==="invalid_state"||s.code==="conflict"||s.code==="not_found")&&await de(e),h.update(d=>({...d,loading:{...d.loading,mutation:!1}}));return}await de(e),h.update(a=>({...a,loading:{...a.loading,mutation:!1}}))}}function Je(t,e){return Dt("checkin",t,()=>Wt(t,e))}function ze(t,e){return Dt("checkout",t,()=>Gt(t,e))}function Ye(t,e){return Dt("report",t,()=>Qt(t,e))}async function We(t){if(h.getState().loading.mutation)return!1;h.update(n=>({...n,loading:{...n.loading,mutation:!0},errors:{...n.errors,plan:null}}));let e;try{e=await Yt(t)}catch(n){return h.update(a=>({...a,loading:{...a.loading,mutation:!1},errors:{...a.errors,plan:J(n)}})),!1}return await rt(),await ht(e.id),h.update(n=>({...n,loading:{...n.loading,mutation:!1}})),!0}async function Ge(){if(h.getState().loading.mutation)return;let t=[ue(),rt(),ft()],e=h.getState().selected?.id;e!==void 0&&t.push(ht(e)),await Promise.all(t)}$t.addEventListener("click",()=>{Ge()});h.update(t=>({...t,loading:{...t.loading,catalog:!0,visits:!0,dashboard:!0}}));h.subscribe(ce);ce(h.getState());Promise.all([ue(),rt(),ft()]);})();

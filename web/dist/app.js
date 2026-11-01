"use strict";(()=>{var Y=class extends Error{status;code;details;constructor(t,n,i,l){super(i),this.name="ApiError",this.status=t,this.code=n,this.details=l}get field(){return this.details?.field}};function K(e){return e instanceof Y?e:e instanceof Error?new Y(0,"internal_error",e.message):new Y(0,"internal_error","An unexpected error occurred.")}function xe(e){return typeof e=="object"&&e!==null}function $t(e){if(!xe(e)||!xe(e.error))return null;let t=e.error;if(typeof t.code!="string"||typeof t.message!="string")return null;let n;if(xe(t.details)){n={};for(let[i,l]of Object.entries(t.details))typeof l=="string"&&(n[i]=l)}return{code:t.code,message:t.message,details:n}}var Ze="admin";function Se(e){Ze=e}async function Q(e,t){let n,i={...t,headers:{...t?.headers??{},"X-Actor":Ze}};try{n=await fetch(e,i)}catch(u){let T=u instanceof Error?u.message:"Network request failed.";throw new Y(0,"network_error",T)}let l=await n.text(),d=null;if(l.length>0)try{d=JSON.parse(l)}catch{d=null}if(!n.ok){let u=$t(d);throw new Y(n.status,u?.code??"internal_error",u?.message??`Request failed with HTTP ${n.status}.`,u?.details)}return d}function Z(e,t,n){return Q(e,{method:t,headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}function et(){return Q("/api/catalog")}function tt(e){let t=new URLSearchParams;return e.status&&t.set("status",e.status),e.productId&&t.set("productId",e.productId),t.set("limit","200"),Q(`/api/visits?${t.toString()}`)}function nt(e){return Q(`/api/visits/${encodeURIComponent(e)}`)}function at(e){return Z("/api/visits","POST",e)}function it(e,t){return Z(`/api/visits/${encodeURIComponent(e)}/checkin`,"POST",t)}function rt(e,t){return Z(`/api/visits/${encodeURIComponent(e)}/checkout`,"POST",t)}function ot(e,t){return Z(`/api/visits/${encodeURIComponent(e)}/report`,"PUT",t)}function lt(e,t){return Z(`/api/visits/${encodeURIComponent(e)}/cancel`,"POST",{reason:t})}function st(e,t){return Z(`/api/visits/${encodeURIComponent(e)}/void`,"POST",{reason:t})}function dt(e){return Q(`/api/visits/${encodeURIComponent(e)}`,{method:"DELETE"})}function ct(e=6){return Q(`/api/dashboard/monthly?months=${e}`)}function r(e,t){let n=e.querySelector(t);if(n===null)throw new Error(`Missing required element: ${t}`);return n}function s(e,t,n){let i=document.createElement(e);return t&&(i.className=t),n!==void 0&&(i.textContent=n),i}function ee(e,t){let n=document.createElement("option");return n.value=e,n.textContent=t,n}function It(){return{catalog:null,actor:"",visits:[],selected:null,dashboard:null,filters:{status:"",productId:""},loading:{catalog:!1,visits:!1,selected:!1,dashboard:!1,mutation:!1},errors:{catalog:null,list:null,detail:null,dashboard:null,plan:null,checkin:null,checkout:null,report:null,terminal:null}}}function ut(){let e=It(),t=new Set;return{getState:()=>e,update:n=>{e=n(e);for(let i of t)i(e)},subscribe:n=>(t.add(n),()=>t.delete(n))}}var At=["1\u6708","2\u6708","3\u6708","4\u6708","5\u6708","6\u6708","7\u6708","8\u6708","9\u6708","10\u6708","11\u6708","12\u6708"],ge=e=>String(e).padStart(2,"0"),Pt={PLANNED:"\u5DF2\u8BA1\u5212",CHECKED_IN:"\u5DF2\u7B7E\u5230",CHECKED_OUT:"\u5DF2\u7B7E\u9000",REPORTED:"\u5DF2\u5B8C\u6210",CANCELLED:"\u5DF2\u53D6\u6D88",VOIDED:"Voided",DELETED:"\u5DF2\u5220\u9664"};function he(e){return Pt[e]}function we(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${He(e)} ${De(e)}`}function He(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${t.getFullYear()}-${ge(t.getMonth()+1)}-${ge(t.getDate())}`}function De(e){let t=new Date(e);return Number.isNaN(t.getTime())?"\u2014":`${ge(t.getHours())}:${ge(t.getMinutes())}`}function pt(e){let t=/^(\d{4})-(\d{2})$/.exec(e);if(!t)return e;let n=Number(t[1]),i=Number(t[2])-1;return!Number.isInteger(n)||i<0||i>11?e:`${At[i]} ${n}`}function mt(e){if(!Number.isFinite(e))return"\u2014";let t=Math.max(0,Math.floor(e)),n=Math.floor(t/3600),i=Math.floor(t%3600/60),l=t%60;return n>0?`${n} \u5C0F\u65F6 ${i} \u5206 ${l} \u79D2`:i>0?`${i} \u5206 ${l} \u79D2`:`${l} \u79D2`}function ve(e){if(!Number.isFinite(e)||e<=0)return"0%";let t=e*100,n=Math.round(t*10)/10;return n<1?"<1%":n>=100?"100%":Number.isInteger(n)?`${n}%`:`${n.toFixed(1)}%`}function Ve(e){return Number.isFinite(e)?`${Math.round(Math.max(0,e))} m`:"\u2014"}function $e(e){return Number.isFinite(e)?e.toFixed(6):"\u2014"}function A(e){return String(e).padStart(2,"0")}function Nt(e){return`${e.getFullYear()}-${A(e.getMonth()+1)}-${A(e.getDate())}T${A(e.getHours())}:${A(e.getMinutes())}`}function Ie(e=new Date){let t=new Date(e.getFullYear(),e.getMonth(),e.getDate()+1,10,0,0,0);return Nt(t)}function ft(e){let t=-e.getTimezoneOffset(),n=t>=0?"+":"-",i=Math.abs(t);return`${e.getFullYear()}-${A(e.getMonth()+1)}-${A(e.getDate())}T${A(e.getHours())}:${A(e.getMinutes())}:${A(e.getSeconds())}${n}${A(Math.floor(i/60))}:${A(i%60)}`}function Ae(e){return e==="PLANNED"||e==="CHECKED_IN"||e==="CHECKED_OUT"||e==="REPORTED"||e==="CANCELLED"||e==="VOIDED"||e==="DELETED"}function I(){let e=document.createElement("div");e.className="error-banner",e.dataset.testid="error-banner",e.setAttribute("role","alert"),e.hidden=!0;let t=document.createElement("code");t.className="error-code";let n=document.createElement("span");n.className="error-field";let i=document.createElement("span");i.className="error-message",e.append(t,n,i);let l=null;function d(u,T,C,p){if(u!==l){if(l=u,u===null){e.hidden=!0,t.textContent="",n.textContent="",i.textContent="";return}e.hidden=!1,t.hidden=T==="",t.textContent=T,n.hidden=C==="",n.textContent=C,i.textContent=p}}return{element:e,show:u=>{if(u===null){d(null,"","","");return}let T=u.field?`field: ${u.field}`:"";d(`api:${u.code}:${T}:${u.message}`,u.code,T,u.message)},showText:u=>{d(`text:${u}`,"","",u)},clear:()=>d(null,"","","")}}var Rt=`
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
`;function Ft(e){let t=new Map;for(let E of e.rows){let b=t.get(E.productId);b===void 0&&(b={productId:E.productId,productName:E.productName,byMonth:new Map},t.set(E.productId,b)),b.byMonth.set(E.month,E)}let n=[...t.values()].sort((E,b)=>E.productName.localeCompare(b.productName)),i=s("div","table-wrap"),l=s("table","dashboard-table");l.dataset.testid="dashboard-table";let d=s("thead"),u=s("tr"),T=s("th",void 0,"\u836F\u54C1");T.scope="col",u.append(T);for(let E of e.months){let b=s("th",void 0,pt(E));b.scope="col",b.title=E,u.append(b)}d.append(u);let C=new Map;for(let E of e.months)C.set(E,{visits:0,done:0,cancelled:0,voided:0,abnormal:0});let p=s("tbody");for(let E of n){let b=s("tr"),c=s("th","row-heading",E.productName);c.scope="row",b.append(c);for(let h of e.months){let v=E.byMonth.get(h),V=v?.visits??0,R=v?.abnormal??0,O=v?.abnormalShare??0,B=v?.done??0,o=v?.cancelled??0,g=v?.voided??0,k=C.get(h);k&&(k.visits+=V,k.done+=B,k.cancelled+=o,k.voided+=g,k.abnormal+=R);let w=s("td","dashboard-cell",`${B} / ${ve(O)}`);O>0&&w.classList.add("has-abnormal"),w.title=`${h}\uFF1A\u5B8C\u6210 ${B}\uFF08\u6709\u6548 ${v?.effective??0} \xB7 \u5F02\u5E38 ${R}\uFF09 \xB7 \u53D6\u6D88 ${o} \xB7 \u4F5C\u5E9F ${g}`,w.dataset.month=h,w.dataset.visits=String(V),w.dataset.abnormal=String(R),b.append(w)}p.append(b)}let M=s("tfoot"),y=s("tr","total-row"),N=s("th",void 0,"\u5408\u8BA1");N.scope="row",y.append(N);for(let E of e.months){let b=C.get(E)??{visits:0,done:0,cancelled:0,voided:0,abnormal:0},c=b.done>0?b.abnormal/b.done:0,h=s("td","dashboard-cell",`${b.done} / ${ve(c)}`);c>0&&h.classList.add("has-abnormal"),h.title=`${E}\uFF1A\u5B8C\u6210 ${b.done} \xB7 \u5F02\u5E38 ${b.abnormal} \xB7 \u53D6\u6D88 ${b.cancelled} \xB7 \u4F5C\u5E9F ${b.voided}`,y.append(h)}return M.append(y),l.append(d,p,M),i.append(l),i}function bt(e,t){e.innerHTML=Rt;let n=r(e,".dashboard-card"),i=r(e,"[data-dashboard-content]"),l=r(e,"[data-dashboard-refresh]"),d=I();r(e,"[data-dashboard-banner]").append(d.element);let u=null;l.addEventListener("click",()=>t.onRefresh());function T(p){let M=s("div","empty-state");M.append(s("p",void 0,p)),i.replaceChildren(M)}function C(p){if(p.rows.length===0){T("No check-ins recorded in the last 6 months.");return}let M=p.totalDone>0?p.totalAbnormal/p.totalDone:0,y=s("p","totals-line");y.append(document.createTextNode(`\u8FD1 ${p.months.length} \u4E2A\u6708 \xB7 \u5B8C\u6210 ${p.totalDone}\uFF08\u6709\u6548 ${p.totalEffective} \xB7 \u5F02\u5E38 ${p.totalAbnormal}\uFF09\xB7 \u53D6\u6D88 ${p.totalCancelled} \xB7 \u4F5C\u5E9F ${p.totalVoided} \xB7 \u5F02\u5E38\u7387 `),s("strong",void 0,ve(M)),document.createTextNode("\uFF08\u5220\u9664\u4E0D\u8BA1\u5165\u4EFB\u4F55\u4E00\u9879\uFF09")),i.replaceChildren(Ft(p),y)}return{update(p){if(n.setAttribute("aria-busy",String(p.loading.dashboard)),l.disabled=p.loading.dashboard,d.show(p.errors.dashboard),p.dashboard===null){p.loading.dashboard?T("Loading monthly dashboard\u2026"):p.errors.dashboard?T("\u770B\u677F\u6570\u636E\u52A0\u8F7D\u5931\u8D25\u3002"):T("\u6682\u65E0\u770B\u677F\u6570\u636E\u3002"),u=null;return}p.dashboard!==u&&(u=p.dashboard,C(p.dashboard))}}}var Ot=63710088e-1,de=500;function Pe(e,t){if(![e.lat,e.lng,t.lat,t.lng].every(M=>Number.isFinite(M)))return Number.NaN;let i=e.lat*Math.PI/180,l=t.lat*Math.PI/180,d=(t.lat-e.lat)*Math.PI/180,u=(t.lng-e.lng)*Math.PI/180,T=Math.sin(d/2),C=Math.sin(u/2),p=T*T+Math.cos(i)*Math.cos(l)*C*C;return p>1&&(p=1),2*Ot*Math.asin(Math.sqrt(p))}var Bt=[{value:"slide",label:"Slide"},{value:"reprint",label:"\u91CD\u5370\u4EF6"},{value:"document",label:"\u6587\u732E"},{value:"other",label:"Other"}],_t=["\u8BA1\u5212","\u7B7E\u5230","\u5B66\u672F\u6C9F\u901A","\u7B7E\u9000","\u53CD\u9988\u8BB0\u5F55"],qt={PLANNED:["done","current","pending","pending","pending"],CHECKED_IN:["done","done","current","pending","pending"],CHECKED_OUT:["done","done","done","done","current"],REPORTED:["done","done","done","done","done"],CANCELLED:["done","pending","pending","pending","pending"],VOIDED:["done","done","pending","pending","pending"],DELETED:["done","pending","pending","pending","pending"]},Kt=`
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
`;function Ut(e){return e==="slide"||e==="reprint"||e==="document"||e==="other"}function gt(e,t){let n=Number.parseFloat(e.value),i=Number.parseFloat(t.value);return!Number.isFinite(n)||!Number.isFinite(i)||n<-90||n>90||i<-180||i>180?null:{lat:n,lng:i}}function jt(e,t,n){if(e.value.trim()===""||t.value.trim()==="")return"\u586B\u5165\u7ECF\u7EAC\u5EA6\u540E\u663E\u793A\u4E0E\u533B\u9662\u57FA\u51C6\u70B9\u7684\u8DDD\u79BB\u3002";let i=Number.parseFloat(e.value),l=Number.parseFloat(t.value);if(!Number.isFinite(i)||!Number.isFinite(l))return"\u586B\u5165\u5408\u6CD5\u6570\u5B57\u540E\u663E\u793A\u8DDD\u79BB\u3002";if(!Number.isFinite(n.baseLat)||!Number.isFinite(n.baseLng))return"\u533B\u9662\u57FA\u51C6\u5750\u6807\u4E0D\u53EF\u7528\u3002";let d=Pe({lat:i,lng:l},{lat:n.baseLat,lng:n.baseLng});return d>de?`Distance from hospital base: ${Ve(d)} \u2014 outside the ${de} m limit.`:`Distance from hospital base: ${Ve(d)} \u2014 within the ${de} m limit.`}function ht(e,t){e.innerHTML=Kt;let n=r(e,".detail-card"),i=r(e,"[data-detail-empty]"),l=r(e,"[data-detail-empty-text]"),d=r(e,"[data-detail-body]"),u=r(e,"[data-detail-hcp]"),T=r(e,"[data-detail-subtitle]"),C=r(e,"[data-status-pill]"),p=r(e,"[data-abnormal]"),M=r(e,"[data-flag-list]"),y=r(e,"[data-compliance-note]"),N=r(e,"[data-timeline]"),E=r(e,"[data-meta]"),b=r(e,"[data-checkin-form]"),c=r(e,"#checkin-lat"),h=r(e,"#checkin-lng"),v=r(e,'[data-testid="checkin-submit"]'),V=r(e,"[data-checkin-record]"),R=r(e,"[data-checkin-distance]"),O=r(e,"[data-checkin-hint]"),B=r(e,"[data-checkout-form]"),o=r(e,"#checkout-lat"),g=r(e,"#checkout-lng"),k=r(e,'[data-testid="checkout-submit"]'),w=r(e,"[data-checkout-record]"),z=r(e,"[data-checkout-distance]"),ne=r(e,"[data-checkout-hint]"),pe=r(e,"[data-duration-value]"),ae=r(e,"[data-duration-note]"),U=r(e,"[data-report-form]"),F=r(e,'[data-testid="report-talking-points"]'),ie=r(e,'[data-testid="report-feedback"]'),re=r(e,"[data-materials-distributed]"),xt=r(e,"[data-materials-block]"),me=r(e,"[data-material-rows]"),ke=r(e,"[data-material-add]"),St=r(e,'[data-testid="report-submit"]'),Te=r(e,"[data-report-hint]"),oe=r(e,'[data-testid="terminal-reason"]'),qe=r(e,"[data-cancel-submit]"),Ke=r(e,"[data-void-submit]"),Ue=r(e,"[data-delete-submit]"),J=r(e,"[data-terminal-hint]"),je=I();r(e,"[data-detail-banner]").append(je.element);let le=I();r(e,"[data-checkin-banner]").append(le.element);let se=I();r(e,"[data-checkout-banner]").append(se.element);let X=I();r(e,"[data-terminal-banner]").append(X.element);let j=I();r(e,"[data-report-banner]").append(j.element);let L=null,ye=null,H=!1,Ye=null,We=null,ze=null,_=[],Me=0;function G(a,f,x,$){let D=jt(a,f,$);x.textContent=D;let S=Pe({lat:Number.parseFloat(a.value),lng:Number.parseFloat(f.value)},{lat:$.baseLat,lng:$.baseLng});x.classList.toggle("warn",Number.isFinite(S)&&S>de)}function fe(){me.replaceChildren(),_.forEach((a,f)=>{let x=s("div","material-row");Me+=1;let $=`material-name-${Me}`,D=`material-kind-${Me}`,S=s("label","sr-only",`Material ${f+1} name`);S.htmlFor=$;let P=s("input");P.id=$,P.type="text",P.value=a.name,P.placeholder="Name",P.dataset.testid="report-material-name",P.addEventListener("input",()=>{a.name=P.value});let Ge=s("label","sr-only",`Material ${f+1} kind`);Ge.htmlFor=D;let q=s("select");q.id=D,q.dataset.testid="report-material-kind";for(let Qe of Bt){let Ce=document.createElement("option");Ce.value=Qe.value,Ce.textContent=Qe.label,q.append(Ce)}q.value=a.kind,q.addEventListener("change",()=>{a.kind=Ut(q.value)?q.value:"document"});let be=s("button","btn btn-small","Remove");be.type="button",be.setAttribute("aria-label",`Remove material ${f+1}`),be.addEventListener("click",()=>{_.splice(f,1),fe(),ke.focus()}),x.append(S,P,Ge,q,be),me.append(x)})}function wt(){j.clear(),_.push({name:"",kind:"document"}),fe();let a=me.querySelectorAll('[data-testid="report-material-name"]'),f=a.item(a.length-1);f&&f.focus()}function Je(){xt.hidden=!re.checked,re.checked&&_.length===0&&(_.push({name:"",kind:"document"}),fe())}re.addEventListener("change",Je),ke.addEventListener("click",wt);function Ht(a){c.value=String(a.checkin?.lat??a.baseLat),h.value=String(a.checkin?.lng??a.baseLng),o.value=String(a.checkout?.lat??a.baseLat),g.value=String(a.checkout?.lng??a.baseLng),G(c,h,R,a),G(o,g,z,a),F.value=a.talkingPoints,ie.value=a.hcpFeedback,re.checked=a.materialsDistributed,_=a.materials.map(f=>({name:f.name,kind:f.kind})),fe(),Je(),le.clear(),se.clear(),j.clear()}function Dt(a){N.replaceChildren();let f=qt[a];_t.forEach((x,$)=>{let D=f[$]??"pending",S=s("li",`timeline-step is-${D}`);S.append(s("span","timeline-index",String($+1))),S.append(s("span","timeline-label",x));let P=D==="done"?"completed":D==="current"?"current":"pending";S.append(s("span","sr-only",`: ${P}`)),D==="current"&&S.setAttribute("aria-current","step"),N.append(S)})}function Xe(a,f,x){a.hidden=!1,a.textContent=`${f} ${we(x.at)} at ${$e(x.lat)}, ${$e(x.lng)}.`}function Vt(a){if(u.textContent=a.hcpName,T.textContent=`${a.productName} \xB7 ${a.hospitalName} \xB7 ${a.department}`,C.className=`pill pill-${a.status.toLowerCase().replaceAll("_","-")}`,C.textContent=he(a.status),p.hidden=!a.abnormal,M.replaceChildren(),a.abnormal)if(a.flags.length===0){let f=s("li","flag-item");f.append(s("span","flag-detail","\u670D\u52A1\u7AEF\u628A\u8FD9\u6B21\u62DC\u8BBF\u6807\u8BB0\u4E3A\u5F02\u5E38\u3002")),M.append(f)}else for(let f of a.flags){let x=s("li","flag-item");x.append(s("code","flag-code",f.code)),x.append(s("span","flag-detail",f.detail)),M.append(x)}a.abnormal?(y.hidden=!0,y.textContent="",y.className="compliance-note"):a.status==="CHECKED_OUT"||a.status==="REPORTED"?(y.hidden=!1,y.className="compliance-note ok",y.textContent="\u7B7E\u9000\u65F6\u672A\u547D\u4E2D\u4EFB\u4F55\u5408\u89C4\u89C4\u5219\u3002"):(y.hidden=!1,y.className="compliance-note",y.textContent="\u5408\u89C4\u5224\u5B9A\u5728\u7B7E\u9000\u65F6\u6267\u884C\u3002"),Dt(a.status),E.textContent=`Planned ${we(a.plannedAt)} \xB7 MR ${a.mrName}`,a.checkin?Xe(V,"\u5DF2\u7B7E\u5230",a.checkin):(V.hidden=!0,V.textContent=""),a.checkout?(Xe(w,"\u5DF2\u7B7E\u9000",a.checkout),pe.textContent=mt(a.durationSeconds??0),ae.textContent="computed by the server"):(w.hidden=!0,w.textContent="",pe.textContent="\u5C1A\u672A\u4EA7\u751F",ae.textContent="derived at check-out"),c.disabled=!a.capabilities.canCheckIn,h.disabled=!a.capabilities.canCheckIn,o.disabled=!a.capabilities.canCheckOut,g.disabled=!a.capabilities.canCheckOut,v.disabled=!a.capabilities.canCheckIn||H,k.disabled=!a.capabilities.canCheckOut||H,St.disabled=!a.capabilities.canReport||H,qe.disabled=!a.capabilities.canCancel||H,Ke.disabled=!a.capabilities.canVoid||H,Ue.disabled=!a.capabilities.canDelete||H,oe.disabled=!(a.capabilities.canCancel||a.capabilities.canVoid)||H,a.capabilities.canCheckIn?O.textContent="Uses the server clock; coordinates are stored as entered.":a.checkin?O.textContent="\u5DF2\u8BB0\u5F55\u7B7E\u5230\u3002":O.textContent="\u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u7B7E\u5230\u3002",a.capabilities.canCheckOut?ne.textContent="Uses the server clock; duration is derived server-side.":a.checkout?ne.textContent="\u5DF2\u8BB0\u5F55\u7B7E\u9000\u3002":ne.textContent="\u7B7E\u5230\u540E\u53EF\u7528\u3002",a.capabilities.canReport?Te.textContent="Submitting files the report and marks the visit REPORTED.":a.status==="REPORTED"?Te.textContent="Report filed.":Te.textContent="\u7B7E\u9000\u540E\u53EF\u7528\u3002",a.capabilities.canCancel?J.textContent="\u53D6\u6D88\u9700\u8981\u586B\u5199\u539F\u56E0\uFF0C\u5E76\u8BA1\u5165\u53D6\u6D88\u7EDF\u8BA1\uFF1B\u5220\u9664\u53EA\u7528\u4E8E\u5F55\u5165\u9519\u8BEF\uFF0C\u4E14\u4EC5\u5728\u521B\u5EFA\u540E\u77ED\u65F6\u95F4\u5185\u53EF\u7528\u3002":a.capabilities.canVoid?J.textContent="\u4F5C\u5E9F\u4FDD\u7559\u7B7E\u5230\u8BC1\u636E\u5E76\u91CD\u8DD1\u4F4D\u7F6E\u89C4\u5219\uFF0C\u5F02\u5E38\u4E0D\u4F1A\u88AB\u62B9\u6389\u3002":a.status==="VOIDED"&&a.voidReason?J.textContent=`\u5DF2\u4F5C\u5E9F\uFF1A${a.voidReason}`:a.status==="CANCELLED"&&a.cancelReason?J.textContent=`\u5DF2\u53D6\u6D88\uFF1A${a.cancelReason}`:a.status==="DELETED"?J.textContent="\u5DF2\u5220\u9664\uFF1A\u6570\u636E\u4ECD\u5728\u5E93\u4E2D\uFF0C\u4F46\u4E0D\u8FDB\u4EFB\u4F55\u7EDF\u8BA1\u3002":J.textContent="\u5F53\u524D\u72B6\u6001\u6CA1\u6709\u53EF\u6267\u884C\u7684\u53D6\u6D88/\u4F5C\u5E9F/\u5220\u9664\u64CD\u4F5C\u3002"}return c.addEventListener("input",()=>{L&&G(c,h,R,L)}),h.addEventListener("input",()=>{L&&G(c,h,R,L)}),o.addEventListener("input",()=>{L&&G(o,g,z,L)}),g.addEventListener("input",()=>{L&&G(o,g,z,L)}),b.addEventListener("submit",a=>{if(a.preventDefault(),L===null||H||!L.capabilities.canCheckIn||!b.reportValidity())return;let f=gt(c,h);if(f===null){le.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),c.focus();return}le.clear(),t.onCheckIn(L.id,f)}),B.addEventListener("submit",a=>{if(a.preventDefault(),L===null||H||!L.capabilities.canCheckOut||!B.reportValidity())return;let f=gt(o,g);if(f===null){se.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),o.focus();return}se.clear(),t.onCheckOut(L.id,f)}),qe.addEventListener("click",()=>{if(L===null||H||!L.capabilities.canCancel)return;let a=oe.value.trim();if(a===""){X.showText("\u53D6\u6D88\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002"),oe.focus();return}X.clear(),t.onCancel(L.id,a)}),Ke.addEventListener("click",()=>{if(L===null||H||!L.capabilities.canVoid)return;let a=oe.value.trim();if(a===""){X.showText("\u4F5C\u5E9F\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002"),oe.focus();return}X.clear(),t.onVoid(L.id,a)}),Ue.addEventListener("click",()=>{L===null||H||!L.capabilities.canDelete||(X.clear(),t.onDelete(L.id))}),U.addEventListener("submit",a=>{if(a.preventDefault(),L===null||H||!L.capabilities.canReport||!U.reportValidity())return;let f=re.checked,x=[];if(f){if(_.length===0){j.showText("\u81F3\u5C11\u6DFB\u52A0\u4E00\u6761\u8D44\u6599\uFF0C\u6216\u53D6\u6D88\u52FE\u9009\u300C\u5DF2\u6D3E\u53D1\u8D44\u6599\u300D\u3002"),ke.focus();return}let $=_.map(S=>({name:S.name.trim(),kind:S.kind})),D=$.findIndex(S=>S.name==="");if(D>=0){j.showText(`Material ${D+1} needs a name, or remove that row.`),me.querySelectorAll('[data-testid="report-material-name"]').item(D)?.focus();return}x=$}j.clear(),t.onSubmitReport(L.id,{talkingPoints:F.value.trim(),hcpFeedback:ie.value.trim(),materialsDistributed:f,materials:x})}),{update(a){if(H=a.loading.mutation||a.loading.selected,L=a.selected,n.setAttribute("aria-busy",String(a.loading.selected)),je.show(a.errors.detail),a.errors.checkin!==Ye&&(Ye=a.errors.checkin,le.show(a.errors.checkin)),a.errors.checkout!==We&&(We=a.errors.checkout,se.show(a.errors.checkout)),a.errors.report!==ze&&(ze=a.errors.report,j.show(a.errors.report)),a.selected===null){ye=null,i.hidden=!1,d.hidden=!0,l.textContent=a.loading.selected?"Loading visit\u2026":a.errors.detail?"\u8BE5\u62DC\u8BBF\u52A0\u8F7D\u5931\u8D25\u3002":"\u4ECE\u5DE6\u4FA7\u5217\u8868\u9009\u62E9\u4E00\u6761\u62DC\u8BBF\uFF0C\u67E5\u770B\u8BE6\u60C5\u4E0E\u5408\u89C4\u8BC1\u636E\u3002";return}i.hidden=!0,d.hidden=!1,Vt(a.selected),a.selected.id!==ye&&(ye=a.selected.id,Ht(a.selected))}}}var Yt=`
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
`;function Wt(e){return e.toLowerCase().replaceAll("_","-")}function zt(e){return e.map(t=>`${t.id}:${t.status}:${t.abnormal}:${t.updatedAt}`).join("|")}function vt(e,t){e.innerHTML=Yt;let n=r(e,"[data-status-filter]"),i=r(e,"[data-product-filter]"),l=r(e,"[data-clear]"),d=r(e,"[data-empty-clear]"),u=I();r(e,"[data-list-banner]").append(u.element);let T=r(e,"[data-rows]"),C=r(e,"[data-table-wrap]"),p=r(e,"[data-empty]"),M=r(e,"[data-empty-title]"),y=r(e,"[data-count]"),N=r(e,".list-card"),E=null,b="";function c(o){return o.filters.status!==""||o.filters.productId!==""}function h(){t.onFiltersChange({status:"",productId:""}),n.focus()}l.addEventListener("click",h),d.addEventListener("click",h),n.addEventListener("change",()=>{let o=n.value;t.onFiltersChange({status:Ae(o)?o:"",productId:i.value})}),i.addEventListener("change",()=>{t.onFiltersChange({status:Ae(n.value)?n.value:"",productId:i.value})});function v(o){let g=i.value;i.replaceChildren(ee("","\u5168\u90E8\u836F\u54C1"));for(let k of o?.products??[])i.append(ee(k.id,k.name));[...i.options].some(k=>k.value===g)&&(i.value=g)}function V(o){t.onSelect(o)}function R(o){let g=s("tr","visit-row");g.dataset.visitId=o.id,g.dataset.testid="visit-row",g.tabIndex=0,g.addEventListener("click",()=>V(o.id)),g.addEventListener("keydown",F=>{(F.key==="Enter"||F.key===" ")&&(F.preventDefault(),V(o.id))});let k=s("td","planned-cell"),w=s("time");w.dateTime=o.plannedAt,w.append(s("span","planned-date",He(o.plannedAt)),s("span","planned-time",De(o.plannedAt))),k.append(w);let z=s("td");z.append(s("span","cell-primary",o.hcpName),s("span","cell-secondary",o.department));let ne=s("td",void 0,o.hospitalName),pe=s("td",void 0,o.productName),ae=s("td");ae.append(s("span",`pill pill-${Wt(o.status)}`,he(o.status)));let U=s("td");if(o.abnormal){let F=s("span","badge badge-abnormal","\u5F02\u5E38");F.title=o.flags.map(ie=>`${ie.code}: ${ie.detail}`).join(`
`),U.append(F)}else o.status==="CHECKED_OUT"||o.status==="REPORTED"?U.append(s("span","badge badge-ok","\u5408\u89C4")):U.append(s("span","cell-muted","\u2014"));return g.append(k,z,ne,pe,ae,U),g}function O(o){for(let g of T.querySelectorAll("tr[data-visit-id]")){let k=g.dataset.visitId===o.selected?.id;g.classList.toggle("is-selected",k),k?g.setAttribute("aria-current","true"):g.removeAttribute("aria-current")}}function B(o){let g=o.visits.length>0;C.hidden=!g,p.hidden=g;let k=c(o);if(l.hidden=!k,d.hidden=!k,g){M.textContent="";return}o.loading.visits?M.textContent="\u6B63\u5728\u52A0\u8F7D\u62DC\u8BBF\u2026":o.errors.list?M.textContent="\u62DC\u8BBF\u5217\u8868\u52A0\u8F7D\u5931\u8D25\u3002":k?M.textContent="\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u62DC\u8BBF\u3002":M.textContent="\u8FD8\u6CA1\u6709\u62DC\u8BBF\u8BB0\u5F55\u3002\u5148\u5728\u5DE6\u4FA7\u521B\u5EFA\u4E00\u4E2A\u8BA1\u5212\u3002"}return{update(o){o.catalog!==E&&(E=o.catalog,v(o.catalog)),n.value=o.filters.status,([...i.options].some(w=>w.value===o.filters.productId)||o.filters.productId==="")&&(i.value=o.filters.productId),N.setAttribute("aria-busy",String(o.loading.visits)),y.textContent=o.loading.visits?"Loading\u2026":`\u5171 ${o.visits.length} \u6761`,u.show(o.errors.list);let k=zt(o.visits);k!==b&&(b=k,T.replaceChildren(...o.visits.map(R))),O(o),B(o)}}}var Jt=`
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
`;function Ne(e,t,n){let i=e.value;e.replaceChildren(ee("",t));for(let l of n)e.append(ee(l.value,l.label));e.value=n.some(l=>l.value===i)?i:""}function Et(e,t){e.innerHTML=Jt;let n=r(e,"[data-plan-form]"),i=r(e,"#plan-mr"),l=r(e,"#plan-hcp"),d=r(e,"#plan-product"),u=r(e,"#plan-at"),T=r(e,'button[type="submit"]'),C=I();r(e,"[data-plan-banner]").append(C.element),u.value=Ie();let p=null,M;function y(){let c=p!==null&&p.catalog!==null&&!p.loading.mutation&&i.value!==""&&l.value!==""&&d.value!==""&&u.value!=="";T.disabled=!c}function N(c){Ne(i,c===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u4EE3\u8868\u2026",(c?.mrs??[]).map(v=>({value:v.id,label:`${v.name} \u2014 ${v.region}`}))),Ne(l,c===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u533B\u751F\u2026",(c?.hcps??[]).map(v=>({value:v.id,label:`${v.name} \u2014 ${v.hospitalName}`}))),Ne(d,c===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u836F\u54C1\u2026",(c?.products??[]).map(v=>({value:v.id,label:`${v.name} (${v.code})`})));let h=p===null?"":p.actor;i.disabled=c===null||h!=="",h!==""&&i.value!==h&&(i.value=h),l.disabled=c===null,d.disabled=c===null,y()}function E(){i.value="",l.value="",d.value="",u.value=Ie(),C.clear(),y()}function b(){let c=i.value,h=l.value,v=d.value;if(c===""||h===""||v===""||u.value==="")return null;let V=new Date(u.value);return Number.isNaN(V.getTime())?null:{mrId:c,hcpId:h,productId:v,plannedAt:ft(V)}}n.addEventListener("submit",c=>{if(c.preventDefault(),!n.reportValidity())return;let h=b();if(h===null){C.showText("\u8BF7\u9009\u62E9\u4EE3\u8868\u3001\u533B\u751F\u3001\u836F\u54C1\u4E0E\u8BA1\u5212\u65F6\u95F4\u3002");return}t.onCreate(h).then(v=>{v&&E()})});for(let c of[i,l,d,u])c.addEventListener("input",y),c.addEventListener("change",y);return{update(c){p=c,c.catalog!==M&&(M=c.catalog,N(c.catalog)),n.setAttribute("aria-busy",String(c.loading.catalog)),C.show(c.errors.plan??c.errors.catalog),y()},reset:E}}var m=ut(),Xt=r(document,"#plan-root"),Gt=r(document,"#list-root"),Qt=r(document,"#detail-root"),Zt=r(document,"#dashboard-root"),_e=r(document,"#refresh"),en=Et(Xt,{onCreate:mn}),tn=vt(Gt,{onSelect:ln,onFiltersChange:sn}),nn=ht(Qt,{onCheckIn:dn,onCheckOut:cn,onSubmitReport:un,onCancel:(e,t)=>ue("terminal",e,()=>lt(e,t)),onVoid:(e,t)=>ue("terminal",e,()=>st(e,t)),onDelete:e=>pn(e)}),an=bt(Zt,{onRefresh:()=>{te()}}),Re=0,Fe=0,Oe=0,Be=0,Lt=[{key:"11111111-1111-1111-1111-111111111111",label:"\u5F20\u4F1F",role:"\u533B\u836F\u4EE3\u8868",badge:"MR"},{key:"11111111-1111-1111-1111-111111111112",label:"\u674E\u5A1C",role:"\u533B\u836F\u4EE3\u8868",badge:"MR"},{key:"admin",label:"\u738B\u654F",role:"\u7CFB\u7EDF\u7BA1\u7406\u5458",badge:"AD"}],ce="admin",kt=r(document,"#identity-list"),rn=r(document,"#actor-note");function yt(){kt.replaceChildren();for(let t of Lt){let n=document.createElement("button");n.type="button",n.className="rail-button",t.key===ce&&n.classList.add("is-active"),n.dataset.actor=t.key,n.title=`${t.role} \xB7 ${t.label}`;let i=document.createElement("span");i.className="rail-badge",i.textContent=t.badge;let l=document.createElement("span");l.className="rail-name",l.textContent=t.label;let d=document.createElement("span");d.className="rail-role",d.textContent=t.role,n.append(i,l,d),n.addEventListener("click",()=>{on(t.key)}),kt.append(n)}let e=Lt.find(t=>t.key===ce);rn.textContent=e===void 0?"":`${e.role} \xB7 ${e.label}`}async function on(e){e!==ce&&(ce=e,Se(e),m.update(t=>({...t,actor:e==="admin"?"":e})),yt(),m.update(t=>({...t,selected:null})),await Promise.all([W(),te()]))}function Mt(e){en.update(e),tn.update(e),nn.update(e),an.update(e),_e.disabled=e.loading.mutation,_e.setAttribute("aria-busy",String(e.loading.catalog||e.loading.visits||e.loading.dashboard||e.loading.selected))}async function Ct(){let e=++Re;m.update(t=>({...t,loading:{...t.loading,catalog:!0},errors:{...t.errors,catalog:null}}));try{let t=await et();if(e!==Re)return;m.update(n=>({...n,catalog:t,loading:{...n.loading,catalog:!1}}))}catch(t){if(e!==Re)return;m.update(n=>({...n,loading:{...n.loading,catalog:!1},errors:{...n.errors,catalog:K(t)}}))}}async function W(){let e=++Fe,t=m.getState().filters;m.update(n=>({...n,loading:{...n.loading,visits:!0},errors:{...n.errors,list:null}}));try{let n=await tt(t);if(e!==Fe)return;m.update(i=>({...i,visits:n.visits,loading:{...i.loading,visits:!1}}))}catch(n){if(e!==Fe)return;m.update(i=>({...i,loading:{...i.loading,visits:!1},errors:{...i.errors,list:K(n)}}))}}async function te(){let e=++Be;m.update(t=>({...t,loading:{...t.loading,dashboard:!0},errors:{...t.errors,dashboard:null}}));try{let t=await ct();if(e!==Be)return;m.update(n=>({...n,dashboard:t,loading:{...n.loading,dashboard:!1}}))}catch(t){if(e!==Be)return;m.update(n=>({...n,loading:{...n.loading,dashboard:!1},errors:{...n.errors,dashboard:K(t)}}))}}async function Le(e,t){let n=++Oe;m.update(i=>({...i,selected:t?.id===e?t:i.selected?.id===e?i.selected:null,loading:{...i.loading,selected:!0},errors:{...i.errors,detail:null}}));try{let i=await nt(e);if(n!==Oe)return;m.update(l=>({...l,selected:i,loading:{...l.loading,selected:!1}}))}catch(i){if(n!==Oe)return;let l=K(i);m.update(d=>({...d,selected:l.code==="not_found"?null:d.selected,loading:{...d.loading,selected:!1},errors:{...d.errors,detail:l}}))}}function ln(e){let t=m.getState().visits.find(n=>n.id===e);m.update(n=>({...n,errors:{...n.errors,checkin:null,checkout:null,report:null}})),Le(e,t)}function sn(e){let t=m.getState().filters;t.status===e.status&&t.productId===e.productId||(m.update(n=>({...n,filters:e})),W())}function Ee(e,t,n){return{...e,[t]:n}}async function Tt(e){let t=[W(),te()];m.getState().selected?.id===e&&t.push(Le(e)),await Promise.all(t)}async function ue(e,t,n){if(!m.getState().loading.mutation){m.update(i=>({...i,loading:{...i.loading,mutation:!0},errors:Ee(i.errors,e,null)}));try{await n()}catch(i){let l=K(i);m.update(d=>({...d,errors:Ee(d.errors,e,l)})),(l.code==="invalid_state"||l.code==="conflict"||l.code==="not_found")&&await Tt(t),m.update(d=>({...d,loading:{...d.loading,mutation:!1}}));return}await Tt(t),m.update(i=>({...i,loading:{...i.loading,mutation:!1}}))}}function dn(e,t){return ue("checkin",e,()=>it(e,t))}function cn(e,t){return ue("checkout",e,()=>rt(e,t))}function un(e,t){return ue("report",e,()=>ot(e,t))}async function pn(e){if(!m.getState().loading.mutation){m.update(t=>({...t,loading:{...t.loading,mutation:!0},errors:Ee(t.errors,"terminal",null)}));try{await dt(e)}catch(t){let n=K(t);m.update(i=>({...i,errors:Ee(i.errors,"terminal",n),loading:{...i.loading,mutation:!1}}));return}m.update(t=>({...t,selected:null})),await Promise.all([W(),te()]),m.update(t=>({...t,loading:{...t.loading,mutation:!1}}))}}async function mn(e){if(m.getState().loading.mutation)return!1;m.update(n=>({...n,loading:{...n.loading,mutation:!0},errors:{...n.errors,plan:null}}));let t;try{t=await at(e)}catch(n){return m.update(i=>({...i,loading:{...i.loading,mutation:!1},errors:{...i.errors,plan:K(n)}})),!1}return await W(),await Le(t.id),m.update(n=>({...n,loading:{...n.loading,mutation:!1}})),!0}async function fn(){if(m.getState().loading.mutation)return;let e=[Ct(),W(),te()],t=m.getState().selected?.id;t!==void 0&&e.push(Le(t)),await Promise.all(e)}_e.addEventListener("click",()=>{fn()});m.update(e=>({...e,loading:{...e.loading,catalog:!0,visits:!0,dashboard:!0}}));m.subscribe(Mt);Mt(m.getState());yt();Se(ce);Promise.all([Ct(),W(),te()]);})();

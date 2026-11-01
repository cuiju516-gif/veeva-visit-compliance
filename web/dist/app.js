"use strict";(()=>{var Y=class extends Error{status;code;details;constructor(e,n,i,l){super(i),this.name="ApiError",this.status=e,this.code=n,this.details=l}get field(){return this.details?.field}};function K(t){return t instanceof Y?t:t instanceof Error?new Y(0,"internal_error",t.message):new Y(0,"internal_error","An unexpected error occurred.")}function xt(t){return typeof t=="object"&&t!==null}function Ie(t){if(!xt(t)||!xt(t.error))return null;let e=t.error;if(typeof e.code!="string"||typeof e.message!="string")return null;let n;if(xt(e.details)){n={};for(let[i,l]of Object.entries(e.details))typeof l=="string"&&(n[i]=l)}return{code:e.code,message:e.message,details:n}}var Zt="admin";function St(t){Zt=t}async function Q(t,e){let n,i={...e,headers:{...e?.headers??{},"X-Actor":Zt}};try{n=await fetch(t,i)}catch(u){let L=u instanceof Error?u.message:"Network request failed.";throw new Y(0,"network_error",L)}let l=await n.text(),d=null;if(l.length>0)try{d=JSON.parse(l)}catch{d=null}if(!n.ok){let u=Ie(d);throw new Y(n.status,u?.code??"internal_error",u?.message??`Request failed with HTTP ${n.status}.`,u?.details)}return d}function Z(t,e,n){return Q(t,{method:e,headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}function te(){return Q("/api/catalog")}function ee(t){let e=new URLSearchParams;return t.status&&e.set("status",t.status),t.productId&&e.set("productId",t.productId),e.set("limit","200"),Q(`/api/visits?${e.toString()}`)}function ne(t){return Q(`/api/visits/${encodeURIComponent(t)}`)}function ae(t){return Z("/api/visits","POST",t)}function ie(t,e){return Z(`/api/visits/${encodeURIComponent(t)}/checkin`,"POST",e)}function re(t,e){return Z(`/api/visits/${encodeURIComponent(t)}/checkout`,"POST",e)}function oe(t,e){return Z(`/api/visits/${encodeURIComponent(t)}/report`,"PUT",e)}function le(t,e){return Z(`/api/visits/${encodeURIComponent(t)}/cancel`,"POST",{reason:e})}function se(t,e){return Z(`/api/visits/${encodeURIComponent(t)}/void`,"POST",{reason:e})}function de(t){return Q(`/api/visits/${encodeURIComponent(t)}`,{method:"DELETE"})}function ce(t=6){return Q(`/api/dashboard/monthly?months=${t}`)}function r(t,e){let n=t.querySelector(e);if(n===null)throw new Error(`Missing required element: ${e}`);return n}function s(t,e,n){let i=document.createElement(t);return e&&(i.className=e),n!==void 0&&(i.textContent=n),i}function tt(t,e){let n=document.createElement("option");return n.value=t,n.textContent=e,n}function Ae(){return{catalog:null,actor:"",visits:[],selected:null,dashboard:null,filters:{status:"",productId:""},loading:{catalog:!1,visits:!1,selected:!1,dashboard:!1,mutation:!1},errors:{catalog:null,list:null,detail:null,dashboard:null,plan:null,checkin:null,checkout:null,report:null,terminal:null}}}function ue(){let t=Ae(),e=new Set;return{getState:()=>t,update:n=>{t=n(t);for(let i of e)i(t)},subscribe:n=>(e.add(n),()=>e.delete(n))}}var $e=["1\u6708","2\u6708","3\u6708","4\u6708","5\u6708","6\u6708","7\u6708","8\u6708","9\u6708","10\u6708","11\u6708","12\u6708"],gt=t=>String(t).padStart(2,"0"),Pe={PLANNED:"\u5DF2\u8BA1\u5212",CHECKED_IN:"\u5DF2\u7B7E\u5230",CHECKED_OUT:"\u5DF2\u7B7E\u9000",REPORTED:"\u5DF2\u5B8C\u6210",CANCELLED:"\u5DF2\u53D6\u6D88",VOIDED:"Voided",DELETED:"\u5DF2\u5220\u9664"};function ht(t){return Pe[t]}function wt(t){let e=new Date(t);return Number.isNaN(e.getTime())?"\u2014":`${Ht(t)} ${Dt(t)}`}function Ht(t){let e=new Date(t);return Number.isNaN(e.getTime())?"\u2014":`${e.getFullYear()}-${gt(e.getMonth()+1)}-${gt(e.getDate())}`}function Dt(t){let e=new Date(t);return Number.isNaN(e.getTime())?"\u2014":`${gt(e.getHours())}:${gt(e.getMinutes())}`}function pe(t){let e=/^(\d{4})-(\d{2})$/.exec(t);if(!e)return t;let n=Number(e[1]),i=Number(e[2])-1;return!Number.isInteger(n)||i<0||i>11?t:`${$e[i]} ${n}`}function me(t){if(!Number.isFinite(t))return"\u2014";let e=Math.max(0,Math.floor(t)),n=Math.floor(e/3600),i=Math.floor(e%3600/60),l=e%60;return n>0?`${n} \u5C0F\u65F6 ${i} \u5206 ${l} \u79D2`:i>0?`${i} \u5206 ${l} \u79D2`:`${l} \u79D2`}function vt(t){if(!Number.isFinite(t)||t<=0)return"0%";let e=t*100,n=Math.round(e*10)/10;return n<1?"<1%":n>=100?"100%":Number.isInteger(n)?`${n}%`:`${n.toFixed(1)}%`}function Vt(t){return Number.isFinite(t)?`${Math.round(Math.max(0,t))} m`:"\u2014"}function It(t){return Number.isFinite(t)?t.toFixed(6):"\u2014"}function A(t){return String(t).padStart(2,"0")}function Ne(t){return`${t.getFullYear()}-${A(t.getMonth()+1)}-${A(t.getDate())}T${A(t.getHours())}:${A(t.getMinutes())}`}function At(t=new Date){let e=new Date(t.getFullYear(),t.getMonth(),t.getDate()+1,10,0,0,0);return Ne(e)}function fe(t){let e=-t.getTimezoneOffset(),n=e>=0?"+":"-",i=Math.abs(e);return`${t.getFullYear()}-${A(t.getMonth()+1)}-${A(t.getDate())}T${A(t.getHours())}:${A(t.getMinutes())}:${A(t.getSeconds())}${n}${A(Math.floor(i/60))}:${A(i%60)}`}function $t(t){return t==="PLANNED"||t==="CHECKED_IN"||t==="CHECKED_OUT"||t==="REPORTED"||t==="CANCELLED"||t==="VOIDED"||t==="DELETED"}function I(){let t=document.createElement("div");t.className="error-banner",t.dataset.testid="error-banner",t.setAttribute("role","alert"),t.hidden=!0;let e=document.createElement("code");e.className="error-code";let n=document.createElement("span");n.className="error-field";let i=document.createElement("span");i.className="error-message",t.append(e,n,i);let l=null;function d(u,L,M,p){if(u!==l){if(l=u,u===null){t.hidden=!0,e.textContent="",n.textContent="",i.textContent="";return}t.hidden=!1,e.hidden=L==="",e.textContent=L,n.hidden=M==="",n.textContent=M,i.textContent=p}}return{element:t,show:u=>{if(u===null){d(null,"","","");return}let L=u.field?`field: ${u.field}`:"";d(`api:${u.code}:${L}:${u.message}`,u.code,L,u.message)},showText:u=>{d(`text:${u}`,"","",u)},clear:()=>d(null,"","","")}}var Re=`
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
`;function Fe(t){let e=new Map;for(let v of t.rows){let g=e.get(v.productId);g===void 0&&(g={productId:v.productId,productName:v.productName,byMonth:new Map},e.set(v.productId,g)),g.byMonth.set(v.month,v)}let n=[...e.values()].sort((v,g)=>v.productName.localeCompare(g.productName)),i=s("div","table-wrap"),l=s("table","dashboard-table");l.dataset.testid="dashboard-table";let d=s("thead"),u=s("tr"),L=s("th",void 0,"\u836F\u54C1");L.scope="col",u.append(L);for(let v of t.months){let g=s("th",void 0,pe(v));g.scope="col",g.title=v,u.append(g)}d.append(u);let M=new Map;for(let v of t.months)M.set(v,{visits:0,abnormal:0});let p=s("tbody");for(let v of n){let g=s("tr"),c=s("th","row-heading",v.productName);c.scope="row",g.append(c);for(let b of t.months){let T=v.byMonth.get(b),w=T?.visits??0,N=T?.abnormal??0,O=T?.abnormalShare??0,B=M.get(b);B&&(B.visits+=w,B.abnormal+=N);let o=s("td","dashboard-cell",`${w} (${vt(O)})`);O>0&&o.classList.add("has-abnormal"),o.title=`${b}\uFF1A${w} \u6B21\u62DC\u8BBF\uFF0C\u5176\u4E2D\u5F02\u5E38 ${N} \u6B21`,o.dataset.month=b,o.dataset.visits=String(w),o.dataset.abnormal=String(N),g.append(o)}p.append(g)}let y=s("tfoot"),k=s("tr","total-row"),P=s("th",void 0,"\u5408\u8BA1");P.scope="row",k.append(P);for(let v of t.months){let g=M.get(v)??{visits:0,abnormal:0},c=g.visits>0?g.abnormal/g.visits:0,b=s("td","dashboard-cell",`${g.visits} (${vt(c)})`);c>0&&b.classList.add("has-abnormal"),b.title=`${v}\uFF1A${g.visits} \u6B21\u62DC\u8BBF\uFF0C\u5176\u4E2D\u5F02\u5E38 ${g.abnormal} \u6B21`,k.append(b)}return y.append(k),l.append(d,p,y),i.append(l),i}function be(t,e){t.innerHTML=Re;let n=r(t,".dashboard-card"),i=r(t,"[data-dashboard-content]"),l=r(t,"[data-dashboard-refresh]"),d=I();r(t,"[data-dashboard-banner]").append(d.element);let u=null;l.addEventListener("click",()=>e.onRefresh());function L(p){let y=s("div","empty-state");y.append(s("p",void 0,p)),i.replaceChildren(y)}function M(p){if(p.rows.length===0){L("No check-ins recorded in the last 6 months.");return}let y=p.totalVisits>0?p.totalAbnormal/p.totalVisits:0,k=s("p","totals-line");k.append(document.createTextNode(`\u8FD1 ${p.months.length} \u4E2A\u6708 \xB7 \u5171 ${p.totalVisits} \u6B21\u62DC\u8BBF \xB7 \u5176\u4E2D\u5F02\u5E38 ${p.totalAbnormal} \u6B21 \xB7 \u6574\u4F53\u5F02\u5E38\u7387 `),s("strong",void 0,vt(y)),document.createTextNode(".")),i.replaceChildren(Fe(p),k)}return{update(p){if(n.setAttribute("aria-busy",String(p.loading.dashboard)),l.disabled=p.loading.dashboard,d.show(p.errors.dashboard),p.dashboard===null){p.loading.dashboard?L("Loading monthly dashboard\u2026"):p.errors.dashboard?L("\u770B\u677F\u6570\u636E\u52A0\u8F7D\u5931\u8D25\u3002"):L("\u6682\u65E0\u770B\u677F\u6570\u636E\u3002"),u=null;return}p.dashboard!==u&&(u=p.dashboard,M(p.dashboard))}}}var Oe=63710088e-1,dt=500;function Pt(t,e){if(![t.lat,t.lng,e.lat,e.lng].every(y=>Number.isFinite(y)))return Number.NaN;let i=t.lat*Math.PI/180,l=e.lat*Math.PI/180,d=(e.lat-t.lat)*Math.PI/180,u=(e.lng-t.lng)*Math.PI/180,L=Math.sin(d/2),M=Math.sin(u/2),p=L*L+Math.cos(i)*Math.cos(l)*M*M;return p>1&&(p=1),2*Oe*Math.asin(Math.sqrt(p))}var Be=[{value:"slide",label:"Slide"},{value:"reprint",label:"\u91CD\u5370\u4EF6"},{value:"document",label:"\u6587\u732E"},{value:"other",label:"Other"}],_e=["\u8BA1\u5212","\u7B7E\u5230","\u5B66\u672F\u6C9F\u901A","\u7B7E\u9000","\u53CD\u9988\u8BB0\u5F55"],qe={PLANNED:["done","current","pending","pending","pending"],CHECKED_IN:["done","done","current","pending","pending"],CHECKED_OUT:["done","done","done","done","current"],REPORTED:["done","done","done","done","done"],CANCELLED:["done","pending","pending","pending","pending"],VOIDED:["done","done","pending","pending","pending"],DELETED:["done","pending","pending","pending","pending"]},Ke=`
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
`;function Ue(t){return t==="slide"||t==="reprint"||t==="document"||t==="other"}function ge(t,e){let n=Number.parseFloat(t.value),i=Number.parseFloat(e.value);return!Number.isFinite(n)||!Number.isFinite(i)||n<-90||n>90||i<-180||i>180?null:{lat:n,lng:i}}function je(t,e,n){if(t.value.trim()===""||e.value.trim()==="")return"\u586B\u5165\u7ECF\u7EAC\u5EA6\u540E\u663E\u793A\u4E0E\u533B\u9662\u57FA\u51C6\u70B9\u7684\u8DDD\u79BB\u3002";let i=Number.parseFloat(t.value),l=Number.parseFloat(e.value);if(!Number.isFinite(i)||!Number.isFinite(l))return"\u586B\u5165\u5408\u6CD5\u6570\u5B57\u540E\u663E\u793A\u8DDD\u79BB\u3002";if(!Number.isFinite(n.baseLat)||!Number.isFinite(n.baseLng))return"\u533B\u9662\u57FA\u51C6\u5750\u6807\u4E0D\u53EF\u7528\u3002";let d=Pt({lat:i,lng:l},{lat:n.baseLat,lng:n.baseLng});return d>dt?`Distance from hospital base: ${Vt(d)} \u2014 outside the ${dt} m limit.`:`Distance from hospital base: ${Vt(d)} \u2014 within the ${dt} m limit.`}function he(t,e){t.innerHTML=Ke;let n=r(t,".detail-card"),i=r(t,"[data-detail-empty]"),l=r(t,"[data-detail-empty-text]"),d=r(t,"[data-detail-body]"),u=r(t,"[data-detail-hcp]"),L=r(t,"[data-detail-subtitle]"),M=r(t,"[data-status-pill]"),p=r(t,"[data-abnormal]"),y=r(t,"[data-flag-list]"),k=r(t,"[data-compliance-note]"),P=r(t,"[data-timeline]"),v=r(t,"[data-meta]"),g=r(t,"[data-checkin-form]"),c=r(t,"#checkin-lat"),b=r(t,"#checkin-lng"),T=r(t,'[data-testid="checkin-submit"]'),w=r(t,"[data-checkin-record]"),N=r(t,"[data-checkin-distance]"),O=r(t,"[data-checkin-hint]"),B=r(t,"[data-checkout-form]"),o=r(t,"#checkout-lat"),h=r(t,"#checkout-lng"),C=r(t,'[data-testid="checkout-submit"]'),R=r(t,"[data-checkout-record]"),z=r(t,"[data-checkout-distance]"),nt=r(t,"[data-checkout-hint]"),pt=r(t,"[data-duration-value]"),at=r(t,"[data-duration-note]"),U=r(t,"[data-report-form]"),F=r(t,'[data-testid="report-talking-points"]'),it=r(t,'[data-testid="report-feedback"]'),rt=r(t,"[data-materials-distributed]"),xe=r(t,"[data-materials-block]"),mt=r(t,"[data-material-rows]"),kt=r(t,"[data-material-add]"),Se=r(t,'[data-testid="report-submit"]'),Tt=r(t,"[data-report-hint]"),ot=r(t,'[data-testid="terminal-reason"]'),qt=r(t,"[data-cancel-submit]"),Kt=r(t,"[data-void-submit]"),Ut=r(t,"[data-delete-submit]"),J=r(t,"[data-terminal-hint]"),jt=I();r(t,"[data-detail-banner]").append(jt.element);let lt=I();r(t,"[data-checkin-banner]").append(lt.element);let st=I();r(t,"[data-checkout-banner]").append(st.element);let X=I();r(t,"[data-terminal-banner]").append(X.element);let j=I();r(t,"[data-report-banner]").append(j.element);let E=null,yt=null,H=!1,Yt=null,Wt=null,zt=null,_=[],Mt=0;function G(a,f,x,V){let D=je(a,f,V);x.textContent=D;let S=Pt({lat:Number.parseFloat(a.value),lng:Number.parseFloat(f.value)},{lat:V.baseLat,lng:V.baseLng});x.classList.toggle("warn",Number.isFinite(S)&&S>dt)}function ft(){mt.replaceChildren(),_.forEach((a,f)=>{let x=s("div","material-row");Mt+=1;let V=`material-name-${Mt}`,D=`material-kind-${Mt}`,S=s("label","sr-only",`Material ${f+1} name`);S.htmlFor=V;let $=s("input");$.id=V,$.type="text",$.value=a.name,$.placeholder="Name",$.dataset.testid="report-material-name",$.addEventListener("input",()=>{a.name=$.value});let Gt=s("label","sr-only",`Material ${f+1} kind`);Gt.htmlFor=D;let q=s("select");q.id=D,q.dataset.testid="report-material-kind";for(let Qt of Be){let Ct=document.createElement("option");Ct.value=Qt.value,Ct.textContent=Qt.label,q.append(Ct)}q.value=a.kind,q.addEventListener("change",()=>{a.kind=Ue(q.value)?q.value:"document"});let bt=s("button","btn btn-small","Remove");bt.type="button",bt.setAttribute("aria-label",`Remove material ${f+1}`),bt.addEventListener("click",()=>{_.splice(f,1),ft(),kt.focus()}),x.append(S,$,Gt,q,bt),mt.append(x)})}function we(){j.clear(),_.push({name:"",kind:"document"}),ft();let a=mt.querySelectorAll('[data-testid="report-material-name"]'),f=a.item(a.length-1);f&&f.focus()}function Jt(){xe.hidden=!rt.checked,rt.checked&&_.length===0&&(_.push({name:"",kind:"document"}),ft())}rt.addEventListener("change",Jt),kt.addEventListener("click",we);function He(a){c.value=String(a.checkin?.lat??a.baseLat),b.value=String(a.checkin?.lng??a.baseLng),o.value=String(a.checkout?.lat??a.baseLat),h.value=String(a.checkout?.lng??a.baseLng),G(c,b,N,a),G(o,h,z,a),F.value=a.talkingPoints,it.value=a.hcpFeedback,rt.checked=a.materialsDistributed,_=a.materials.map(f=>({name:f.name,kind:f.kind})),ft(),Jt(),lt.clear(),st.clear(),j.clear()}function De(a){P.replaceChildren();let f=qe[a];_e.forEach((x,V)=>{let D=f[V]??"pending",S=s("li",`timeline-step is-${D}`);S.append(s("span","timeline-index",String(V+1))),S.append(s("span","timeline-label",x));let $=D==="done"?"completed":D==="current"?"current":"pending";S.append(s("span","sr-only",`: ${$}`)),D==="current"&&S.setAttribute("aria-current","step"),P.append(S)})}function Xt(a,f,x){a.hidden=!1,a.textContent=`${f} ${wt(x.at)} at ${It(x.lat)}, ${It(x.lng)}.`}function Ve(a){if(u.textContent=a.hcpName,L.textContent=`${a.productName} \xB7 ${a.hospitalName} \xB7 ${a.department}`,M.className=`pill pill-${a.status.toLowerCase().replaceAll("_","-")}`,M.textContent=ht(a.status),p.hidden=!a.abnormal,y.replaceChildren(),a.abnormal)if(a.flags.length===0){let f=s("li","flag-item");f.append(s("span","flag-detail","\u670D\u52A1\u7AEF\u628A\u8FD9\u6B21\u62DC\u8BBF\u6807\u8BB0\u4E3A\u5F02\u5E38\u3002")),y.append(f)}else for(let f of a.flags){let x=s("li","flag-item");x.append(s("code","flag-code",f.code)),x.append(s("span","flag-detail",f.detail)),y.append(x)}a.abnormal?(k.hidden=!0,k.textContent="",k.className="compliance-note"):a.status==="CHECKED_OUT"||a.status==="REPORTED"?(k.hidden=!1,k.className="compliance-note ok",k.textContent="\u7B7E\u9000\u65F6\u672A\u547D\u4E2D\u4EFB\u4F55\u5408\u89C4\u89C4\u5219\u3002"):(k.hidden=!1,k.className="compliance-note",k.textContent="\u5408\u89C4\u5224\u5B9A\u5728\u7B7E\u9000\u65F6\u6267\u884C\u3002"),De(a.status),v.textContent=`Planned ${wt(a.plannedAt)} \xB7 MR ${a.mrName}`,a.checkin?Xt(w,"\u5DF2\u7B7E\u5230",a.checkin):(w.hidden=!0,w.textContent=""),a.checkout?(Xt(R,"\u5DF2\u7B7E\u9000",a.checkout),pt.textContent=me(a.durationSeconds??0),at.textContent="computed by the server"):(R.hidden=!0,R.textContent="",pt.textContent="\u5C1A\u672A\u4EA7\u751F",at.textContent="derived at check-out"),c.disabled=!a.capabilities.canCheckIn,b.disabled=!a.capabilities.canCheckIn,o.disabled=!a.capabilities.canCheckOut,h.disabled=!a.capabilities.canCheckOut,T.disabled=!a.capabilities.canCheckIn||H,C.disabled=!a.capabilities.canCheckOut||H,Se.disabled=!a.capabilities.canReport||H,qt.disabled=!a.capabilities.canCancel||H,Kt.disabled=!a.capabilities.canVoid||H,Ut.disabled=!a.capabilities.canDelete||H,ot.disabled=!(a.capabilities.canCancel||a.capabilities.canVoid)||H,a.capabilities.canCheckIn?O.textContent="Uses the server clock; coordinates are stored as entered.":a.checkin?O.textContent="\u5DF2\u8BB0\u5F55\u7B7E\u5230\u3002":O.textContent="\u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u7B7E\u5230\u3002",a.capabilities.canCheckOut?nt.textContent="Uses the server clock; duration is derived server-side.":a.checkout?nt.textContent="\u5DF2\u8BB0\u5F55\u7B7E\u9000\u3002":nt.textContent="\u7B7E\u5230\u540E\u53EF\u7528\u3002",a.capabilities.canReport?Tt.textContent="Submitting files the report and marks the visit REPORTED.":a.status==="REPORTED"?Tt.textContent="Report filed.":Tt.textContent="\u7B7E\u9000\u540E\u53EF\u7528\u3002",a.capabilities.canCancel?J.textContent="\u53D6\u6D88\u9700\u8981\u586B\u5199\u539F\u56E0\uFF0C\u5E76\u8BA1\u5165\u53D6\u6D88\u7EDF\u8BA1\uFF1B\u5220\u9664\u53EA\u7528\u4E8E\u5F55\u5165\u9519\u8BEF\uFF0C\u4E14\u4EC5\u5728\u521B\u5EFA\u540E\u77ED\u65F6\u95F4\u5185\u53EF\u7528\u3002":a.capabilities.canVoid?J.textContent="\u4F5C\u5E9F\u4FDD\u7559\u7B7E\u5230\u8BC1\u636E\u5E76\u91CD\u8DD1\u4F4D\u7F6E\u89C4\u5219\uFF0C\u5F02\u5E38\u4E0D\u4F1A\u88AB\u62B9\u6389\u3002":a.status==="VOIDED"&&a.voidReason?J.textContent=`\u5DF2\u4F5C\u5E9F\uFF1A${a.voidReason}`:a.status==="CANCELLED"&&a.cancelReason?J.textContent=`\u5DF2\u53D6\u6D88\uFF1A${a.cancelReason}`:a.status==="DELETED"?J.textContent="\u5DF2\u5220\u9664\uFF1A\u6570\u636E\u4ECD\u5728\u5E93\u4E2D\uFF0C\u4F46\u4E0D\u8FDB\u4EFB\u4F55\u7EDF\u8BA1\u3002":J.textContent="\u5F53\u524D\u72B6\u6001\u6CA1\u6709\u53EF\u6267\u884C\u7684\u53D6\u6D88/\u4F5C\u5E9F/\u5220\u9664\u64CD\u4F5C\u3002"}return c.addEventListener("input",()=>{E&&G(c,b,N,E)}),b.addEventListener("input",()=>{E&&G(c,b,N,E)}),o.addEventListener("input",()=>{E&&G(o,h,z,E)}),h.addEventListener("input",()=>{E&&G(o,h,z,E)}),g.addEventListener("submit",a=>{if(a.preventDefault(),E===null||H||!E.capabilities.canCheckIn||!g.reportValidity())return;let f=ge(c,b);if(f===null){lt.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),c.focus();return}lt.clear(),e.onCheckIn(E.id,f)}),B.addEventListener("submit",a=>{if(a.preventDefault(),E===null||H||!E.capabilities.canCheckOut||!B.reportValidity())return;let f=ge(o,h);if(f===null){st.showText("Enter a latitude between -90 and 90 and a longitude between -180 and 180."),o.focus();return}st.clear(),e.onCheckOut(E.id,f)}),qt.addEventListener("click",()=>{if(E===null||H||!E.capabilities.canCancel)return;let a=ot.value.trim();if(a===""){X.showText("\u53D6\u6D88\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002"),ot.focus();return}X.clear(),e.onCancel(E.id,a)}),Kt.addEventListener("click",()=>{if(E===null||H||!E.capabilities.canVoid)return;let a=ot.value.trim();if(a===""){X.showText("\u4F5C\u5E9F\u5FC5\u987B\u586B\u5199\u539F\u56E0\u3002"),ot.focus();return}X.clear(),e.onVoid(E.id,a)}),Ut.addEventListener("click",()=>{E===null||H||!E.capabilities.canDelete||(X.clear(),e.onDelete(E.id))}),U.addEventListener("submit",a=>{if(a.preventDefault(),E===null||H||!E.capabilities.canReport||!U.reportValidity())return;let f=rt.checked,x=[];if(f){if(_.length===0){j.showText("\u81F3\u5C11\u6DFB\u52A0\u4E00\u6761\u8D44\u6599\uFF0C\u6216\u53D6\u6D88\u52FE\u9009\u300C\u5DF2\u6D3E\u53D1\u8D44\u6599\u300D\u3002"),kt.focus();return}let V=_.map(S=>({name:S.name.trim(),kind:S.kind})),D=V.findIndex(S=>S.name==="");if(D>=0){j.showText(`Material ${D+1} needs a name, or remove that row.`),mt.querySelectorAll('[data-testid="report-material-name"]').item(D)?.focus();return}x=V}j.clear(),e.onSubmitReport(E.id,{talkingPoints:F.value.trim(),hcpFeedback:it.value.trim(),materialsDistributed:f,materials:x})}),{update(a){if(H=a.loading.mutation||a.loading.selected,E=a.selected,n.setAttribute("aria-busy",String(a.loading.selected)),jt.show(a.errors.detail),a.errors.checkin!==Yt&&(Yt=a.errors.checkin,lt.show(a.errors.checkin)),a.errors.checkout!==Wt&&(Wt=a.errors.checkout,st.show(a.errors.checkout)),a.errors.report!==zt&&(zt=a.errors.report,j.show(a.errors.report)),a.selected===null){yt=null,i.hidden=!1,d.hidden=!0,l.textContent=a.loading.selected?"Loading visit\u2026":a.errors.detail?"\u8BE5\u62DC\u8BBF\u52A0\u8F7D\u5931\u8D25\u3002":"\u4ECE\u5DE6\u4FA7\u5217\u8868\u9009\u62E9\u4E00\u6761\u62DC\u8BBF\uFF0C\u67E5\u770B\u8BE6\u60C5\u4E0E\u5408\u89C4\u8BC1\u636E\u3002";return}i.hidden=!0,d.hidden=!1,Ve(a.selected),a.selected.id!==yt&&(yt=a.selected.id,He(a.selected))}}}var Ye=`
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
`;function We(t){return t.toLowerCase().replaceAll("_","-")}function ze(t){return t.map(e=>`${e.id}:${e.status}:${e.abnormal}:${e.updatedAt}`).join("|")}function ve(t,e){t.innerHTML=Ye;let n=r(t,"[data-status-filter]"),i=r(t,"[data-product-filter]"),l=r(t,"[data-clear]"),d=r(t,"[data-empty-clear]"),u=I();r(t,"[data-list-banner]").append(u.element);let L=r(t,"[data-rows]"),M=r(t,"[data-table-wrap]"),p=r(t,"[data-empty]"),y=r(t,"[data-empty-title]"),k=r(t,"[data-count]"),P=r(t,".list-card"),v=null,g="";function c(o){return o.filters.status!==""||o.filters.productId!==""}function b(){e.onFiltersChange({status:"",productId:""}),n.focus()}l.addEventListener("click",b),d.addEventListener("click",b),n.addEventListener("change",()=>{let o=n.value;e.onFiltersChange({status:$t(o)?o:"",productId:i.value})}),i.addEventListener("change",()=>{e.onFiltersChange({status:$t(n.value)?n.value:"",productId:i.value})});function T(o){let h=i.value;i.replaceChildren(tt("","\u5168\u90E8\u836F\u54C1"));for(let C of o?.products??[])i.append(tt(C.id,C.name));[...i.options].some(C=>C.value===h)&&(i.value=h)}function w(o){e.onSelect(o)}function N(o){let h=s("tr","visit-row");h.dataset.visitId=o.id,h.dataset.testid="visit-row",h.tabIndex=0,h.addEventListener("click",()=>w(o.id)),h.addEventListener("keydown",F=>{(F.key==="Enter"||F.key===" ")&&(F.preventDefault(),w(o.id))});let C=s("td","planned-cell"),R=s("time");R.dateTime=o.plannedAt,R.append(s("span","planned-date",Ht(o.plannedAt)),s("span","planned-time",Dt(o.plannedAt))),C.append(R);let z=s("td");z.append(s("span","cell-primary",o.hcpName),s("span","cell-secondary",o.department));let nt=s("td",void 0,o.hospitalName),pt=s("td",void 0,o.productName),at=s("td");at.append(s("span",`pill pill-${We(o.status)}`,ht(o.status)));let U=s("td");if(o.abnormal){let F=s("span","badge badge-abnormal","\u5F02\u5E38");F.title=o.flags.map(it=>`${it.code}: ${it.detail}`).join(`
`),U.append(F)}else o.status==="CHECKED_OUT"||o.status==="REPORTED"?U.append(s("span","badge badge-ok","\u5408\u89C4")):U.append(s("span","cell-muted","\u2014"));return h.append(C,z,nt,pt,at,U),h}function O(o){for(let h of L.querySelectorAll("tr[data-visit-id]")){let C=h.dataset.visitId===o.selected?.id;h.classList.toggle("is-selected",C),C?h.setAttribute("aria-current","true"):h.removeAttribute("aria-current")}}function B(o){let h=o.visits.length>0;M.hidden=!h,p.hidden=h;let C=c(o);if(l.hidden=!C,d.hidden=!C,h){y.textContent="";return}o.loading.visits?y.textContent="\u6B63\u5728\u52A0\u8F7D\u62DC\u8BBF\u2026":o.errors.list?y.textContent="\u62DC\u8BBF\u5217\u8868\u52A0\u8F7D\u5931\u8D25\u3002":C?y.textContent="\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u62DC\u8BBF\u3002":y.textContent="\u8FD8\u6CA1\u6709\u62DC\u8BBF\u8BB0\u5F55\u3002\u5148\u5728\u5DE6\u4FA7\u521B\u5EFA\u4E00\u4E2A\u8BA1\u5212\u3002"}return{update(o){o.catalog!==v&&(v=o.catalog,T(o.catalog)),n.value=o.filters.status,([...i.options].some(R=>R.value===o.filters.productId)||o.filters.productId==="")&&(i.value=o.filters.productId),P.setAttribute("aria-busy",String(o.loading.visits)),k.textContent=o.loading.visits?"Loading\u2026":`\u5171 ${o.visits.length} \u6761`,u.show(o.errors.list);let C=ze(o.visits);C!==g&&(g=C,L.replaceChildren(...o.visits.map(N))),O(o),B(o)}}}var Je=`
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
`;function Nt(t,e,n){let i=t.value;t.replaceChildren(tt("",e));for(let l of n)t.append(tt(l.value,l.label));t.value=n.some(l=>l.value===i)?i:""}function Ee(t,e){t.innerHTML=Je;let n=r(t,"[data-plan-form]"),i=r(t,"#plan-mr"),l=r(t,"#plan-hcp"),d=r(t,"#plan-product"),u=r(t,"#plan-at"),L=r(t,'button[type="submit"]'),M=I();r(t,"[data-plan-banner]").append(M.element),u.value=At();let p=null,y;function k(){let c=p!==null&&p.catalog!==null&&!p.loading.mutation&&i.value!==""&&l.value!==""&&d.value!==""&&u.value!=="";L.disabled=!c}function P(c){Nt(i,c===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u4EE3\u8868\u2026",(c?.mrs??[]).map(T=>({value:T.id,label:`${T.name} \u2014 ${T.region}`}))),Nt(l,c===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u533B\u751F\u2026",(c?.hcps??[]).map(T=>({value:T.id,label:`${T.name} \u2014 ${T.hospitalName}`}))),Nt(d,c===null?"\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026":"\u8BF7\u9009\u62E9\u836F\u54C1\u2026",(c?.products??[]).map(T=>({value:T.id,label:`${T.name} (${T.code})`})));let b=p===null?"":p.actor;i.disabled=c===null||b!=="",b!==""&&i.value!==b&&(i.value=b),l.disabled=c===null,d.disabled=c===null,k()}function v(){i.value="",l.value="",d.value="",u.value=At(),M.clear(),k()}function g(){let c=i.value,b=l.value,T=d.value;if(c===""||b===""||T===""||u.value==="")return null;let w=new Date(u.value);return Number.isNaN(w.getTime())?null:{mrId:c,hcpId:b,productId:T,plannedAt:fe(w)}}n.addEventListener("submit",c=>{if(c.preventDefault(),!n.reportValidity())return;let b=g();if(b===null){M.showText("\u8BF7\u9009\u62E9\u4EE3\u8868\u3001\u533B\u751F\u3001\u836F\u54C1\u4E0E\u8BA1\u5212\u65F6\u95F4\u3002");return}e.onCreate(b).then(T=>{T&&v()})});for(let c of[i,l,d,u])c.addEventListener("input",k),c.addEventListener("change",k);return{update(c){p=c,c.catalog!==y&&(y=c.catalog,P(c.catalog)),n.setAttribute("aria-busy",String(c.loading.catalog)),M.show(c.errors.plan??c.errors.catalog),k()},reset:v}}var m=ue(),Xe=r(document,"#plan-root"),Ge=r(document,"#list-root"),Qe=r(document,"#detail-root"),Ze=r(document,"#dashboard-root"),_t=r(document,"#refresh"),tn=Ee(Xe,{onCreate:mn}),en=ve(Ge,{onSelect:ln,onFiltersChange:sn}),nn=he(Qe,{onCheckIn:dn,onCheckOut:cn,onSubmitReport:un,onCancel:(t,e)=>ut("terminal",t,()=>le(t,e)),onVoid:(t,e)=>ut("terminal",t,()=>se(t,e)),onDelete:t=>pn(t)}),an=be(Ze,{onRefresh:()=>{et()}}),Rt=0,Ft=0,Ot=0,Bt=0,Le=[{key:"11111111-1111-1111-1111-111111111111",label:"\u5F20\u4F1F",role:"\u533B\u836F\u4EE3\u8868",badge:"MR"},{key:"11111111-1111-1111-1111-111111111112",label:"\u674E\u5A1C",role:"\u533B\u836F\u4EE3\u8868",badge:"MR"},{key:"admin",label:"\u738B\u654F",role:"\u7CFB\u7EDF\u7BA1\u7406\u5458",badge:"AD"}],ct="admin",ke=r(document,"#identity-list"),rn=r(document,"#actor-note");function ye(){ke.replaceChildren();for(let e of Le){let n=document.createElement("button");n.type="button",n.className="rail-button",e.key===ct&&n.classList.add("is-active"),n.dataset.actor=e.key,n.title=`${e.role} \xB7 ${e.label}`;let i=document.createElement("span");i.className="rail-badge",i.textContent=e.badge;let l=document.createElement("span");l.className="rail-name",l.textContent=e.label;let d=document.createElement("span");d.className="rail-role",d.textContent=e.role,n.append(i,l,d),n.addEventListener("click",()=>{on(e.key)}),ke.append(n)}let t=Le.find(e=>e.key===ct);rn.textContent=t===void 0?"":`${t.role} \xB7 ${t.label}`}async function on(t){t!==ct&&(ct=t,St(t),m.update(e=>({...e,actor:t==="admin"?"":t})),ye(),m.update(e=>({...e,selected:null})),await Promise.all([W(),et()]))}function Me(t){tn.update(t),en.update(t),nn.update(t),an.update(t),_t.disabled=t.loading.mutation,_t.setAttribute("aria-busy",String(t.loading.catalog||t.loading.visits||t.loading.dashboard||t.loading.selected))}async function Ce(){let t=++Rt;m.update(e=>({...e,loading:{...e.loading,catalog:!0},errors:{...e.errors,catalog:null}}));try{let e=await te();if(t!==Rt)return;m.update(n=>({...n,catalog:e,loading:{...n.loading,catalog:!1}}))}catch(e){if(t!==Rt)return;m.update(n=>({...n,loading:{...n.loading,catalog:!1},errors:{...n.errors,catalog:K(e)}}))}}async function W(){let t=++Ft,e=m.getState().filters;m.update(n=>({...n,loading:{...n.loading,visits:!0},errors:{...n.errors,list:null}}));try{let n=await ee(e);if(t!==Ft)return;m.update(i=>({...i,visits:n.visits,loading:{...i.loading,visits:!1}}))}catch(n){if(t!==Ft)return;m.update(i=>({...i,loading:{...i.loading,visits:!1},errors:{...i.errors,list:K(n)}}))}}async function et(){let t=++Bt;m.update(e=>({...e,loading:{...e.loading,dashboard:!0},errors:{...e.errors,dashboard:null}}));try{let e=await ce();if(t!==Bt)return;m.update(n=>({...n,dashboard:e,loading:{...n.loading,dashboard:!1}}))}catch(e){if(t!==Bt)return;m.update(n=>({...n,loading:{...n.loading,dashboard:!1},errors:{...n.errors,dashboard:K(e)}}))}}async function Lt(t,e){let n=++Ot;m.update(i=>({...i,selected:e?.id===t?e:i.selected?.id===t?i.selected:null,loading:{...i.loading,selected:!0},errors:{...i.errors,detail:null}}));try{let i=await ne(t);if(n!==Ot)return;m.update(l=>({...l,selected:i,loading:{...l.loading,selected:!1}}))}catch(i){if(n!==Ot)return;let l=K(i);m.update(d=>({...d,selected:l.code==="not_found"?null:d.selected,loading:{...d.loading,selected:!1},errors:{...d.errors,detail:l}}))}}function ln(t){let e=m.getState().visits.find(n=>n.id===t);m.update(n=>({...n,errors:{...n.errors,checkin:null,checkout:null,report:null}})),Lt(t,e)}function sn(t){let e=m.getState().filters;e.status===t.status&&e.productId===t.productId||(m.update(n=>({...n,filters:t})),W())}function Et(t,e,n){return{...t,[e]:n}}async function Te(t){let e=[W(),et()];m.getState().selected?.id===t&&e.push(Lt(t)),await Promise.all(e)}async function ut(t,e,n){if(!m.getState().loading.mutation){m.update(i=>({...i,loading:{...i.loading,mutation:!0},errors:Et(i.errors,t,null)}));try{await n()}catch(i){let l=K(i);m.update(d=>({...d,errors:Et(d.errors,t,l)})),(l.code==="invalid_state"||l.code==="conflict"||l.code==="not_found")&&await Te(e),m.update(d=>({...d,loading:{...d.loading,mutation:!1}}));return}await Te(e),m.update(i=>({...i,loading:{...i.loading,mutation:!1}}))}}function dn(t,e){return ut("checkin",t,()=>ie(t,e))}function cn(t,e){return ut("checkout",t,()=>re(t,e))}function un(t,e){return ut("report",t,()=>oe(t,e))}async function pn(t){if(!m.getState().loading.mutation){m.update(e=>({...e,loading:{...e.loading,mutation:!0},errors:Et(e.errors,"terminal",null)}));try{await de(t)}catch(e){let n=K(e);m.update(i=>({...i,errors:Et(i.errors,"terminal",n),loading:{...i.loading,mutation:!1}}));return}m.update(e=>({...e,selected:null})),await Promise.all([W(),et()]),m.update(e=>({...e,loading:{...e.loading,mutation:!1}}))}}async function mn(t){if(m.getState().loading.mutation)return!1;m.update(n=>({...n,loading:{...n.loading,mutation:!0},errors:{...n.errors,plan:null}}));let e;try{e=await ae(t)}catch(n){return m.update(i=>({...i,loading:{...i.loading,mutation:!1},errors:{...i.errors,plan:K(n)}})),!1}return await W(),await Lt(e.id),m.update(n=>({...n,loading:{...n.loading,mutation:!1}})),!0}async function fn(){if(m.getState().loading.mutation)return;let t=[Ce(),W(),et()],e=m.getState().selected?.id;e!==void 0&&t.push(Lt(e)),await Promise.all(t)}_t.addEventListener("click",()=>{fn()});m.update(t=>({...t,loading:{...t.loading,catalog:!0,visits:!0,dashboard:!0}}));m.subscribe(Me);Me(m.getState());ye();St(ct);Promise.all([Ce(),W(),et()]);})();

/**
 * Canvas chart engine — 18 chart types, inline controls, MCP integration.
 * Used by chart-driven apps (e.g. Stock Intelligence).
 * Expects: window.__APP_CONFIG__ = { toolName, controls, defaults }
 * Expects: state, callTool, extractData, showError, addViewActions (from MCP client)
 */
(function() {
'use strict';

var C=['#448aff','#ff9100','#7c4dff','#00e5ff','#ffea00','#e040fb','#00e676','#ff5252','#40c4ff','#ffd740'];
var BG='#1a1a2e',CD='#16213e',GN='#00c853',RD='#ff1744',GR='#2a2a4a',TX='#e0e0e0',MU='#888';

function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=String(s);return d.innerHTML}
function $(t,a,c){var e=document.createElement(t);if(a)for(var k in a){if(k==='s'&&typeof a[k]==='object'){for(var j in a[k])e.style[j]=a[k][j]}else if(k==='c')e.className=a[k];else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2).toLowerCase(),a[k]);else e.setAttribute(k,a[k])}if(c){if(!Array.isArray(c))c=[c];for(var i=0;i<c.length;i++){var x=c[i];if(typeof x==='string')e.appendChild(document.createTextNode(x));else if(x)e.appendChild(x)}}return e}
function fn(v){if(v==null)return'\u2014';var a=Math.abs(v);if(a>=1e12)return(v/1e12).toFixed(1)+'T';if(a>=1e9)return(v/1e9).toFixed(1)+'B';if(a>=1e6)return(v/1e6).toFixed(1)+'M';if(a>=1e4)return(v/1e3).toFixed(0)+'K';if(v===Math.floor(v))return v.toLocaleString();return v.toFixed(2)}
function fc(v){return v==null?'\u2014':'$'+fn(v)}
function fp(v){return v==null?'\u2014':(v>=0?'+':'')+v.toFixed(2)+'%'}
function fd(d){return d?new Date(d).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):''}
function fs(d){return d?new Date(d).toLocaleDateString('en',{month:'short',year:'2-digit'}):''}
function cl(v,a,b){return Math.max(a,Math.min(b,v))}
function nr(a,b){var r=b-a;if(r===0)r=Math.abs(a)||1;return{mn:a-r*.05,mx:b+r*.05}}

function mc(el,w,h){var d=window.devicePixelRatio||1;var c=document.createElement('canvas');c.style.cssText='width:'+w+'px;height:'+h+'px;display:block;';c.width=w*d;c.height=h*d;var x=c.getContext('2d');x.scale(d,d);el.appendChild(c);return{c:c,x:x,W:w,H:h}}
function dg(x,p,pw,ph,n){x.strokeStyle=GR;x.lineWidth=1;for(var i=0;i<=n;i++){var y=p.t+(ph/n)*i;x.beginPath();x.moveTo(p.l,y);x.lineTo(p.l+pw,y);x.stroke()}}
function dy(x,p,ph,mn,mx,n,al,xo){x.fillStyle=MU;x.font='10px -apple-system,sans-serif';x.textAlign=al;x.textBaseline='middle';for(var i=0;i<=n;i++){x.fillText(fn(mx-(mx-mn)*(i/n)),xo,p.t+(ph/n)*i)}}
function dx(x,p,pw,H,t0,t1,n){x.fillStyle=MU;x.font='10px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';n=Math.min(n,Math.floor(pw/70));for(var i=0;i<=n;i++){x.fillText(fs(t0+(t1-t0)*(i/n)),p.l+(pw/n)*i,H-p.b+6)}}
function att(el){var t=document.createElement('div');t.className='tt';el.appendChild(t);return t}
function ach(el,w,h){var d=window.devicePixelRatio||1;var c=document.createElement('canvas');c.style.cssText='position:absolute;top:0;left:0;width:'+w+'px;height:'+h+'px;pointer-events:none;';c.width=w*d;c.height=h*d;var x=c.getContext('2d');x.scale(d,d);el.appendChild(c);return{c:c,x:x}}
function mst(v,l,co){var s=$('div',{c:'st'});s.appendChild($('div',{c:'sv',s:{color:co}},String(v)));s.appendChild($('div',{c:'sl'},l));return s}

function rCandle(r,d){
  var bars=d.data||[];if(!bars.length){r.innerHTML='<div class="ld2">No price data</div>';return}
  var q=d.quote||{},ind=d.indicators||[];
  r.appendChild($('div',{c:'hdr'},[$('div',null,[$('h1',null,esc(d.title||d.symbol||'')),$('div',{c:'sub'},q.price!=null?'$'+q.price.toFixed(2)+' '+fp(q.changePercentage!=null?q.changePercentage:q.changesPercentage):'')])]));
  var W=r.offsetWidth||600,H=320,vH=H*.18;
  var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var p={t:10,r:56,b:28,l:56},pW=W-p.l-p.r,pH=H-p.t-p.b-vH;
  var cv=mc(b,W,H),x=cv.x;
  var t0=Infinity,t1=-Infinity,pn=Infinity,px=-Infinity,vm=0;
  for(var i=0;i<bars.length;i++){var br=bars[i],t=new Date(br.date).getTime();if(t<t0)t0=t;if(t>t1)t1=t;if(br.low<pn)pn=br.low;if(br.high>px)px=br.high;if(br.volume>vm)vm=br.volume}
  var rr=nr(pn,px);pn=rr.mn;px=rr.mx;if(t0===t1)t1=t0+864e5;if(!vm)vm=1;
  var bW=Math.max(1,Math.floor(pW/bars.length*.7));
  function xS(t){return p.l+(t-t0)/(t1-t0)*pW}function yS(v){return p.t+pH-(v-pn)/(px-pn)*pH}
  dg(x,p,pW,pH,5);dy(x,p,pH,pn,px,5,'right',p.l-6);dx(x,p,pW,H,t0,t1,6);
  for(var i=0;i<bars.length;i++){var br=bars[i],t=new Date(br.date).getTime(),xp=xS(t),yO=yS(br.open),yC=yS(br.close),yH=yS(br.high),yL=yS(br.low);
    var up=br.close>=br.open,co=up?GN:RD;x.strokeStyle=co;x.fillStyle=co;x.lineWidth=1;x.beginPath();x.moveTo(xp,yH);x.lineTo(xp,yL);x.stroke();
    x.fillRect(xp-bW/2,Math.min(yO,yC),bW,Math.max(Math.abs(yO-yC),1));
    x.globalAlpha=.35;x.fillRect(xp-bW/2,H-p.b-(br.volume/vm)*vH,bW,(br.volume/vm)*vH);x.globalAlpha=1}
  for(var j=0;j<ind.length;j++){var pts=ind[j].data||[];x.strokeStyle=C[(j+1)%C.length];x.lineWidth=1.5;x.lineJoin='round';x.beginPath();var st=false;
    for(var k=0;k<pts.length;k++){var pp=xS(new Date(pts[k].date).getTime()),py=yS(pts[k].value);if(!st){x.moveTo(pp,py);st=true}else x.lineTo(pp,py)}x.stroke()}
  var tt=att(b),ch=ach(b,W,H);
  cv.c.addEventListener('mousemove',function(ev){var cr=cv.c.getBoundingClientRect(),mx=ev.clientX-cr.left,my=ev.clientY-cr.top;ch.x.clearRect(0,0,W,H);
    if(mx<p.l||mx>p.l+pW||my<p.t||my>p.t+pH+vH){tt.style.display='none';return}
    ch.x.strokeStyle='#ffffff30';ch.x.lineWidth=1;ch.x.setLineDash([4,3]);ch.x.beginPath();ch.x.moveTo(mx,p.t);ch.x.lineTo(mx,H-p.b);ch.x.stroke();ch.x.beginPath();ch.x.moveTo(p.l,my);ch.x.lineTo(p.l+pW,my);ch.x.stroke();ch.x.setLineDash([]);
    var hT=t0+(mx-p.l)/pW*(t1-t0),bi=0,bd=Infinity;for(var i=0;i<bars.length;i++){var dd=Math.abs(new Date(bars[i].date).getTime()-hT);if(dd<bd){bd=dd;bi=i}}var br=bars[bi];
    tt.innerHTML='<div class="td">'+fd(br.date)+'</div>O:'+br.open.toFixed(2)+' H:'+br.high.toFixed(2)+'<br>L:'+br.low.toFixed(2)+' C:'+br.close.toFixed(2)+'<br>Vol:'+fn(br.volume);
    tt.style.display='block';tt.style.left=Math.min(mx+12,W-tt.offsetWidth-4)+'px';tt.style.top=Math.max(my-tt.offsetHeight/2,2)+'px'});
  cv.c.addEventListener('mouseleave',function(){tt.style.display='none';ch.x.clearRect(0,0,W,H)});
  if(ind.length){var lg=$('div',{c:'lg'});lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:'#888'}}),document.createTextNode('Price')]));for(var j=0;j<ind.length;j++)lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[(j+1)%C.length]}}),document.createTextNode(ind[j].name)]));r.appendChild(lg)}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rLine(r,d){rLA(r,d,false)}
function rArea(r,d){rLA(r,d,true)}
function rLA(r,d,fill){
  var sr=bSeries(d);if(!sr.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var W=r.offsetWidth||600,H=280;
  var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  dLS(b,sr,W,H,fill);
  if(sr.length>1){var lg=$('div',{c:'lg'});for(var i=0;i<sr.length;i++)lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:sr[i].co}}),document.createTextNode(sr[i].nm)]));r.appendChild(lg)}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}
function bSeries(d){
  var data=d.data,out=[];
  if(Array.isArray(data)&&data.length){
    if(data[0].close!=null)out.push({nm:d.symbol||'Price',pts:data.map(function(r){return{t:new Date(r.date).getTime(),v:r.close}}),co:C[0]});
    else if(data[0].value!=null)out.push({nm:d.title||'Value',pts:data.map(function(r){return{t:new Date(r.date).getTime(),v:r.value}}),co:C[0]});
  }
  var ind=d.indicators||[];
  for(var i=0;i<ind.length;i++)out.push({nm:ind[i].name,pts:(ind[i].data||[]).map(function(r){return{t:new Date(r.date).getTime(),v:r.value}}),co:C[(out.length)%C.length]});
  return out;
}
function dLS(b,sr,W,H,fill){
  var p={t:10,r:16,b:28,l:56},pW=W-p.l-p.r,pH=H-p.t-p.b;
  var cv=mc(b,W,H),x=cv.x;
  var t0=Infinity,t1=-Infinity,vn=Infinity,vx=-Infinity;
  for(var s=0;s<sr.length;s++)for(var i=0;i<sr[s].pts.length;i++){var pt=sr[s].pts[i];if(pt.t<t0)t0=pt.t;if(pt.t>t1)t1=pt.t;if(pt.v<vn)vn=pt.v;if(pt.v>vx)vx=pt.v}
  if(t0===t1)t1=t0+864e5;var rr=nr(vn,vx);vn=rr.mn;vx=rr.mx;
  function xS(t){return p.l+(t-t0)/(t1-t0)*pW}function yS(v){return p.t+pH-(v-vn)/(vx-vn)*pH}
  dg(x,p,pW,pH,4);dy(x,p,pH,vn,vx,4,'right',p.l-6);dx(x,p,pW,H,t0,t1,6);
  for(var s=0;s<sr.length;s++){var pts=sr[s].pts;if(!pts.length)continue;pts.sort(function(a,b){return a.t-b.t});
    x.strokeStyle=sr[s].co;x.lineWidth=2;x.lineJoin='round';x.beginPath();for(var i=0;i<pts.length;i++){var px2=xS(pts[i].t),py=yS(pts[i].v);if(!i)x.moveTo(px2,py);else x.lineTo(px2,py)}x.stroke();
    if(fill){x.lineTo(xS(pts[pts.length-1].t),p.t+pH);x.lineTo(xS(pts[0].t),p.t+pH);x.closePath();var gd=x.createLinearGradient(0,p.t,0,p.t+pH);gd.addColorStop(0,sr[s].co+'40');gd.addColorStop(1,sr[s].co+'05');x.fillStyle=gd;x.fill()}}
  var tt=att(b),ch=ach(b,W,H);
  cv.c.addEventListener('mousemove',function(ev){var cr=cv.c.getBoundingClientRect(),mx=ev.clientX-cr.left,my=ev.clientY-cr.top;ch.x.clearRect(0,0,W,H);
    if(mx<p.l||mx>p.l+pW){tt.style.display='none';return}ch.x.strokeStyle='#ffffff30';ch.x.lineWidth=1;ch.x.setLineDash([4,3]);ch.x.beginPath();ch.x.moveTo(mx,p.t);ch.x.lineTo(mx,p.t+pH);ch.x.stroke();ch.x.setLineDash([]);
    var hT=t0+(mx-p.l)/pW*(t1-t0),ln=[];var cd=null;
    for(var s=0;s<sr.length;s++){var pts=sr[s].pts,bi=0,bd=Infinity;for(var i=0;i<pts.length;i++){var dd=Math.abs(pts[i].t-hT);if(dd<bd){bd=dd;bi=i}}if(pts[bi]){if(!cd)cd=new Date(pts[bi].t);ln.push('<span style="color:'+sr[s].co+'">●</span> '+esc(sr[s].nm)+': <b>'+fn(pts[bi].v)+'</b>');ch.x.fillStyle=sr[s].co;ch.x.beginPath();ch.x.arc(xS(pts[bi].t),yS(pts[bi].v),3.5,0,Math.PI*2);ch.x.fill()}}
    if(ln.length){tt.innerHTML='<div class="td">'+fd(cd)+'</div>'+ln.join('<br>');tt.style.display='block';tt.style.left=Math.min(mx+12,W-tt.offsetWidth-4)+'px';tt.style.top=Math.max(my-tt.offsetHeight/2,2)+'px'}});
  cv.c.addEventListener('mouseleave',function(){tt.style.display='none';ch.x.clearRect(0,0,W,H)});
}

function rCol(r,d){
  var data=d.data||[];if(!data.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var keys=pKeys(data,d.statement_type),labels=data.map(function(r){return r.period?r.period+' '+(r.calendarYear||''):(r.date||'').slice(0,7)});
  var W=r.offsetWidth||600,H=300;var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var p={t:14,r:16,b:36,l:64},pW=W-p.l-p.r,pH=H-p.t-p.b;var cv=mc(b,W,H),x=cv.x;
  var vn=0,vx=-Infinity;for(var i=0;i<data.length;i++)for(var k=0;k<keys.length;k++){var v=data[i][keys[k]];if(v!=null){if(v<vn)vn=v;if(v>vx)vx=v}}
  if(vx<=vn)vx=vn+1;var rr=nr(vn,vx);if(vn>=0)rr.mn=0;vn=rr.mn;vx=rr.mx;
  dg(x,p,pW,pH,4);dy(x,p,pH,vn,vx,4,'right',p.l-6);
  var gW=pW/data.length,bW=Math.max(2,Math.floor(gW/(keys.length+1)*.8));
  function yS(v){return p.t+pH-(v-vn)/(vx-vn)*pH}var z=yS(0);
  for(var i=0;i<data.length;i++){var gx=p.l+gW*i+gW/2;x.fillStyle=MU;x.font='10px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';x.fillText(labels[i],gx,H-p.b+6);
    for(var k=0;k<keys.length;k++){var v=data[i][keys[k]];if(v==null)continue;var bx=gx-(keys.length*bW)/2+k*bW,by=yS(v);x.fillStyle=C[k%C.length];x.fillRect(bx,Math.min(by,z),bW-1,Math.abs(by-z)||1)}}
  var tt=att(b);cv.c.addEventListener('mousemove',function(ev){var cr=cv.c.getBoundingClientRect(),mx=ev.clientX-cr.left;if(mx<p.l||mx>p.l+pW){tt.style.display='none';return}
    var idx=cl(Math.floor((mx-p.l)/gW),0,data.length-1),ln=['<div class="td">'+esc(labels[idx])+'</div>'];for(var k=0;k<keys.length;k++){var v=data[idx][keys[k]];ln.push('<span style="color:'+C[k%C.length]+'">●</span> '+esc(keys[k])+': <b>'+fc(v)+'</b>')}
    tt.innerHTML=ln.join('<br>');tt.style.display='block';tt.style.left=Math.min(mx+12,W-tt.offsetWidth-4)+'px';tt.style.top='40px'});
  cv.c.addEventListener('mouseleave',function(){tt.style.display='none'});
  var lg=$('div',{c:'lg'});for(var k=0;k<keys.length;k++)lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[k%C.length]}}),document.createTextNode(keys[k])]));r.appendChild(lg);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}
function pKeys(data,st){
  if(!data.length)return[];
  var m={balance:['totalAssets','totalLiabilities','totalStockholdersEquity'],cashflow:['operatingCashFlow','capitalExpenditure','freeCashFlow'],income:['revenue','netIncome','grossProfit','operatingIncome']};
  var k=m[st]||m.income;k=k.filter(function(k){return data[0][k]!=null});if(k.length)return k;
  var skip={date:1,period:1,calendarYear:1,symbol:1,cik:1,fillingDate:1,acceptedDate:1,link:1,finalLink:1,reportedCurrency:1};
  var out=[];for(var j in data[0])if(!skip[j]&&typeof data[0][j]==='number')out.push(j);return out.slice(0,5);
}

function rBar(r,d){
  var data=d.data||[];if(!data.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var metrics=d.metrics||[];if(!metrics.length){var sk={symbol:1,name:1};for(var k in data[0])if(!sk[k]&&typeof data[0][k]==='number')metrics.push(k);metrics=metrics.slice(0,4)}
  if(!metrics.length){rTbl(r,d);return}
  for(var mi=0;mi<metrics.length;mi++){var met=metrics[mi];
    var items=data.map(function(r){return{l:r.symbol||r.name||'',v:r[met]||0}}).filter(function(r){return r.v!=null});items.sort(function(a,b){return b.v-a.v});
    var mx=Math.max.apply(null,items.map(function(r){return Math.abs(r.v)}))||1;
    var sec=$('div',{c:'cd'});sec.appendChild($('div',{s:{fontSize:'13px',fontWeight:'600',marginBottom:'8px',color:TX}},met));
    for(var i=0;i<items.length;i++){var pct=Math.abs(items[i].v)/mx*100,co=items[i].v>=0?GN:RD;
      var row=$('div',{s:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}});
      row.appendChild($('div',{s:{width:'60px',fontSize:'12px',fontWeight:'500',textAlign:'right',flexShrink:'0'}},items[i].l));
      var bg=$('div',{s:{flex:'1',height:'18px',background:BG,borderRadius:'3px',overflow:'hidden'}});
      bg.appendChild($('div',{s:{width:pct+'%',height:'100%',background:co,borderRadius:'3px'}}));row.appendChild(bg);
      row.appendChild($('div',{s:{width:'70px',fontSize:'11px',color:MU,textAlign:'right',flexShrink:'0'}},fn(items[i].v)));sec.appendChild(row)}
    r.appendChild(sec)}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rDual(r,d){
  var data=d.data||[];if(!data.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var keys=pKeys(data,d.statement_type);if(keys.length<2){rCol(r,d);return}
  var ck=keys[0],lk=keys[1],labels=data.map(function(r){return r.period?r.period+' '+(r.calendarYear||''):(r.date||'').slice(0,7)});
  var W=r.offsetWidth||600,H=300;var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var p={t:14,r:60,b:36,l:64},pW=W-p.l-p.r,pH=H-p.t-p.b;var cv=mc(b,W,H),x=cv.x;
  var y1n=0,y1x=-Infinity,y2n=Infinity,y2x=-Infinity;
  for(var i=0;i<data.length;i++){var v1=data[i][ck],v2=data[i][lk];if(v1!=null){if(v1>y1x)y1x=v1;if(v1<y1n)y1n=v1}if(v2!=null){if(v2>y2x)y2x=v2;if(v2<y2n)y2n=v2}}
  var r1=nr(y1n,y1x);if(y1n>=0)r1.mn=0;y1n=r1.mn;y1x=r1.mx;var r2=nr(y2n,y2x);y2n=r2.mn;y2x=r2.mx;
  dg(x,p,pW,pH,4);dy(x,p,pH,y1n,y1x,4,'right',p.l-6);dy(x,p,pH,y2n,y2x,4,'left',p.l+pW+6);
  var gW=pW/data.length,bW=Math.max(2,Math.floor(gW*.6));
  function y1S(v){return p.t+pH-(v-y1n)/(y1x-y1n)*pH}function y2S(v){return p.t+pH-(v-y2n)/(y2x-y2n)*pH}var z=y1S(0);
  for(var i=0;i<data.length;i++){var gx=p.l+gW*i+gW/2;x.fillStyle=MU;x.font='10px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';x.fillText(labels[i],gx,H-p.b+6);
    var v=data[i][ck];if(v!=null){var by=y1S(v);x.fillStyle=C[0];x.fillRect(gx-bW/2,Math.min(by,z),bW,Math.abs(by-z)||1)}}
  x.strokeStyle=C[1];x.lineWidth=2.5;x.lineJoin='round';x.beginPath();var st=false;
  for(var i=0;i<data.length;i++){var v=data[i][lk];if(v==null)continue;var gx=p.l+gW*i+gW/2,gy=y2S(v);if(!st){x.moveTo(gx,gy);st=true}else x.lineTo(gx,gy)}x.stroke();
  for(var i=0;i<data.length;i++){var v=data[i][lk];if(v==null)continue;x.fillStyle=C[1];x.beginPath();x.arc(p.l+gW*i+gW/2,y2S(v),3,0,Math.PI*2);x.fill()}
  var lg=$('div',{c:'lg'});lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[0]}}),document.createTextNode(ck)]));lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[1]}}),document.createTextNode(lk)]));r.appendChild(lg);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rScatter(r,d){
  var data=d.data||[];if(!data.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var met=d.metrics||[];var xK=met[0],yK=met[1]||met[0];
  if(!xK){var nk=[];for(var k in data[0])if(typeof data[0][k]==='number')nk.push(k);xK=nk[0];yK=nk[1]||nk[0]}
  if(!xK){rTbl(r,d);return}
  var W=r.offsetWidth||600,H=300;var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var p={t:14,r:20,b:36,l:64},pW=W-p.l-p.r,pH=H-p.t-p.b;var cv=mc(b,W,H),x=cv.x;
  var xn=Infinity,xx=-Infinity,yn=Infinity,yx=-Infinity,pts=[];
  for(var i=0;i<data.length;i++){var xv=data[i][xK],yv=data[i][yK];if(xv==null||yv==null)continue;pts.push({x:xv,y:yv,l:data[i].symbol||data[i].name||''});if(xv<xn)xn=xv;if(xv>xx)xx=xv;if(yv<yn)yn=yv;if(yv>yx)yx=yv}
  var rx=nr(xn,xx);xn=rx.mn;xx=rx.mx;var ry=nr(yn,yx);yn=ry.mn;yx=ry.mx;
  dg(x,p,pW,pH,4);dy(x,p,pH,yn,yx,4,'right',p.l-6);
  x.fillStyle=MU;x.font='10px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';
  for(var i=0;i<=4;i++)x.fillText(fn(xn+(xx-xn)*(i/4)),p.l+pW*(i/4),H-p.b+6);
  function xS(v){return p.l+(v-xn)/(xx-xn)*pW}function yS(v){return p.t+pH-(v-yn)/(yx-yn)*pH}
  for(var i=0;i<pts.length;i++){x.fillStyle=C[i%C.length];x.globalAlpha=.8;x.beginPath();x.arc(xS(pts[i].x),yS(pts[i].y),6,0,Math.PI*2);x.fill();x.globalAlpha=1;
    if(pts[i].l){x.fillStyle=TX;x.font='10px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='bottom';x.fillText(pts[i].l,xS(pts[i].x),yS(pts[i].y)-8)}}
  x.fillStyle=MU;x.font='11px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';x.fillText(xK,p.l+pW/2,H-6);
  x.save();x.translate(12,p.t+pH/2);x.rotate(-Math.PI/2);x.fillText(yK,0,0);x.restore();
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rPie(r,d){
  var raw=d.data,sl=[];
  if(Array.isArray(raw)){for(var i=0;i<raw.length;i++){var r2=raw[i];sl.push({l:r2.label||r2.name||r2.sector||r2.symbol||'Slice '+i,v:Math.abs(r2.value||r2.count||r2.changesPercentage||r2.weight||1)})}}
  else if(raw&&typeof raw==='object'){for(var k in raw)if(typeof raw[k]==='number')sl.push({l:k,v:Math.abs(raw[k])})}
  if(!sl.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var tot=0;for(var i=0;i<sl.length;i++)tot+=sl[i].v;
  var W=r.offsetWidth||600,H=300,cx=W/2,cy=H/2;
  var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var cv=mc(b,W,H),x=cv.x;var R=Math.min(W,H)/2-30,ir=R*.55,a=-Math.PI/2;
  for(var i=0;i<sl.length;i++){var sw=sl[i].v/tot*Math.PI*2;x.fillStyle=C[i%C.length];x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,R,a,a+sw);x.closePath();x.fill();
    if(sw>.15){var md=a+sw/2,lx=cx+Math.cos(md)*R*.75,ly=cy+Math.sin(md)*R*.75;x.fillStyle='#fff';x.font='bold 11px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText((sl[i].v/tot*100).toFixed(0)+'%',lx,ly)}a+=sw}
  x.fillStyle=CD;x.beginPath();x.arc(cx,cy,ir,0,Math.PI*2);x.fill();x.fillStyle=TX;x.font='bold 16px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(fn(tot),cx,cy);
  var lg=$('div',{c:'lg',s:{justifyContent:'center'}});for(var i=0;i<sl.length;i++)lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[i%C.length]}}),document.createTextNode(sl[i].l+' ('+fn(sl[i].v)+')')]));r.appendChild(lg);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rTree(r,d){
  var raw=d.data,items=[];
  if(raw&&raw.sectors){for(var i=0;i<raw.sectors.length;i++){var s=raw.sectors[i],pc=parseFloat(String(s.changesPercentage||'0').replace('%',''));items.push({l:s.sector||s.name||'',v:Math.abs(pc)+1,ch:pc})}}
  else if(Array.isArray(raw)){for(var i=0;i<raw.length;i++)items.push({l:raw[i].label||raw[i].name||raw[i].symbol||'',v:Math.abs(raw[i].value||raw[i].marketCap||1),ch:raw[i].change||raw[i].changesPercentage||0})}
  if(!items.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  items.sort(function(a,b){return b.v-a.v});
  var W=r.offsetWidth||600,H=Math.max(240,items.length*22);
  var rects=sqfy(items.map(function(d){return d.v}),{x:0,y:0,w:W,h:H});
  var ct=$('div',{s:{position:'relative',width:W+'px',height:H+'px',overflow:'hidden'}});
  for(var i=0;i<rects.length;i++){var rc=rects[i],it=items[i],ch=it.ch||0;
    var int=Math.min(Math.abs(ch)/5,1),bg=ch>=0?'rgba(0,200,83,'+(0.15+int*.45)+')':'rgba(255,23,68,'+(0.15+int*.45)+')';
    var cell=$('div',{s:{position:'absolute',left:rc.x+'px',top:rc.y+'px',width:rc.w+'px',height:rc.h+'px',background:bg,border:'1px solid '+BG,borderRadius:'3px',overflow:'hidden',padding:'4px 6px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center'}});
    if(rc.w>50&&rc.h>30){cell.appendChild($('div',{s:{fontSize:rc.w>100?'12px':'10px',fontWeight:'600',color:'#fff',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}},it.l));cell.appendChild($('div',{s:{fontSize:'11px',color:ch>=0?GN:RD,fontWeight:'600'}},fp(ch)))}
    ct.appendChild(cell)}r.appendChild(ct);
  if(raw&&raw.gainers){r.appendChild($('div',{s:{fontSize:'13px',fontWeight:'600',margin:'14px 0 6px',color:TX}},'Top Gainers'));for(var i=0;i<Math.min(raw.gainers.length,5);i++){var g=raw.gainers[i];r.appendChild($('div',{s:{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:'12px',borderBottom:'1px solid #1e1e3a'}},[$('span',{s:{fontWeight:'500'}},g.symbol+' \u2014 '+esc(g.name||'')),$('span',{s:{color:GN,fontWeight:'600'}},fp(g.changesPercentage))]))}}
  if(raw&&raw.losers){r.appendChild($('div',{s:{fontSize:'13px',fontWeight:'600',margin:'14px 0 6px',color:TX}},'Top Losers'));for(var i=0;i<Math.min(raw.losers.length,5);i++){var l=raw.losers[i];r.appendChild($('div',{s:{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:'12px',borderBottom:'1px solid #1e1e3a'}},[$('span',{s:{fontWeight:'500'}},l.symbol+' \u2014 '+esc(l.name||'')),$('span',{s:{color:RD,fontWeight:'600'}},fp(l.changesPercentage))]))}}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}
function sqfy(vals,rect){var out=[];sqRow(vals,rect,out,vals.reduce(function(a,b){return a+b},0));return out}
function sqRow(vs,rc,out,total){
  if(!vs.length)return;if(vs.length===1){out.push({x:rc.x,y:rc.y,w:rc.w,h:rc.h});return}
  var wide=rc.w>=rc.h,side=wide?rc.h:rc.w,row=[],rv=0,best=Infinity;
  for(var i=0;i<vs.length;i++){row.push(vs[i]);rv+=vs[i];var f=rv/total,rs=wide?rc.w*f:rc.h*f,wa=0;
    for(var j=0;j<row.length;j++){var cs=side*(row[j]/rv),ar=Math.max(rs/cs,cs/rs);if(ar>wa)wa=ar}
    if(wa>best&&row.length>1){row.pop();rv-=vs[i];var f2=rv/total;
      if(wide){var rw=rc.w*f2,oy=rc.y;for(var j=0;j<row.length;j++){var ch=rc.h*(row[j]/rv);out.push({x:rc.x,y:oy,w:rw,h:ch});oy+=ch}sqRow(vs.slice(i),{x:rc.x+rw,y:rc.y,w:rc.w-rw,h:rc.h},out,total-rv)}
      else{var rh=rc.h*f2,ox=rc.x;for(var j=0;j<row.length;j++){var cw=rc.w*(row[j]/rv);out.push({x:ox,y:rc.y,w:cw,h:rh});ox+=cw}sqRow(vs.slice(i),{x:rc.x,y:rc.y+rh,w:rc.w,h:rc.h-rh},out,total-rv)}return}best=wa}
  if(wide){var oy=rc.y;for(var j=0;j<row.length;j++){var ch=rc.h*(row[j]/rv);out.push({x:rc.x,y:oy,w:rc.w,h:ch});oy+=ch}}
  else{var ox=rc.x;for(var j=0;j<row.length;j++){var cw=rc.w*(row[j]/rv);out.push({x:ox,y:rc.y,w:cw,h:rc.h});ox+=cw}}
}

function rRadar(r,d){
  var data=d.data||[],met=d.metrics||[];if(!met.length){var sk={symbol:1,name:1};for(var k in(data[0]||{}))if(!sk[k]&&typeof data[0][k]==='number')met.push(k);met=met.slice(0,8)}
  if(!data.length||!met.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var mx={};for(var m=0;m<met.length;m++){mx[met[m]]=0;for(var i=0;i<data.length;i++){var v=Math.abs(data[i][met[m]]||0);if(v>mx[met[m]])mx[met[m]]=v}}
  var W=r.offsetWidth||600,H=340,cx=W/2,cy=H/2-10,R=Math.min(W,H)/2-50;
  var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var cv=mc(b,W,H),x=cv.x,n=met.length,st=Math.PI*2/n;
  for(var ring=1;ring<=4;ring++){x.strokeStyle=GR;x.lineWidth=1;x.beginPath();for(var m=0;m<=n;m++){var a=-Math.PI/2+st*(m%n),rr=R*(ring/4);if(!m)x.moveTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);else x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)}x.closePath();x.stroke()}
  for(var m=0;m<n;m++){var a=-Math.PI/2+st*m;x.strokeStyle=GR;x.lineWidth=1;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);x.stroke();
    x.fillStyle=MU;x.font='10px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(met[m],cx+Math.cos(a)*(R+16),cy+Math.sin(a)*(R+16))}
  for(var di=0;di<data.length;di++){var dd=data[di],co=C[di%C.length];x.strokeStyle=co;x.lineWidth=2;x.fillStyle=co+'30';x.beginPath();
    for(var m=0;m<=n;m++){var mi=m%n,a=-Math.PI/2+st*mi,nm=mx[met[mi]]?Math.abs(dd[met[mi]]||0)/mx[met[mi]]:0;nm=cl(nm,0,1);var px2=cx+Math.cos(a)*R*nm,py=cy+Math.sin(a)*R*nm;if(!m)x.moveTo(px2,py);else x.lineTo(px2,py)}x.closePath();x.fill();x.stroke();
    for(var m=0;m<n;m++){var a=-Math.PI/2+st*m,nm=mx[met[m]]?Math.abs(dd[met[m]]||0)/mx[met[m]]:0;x.fillStyle=co;x.beginPath();x.arc(cx+Math.cos(a)*R*nm,cy+Math.sin(a)*R*nm,3,0,Math.PI*2);x.fill()}}
  var lg=$('div',{c:'lg',s:{justifyContent:'center'}});for(var i=0;i<data.length;i++)lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[i%C.length]}}),document.createTextNode(data[i].symbol||data[i].name||'Series '+(i+1))]));r.appendChild(lg);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rHist(r,d){
  var raw=d.data||[];if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  if(raw.bins)return rHistB(r,raw.bins.map(function(b){return{l:b.label||b.min+'-'+b.max,c:b.count||0}}),d);
  var vals=[];if(Array.isArray(raw))for(var i=0;i<raw.length;i++){if(typeof raw[i]==='number')vals.push(raw[i]);else if(raw[i]&&raw[i].value!=null)vals.push(raw[i].value)}
  if(!vals.length){r.innerHTML='<div class="ld2">No data</div>';return}
  var mn=Math.min.apply(null,vals),mx2=Math.max.apply(null,vals),nb=Math.min(20,Math.max(5,Math.ceil(Math.sqrt(vals.length)))),bw=(mx2-mn)/nb;if(!bw)bw=1;
  var bins=[];for(var i=0;i<nb;i++)bins.push({l:(mn+bw*i).toFixed(1)+'-'+(mn+bw*(i+1)).toFixed(1),c:0});
  for(var i=0;i<vals.length;i++){var idx=Math.min(Math.floor((vals[i]-mn)/bw),nb-1);bins[idx].c++}
  rHistB(r,bins,d);
}
function rHistB(r,bins,d){
  var W=r.offsetWidth||600,H=240;var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var p={t:10,r:16,b:36,l:50},pW=W-p.l-p.r,pH=H-p.t-p.b;var cv=mc(b,W,H),x=cv.x;
  var mx=0;for(var i=0;i<bins.length;i++)if(bins[i].c>mx)mx=bins[i].c;if(!mx)mx=1;
  dg(x,p,pW,pH,4);dy(x,p,pH,0,mx,4,'right',p.l-6);
  var bw=pW/bins.length;for(var i=0;i<bins.length;i++){x.fillStyle=C[0];x.fillRect(p.l+bw*i+1,p.t+pH-bins[i].c/mx*pH,bw-2,bins[i].c/mx*pH);
    x.fillStyle=MU;x.font='9px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';if(bw>20||!(i%2))x.fillText(bins[i].l,p.l+bw*i+bw/2,H-p.b+4)}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rHeat(r,d){
  var raw=d.data;if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var rows=[],cl2=[],rl=[];
  if(Array.isArray(raw)&&raw.length){
    if(Array.isArray(raw[0])){rows=raw;for(var i=0;i<rows.length;i++)rl.push('Row '+(i+1));if(rows[0])for(var j=0;j<rows[0].length;j++)cl2.push('Col '+(j+1))}
    else{var keys=[];for(var k in raw[0])if(typeof raw[0][k]==='number')keys.push(k);cl2=keys;for(var i=0;i<raw.length;i++){rl.push(raw[i].symbol||raw[i].name||raw[i].label||'Row '+(i+1));var row=[];for(var j=0;j<keys.length;j++)row.push(raw[i][keys[j]]||0);rows.push(row)}}}
  if(!rows.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.rowLabels)rl=d.rowLabels;if(d.colLabels)cl2=d.colLabels;
  var mn=Infinity,mx=-Infinity;for(var i=0;i<rows.length;i++)for(var j=0;j<rows[i].length;j++){if(rows[i][j]<mn)mn=rows[i][j];if(rows[i][j]>mx)mx=rows[i][j]}if(mn===mx){mn--;mx++}
  var cW=Math.max(30,Math.min(60,Math.floor((r.offsetWidth-80)/cl2.length))),cH=Math.max(24,Math.min(40,cW*.7)),lW=80;
  var tbl=$('div',{s:{overflowX:'auto'}});
  var hdr=$('div',{s:{display:'flex',paddingLeft:lW+'px'}});for(var j=0;j<cl2.length;j++)hdr.appendChild($('div',{s:{width:cW+'px',textAlign:'center',fontSize:'10px',color:MU,padding:'2px 0'}},esc(cl2[j])));tbl.appendChild(hdr);
  for(var i=0;i<rows.length;i++){var re=$('div',{s:{display:'flex',alignItems:'center'}});re.appendChild($('div',{s:{width:lW+'px',fontSize:'11px',color:TX,fontWeight:'500',textAlign:'right',paddingRight:'6px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},esc(rl[i])));
    for(var j=0;j<rows[i].length;j++){var v=rows[i][j],nm=(v-mn)/(mx-mn),rr,gg,bb;if(nm<.5){rr=Math.round(255*nm*2);gg=Math.round(60+140*nm*2);bb=60}else{rr=Math.round(60+195*(1-nm)*2);gg=Math.round(200+55*(nm-.5)*2);bb=Math.round(60+23*(nm-.5)*2)}
      re.appendChild($('div',{s:{width:cW+'px',height:cH+'px',background:'rgb('+rr+','+gg+','+bb+')',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',color:'#fff',fontWeight:'500',border:'1px solid '+BG}},fn(v)))}tbl.appendChild(re)}r.appendChild(tbl);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rFunnel(r,d){
  var raw=d.data||[];if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var items=[];for(var i=0;i<raw.length;i++){var r2=raw[i];items.push({l:r2.label||r2.date||r2.period||'Stage '+(i+1),v:r2.value||r2.estimatedEarning||r2.count||0})}
  if(!items.length){r.innerHTML='<div class="ld2">No data</div>';return}
  var mx=Math.max.apply(null,items.map(function(d){return Math.abs(d.v)}))||1,mW=r.offsetWidth-40||560;
  var ct=$('div',{s:{padding:'10px 0'}});
  for(var i=0;i<items.length;i++){var pct=Math.abs(items[i].v)/mx,w=Math.max(40,pct*mW);
    var row=$('div',{s:{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:'4px'}});
    var bar=$('div',{s:{width:w+'px',height:'36px',background:C[i%C.length],borderRadius:'4px',display:'flex',alignItems:'center',justifyContent:'center'}});
    bar.appendChild($('span',{s:{fontSize:'12px',fontWeight:'600',color:'#fff'}},esc(items[i].l)+': '+fn(items[i].v)));row.appendChild(bar);ct.appendChild(row)}r.appendChild(ct);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rTbl(r,d){
  var raw=d.data||[];
  if(!Array.isArray(raw)){if(raw&&typeof raw==='object'){for(var k in raw)if(Array.isArray(raw[k])&&raw[k].length){raw=raw[k];break}if(!Array.isArray(raw)){var fl=[];for(var k in raw)fl.push({field:k,value:raw[k]});raw=fl}}}
  if(!raw.length){r.innerHTML='<div class="ld2">No data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var skip={link:1,finalLink:1,cik:1,acceptedDate:1,fillingDate:1},cols=[];for(var k in raw[0])if(!skip[k])cols.push(k);
  var sc=null,sd=1;
  function build(){var ex=r.querySelector('.tw');if(ex)r.removeChild(ex);var sorted=raw.slice();
    if(sc!=null)sorted.sort(function(a,b){var va=a[sc],vb=b[sc];if(typeof va==='number'&&typeof vb==='number')return(va-vb)*sd;return String(va||'').localeCompare(String(vb||''))*sd});
    var w=$('div',{c:'tw',s:{overflowX:'auto'}}),tbl=$('table',{c:'tbl'}),th=$('thead'),tr=$('tr');
    for(var c=0;c<cols.length;c++){(function(col){var t=$('th',{onClick:function(){if(sc===col)sd*=-1;else{sc=col;sd=1}build()}});t.innerHTML=esc(col)+(sc===col?(sd===1?' \u25B2':' \u25BC'):'');tr.appendChild(t)})(cols[c])}
    th.appendChild(tr);tbl.appendChild(th);var tb=$('tbody');
    for(var i=0;i<sorted.length;i++){var row=$('tr');for(var c=0;c<cols.length;c++){var v=sorted[i][cols[c]],isN=typeof v==='number';var td=$('td',{c:isN?'n':''});td.textContent=isN?ftn(v,cols[c]):v==null?'\u2014':String(v);row.appendChild(td)}tb.appendChild(row)}
    tbl.appendChild(tb);w.appendChild(tbl);r.appendChild(w)}build();
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}
function ftn(v,col){var c=(col||'').toLowerCase();if(c.includes('price')||c.includes('revenue')||c.includes('income')||c.includes('asset')||c.includes('cash')||c.includes('debt')||c.includes('equity'))return fc(v);if(c.includes('percent'))return fp(v);return fn(v)}

function rQuote(r,d){
  var q=d.data||{},sp=d.sparkline||[],sym=d.symbol||q.symbol||'',pr=q.price,ch=q.change,cp=q.changePercentage!=null?q.changePercentage:q.changesPercentage,up=(cp||0)>=0;
  var hd=$('div',{c:'cd',s:{textAlign:'center',paddingTop:'24px',paddingBottom:'24px'}});
  hd.appendChild($('div',{s:{fontSize:'14px',color:MU,fontWeight:'500'}},esc(q.name||sym)));
  hd.appendChild($('div',{s:{fontSize:'38px',fontWeight:'700',color:TX,margin:'4px 0'}},pr!=null?'$'+pr.toFixed(2):'\u2014'));
  hd.appendChild($('div',{s:{fontSize:'16px',fontWeight:'600',color:up?GN:RD}},(ch!=null?(up?'+':'')+ch.toFixed(2)+' ':'')+(cp!=null?'('+fp(cp)+')':'')));
  if(sp.length>2){var sW=Math.min(300,r.offsetWidth-80),sH=50,sc=document.createElement('canvas');sc.width=sW*2;sc.height=sH*2;sc.style.cssText='width:'+sW+'px;height:'+sH+'px;margin:10px auto 0;display:block;';
    var sx=sc.getContext('2d');sx.scale(2,2);var mn=Math.min.apply(null,sp),mx=Math.max.apply(null,sp);if(mn===mx)mx=mn+1;
    sx.strokeStyle=up?GN:RD;sx.lineWidth=1.5;sx.lineJoin='round';sx.beginPath();for(var i=0;i<sp.length;i++){var x2=i/(sp.length-1)*sW,y=sH-(sp[i]-mn)/(mx-mn)*sH;if(!i)sx.moveTo(x2,y);else sx.lineTo(x2,y)}sx.stroke();
    sx.lineTo(sW,sH);sx.lineTo(0,sH);sx.closePath();sx.fillStyle=(up?GN:RD)+'20';sx.fill();hd.appendChild(sc)}r.appendChild(hd);
  var stats=[{l:'Market Cap',v:q.marketCap?fc(q.marketCap):null},{l:'Volume',v:q.volume?fn(q.volume):null},{l:'52W High',v:q.yearHigh?'$'+q.yearHigh.toFixed(2):null},{l:'52W Low',v:q.yearLow?'$'+q.yearLow.toFixed(2):null},{l:'Day High',v:q.dayHigh?'$'+q.dayHigh.toFixed(2):null},{l:'Day Low',v:q.dayLow?'$'+q.dayLow.toFixed(2):null},{l:'50d Avg',v:q.priceAvg50?'$'+q.priceAvg50.toFixed(2):null},{l:'Exchange',v:q.exchange||null}].filter(function(s){return s.v!=null});
  if(stats.length){var g=$('div',{c:'sg'});for(var i=0;i<stats.length;i++){var s=$('div',{c:'st'});s.appendChild($('div',{c:'sv'},stats[i].v));s.appendChild($('div',{c:'sl'},stats[i].l));g.appendChild(s)}r.appendChild(g)}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rEarn(r,d){
  var data=d.data||[];if(!data.length){r.innerHTML='<div class="ld2">No earnings data</div>';return}
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var beats=0,misses=0,meets=0,cd=[];
  for(var i=0;i<data.length;i++){var dd=data[i],est=dd.epsEstimated!=null?dd.epsEstimated:(dd.estimatedEarning!=null?dd.estimatedEarning:dd.estimate),act=dd.epsActual!=null?dd.epsActual:(typeof dd.actualEarningResult==='number'?dd.actualEarningResult:dd.actual);
    if(act!=null&&est!=null&&act>est)beats++;else if(act!=null&&est!=null&&act<est)misses++;else meets++;cd.push({dt:dd.date||dd.fiscalDateEnding||'',est:est,act:act})}
  var sg=$('div',{c:'sg'});sg.appendChild(mst(beats,'Beats',GN));sg.appendChild(mst(misses,'Misses',RD));sg.appendChild(mst(meets,'Meets',MU));sg.appendChild(mst(data.length,'Quarters',TX));r.appendChild(sg);
  var W=r.offsetWidth||600,H=220;var b=$('div',{c:'cb',s:{width:W+'px',height:H+'px',position:'relative'}});r.appendChild(b);
  var p={t:14,r:16,b:36,l:50},pW=W-p.l-p.r,pH=H-p.t-p.b;var cv=mc(b,W,H),x=cv.x;
  var vn=Infinity,vx=-Infinity;for(var i=0;i<cd.length;i++){if(cd[i].est!=null){if(cd[i].est<vn)vn=cd[i].est;if(cd[i].est>vx)vx=cd[i].est}if(cd[i].act!=null){if(cd[i].act<vn)vn=cd[i].act;if(cd[i].act>vx)vx=cd[i].act}}
  if(vn===Infinity){vn=0;vx=1}var rr=nr(vn,vx);vn=rr.mn;vx=rr.mx;dg(x,p,pW,pH,4);dy(x,p,pH,vn,vx,4,'right',p.l-6);
  var gW=pW/cd.length,bW=Math.max(2,Math.floor(gW*.35));function yS(v){return p.t+pH-(v-vn)/(vx-vn)*pH}
  for(var i=0;i<cd.length;i++){var gx=p.l+gW*i+gW/2;x.fillStyle=MU;x.font='9px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='top';x.fillText(fs(cd[i].dt),gx,H-p.b+6);
    if(cd[i].est!=null){x.fillStyle=C[0]+'80';x.fillRect(gx-bW-1,yS(Math.max(cd[i].est,0)),bW,Math.abs(yS(cd[i].est)-yS(0))||1)}
    if(cd[i].act!=null){x.fillStyle=cd[i].est!=null&&cd[i].act>=cd[i].est?GN:RD;x.fillRect(gx+1,yS(Math.max(cd[i].act,0)),bW,Math.abs(yS(cd[i].act)-yS(0))||1)}}
  var lg=$('div',{c:'lg'});lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:C[0]}}),document.createTextNode('Estimate')]));lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:GN}}),document.createTextNode('Beat')]));lg.appendChild($('div',{c:'li'},[$('span',{c:'ld',s:{background:RD}}),document.createTextNode('Miss')]));r.appendChild(lg);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rRate(r,d){
  var data=d.data||{},rating=data.rating||{},pt=data.price_target||{},grades=data.grades||[];
  if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var sc2=rating.overallScore||0,con=rating.ratingRecommendation||(sc2>=4?'Strong Buy':sc2>=3?'Buy':sc2>=2?'Hold':'Sell');
  var buys=1,holds=1,sells=0;
  if(con.toLowerCase().includes('buy')){buys=3;holds=1;sells=0}else if(con.toLowerCase().includes('sell')){buys=0;holds=1;sells=2}else{buys=1;holds=2;sells=1}
  var tot=buys+holds+sells||1;var tr=$('div',{s:{display:'flex',gap:'16px',flexWrap:'wrap',marginBottom:'14px'}});
  var dc=$('div',{c:'cd',s:{flex:'0 0 auto',display:'flex',flexDirection:'column',alignItems:'center',padding:'16px'}});
  var dS=120,dR=50,di=30,dcv=document.createElement('canvas');dcv.width=dS*2;dcv.height=dS*2;dcv.style.cssText='width:'+dS+'px;height:'+dS+'px;';
  var dx2=dcv.getContext('2d');dx2.scale(2,2);var cx=dS/2,cy=dS/2;
  var sls=[{v:buys,c:GN,l:'Buy'},{v:holds,c:'#ffea00',l:'Hold'},{v:sells,c:RD,l:'Sell'}],a=-Math.PI/2;
  for(var i=0;i<sls.length;i++){var sw=sls[i].v/tot*Math.PI*2;if(sw<.01)continue;dx2.fillStyle=sls[i].c;dx2.beginPath();dx2.moveTo(cx,cy);dx2.arc(cx,cy,dR,a,a+sw);dx2.closePath();dx2.fill();a+=sw}
  dx2.fillStyle=CD;dx2.beginPath();dx2.arc(cx,cy,di,0,Math.PI*2);dx2.fill();dx2.fillStyle=TX;dx2.font='bold 13px -apple-system,sans-serif';dx2.textAlign='center';dx2.textBaseline='middle';dx2.fillText(con,cx,cy);dc.appendChild(dcv);
  var dl=$('div',{s:{display:'flex',gap:'10px',marginTop:'6px'}});for(var i=0;i<sls.length;i++)dl.appendChild($('div',{s:{fontSize:'11px',color:sls[i].c}},sls[i].v+' '+sls[i].l));dc.appendChild(dl);tr.appendChild(dc);
  var pc=$('div',{c:'cd',s:{flex:'1',minWidth:'180px'}});pc.appendChild($('div',{s:{fontSize:'12px',color:MU,marginBottom:'6px'}},'Price Target'));
  var tgs=[{l:'Average',v:pt.lastMonthAvgPriceTarget||pt.targetMedian},{l:'High',v:pt.lastQuarterAvgPriceTarget||pt.targetHigh},{l:'Low',v:pt.lastYearAvgPriceTarget||pt.targetLow},{l:'Consensus',v:pt.targetConsensus}];
  for(var i=0;i<tgs.length;i++)if(tgs[i].v!=null)pc.appendChild($('div',{s:{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:'12px'}},[$('span',{s:{color:MU}},tgs[i].l),$('span',{s:{fontWeight:'600'}},'$'+Number(tgs[i].v).toFixed(2))]));
  tr.appendChild(pc);r.appendChild(tr);
  if(grades.length){r.appendChild($('div',{s:{fontSize:'13px',fontWeight:'600',marginBottom:'8px',color:TX}},'Recent Grades'));
    for(var i=0;i<Math.min(grades.length,10);i++){var g=grades[i],ac=(g.newGrade||'').toLowerCase();
      var cls=ac.includes('buy')||ac.includes('overweight')||ac.includes('outperform')?'gb gu':ac.includes('sell')||ac.includes('underweight')||ac.includes('underperform')?'gb gd':'gb gm';
      var it=$('div',{c:'gi'});it.appendChild($('span',{c:'gf'},esc(g.gradingCompany||'')));it.appendChild($('span',{c:cls},esc(g.newGrade||'')));
      if(g.previousGrade)it.appendChild($('span',{s:{fontSize:'11px',color:MU}},'from '+esc(g.previousGrade)));it.appendChild($('span',{s:{fontSize:'10px',color:'#666',marginLeft:'auto'}},fd(g.date)));r.appendChild(it)}}
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

function rVal(r,d){
  var data=d.data||{};if(d.title)r.appendChild($('div',{c:'hdr'},[$('h1',null,esc(d.title))]));
  var cp=data.current_price||0,iv=data.intrinsic_value||0,ms=data.margin_of_safety||0,vd=data.verdict||'';
  var vc=vd==='undervalued'?GN:vd==='overvalued'?RD:'#ffea00';
  var top=$('div',{c:'cd',s:{textAlign:'center',paddingTop:'20px',paddingBottom:'20px'}});
  top.appendChild($('div',{s:{fontSize:'28px',fontWeight:'700',color:vc,textTransform:'uppercase',letterSpacing:'.05em'}},esc(vd)));
  var gW=200,gH=100,gc=document.createElement('canvas');gc.width=gW*2;gc.height=gH*2;gc.style.cssText='width:'+gW+'px;height:'+gH+'px;margin:12px auto;display:block;';
  var gx=gc.getContext('2d');gx.scale(2,2);var gcx=gW/2,gcy=gH-5,gR=80;
  var grd=gx.createLinearGradient(gcx-gR,0,gcx+gR,0);grd.addColorStop(0,GN);grd.addColorStop(.5,'#ffea00');grd.addColorStop(1,RD);
  gx.strokeStyle=grd;gx.lineWidth=14;gx.lineCap='round';gx.beginPath();gx.arc(gcx,gcy,gR,Math.PI,0);gx.stroke();
  var na=Math.PI-cl((ms+50)/100,0,1)*Math.PI,nx=gcx+Math.cos(na)*65,ny=gcy+Math.sin(na)*65;
  gx.strokeStyle=TX;gx.lineWidth=2;gx.beginPath();gx.moveTo(gcx,gcy);gx.lineTo(nx,ny);gx.stroke();gx.fillStyle=TX;gx.beginPath();gx.arc(gcx,gcy,4,0,Math.PI*2);gx.fill();top.appendChild(gc);
  top.appendChild($('div',{s:{fontSize:'13px',color:MU,margin:'4px 0'}},'Margin of Safety'));
  top.appendChild($('div',{s:{fontSize:'24px',fontWeight:'700',color:ms>=0?GN:RD}},(ms>=0?'+':'')+ms.toFixed(1)+'%'));r.appendChild(top);
  var g=$('div',{c:'sg'});g.appendChild(mst('$'+cp.toFixed(2),'Current Price',TX));g.appendChild(mst('$'+iv.toFixed(2),'DCF Value',C[0]));
  var q=data.quote||{};if(q.pe)g.appendChild(mst(q.pe.toFixed(1),'P/E Ratio',TX));if(q.marketCap)g.appendChild(mst(fc(q.marketCap),'Market Cap',TX));r.appendChild(g);
  if(d.summary)r.appendChild($('div',{c:'sum'},esc(d.summary)));
}

var R={candlestick:rCandle,line:rLine,area:rArea,column:rCol,bar:rBar,dual_axes:rDual,scatter:rScatter,pie:rPie,treemap:rTree,radar:rRadar,histogram:rHist,heatmap:rHeat,funnel:rFunnel,table:rTbl,quote_card:rQuote,earnings_card:rEarn,ratings_card:rRate,valuation_card:rVal};

var appState={loading:false};

function chartEngineRender(data){
  var el=document.querySelector('.dashboard-content');
  if(!el)return;
  el.innerHTML='';
  if(!data||typeof data!=='object'){el.innerHTML='<div class="ld2">No data received</div>';return;}
  var cfg=window.__APP_CONFIG__||{};
  var toolName=cfg.toolName||'stock_app';
  var controls=cfg.controls||{};
  var defaults=cfg.defaults||{};

  var controlsDiv=document.createElement('div');
  controlsDiv.id='controls';
  el.appendChild(controlsDiv);

  var contentDiv=document.createElement('div');
  el.appendChild(contentDiv);

  var type=data.chart_type||'table',fn2=R[type];
  if(!fn2){contentDiv.innerHTML='<div class="ld2">Unknown chart: '+esc(type)+'</div>';return;}
  try{fn2(contentDiv,data);}catch(e){contentDiv.innerHTML='<div class="ld2">Error: '+esc(e.message)+'</div>';}

  var ft=$('div',{c:'ft'});
  ft.appendChild($('a',{href:'https://mcpbundles.com',target:'_blank',rel:'noopener'},'mcpbundles.com'));
  ft.appendChild(document.createTextNode('Updated '+new Date().toLocaleTimeString()));
  contentDiv.appendChild(ft);

  renderControls(controls,defaults);
}

function renderControls(controls,defaults){
  var box=document.getElementById('controls');
  if(!box)return;
  box.innerHTML='';
  if(!state.lastToolInput)return;
  var view=state.lastToolInput.view||'chart';
  var groups=controls[view];
  if(!groups||!groups.length)return;
  var row=$('div',{c:'ctrl'});
  for(var g=0;g<groups.length;g++){
    if(g>0)row.appendChild($('div',{c:'ctrl-sep'}));
    var grp=$('div',{c:'ctrl-grp'}),gr=groups[g];
    var cur=state.lastToolInput[gr.key]||defaults[gr.key]||(gr.opts&&gr.opts[0]?gr.opts[0].v:null);
    if(!gr.opts)continue;
    for(var i=0;i<gr.opts.length;i++){
      (function(key,val,label){
        var btn=$('button',{c:'ctrl-pill'+(val===cur?' active':''),onClick:function(){ctrlClick(key,val,controls,defaults);}},label);
        grp.appendChild(btn);
      })(gr.key,gr.opts[i].v,gr.opts[i].l);
    }
    row.appendChild(grp);
  }
  box.appendChild(row);
}

function ctrlClick(key,val,controls,defaults){
  var cfg=window.__APP_CONFIG__||{};
  var toolName=cfg.toolName||'stock_app';
  if(!state.mcpInitialized||!state.lastToolInput||appState.loading)return;
  if(state.lastToolInput[key]===val)return;
  state.lastToolInput[key]=val;
  appState.loading=true;
  var pills=document.querySelectorAll('.ctrl-pill');
  for(var i=0;i<pills.length;i++)pills[i].disabled=true;
  var contentEl=document.querySelector('.dashboard-content > div:last-child');
  if(contentEl)contentEl.style.opacity='.5';
  callTool(toolName,state.lastToolInput).then(function(result){
    var data=extractData(result);
    if(data){if(contentEl)contentEl.style.opacity='1';chartEngineRender(data);}
  }).catch(function(err){if(contentEl)contentEl.style.opacity='1';showError(err.message);})
  .finally(function(){appState.loading=false;var p2=document.querySelectorAll('.ctrl-pill');for(var j=0;j<p2.length;j++)p2[j].disabled=false;});
}

function refreshChartView(){
  var cfg=window.__APP_CONFIG__||{};
  var toolName=cfg.toolName||'stock_app';
  if(!state.mcpInitialized||!state.lastToolInput)return Promise.resolve();
  return callTool(toolName,state.lastToolInput).then(function(result){
    var data=extractData(result);
    if(data)chartEngineRender(data);
  }).catch(function(err){showError(err.message);});
}

function bootstrapChartEngine(){
  var cfg=window.__APP_CONFIG__;
  if(!cfg||!cfg.toolName)return;
  renderDashboard=function(data){
    chartEngineRender(data);
    addViewActions(
      function(){return{question:'Analyze this data and share insights:',context:data};},
      function(){return refreshChartView();}
    );
  };
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',bootstrapChartEngine);
}else{
  bootstrapChartEngine();
}

})();

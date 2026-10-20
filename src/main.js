const state = {
  simSeats:true, prevErr:1.6, trend:0, squeeze:0, oppMode:"direct", squeezeTo:{LAB:35,NAT:25,GRN:20,NZF:10,ACT:5,NONE:5}, scenario:"0", shares:{...POLLS[0].s}, pollBase:{...POLLS[0].s}, pollName:POLLS[0].id, sidesOpen:false, natMore:false, locks:{}, split:0, swing:0, err:1.6, corr:true,
  bloc:{GRN:"opp",TPM:"opp",LAB:"opp",OPP:"und",OTH:"und",NZF:"gov",NAT:"gov",ACT:"gov"},
  listParty:"NAT", listFull:false, sim:null, showMps:false
};
function adjusted(){
  // 1. late swing  2. Opportunity squeeze
  const sh={...state.shares};
  if(state.trend){ PARTIES.forEach(p=>{ sh[p.c]=Math.max(0, sh[p.c]+TREND[p.c]*TREND_DAYS*state.trend/100); }); }
  if(state.oppMode==="squeeze" && state.squeeze>0){
    const moved=sh.OPP*state.squeeze/100, to=state.squeezeTo, tot=Object.values(to).reduce((a,b)=>a+b,0)||1;
    sh.OPP-=moved; Object.entries(to).forEach(([k,v])=>{ if(k!=="NONE" && sh[k]!=null) sh[k]+=moved*v/tot; });
  }
  return sh;
}
function eff(){
  const base=adjusted(); const sh={...base}; if(!state.swing) return sh;
  const g=PARTIES.filter(p=>state.bloc[p.c]==="gov"), o=PARTIES.filter(p=>state.bloc[p.c]==="opp");
  const gs=g.reduce((a,p)=>a+sh[p.c],0), os=o.reduce((a,p)=>a+sh[p.c],0);
  if(gs>0&&os>0){ g.forEach(p=>sh[p.c]=Math.max(0,sh[p.c]+state.swing*base[p.c]/gs)); o.forEach(p=>sh[p.c]=Math.max(0,sh[p.c]-state.swing*base[p.c]/os)); }
  return sh;
}
const ERRNAME={"0":"simulations off (no polling error)","1":"small polling error","1.6":"a typical polling error","2.4":"a big polling miss","0.3":"specials-only error"};
const BLOCS = {opp:"Labour-led",und:"Kingmaker",gov:"National-led"};
const BLOC_ORDER = ["opp","und","gov"];
const fmt = n=>Math.round(n).toLocaleString("en-NZ");
const esc = s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const color = c=>MODEL_CODES.has(c)||c==="OTH"?`var(--${c})`:"var(--line)";
const fmtP = x=>{ if(x==null) return "…"; const v=Math.round(x*100); return v<1&&x>0?"<1%":v>99&&x<1?">99%":v+"%"; };
const swatch = c=>`<span class="swatch" style="background:var(--${c})"></span>`;
const pname = c=>`<span style="display:inline-flex;align-items:center;gap:8px">${swatch(c)}${NAMES[c]}</span>`;

/* ---------- electorate model ---------- */
function partyFactor(code, shares){
  if(!MODEL_CODES.has(code)) return 1;
  return Math.exp(BETA*((shares[code]||0)-AVG[code] + (code==="NAT"?state.split:0)));
}
function seatProbs(seat, shares){
  const w = seat.c.map(c=> c.w>0 ? c.w*partyFactor(c.p,shares) : 0);
  const t = w.reduce((a,b)=>a+b,0)||1; return w.map(x=>x/t);
}
function argmax(a){ let b=0; a.forEach((v,j)=>{ if(v>a[b]) b=j; }); return b; }
function projectWinners(shares){ return ESEATS.map((s,i)=> state.locks[i]!=null ? state.locks[i] : argmax(seatProbs(s,shares))); }
function elecCounts(winners){ const e={}; [...PARTIES,OTH].forEach(p=>e[p.c]=0); winners.forEach((j,i)=>{ const c=ESEATS[i].c[j].p; if(e[c]!=null) e[c]++; }); return e; }
function listAvail(winners){
  const won=new Set(winners.map((j,i)=>ESEATS[i].c[j].p+"|"+ESEATS[i].c[j].nm));
  const a={}; PARTIES.forEach(p=>{ a[p.c]=(LISTS[p.c]||[]).filter(n=>!won.has(p.c+"|"+n)).length; }); return a;
}
function compute(shares, winners, totalPct=100){
  const elec=elecCounts(winners), avail=listAvail(winners), s={}, tot=totalPct/100;
  PARTIES.forEach(p=>s[p.c]=Math.max(0,shares[p.c])/100);
  const eligible={}; PARTIES.forEach(p=>eligible[p.c]= s[p.c]/tot>=THRESH || elec[p.c]>0);
  const qs=[]; PARTIES.forEach(p=>{ if(eligible[p.c]&&s[p.c]>0) for(let k=0;k<70;k++) qs.push({p:p.c,q:s[p.c]/(2*k+1)}); });
  qs.sort((a,b)=>b.q-a.q);
  const c120=qs[SEATS-1]?qs[SEATS-1].q:0, ent={}; PARTIES.forEach(p=>ent[p.c]=0); qs.slice(0,SEATS).forEach(x=>ent[x.p]++);
  const seats={}, gap={};
  PARTIES.forEach(p=>{ const c=p.c, want=eligible[c]?Math.max(ent[c],elec[c]):0; seats[c]=Math.min(want,elec[c]+avail[c]);
    gap[c]=eligible[c]?Math.max(0,(2*Math.max(ent[c],elec[c])+1)*c120-s[c]):Math.max(0,THRESH*tot-s[c]); });
  seats.OTH=elec.OTH;
  const total=Object.values(seats).reduce((a,b)=>a+b,0);
  return {seats,ent,gap,eligible,elec,total,majority:Math.floor(total/2)+1,winners};
}
function members(res){
  const out={}; PARTIES.forEach(p=>out[p.c]={seatWins:[],listIn:[],won:new Set()});
  res.winners.forEach((j,i)=>{ const c=ESEATS[i].c[j]; if(out[c.p]){ out[c.p].seatWins.push({nm:c.nm,seat:ESEATS[i].n}); out[c.p].won.add(c.nm);} });
  PARTIES.forEach(p=>{ const o=out[p.c]; let L=res.seats[p.c]-o.seatWins.length;
    for(const n of (LISTS[p.c]||[])){ if(L<=0) break; if(!o.won.has(n)){ o.listIn.push(n); L--; } } });
  return out;
}
function blocTotals(seats){ const t={opp:0,und:0,gov:0}; [...PARTIES,OTH].forEach(p=>t[state.bloc[p.c]]+=seats[p.c]||0); return t; }

/* ---------- simulation ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function makeNormal(rand){let spare=null;return function(){ if(spare!==null){const v=spare;spare=null;return v;} let u=0,v=0;while(u===0)u=rand();v=rand();const m=Math.sqrt(-2*Math.log(u));spare=m*Math.sin(2*Math.PI*v);return m*Math.cos(2*Math.PI*v);};}
let SIMTOKEN=0;
async function simulate(nOverride, onProgress, token){
  const OFF=state.err===0, N=OFF?1:(nOverride||parseInt(document.getElementById("nsim").value,10)), k=state.err, corr=OFF?false:state.corr, SH=eff();
  const rand=mulberry32(20261107), norm=makeNormal(rand);
  const codes=PARTIES.map(p=>p.c), P=codes.length, pidx=Object.fromEntries(codes.map((c,i)=>[c,i]));
  const base=codes.map(c=>Math.max(0,SH[c])/100), baseSum=base.reduce((a,b)=>a+b,0);
  const govI=codes.map((c,i)=>state.bloc[c]==="gov"?i:-1).filter(i=>i>=0), oppI=codes.map((c,i)=>state.bloc[c]==="opp"?i:-1).filter(i=>i>=0);
  const govBase=govI.reduce((a,i)=>a+base[i],0), oppBase=oppI.reduce((a,i)=>a+base[i],0);
  const prep=ESEATS.map((s,i)=>{ const idx=s.c.map((c,j)=>j).filter(j=>s.c[j].w>0);
    return {lock:state.locks[i], idx, w:idx.map(j=>s.c[j].w), pi:idx.map(j=>pidx[s.c[j].p]??-1), oth:idx.map(j=>s.c[j].p==="OTH"),
      rank:idx.map(j=>{ const r=RANK[s.c[j].p]; return r&&r[s.c[j].nm]!=null?r[s.c[j].nm]:-1; }), fav:(()=>{ const p=seatProbs(s,SH); return idx.indexOf(argmax(p)); })()}; });
  const listLen=codes.map(c=>(LISTS[c]||[]).length);
  const seatWin=ESEATS.map(s=>new Int32Array(s.c.length)), listIn=codes.map((c,i)=>new Int32Array(listLen[i])), wonFlag=codes.map((c,i)=>new Uint8Array(listLen[i]));
  const seatsS=codes.map(()=>new Int16Array(N)), othS=new Int16Array(N), totS=new Int16Array(N), entNat=new Int16Array(N), elecNat=new Int16Array(N);
  const outc=new Uint8Array(N), fOpp=new Uint8Array(N), fNat=new Uint8Array(N), fBloc=new Uint8Array(N), fTpm=new Uint8Array(N), fOth=new Uint8Array(N);
  const STORE=Math.min(N,5000), winStore=new Int8Array(STORE*ESEATS.length);
  const inParl=new Array(P).fill(0);
  const qv=new Float64Array(P*62), qp=new Int8Array(P*62), ord=new Array(P*62);
  const sh=new Float64Array(P), f=new Float64Array(P), elec=new Int32Array(P), wonOn=new Int32Array(P), seats=new Int32Array(P), ent=new Int32Array(P);
  const touched=[], splitF=Math.exp(BETA*state.split), sdBloc=0.012*k/1.6*1.6, indep=corr?0.75:1;
  const CH=400;
  for(let s=0;s<N;s++){
    if(s>0 && s%CH===0){ if(onProgress) onProgress(s/N); await new Promise(r=>setTimeout(r,0)); if(token!=null && token!==SIMTOKEN) return false; }
    for(let i=0;i<P;i++){ const p=base[i]; const sd=indep*k*Math.sqrt(Math.max(p*(1-p),0.0004)/1000); sh[i]=Math.max(0,p+sd*norm()); }
    const zb=norm(); // always drawn, so every setting replays the same random numbers
    if(corr && govBase>0 && oppBase>0){ const b=sdBloc*zb; govI.forEach(i=>sh[i]=Math.max(0,sh[i]+b*base[i]/govBase)); oppI.forEach(i=>sh[i]=Math.max(0,sh[i]-b*base[i]/oppBase)); }
    let sum=0; for(let i=0;i<P;i++) sum+=sh[i];
    let gsum=0; for(let i=0;i<P;i++){ sh[i]=sh[i]*baseSum/sum; f[i]=Math.exp(BETA*(sh[i]*100-AVG[codes[i]]))*(codes[i]==="NAT"?splitF:1); elec[i]=0; wonOn[i]=0; }
    govI.forEach(i=>gsum+=sh[i]); fBloc[s]= gsum>govBase?1:0;
    let othE=0; touched.length=0;
    for(let si=0;si<prep.length;si++){
      const sp=prep[si]; let jj; const u=rand(); // one random number per seat per run, used or not
      if(sp.lock!=null){ jj=sp.lock; }
      else{ let tot=0; for(let j=0;j<sp.w.length;j++) tot+=sp.w[j]*(sp.pi[j]>=0?f[sp.pi[j]]:1);
        let pick=sp.w.length-1;
        if(!state.simSeats && sp.fav!=null){ pick=sp.fav; }
        else if(OFF){ let bw=-1; for(let j=0;j<sp.w.length;j++){ const wj=sp.w[j]*(sp.pi[j]>=0?f[sp.pi[j]]:1); if(wj>bw){bw=wj;pick=j;} } }
        else { let r=u*tot; for(let j=0;j<sp.w.length;j++){ r-=sp.w[j]*(sp.pi[j]>=0?f[sp.pi[j]]:1); if(r<=0){pick=j;break;} } }
        jj=sp.idx[pick]; }
      seatWin[si][jj]++; if(s<STORE) winStore[s*ESEATS.length+si]=jj;
      const c=ESEATS[si].c[jj], pi=pidx[c.p];
      if(c.p==="OTH") othE++;
      else if(pi!=null){ elec[pi]++; const rk=RANK[c.p]&&RANK[c.p][c.nm]!=null?RANK[c.p][c.nm]:-1; if(rk>=0){ wonFlag[pi][rk]=1; wonOn[pi]++; touched.push(pi,rk);} }
    }
    let n=0;
    for(let i=0;i<P;i++){ ent[i]=0; if(sh[i]>=THRESH||elec[i]>0){ for(let j=0;j<62;j++){ qv[n]=sh[i]/(2*j+1); qp[n]=i; ord[n]=n; n++; } } }
    const o=ord.slice(0,n); o.sort((a,b)=>qv[b]-qv[a]);
    for(let j=0;j<SEATS&&j<n;j++) ent[qp[o[j]]]++;
    let total=othE;
    for(let i=0;i<P;i++){
      const elig=sh[i]>=THRESH||elec[i]>0;
      seats[i]=elig?Math.min(Math.max(ent[i],elec[i]),elec[i]+listLen[i]-wonOn[i]):0;
      total+=seats[i]; seatsS[i][s]=seats[i]; if(seats[i]>0) inParl[i]++;
      let L=seats[i]-elec[i]; for(let r=0;r<listLen[i]&&L>0;r++){ if(!wonFlag[i][r]){ listIn[i][r]++; L--; } }
    }
    for(let t=0;t<touched.length;t+=2) wonFlag[touched[t]][touched[t+1]]=0;
    othS[s]=othE; totS[s]=total; entNat[s]=ent[pidx.NAT]; elecNat[s]=elec[pidx.NAT];
    const maj=Math.floor(total/2)+1, tb={opp:0,und:0,gov:0};
    for(let i=0;i<P;i++) tb[state.bloc[codes[i]]]+=seats[i]; tb[state.bloc.OTH]+=othE;
    outc[s]= tb.gov>=maj?0: tb.opp>=maj?1:2;
    fOpp[s]=seats[pidx.OPP]>0?1:0; fNat[s]=elec[pidx.NAT]>ent[pidx.NAT]?1:0; fTpm[s]=seats[pidx.TPM]>=4?1:0; fOth[s]=othE>0?1:0;
  }
  // medians and representative run
  const med=a=>{ const b=Array.from(a).sort((x,y)=>x-y); return b[Math.floor(b.length/2)]; };
  const q=(a,f)=>{ const b=Array.from(a).sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))]; };
  const medS=codes.map((c,i)=>med(seatsS[i])), medO=med(othS);
  const totCount={}; for(let s=0;s<N;s++) totCount[totS[s]]=(totCount[totS[s]]||0)+1;
  // aim for the House size implied by each party's middle result, so the picture never adds seats nobody is likely to win
  const modeTot=medS.reduce((a,b)=>a+b,0)+medO;
  // closest run to the middle result; among ties, the one whose electorate results are most plausible
  const dist=new Float64Array(STORE); let bestD=1e9;
  const medEN=med(entNat), medEL=med(elecNat);
  for(let s=0;s<STORE;s++){ let d=20*Math.abs(othS[s]-medO)+20*Math.abs(totS[s]-modeTot)+Math.abs(entNat[s]-medEN)+Math.abs(elecNat[s]-medEL); for(let i=0;i<P;i++) d+=Math.abs(seatsS[i][s]-medS[i]); dist[s]=d; if(d<bestD) bestD=d; }
  const logp=ESEATS.map(se=>seatProbs(se,SH).map(p=>Math.log(Math.max(p,1e-4))));
  let best=0, bestL=-1e18;
  for(let s=0;s<STORE;s++){ if(dist[s]!==bestD) continue; let L=0; for(let si=0;si<ESEATS.length;si++) L+=logp[si][winStore[s*ESEATS.length+si]]; if(L>bestL){bestL=L;best=s;} }
  const repW=Array.from(winStore.subarray(best*ESEATS.length,(best+1)*ESEATS.length));
  const repSeats={}; codes.forEach((c,i)=>repSeats[c]=seatsS[i][best]); repSeats.OTH=othS[best];
  const repTotal=totS[best];
  const natHist={}; for(let s=0;s<N;s++) natHist[elecNat[s]]=(natHist[elecNat[s]]||0)+1;
  state.sim={N,k,corr,off:OFF,codes,seatsS,othS,totS,outc,fOpp,fNat,fBloc,fTpm,fOth,inParl,seatWin,listIn,medS,medO,
    ranges:codes.map((c,i)=>[q(seatsS[i],0.1),q(seatsS[i],0.9)]),
    rep:{winners:repW,seats:repSeats,total:repTotal,majority:Math.floor(repTotal/2)+1,entNat:entNat[best],elecNat:elecNat[best]},
    modeTot,modeTotP:(totCount[modeTot]||0)/N,natHist,medEntNat:med(entNat),medElecNat:med(elecNat)};
  return true;
}
function pIn(party,name){
  const sim=state.sim; if(!sim) return null; let v=0; const pi=sim.codes.indexOf(party);
  if(pi>=0&&RANK[party]&&RANK[party][name]!=null) v+=sim.listIn[pi][RANK[party][name]];
  const st=STAND[party+"|"+name]; if(st) v+=sim.seatWin[st.i][st.j];
  return v/sim.N;
}

/* ---------- 1. Parliament ---------- */
function seatPositions(n){
  const rows=n>130?9:8, inner=0.36, radii=Array.from({length:rows},(_,i)=>inner+(1-inner)*i/(rows-1));
  const sum=radii.reduce((a,b)=>a+b,0); let counts=radii.map(r=>n*r/sum), fl=counts.map(Math.floor);
  let rem=n-fl.reduce((a,b)=>a+b,0); counts.map((c,i)=>[c-fl[i],i]).sort((a,b)=>b[0]-a[0]).slice(0,rem).forEach(([,i])=>fl[i]++);
  const pos=[]; radii.forEach((r,i)=>{ const k=fl[i]; for(let j=0;j<k;j++){ const t=k===1?Math.PI/2:Math.PI-Math.PI*j/(k-1); pos.push({t,r,step:k>1?Math.PI/(k-1):Math.PI,row:i}); } });
  pos.sort((a,b)=>b.t-a.t||a.r-b.r); return {pos,dotR:(1-inner)/(rows-1)*0.42,band:(1-inner)/(rows-1)};
}
const initials = n=>n.split(/[\s-]+/).filter(w=>/^[A-ZĀĒĪŌŪ]/.test(w)).map(w=>w[0]).slice(0,3).join("");
let SEATMAP=[];
function drawHouse(){
  const sim=state.sim; if(!sim) return;
  const rep=sim.rep, mem=members(rep), order=[];
  BLOC_ORDER.forEach(b=>[...PARTIES,OTH].forEach(p=>{
    if(state.bloc[p.c]!==b) return;
    if(p.c==="OTH"){ rep.winners.forEach((j,i)=>{ const c=ESEATS[i].c[j]; if(c.p==="OTH") order.push({c:"OTH",nm:c.nm,via:ESEATS[i].n+" (electorate)",pl:c.pl}); }); return; }
    const m=mem[p.c]; m.seatWins.forEach(x=>order.push({c:p.c,nm:x.nm,via:x.seat+" (electorate)"}));
    m.listIn.forEach(n=>order.push({c:p.c,nm:n,via:`List #${RANK[p.c][n]+1}`}));
  }));
  SEATMAP=order;
  const {pos,dotR}=seatPositions(order.length), cx=210, cy=212, R=200, r=(R*dotR);
  let h="";
  pos.forEach((p,i)=>{ const x=cx+R*p.r*Math.cos(p.t), y=cy-R*p.r*Math.sin(p.t), o=order[i];
    h+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="var(--${o.c})" data-i="${i}" tabindex="-1"><title>${esc(o.nm)}, ${o.c==="OTH"?esc(o.pl):NAMES[o.c]}, ${esc(o.via)}</title></circle>`;
    if(state.showMps) h+=`<text class="ini${o.c==="ACT"?" dk":""}" x="${x.toFixed(1)}" y="${(y+1.8).toFixed(1)}" text-anchor="middle">${esc(initials(o.nm))}</text>`; });
  // outline the side that holds a majority in this Parliament
  { const band=seatPositions(order.length).band, tb=blocTotals(rep.seats);
    const win= tb.gov>=rep.majority?"gov": tb.opp>=rep.majority?"opp":null;
    if(win){
      const inB=i=>state.bloc[order[i].c]===win, rows={};
      pos.forEach((p,i)=>{ const R0=rows[p.row]||(rows[p.row]={r:p.r,step:p.step,tmin:null,tmax:null}); if(inB(i)){ R0.tmin=R0.tmin==null?p.t:Math.min(R0.tmin,p.t); R0.tmax=R0.tmax==null?p.t:Math.max(R0.tmax,p.t); } });
      const rs=Object.keys(rows).map(Number).sort((a,b)=>a-b).map(k=>rows[k]);
      const left= win==="opp" ? (state.bloc.LAB==="opp") : false; // Labour-led side sits on the left
      const isLeft = pos.findIndex((p,i)=>inB(i))===0;
      const pad=1.6/R, E= isLeft? Math.PI+ (rs[rs.length-1].step/2)+pad : -(rs[rs.length-1].step/2)-pad;
      const bnd=rs.map(r=> r.tmin==null ? (isLeft?Math.PI+r.step/2:-r.step/2) : (isLeft ? r.tmin-r.step/2+pad*0.0 : r.tmax+r.step/2) );
      const P=(rr,t)=>`${(cx+R*rr*Math.cos(t)).toFixed(2)},${(cy-R*rr*Math.sin(t)).toFixed(2)}`;
      const rin=i=>rs[i].r-band/2-pad, rout=i=>rs[i].r+band/2+pad, n=rs.length;
      const sw=(from,to)=> (to<from?1:0); // decreasing angle = clockwise on screen
      const bb=i=> isLeft ? bnd[i]-pad : bnd[i]+pad;
      let d=`M${P(rout(n-1),bb(n-1))}`;
      const E0=isLeft?Math.PI:0, drop=(R*band*0.5+2.5).toFixed(2), sx=isLeft?-1:1;
      const xo=(cx+sx*R*rout(n-1)).toFixed(2), xi=(cx+sx*R*rin(0)).toFixed(2), yb=(cy+ +drop).toFixed(2);
      d+=` A${(R*rout(n-1)).toFixed(2)},${(R*rout(n-1)).toFixed(2)} 0 0 ${sw(bb(n-1),E0)} ${xo},${cy}`;
      d+=` L${xo},${yb} L${xi},${yb} L${xi},${cy}`;
      d+=` A${(R*rin(0)).toFixed(2)},${(R*rin(0)).toFixed(2)} 0 0 ${sw(E0,bb(0))} ${P(rin(0),bb(0))}`;
      for(let i=0;i<n;i++){
        const ro=i<n-1?(rs[i].r+rs[i+1].r)/2:rout(i);
        d+=` L${P(ro,bb(i))}`;
        if(i<n-1) d+=` A${(R*ro).toFixed(2)},${(R*ro).toFixed(2)} 0 0 ${sw(bb(i),bb(i+1))} ${P(ro,bb(i+1))}`;
      }
      d+=" Z";
      const colr= win==="gov"?"var(--NAT)":"var(--LAB)";
      h+=`<path class="winline" d="${d}" stroke="${colr}"><title>${BLOCS[win]} majority: ${tb[win]} of ${rep.total} seats</title></path>`;
      h+=`<text class="winlab" x="${isLeft?(cx-R*rout(n-1)).toFixed(1):(cx+R*rout(n-1)).toFixed(1)}" y="${(cy+ +drop+12).toFixed(1)}" text-anchor="${isLeft?"start":"end"}" fill="${colr}">${BLOCS[win]} majority: ${tb[win]} seats</text>`;
    }
  }
  h+=`<text class="total" x="${cx}" y="${cy-18}" text-anchor="middle">${rep.total}</text><text class="tlab" x="${cx}" y="${cy-2}" text-anchor="middle">seats · ${rep.majority} for a majority</text>`;
  const svg=document.getElementById("hemi"); svg.innerHTML=h;
  svg.setAttribute("aria-label",`Seat diagram, ${rep.total} seats: ${[...PARTIES,OTH].filter(p=>rep.seats[p.c]).map(p=>NAMES[p.c]+" "+rep.seats[p.c]).join(", ")}`);
  // headline
  const N=sim.N, pc=a=>a/N; let g=0,o2=0,hu=0; for(let s=0;s<N;s++){ if(sim.outc[s]===0)g++; else if(sim.outc[s]===1)o2++; else hu++; }
  const outs=[[g,"National-led majority","var(--NAT)"],[o2,"Labour-led majority","var(--LAB)"],[hu,"Neither has a majority: kingmakers decide","var(--OTH)"]];
  const top=outs.slice().sort((a,b)=>b[0]-a[0])[0];
  const vt={0:"a National-led majority",1:"a Labour-led majority",2:"neither side has a majority, so the kingmakers decide"};
  document.getElementById("verdict").textContent=`Most likely: ${vt[outs.indexOf(top)]} (${fmtP(pc(top[0]))} of simulations).`;
  document.getElementById("odds").innerHTML=outs.map(([v,l,c])=>`<div class="odd" style="border-left:4px solid ${c}"><div class="big">${fmtP(pc(v))}</div><div class="lab">${l}</div></div>`).join("");
  const tb=blocTotals(rep.seats), pct=v=>(v/rep.total*100).toFixed(2)+"%", colors={opp:"var(--LAB)",und:"var(--OTH)",gov:"var(--NAT)"};
  document.getElementById("blocs").innerHTML=partyBar(rep.seats,rep.total,rep.majority,true)+`<div class="blocrow">${BLOC_ORDER.map(b=>`<span><span class="swatch" style="background:${colors[b]}"></span>${BLOCS[b]} <b>${tb[b]}</b></span>`).join("")}</div>`;
  document.getElementById("houseHint").innerHTML= sim.off ? `<span class="offnote">Simulations are off: one result using the poll exactly as published, with every electorate going to its favourite. Turn them back on under "How wrong the polls could be".</span> House size: ${sim.modeTot} seats.` : `Based on ${N.toLocaleString()} simulated elections <button class="qbtn" data-info="sim" aria-label="How the simulation works">?</button>. Most likely House size: ${sim.modeTot} seats (${fmtP(sim.modeTotP)} of runs); 120 plus overhang.`;
  // party table
  let maxSeat=10; sim.seatsS.forEach(a=>{ for(let i=0;i<a.length;i++) if(a[i]>maxSeat) maxSeat=a[i]; });
  const L=v=>(v/maxSeat*100).toFixed(1)+"%";
  const E=eff(); const rows=PARTIES.map((p,i)=>{ const [lo,hi]=sim.ranges[i], md=sim.medS[i];
    return `<tr><td>${pname(p.c)}</td><td>${E[p.c].toFixed(1)}%</td><td><b>${md}</b></td><td>${lo}–${hi}</td>
    <td style="text-align:left"><div class="range" aria-hidden="true"><i style="left:${L(lo)};width:calc(${L(hi)} - ${L(lo)} + 3px);background:var(--${p.c})"></i><b style="left:${L(md)}"></b></div></td>
    <td>${fmtP(sim.inParl[i]/N)}</td></tr>`; });
  let othIn=0; for(let s=0;s<N;s++) if(sim.othS[s]>0) othIn++;
  rows.push(`<tr><td>${pname("OTH")}<button class="qbtn" data-q="oth" aria-label="About the independent and other seats">?</button></td><td>–</td><td><b>${sim.medO}</b></td><td>–</td><td></td><td>${fmtP(othIn/N)}</td></tr>`);
  document.getElementById("partyBody").innerHTML=rows.join("");
 document.querySelectorAll('#partyBody [data-q="oth"]').forEach(bindQ);
  drawSides(); drawDock(order,pos,dotR,outs,tb,rep); placeMaj(document.getElementById("blocs")); placeMaj(document.getElementById("dockBar"));
}
function sideRow(p){
  const sim=state.sim, seats=p.c==="OTH"?sim.medO:sim.medS[sim.codes.indexOf(p.c)];
  const q=p.c==="OTH"?'<button class="qbtn" data-q="oth" aria-label="About the independent and other seats">?</button>':"";
  const fixed=p.c==="LAB"?"Always Labour-led: it leads that side":p.c==="NAT"?"Always National-led: it leads that side":null;
  return `<div class="siderow"><span class="pn">${swatch(p.c)}${p.n} <span style="color:var(--muted);font-weight:400">${seats}</span>${q}</span>
    ${fixed?`<div class="fixedside">${fixed}</div>`:`<div class="sideseg" role="group" aria-label="${p.n} sides with">${[["opp","Labour-led"],["und","Kingmaker"],["gov","National-led"]].map(([k,l])=>`<button data-p="${p.c}" data-b="${k}" aria-pressed="${state.bloc[p.c]===k}">${l}</button>`).join("")}</div>`}</div>`;
}
function partyBar(seats,total,majority,labels){
  const blocs=BLOC_ORDER.map(b=>({b,ps:[...PARTIES,OTH].filter(p=>state.bloc[p.c]===b&&seats[p.c]>0)})).filter(x=>x.ps.length);
  const sum=x=>x.ps.reduce((a,p)=>a+seats[p.c],0);
  const segs=blocs.map(x=>`<span class="bblock bb-${x.b}" style="flex:${sum(x)} 1 0">${x.ps.map(p=>{
      const n=seats[p.c], w=n/total, wide=labels&&(document.getElementById("blocs").offsetWidth||0)>600, lab=!labels?"":w>=(wide?0.05:0.1)?`<em>${p.c==="OTH"?"Ind":p.c} ${n}</em>`:w>=(wide?0.02:0.045)?`<em>${n}</em>`:"";
      return `<span class="pseg${p.c==="ACT"?" dk":""}" data-p="${p.c}" data-n="${n}" tabindex="0" style="flex:${n} 1 0;background:var(--${p.c})" aria-label="${p.n}: ${n} seats">${lab}</span>`; }).join("")}</span>`).join("");
  return `<div class="pbarw${labels?"":" slim"}" data-maj="${majority}"><div class="pbar2" role="img" aria-label="${blocs.map(x=>`${BLOCS[x.b]}: ${x.ps.map(p=>p.n+" "+seats[p.c]).join(", ")}`).join("; ")}">${segs}</div><i class="maj" style="left:calc(${(majority/total*100).toFixed(2)}% - 1px)" title="Majority: ${majority}"></i>${labels?`<span class="majlab" style="left:${(majority/total*100).toFixed(2)}%">Halfway: ${majority} seats needed to govern</span>`:""}</div>`;
}
function placeMaj(root){
  root.querySelectorAll(".pbarw").forEach(w=>{
    const segs=[...w.querySelectorAll(".pseg")], total=segs.reduce((a,g)=>a+(+g.dataset.n),0), mid=total/2, wr=w.getBoundingClientRect(); let cum=0, x=null;
    for(let k=0;k<segs.length;k++){ const g=segs[k], n=+g.dataset.n, r=g.getBoundingClientRect();
      if(Math.abs(cum+n-mid)<1e-9 && k<segs.length-1){ const r2=segs[k+1].getBoundingClientRect(); x=(r.right+r2.left)/2-wr.left; break; }
      if(cum+n>mid){ x=r.left-wr.left+(mid-cum)/n*r.width; break; } cum+=n; }
    if(x==null) return;
    const line=w.querySelector(".maj"), lab=w.querySelector(".majlab");
    line.style.left=(x-1)+"px"; if(lab) lab.style.left=x+"px";
  });
}
function drawOppSide(){
  document.querySelectorAll("#oppSide button").forEach(b=>{ b.setAttribute("aria-pressed",state.bloc.OPP===b.dataset.b); b.onclick=()=>{ state.bloc.OPP=b.dataset.b; update(); }; });
}
function drawSides(){
  const others=[...PARTIES,OTH].filter(p=>p.c!=="OPP");
  const groups=BLOC_ORDER.map(b=>{ const ps=others.filter(p=>state.bloc[p.c]===b).map(p=>p.n); return ps.length?`${BLOCS[b]}: ${ps.join(", ")}`:null; }).filter(Boolean).join(". ");
  drawOppSide();
  document.getElementById("sides").innerHTML = 
    `<details class="moresides"${state.sidesOpen?" open":""}><summary><span>Change which bloc each party sits in<span class="sum">${groups}</span></span><svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
     <div class="inner">${others.map(sideRow).join("")}</div></details>`;
  const d=document.querySelector("#sides .moresides"); d.addEventListener("toggle",()=>{ state.sidesOpen=d.open; });
  document.querySelectorAll("#sides .sideseg button").forEach(b=>b.onclick=()=>{ if(b.dataset.p==="LAB"||b.dataset.p==="NAT") return; state.bloc[b.dataset.p]=b.dataset.b; update(); });
  document.querySelectorAll('#sides [data-q="oth"]').forEach(bindQ);
}
function drawDock(order,pos,dotR,outs,tb,rep){
  const cx=210, cy=212, R=200, r=(R*dotR*1.15); let h="";
  pos.forEach((p,i)=>{ h+=`<circle cx="${(cx+R*p.r*Math.cos(p.t)).toFixed(1)}" cy="${(cy-R*p.r*Math.sin(p.t)).toFixed(1)}" r="${r.toFixed(1)}" fill="var(--${order[i].c})"/>`; });
  document.getElementById("miniHemi").innerHTML=h;
  const N=state.sim.N;
  document.getElementById("dockOdds").innerHTML=`<b>${rep.total} seats</b>, ${rep.majority} to govern. National-led ${fmtP(outs[0][0]/N)}, Labour-led ${fmtP(outs[1][0]/N)}, kingmakers decide ${fmtP(outs[2][0]/N)}`;
  const pct=v=>(v/rep.total*100).toFixed(2)+"%", colors={opp:"var(--LAB)",und:"var(--OTH)",gov:"var(--NAT)"};
  document.getElementById("dockBar").innerHTML=partyBar(rep.seats,rep.total,rep.majority,false);
  document.getElementById("dockCounts").innerHTML=BLOC_ORDER.map(b=>`<span><span class="swatch" style="background:${colors[b]}"></span>${BLOCS[b]} <b>${tb[b]}</b></span>`).join("");
}
function bindTips(){
  const wrap=document.getElementById("chamberwrap"), tip=document.getElementById("tip"), svg=document.getElementById("hemi");
  const show=e=>{ const c=e.target.closest("circle"); if(!c){ tip.hidden=true; return; } const o=SEATMAP[+c.dataset.i]; if(!o) return;
    if(o.c==="OTH"){ tip.hidden=true; ottPop(c); c.addEventListener("mouseleave",schedClose,{once:true}); return; }
    const wr=wrap.getBoundingClientRect(), cr=c.getBoundingClientRect();
    tip.textContent=`${o.nm}, ${o.c==="OTH"?o.pl:NAMES[o.c]}, ${o.via}`; tip.hidden=false; const tw=tip.offsetWidth||200; let lx=cr.left+cr.width/2-wr.left; lx=Math.max(tw/2+2,Math.min(wr.width-tw/2-2,lx)); tip.style.left=lx+"px"; tip.style.top=(cr.top-wr.top)+"px"; tip.hidden=false; };
  svg.addEventListener("pointerover",show); svg.addEventListener("click",show);
  svg.addEventListener("pointerleave",()=>tip.hidden=true);
  document.getElementById("showMps").onchange=e=>{ state.showMps=e.target.checked; drawHouse(); };
}

/* ---------- 2. Factors ---------- */
function cond(flag){
  const sim=state.sim, N=sim.N; let nT=0,gT=0,oT=0,nF=0,gF=0,oF=0;
  for(let s=0;s<N;s++){ if(flag[s]){ nT++; if(sim.outc[s]===0)gT++; else if(sim.outc[s]===1)oT++; } else { nF++; if(sim.outc[s]===0)gF++; else if(sim.outc[s]===1)oF++; } }
  const p=nT/N, gt=nT?gT/nT:0, gf=nF?gF/nF:0, ot=nT?oT/nT:0, of=nF?oF/nF:0;
  const impact=(Math.abs(gt-gf)+Math.abs(ot-of))*Math.min(1,4*p*(1-p));
  return {p,gt,gf,ot,of,impact};
}
function drawCampaign(){
  { const a=state.shares.OPP, e=eff().OPP; document.getElementById("oppOut").textContent= Math.abs(a-e)>=0.05?`${a.toFixed(1)}% → ${e.toFixed(1)}%`:`${e.toFixed(1)}%`; }
  const E=eff(), fmtD=v=>`${v>0?"+":""}${v.toFixed(1)}`;
  // trend
  document.getElementById("trendOut").textContent= state.trend===0?"None":`${state.trend}%`;
  document.getElementById("v-trend").textContent= state.trend===0?"Off: polls as they are" : `Carrying ${state.trend}% of the recent trend through the ${TREND_DAYS} days to election day`;
  document.getElementById("trendChips").innerHTML=PARTIES.map(p=>{ const d=TREND[p.c]*TREND_DAYS; return `<span>${swatch(p.c)}${p.n} <b class="${d>=0?"up":"dn"}">${fmtD(d)} pts</b></span>`; }).join("")+`<p class="thr" style="width:100%;margin:6px 0 0">Change by election day if the trend carries on in full (100%).</p>`;
  // squeeze
  document.getElementById("sqOut").textContent= state.squeeze===0?"None":`${state.squeeze}%`;
  const moved=adjustedNoSqueezeOpp()*state.squeeze/100;
  document.getElementById("v-sq").textContent= state.squeeze===0?"Off: Opportunity keeps its poll support." : `${moved.toFixed(1)} points move away, leaving Opportunity on ${E.OPP.toFixed(1)}%.`;
  const to=state.squeezeTo, tot=Object.values(to).reduce((a,b)=>a+b,0)||1, lab=k=>k==="NONE"?"Stay home or minor party":NAMES[k];
  const el=document.getElementById("sqTo");
  if(!el.dataset.built){ el.dataset.built=1;
    el.innerHTML=Object.keys(to).map(k=>`<div class="sqrow"><span class="pn">${k==="NONE"?'<span class="swatch" style="background:var(--line)"></span>':swatch(k)}${lab(k)}</span><input type="range" min="0" max="100" step="5" data-sq="${k}" aria-label="Share going to ${lab(k)}"><b data-sqo="${k}"></b></div>`).join("")+`<p class="thr" style="margin:6px 0 0">Starting split is an assumption: mostly to Labour, National and the Greens. Adjust to taste.</p>`;
    el.querySelectorAll("[data-sq]").forEach(i=>{ i.oninput=()=>{ state.squeezeTo[i.dataset.sq]=+i.value; drawCampaign(); if(state.squeeze>0) update(true); }; i.onchange=()=>{ if(state.squeeze>0) update(); }; }); }
  el.querySelectorAll("[data-sq]").forEach(i=>{ if(document.activeElement!==i) i.value=to[i.dataset.sq]; });
  el.querySelectorAll("[data-sqo]").forEach(o=>o.textContent=Math.round(to[o.dataset.sqo]/tot*100)+"%");
  document.getElementById("trend").value=state.trend; document.getElementById("squeeze").value=state.squeeze;
}
function setOppMode(m){
  state.oppMode=m;
  if(m==="squeeze"){ state.shares.OPP=state.pollBase.OPP; // squeeze always starts from the poll
    const body=document.getElementById("b-sq"), btn=document.querySelector('[data-open="sq"]');
    if(body.hidden){ body.hidden=false; btn.setAttribute("aria-expanded","true"); btn.textContent="Hide where switchers go"; } }
  syncVotes(); syncLevers(); drawOppMode(); update();
}
function drawOppMode(){
  const m=state.oppMode, v=state.pollBase.OPP;
  document.querySelectorAll("#oppMode button").forEach(b=>{ b.setAttribute("aria-checked",b.dataset.m===m); b.onclick=()=>{ if(state.oppMode!==b.dataset.m) setOppMode(b.dataset.m); }; });
  document.getElementById("oppDirect").hidden= m!=="direct";
  document.getElementById("oppSqueeze").hidden= m!=="squeeze";
  document.getElementById("oppModeNote").textContent= m==="direct"
    ? `Drag to any vote from 0 to 20%. Every other party stays as polled. The dashed marker shows the poll (${v.toFixed(1)}%).`
    : `Starts from the poll (${v.toFixed(1)}%) and moves a share of Opportunity's voters to other parties at the last minute, so the votes always add up.`;
}
function adjustedNoSqueezeOpp(){ const s0=state.squeeze; state.squeeze=0; const v=adjusted().OPP; state.squeeze=s0; return v; }
function condBoxes(c,labs){
  return `<div>${labs[0]}<b>${fmtP(c.gt)}</b>National-led majority, ${fmtP(c.ot)} Labour-led</div><div>${labs[1]}<b>${fmtP(c.gf)}</b>National-led majority, ${fmtP(c.of)} Labour-led</div>`;
}
function drawFactors(){
  const sim=state.sim; if(!sim) return;
  const pi=c=>sim.codes.indexOf(c), natEnt=sim.medEntNat;
  const C={opp:cond(sim.fOpp),nat:cond(sim.fNat),err:cond(sim.fBloc),tpm:cond(sim.fTpm),oth:cond(sim.fOth)};
  // Opportunity's real influence: how often its seats decide which side can govern
  { const N=sim.N, oi=sim.codes.indexOf("OPP"); let piv=0;
    for(let r=0;r<N;r++){ const o=sim.seatsS[oi][r]; if(!o) continue; const maj=Math.floor(sim.totS[r]/2)+1; let g=0,l=0;
      sim.codes.forEach((c,i)=>{ if(c==="OPP") return; const v=sim.seatsS[i][r]; if(state.bloc[c]==="gov") g+=v; else if(state.bloc[c]==="opp") l+=v; });
      if(state.bloc.OTH==="gov") g+=sim.othS[r]; else if(state.bloc.OTH==="opp") l+=sim.othS[r];
      if((g<maj&&g+o>=maj)||(l<maj&&l+o>=maj)) piv++; }
    C.opp.pivot=piv/N; C.opp.impact=Math.max(C.opp.impact, piv/N); }
  const maxI=Math.max(...Object.values(C).map(c=>c.impact),0.01);
  Object.entries(C).forEach(([k,c])=>document.getElementById("i-"+k).style.width=(c.impact/maxI*100).toFixed(0)+"%");
  state.othImpact={rel:C.oth.impact/maxI, c:C.oth};
  const set=(id,h)=>{ document.getElementById(id).innerHTML=h; };
  // Opportunity
  drawCampaign(); drawOppMode();
  const sideTxt={und:"Hasn't picked a side",opp:"Backing a Labour-led government",gov:"Backing a National-led government"}[state.bloc.OPP];
  set("v-opp",`${eff().OPP.toFixed(1)}% of the party vote. ${sideTxt}. Its seats decide who governs in ${fmtP(C.opp.pivot)} of runs`);
  set("l-opp",`At ${eff().OPP.toFixed(1)}%, Opportunity clears the threshold in ${fmtP(C.opp.p)} of simulations, and in ${fmtP(C.opp.pivot)} its seats are what tips one side over the majority line. That's why its choice of side matters more than anything else on this page.`);
  set("c-opp",condBoxes(C.opp,["When Opportunity is in","When it misses 5%"]));
  // National
  const willis=pIn("NAT","Nicola Willis"), bishop=pIn("NAT","Chris Bishop"), gold=pIn("NAT","Paul Goldsmith");
  const R=sim.rep, ent=R.entNat, el=R.elecNat, natSeats=R.seats.NAT, over=Math.max(0,el-ent), listN=Math.max(0,natSeats-el);
  const LR=listRows("NAT",null,true), inList=LR.m.listIn;
  set("v-nat",`Happens in ${fmtP(C.nat.p)} of simulations`);
  const join=a=>a.length>1?a.slice(0,-1).join(", ")+" and "+a[a.length-1]:a.join("");
  const scale=Math.max(ent,el,40)+2;
  document.getElementById("cb-ent").style.width=(ent/scale*100)+"%";
  document.getElementById("cb-elec").style.width=(Math.min(el,ent)/scale*100)+"%";
  document.getElementById("cb-over").style.width=(over/scale*100)+"%";
  set("n-ent",ent); set("n-elec",el);
  const outAll=(LISTS.NAT||[]).map((n,r)=>({n,r})).filter(x=>!LR.m.won.has(x.n)&&!inList.includes(x.n)), outNames=outAll.slice(0,3).map(x=>x.n);
  const moreBtn=`<button class="linkbtn" id="natMoreBtn">Show more</button>`, moreList="";
  set("p-nat", over>0
    ? `<span class="verdictpill over">Overhang of ${over}</span> No list MPs: ${join(outNames)} miss out. ${moreBtn}${moreList}`
    : listN>0
    ? `<span class="verdictpill room">No overhang</span> ${listN} list seat${listN>1?"s":""}: ${join(inList)}.${LR.firstOut?` First out: ${LR.firstOut}.`:""} ${moreBtn}`
    : `<span class="verdictpill even">On the edge</span> No list seats: ${join(outNames)} miss out. ${moreBtn}${moreList}`);
  { const mb=document.getElementById("natMoreBtn"); if(mb) mb.onclick=()=>{
      const body=document.getElementById("b-nat"), btn=document.querySelector('#lv-nat .lvbtn');
      if(body.hidden){ body.hidden=false; btn.setAttribute("aria-expanded","true"); btn.textContent="Hide info"; }
      document.getElementById("natPeople").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"}); }; }
  set("natPeople",`<p class="mph" style="margin-top:4px">National's list in the most likely Parliament</p>
    <p class="thr" style="margin:0 0 6px">Electorate winners come off the top; the line marks the first person who misses out. "Chance in" adds up both ways in across all runs: winning their electorate, plus getting in through the list in runs where they lose it.</p>
    <div class="tablewrap natlist"><table><thead><tr><th>#</th><th>Candidate</th><th style="text-align:left">Standing in</th><th style="text-align:left">Projection</th><th>Chance in</th></tr></thead><tbody>${LR.rows.join("")}</tbody></table></div>
    <div class="presets" style="margin-top:8px"><button class="btn" id="natFullList">See National's full list</button></div>`);
  document.getElementById("natFullList").onclick=()=>{ state.listParty="NAT"; state.listFull=false; drawLists(); document.getElementById("h-lists").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}); };

  set("l-nat",`National wins more electorates than its party vote earns in ${fmtP(C.nat.p)} of runs. Chance of being in Parliament: Nicola Willis ${fmtP(willis)}, Chris Bishop ${fmtP(bishop)}, Paul Goldsmith ${fmtP(gold)}.`);
  set("c-nat",condBoxes(C.nat,["With a National overhang","Without one"]));
  // Error
  set("v-err", state.err===0?"Off: no simulations, one exact result":`${ERRNAME[String(state.err)].replace(/^a /,"").replace(/^./,m=>m.toUpperCase())}${state.corr?", can favour one side":""}`);
  set("l-err",`The National-led parties beat their combined polling in ${fmtP(C.err.p)} of simulations.`);
  set("c-err",condBoxes(C.err,["National-led side beats polls","National-led side below polls"]));
  // TPM
  set("v-tpm",`Most likely ${sim.medS[pi("TPM")]} seats; 4 or more in ${fmtP(C.tpm.p)} of runs`);
  set("l-tpm",`Te Pāti Māori wins four or more seats in ${fmtP(C.tpm.p)} of simulations.`);
  set("c-tpm",condBoxes(C.tpm,["Te Pāti Māori 4+","3 or fewer"]));
  const tpmSeats=["Hauraki-Waikato","Tāmaki Makaurau","Te Tai Hauāuru","Waiariki","Ikaroa-Rāwhiti"];
  const el1=document.getElementById("s-tpm"); el1.innerHTML=tpmSeats.map(n=>seatCard(SEAT_IDX[n])).join(""); bindCards(el1);
  // OTH
  set("v-oth",`At least one wins in ${fmtP(C.oth.p)} of runs`);
  set("l-oth",`Kapa-Kingi or Ferris wins in ${fmtP(C.oth.p)} of simulations.`);
  set("c-oth",condBoxes(C.oth,["One of them wins","Neither wins"]));
  const el2=document.getElementById("s-oth"); el2.innerHTML=["Te Tai Tokerau","Te Tai Tonga"].map(n=>seatCard(SEAT_IDX[n])).join(""); bindCards(el2);
  const prec=(1.96*Math.sqrt(0.25/sim.N)*100).toFixed(1);
  document.getElementById("simNote").innerHTML= sim.off ? `Simulations are off, so every figure is a single result from "${esc(document.getElementById("scenario").selectedOptions[0].textContent)}" with no polling error. Called seats: ${Object.keys(state.locks).length}.` : `<button class="qbtn" data-info="sim" aria-label="How the simulation works">?</button> ${sim.N.toLocaleString()} runs of "${document.getElementById("scenario").selectedOptions[0].textContent}", with ${ERRNAME[String(state.err)]}. Each percentage is within about ±${prec} points of what more runs would give. Called seats: ${Object.keys(state.locks).length}.`;
}
function bindCards(el){
  el.querySelectorAll(".cand").forEach(b=>b.onclick=()=>{ const i=+b.dataset.s, j=+b.dataset.c; if(state.locks[i]===j) delete state.locks[i]; else state.locks[i]=j; drawSeatList(); update(); });
}
function bindOpen(){
  document.querySelectorAll(".lvbtn").forEach(b=>b.onclick=()=>{
    const body=document.getElementById(b.getAttribute("aria-controls")), open=body.hidden;
    body.hidden=!open; b.setAttribute("aria-expanded",open);
    b.textContent= open?(b.dataset.open==="sq"?"Hide where switchers go":"Hide info"):(b.dataset.open==="sq"?"Where switchers go":["opp","nat","trend"].includes(b.dataset.open)?"More info":"Open to change");
  });
}
let popTimer=null, popAnchor=null;
function ottPop(anchor){
  clearTimeout(popTimer);
  if(popAnchor===anchor && document.querySelector(".pop")) return;
  closePop(); popAnchor=anchor;
  const sim=state.sim, N=sim.N;
  const pk=(seat,nm)=>{ const i=SEAT_IDX[seat], j=ESEATS[i].c.findIndex(c=>c.nm===nm); return sim.seatWin[i][j]/N; };
  const kk=pk("Te Tai Tokerau","Mariameno Kapa-Kingi"), fe=pk("Te Tai Tonga","Tākuta Ferris");
  let any=0; for(let s=0;s<N;s++) if(sim.othS[s]>0) any++;
  const imp=state.othImpact||{rel:0,c:{gt:0,gf:0,ot:0,of:0}};
  const inHouse=sim.medO>0;
  const repWon=nm=>{ const i=STAND["OTH|"+nm].i; return ESEATS[i].c[sim.rep.winners[i]].nm===nm; };
  const kkIn=repWon("Mariameno Kapa-Kingi"), feIn=repWon("Tākuta Ferris");
  const badge=(won,seat)=>won?`<span class="elected">Elected: wins ${seat}</span>`:`<span class="notel">Not elected in this Parliament</span>`;
  const electedNames=[kkIn?"Mariameno Kapa-Kingi is elected as the MP for Te Tai Tokerau":null, feIn?"Tākuta Ferris is elected as the MP for Te Tai Tonga":null].filter(Boolean);
  const pop=document.createElement("div"); pop.className="pop"; pop.setAttribute("role","dialog"); pop.setAttribute("aria-label","About independent and other seats");
  pop.innerHTML=`${electedNames.length?`<p class="electedbar">In the most likely Parliament, ${electedNames.join(", and ")}.</p>`:""}<p style="margin-bottom:10px"><b>Independent / other</b> is two MPs who were expelled from Te Pāti Māori (the Māori Party) and are now standing on their own.</p>
    <div class="whos"><div class="who${kkIn?" won":""}">
      <p class="whoname">Mariameno Kapa-Kingi ${badge(kkIn,"Te Tai Tokerau")}</p>
      <dl>
        <dt>Electorate</dt><dd>Te Tai Tokerau <span>Māori seat covering Northland and north Auckland</span></dd>
        <dt>Party</dt><dd>Te Tai Tokerau Party <span>her own new party, named after the seat</span></dd>
        <dt>Chance of winning</dt><dd><b>${fmtP(kk)}</b> of simulations</dd>
        <dt>Would back</dt><dd>Undecided. Has said she'd consider working with National (<a href="https://www.1news.co.nz/2026/05/11/kapa-kingi-splits-from-te-pati-maori-launches-new-party/" target="_blank" rel="noopener">1News</a>)</dd>
      </dl>
    </div>
    <div class="who${feIn?" won":""}">
      <p class="whoname">Tākuta Ferris ${badge(feIn,"Te Tai Tonga")}</p>
      <dl>
        <dt>Electorate</dt><dd>Te Tai Tonga <span>Māori seat covering the South Island, Wellington and the Chatham Islands</span></dd>
        <dt>Party</dt><dd>Independent <span>no party</span></dd>
        <dt>Chance of winning</dt><dd><b>${fmtP(fe)}</b> of simulations. A late-September <a href="https://thespinoff.co.nz/politics/28-09-2026/takuta-ferris-is-coming-last-in-a-new-te-tai-tonga-poll" target="_blank" rel="noopener">Māori Television poll</a> had him fourth</dd>
        <dt>Would back</dt><dd>Leans Labour-led, but would work with the current coalition if it stays (<a href="https://thespinoff.co.nz/atea/01-10-2026/the-wildest-moments-from-a-hectic-te-tai-tonga-debate" target="_blank" rel="noopener">The Spinoff</a>)</dd>
      </dl>
    </div></div>
    <p><b>Why the chances vary:</b> each simulation redraws every party's vote and every electorate within the polls' margins of error. At least one of them wins in ${fmtP(any/N)} of runs${inHouse?", just over half, so the most likely Parliament includes one":", under half, so the most likely Parliament doesn't include them"}. Neither has picked a side, so they count as kingmakers.</p>
    <div class="impact" style="margin:0 0 6px">How much it moves the odds <span><i style="width:${(imp.rel*100).toFixed(0)}%"></i></span></div>
    <p class="thr" style="margin:0 0 10px">National-led majority ${fmtP(imp.c.gt)} when one of them wins, ${fmtP(imp.c.gf)} when neither does.</p>
    <div class="popbtns"><button class="btn primary" data-go>Open the control</button><button class="btn" data-close>Close</button></div>`;
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect(), w=Math.min(620, window.innerWidth-24);
  pop.style.width=w+"px";
  pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12, r.left+r.width/2-w/2))+window.scrollX+"px";
  const below=r.bottom+8, h=pop.offsetHeight;
  pop.style.top=((below+h>window.innerHeight && r.top-h-8>60)? r.top-h-8 : below)+window.scrollY+"px";
  pop.addEventListener("mouseenter",()=>clearTimeout(popTimer));
  pop.addEventListener("mouseleave",schedClose);
  pop.querySelector("[data-go]").onclick=()=>{ closePop(); goLever(); };
  pop.querySelector("[data-close]").onclick=()=>closePop();
  setTimeout(()=>document.addEventListener("click",outside),0);
}
function schedClose(){ clearTimeout(popTimer); popTimer=setTimeout(closePop,250); }
function bindQ(btn){
  btn.addEventListener("mouseenter",()=>ottPop(btn));
  btn.addEventListener("mouseleave",schedClose);
  btn.addEventListener("focus",()=>ottPop(btn));
  btn.onclick=e=>{ e.stopPropagation(); ottPop(btn); const g=document.querySelector(".pop [data-go]"); if(g) g.focus(); };
}
function simPop(anchor){
  clearTimeout(popTimer);
  if(popAnchor===anchor && document.querySelector(".pop")) return;
  closePop(); popAnchor=anchor;
  const sim=state.sim, N=sim?sim.N:0;
  const pop=document.createElement("div"); pop.className="pop"; pop.setAttribute("role","dialog"); pop.setAttribute("aria-label","About the simulations");
  let g=0,o=0; for(let i=0;i<N;i++){ if(sim.outc[i]===0) g++; else if(sim.outc[i]===1) o++; }
  let dg=Math.round(g/N*20), dl=Math.round(o/N*20); if(dg+dl>20) dl=20-dg; const dk=20-dg-dl;
  const dots=[...Array(dl).fill("LAB"),...Array(dk).fill("OTH"),...Array(dg).fill("NAT")].map(c=>`<i style="background:var(--${c})"></i>`).join("");
  pop.innerHTML=`<p><b>Polls aren't exact,</b> so instead of one prediction this page plays out the election ${N.toLocaleString()} times. Each time, every party's vote is nudged up or down by about as much as polls usually miss, and every seat is decided again.</p>
    <p style="margin-bottom:4px">A percentage is just how often something happened. Out of every 20 runs:</p>
    <div class="dots20" aria-hidden="true">${dots}</div>
    <div class="dotkey"><span><i style="background:var(--LAB)"></i><b>${dl}</b> Labour-led majority</span><span><i style="background:var(--OTH)"></i><b>${dk}</b> kingmakers decide</span><span><i style="background:var(--NAT)"></i><b>${dg}</b> National-led majority</span></div>
    <div class="popbtns"><button class="btn primary" data-go>How the simulation works</button><button class="btn" data-close>Close</button></div>`;
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect(), w=Math.min(420, window.innerWidth-24);
  pop.style.width=w+"px";
  pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12, r.left+r.width/2-w/2))+window.scrollX+"px";
  const h=pop.offsetHeight, below=r.bottom+8;
  pop.style.top=((below+h>window.innerHeight && r.top-h-8>60)? r.top-h-8 : below)+window.scrollY+"px";
  pop.addEventListener("mouseenter",()=>clearTimeout(popTimer));
  pop.addEventListener("mouseleave",schedClose);
  pop.querySelector("[data-go]").onclick=()=>{ closePop(); openSimPanel(); };
  pop.querySelector("[data-close]").onclick=()=>closePop();
  setTimeout(()=>document.addEventListener("click",outside),0);
}
function openSimPanel(){
  const sim=state.sim, N=sim.N, E=eff(), dlg=document.getElementById("simPanel");
  const prec=(1.96*Math.sqrt(0.25/N)*100).toFixed(1), err=ERRNAME[String(state.err)];
  const sd=c=>(state.err*Math.sqrt(Math.max(E[c]/100*(1-E[c]/100),0.0004)/1000)*100*1.28).toFixed(1);
  const codes=sim.codes, rows=[];
  const label=o=>o===0?"National-led majority":o===1?"Labour-led majority":"Kingmakers decide";
  for(let s=0;s<Math.min(5,N);s++){
    const g=k=>sim.seatsS[codes.indexOf(k)][s];
    rows.push(`<tr><td>Run ${s+1}</td><td>${g("NAT")}</td><td>${g("LAB")}</td><td>${g("OPP")||"Out"}</td><td>${sim.totS[s]}</td><td style="text-align:left">${label(sim.outc[s])}</td></tr>`);
  }
  document.getElementById("simPanelBody").innerHTML=`
    <p>The forecast doesn't pick one result. It plays out the election ${N.toLocaleString()} times with realistic randomness, then counts how often each outcome happens.</p>
    <ol class="steps">
      <li><b>Start from the poll</b><p>Currently "${esc(document.getElementById("scenario").selectedOptions[0].textContent)}": National ${E.NAT.toFixed(1)}%, Labour ${E.LAB.toFixed(1)}%, Opportunity ${E.OPP.toFixed(1)}% and so on.</p></li>
      <li><b>Add polling error</b><p>Each run moves every party's vote by a random amount, using ${err}. For National that's typically within about ±${sd("NAT")} points; for Opportunity about ±${sd("OPP")}.${state.corr?" A shared swing can also push the whole National-led or Labour-led side up or down together, as real polling misses often do.":""}</p></li>
      <li><b>Decide every electorate</b><p>All 71 seats are drawn from their chances. If a run gives National a better night, its candidates become more likely to win everywhere, so close seats tend to move together. Seats you've called stay fixed.</p></li>
      <li><b>Hand out the seats</b><p>Parties need 5% or an electorate. The 120 seats are shared by party vote using the Sainte-Laguë formula, electorate winners fill each party's seats first, list MPs fill the rest, and extra electorate wins become overhang seats.</p></li>
      <li><b>Count the sides</b><p>Seats are added up for the Labour-led side, the National-led side and the kingmakers, and checked against the majority line for that run's House size.</p></li>
      <li><b>Repeat ${N.toLocaleString()} times</b><p>Every percentage on the page is the share of runs with that result. With this many runs, each one is within about ±${prec} points of what endless runs would give.</p></li>
    </ol>
    <h3 class="dl">The first five runs, as an example</h3>
    <div class="tablewrap"><table class="runs"><thead><tr><th style="text-align:left">Run</th><th>National</th><th>Labour</th><th>Opportunity</th><th>House</th><th style="text-align:left">Result</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <h3 class="dl">What it can't tell you</h3>
    <p>It only knows what the polls and my electorate estimates say today. It can't foresee campaign events, turnout surprises or a poll-wide error bigger than the setting you choose, and its seat-by-seat chances are informed estimates rather than published forecasts.</p>`;
  dlg.showModal();
}
function partyPop(anchor, code){
  clearTimeout(popTimer);
  if(popAnchor===anchor && document.querySelector(".pop")) return;
  closePop(); popAnchor=anchor;
  const rep=state.sim.rep, m=members(rep)[code], n=rep.seats[code];
  const el=m.seatWins.map(x=>`<li>${esc(x.nm)}<span>${esc(x.seat)}</span></li>`).join("");
  const li=m.listIn.map(nm=>`<li>${esc(nm)}<span>List #${RANK[code][nm]+1}</span></li>`).join("");
  const pop=document.createElement("div"); pop.className="pop"; pop.setAttribute("role","dialog"); pop.setAttribute("aria-label",`${NAMES[code]} MPs`);
  pop.innerHTML=`<p style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="swatch" style="background:var(--${code})"></span><b>${NAMES[code]}: ${n} seat${n===1?"":"s"}</b> <span class="thr" style="margin:0">${BLOCS[state.bloc[code]]}</span></p>
    <p class="thr" style="margin:0 0 8px">Who's in, in the most likely Parliament. ${m.seatWins.length} from electorates, ${m.listIn.length} from the list.</p>
    <div class="mpcols">
      <div><p class="mph">Electorate MPs (${m.seatWins.length})</p>${el?`<ul class="mplist">${el}</ul>`:`<p class="thr">None</p>`}</div>
      <div><p class="mph">List MPs (${m.listIn.length})</p>${li?`<ul class="mplist">${li}</ul>`:`<p class="thr">None${m.seatWins.length>=n&&n>0?": its electorate wins fill all its seats":""}</p>`}</div>
    </div>
    <div class="popbtns" style="margin-top:8px"><button class="btn" data-go>See the full ${NAMES[code]} list</button></div>`;
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect(), w=Math.min(620, window.innerWidth-24);
  pop.style.width=w+"px";
  pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12, r.left+r.width/2-w/2))+window.scrollX+"px";
  const h=pop.offsetHeight, below=r.bottom+8;
  pop.style.top=((below+h>window.innerHeight && r.top-h-8>60)? r.top-h-8 : below)+window.scrollY+"px";
  pop.addEventListener("mouseenter",()=>clearTimeout(popTimer));
  pop.addEventListener("mouseleave",schedClose);
  pop.querySelector("[data-go]").onclick=()=>{ closePop(); state.listParty=code; state.listFull=false; drawLists(); document.getElementById("h-lists").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}); };
  setTimeout(()=>document.addEventListener("click",outside),0);
}
function segPop(seg){ const c=seg.dataset.p; if(c==="OTH") ottPop(seg); else partyPop(seg,c); }
function goLever(){
  const btn=document.querySelector('#lv-oth .lvbtn'), body=document.getElementById("b-oth");
  if(body.hidden){ body.hidden=false; btn.setAttribute("aria-expanded","true"); btn.textContent="Hide info"; }
  document.getElementById("lv-oth").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
}
function outside(e){ const p=document.querySelector(".pop"); if(p && !p.contains(e.target)) closePop(); }
function closePop(){ clearTimeout(popTimer); popAnchor=null; document.querySelectorAll(".pop").forEach(p=>p.remove()); document.removeEventListener("click",outside); }
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closePop(); });
function goOth(){
  document.getElementById("seatSearch").value=""; document.getElementById("seatFilter").value="oth"; drawSeatList();
  document.getElementById("h-seats").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
}

/* ---------- 3. Electorates ---------- */
function rating(p){ const m=Math.max(...p); return m>=0.85?["Safe",""]:m>=0.7?["Likely",""]:m>=0.57?["Leans","lean"]:["Toss-up","toss"]; }
function seatCard(i){
  const s=ESEATS[i], est=seatProbs(s,eff()), lock=state.locks[i], sim=state.sim;
  const useSim=sim && !sim.off && state.simSeats;
  const p= useSim ? Array.from(sim.seatWin[i]).map(v=>v/sim.N) : est;
  const lead=argmax(est);
  let [rt,cls]=lock!=null?["Called",""]:!state.simSeats||(sim&&sim.off)?["Goes to",""]:rating(p); if(lock==null&&rt!=="Toss-up") rt+=" "+(s.c[lead].p==="OTH"?s.c[lead].pl:NAMES[s.c[lead].p]);
  const sw=state.sim?state.sim.seatWin[i]:null;
  const fixed=!useSim;
  const chips=s.c.map((c,j)=>({c,j,pr:p[j],e:est[j]})).filter(x=>x.c.w>0).sort((a,b)=>b.e-a.e).map(x=>{
    const pressed=lock===x.j;
    let pct;
    if(lock!=null) pct=pressed?"100%":"0%";
    else if(fixed) pct= x.j===lead?`Wins <span class="est">(${Math.round(x.e*100)}% chance)</span>`:`<span class="est">${x.e<0.01?"<1":Math.round(x.e*100)}% chance</span>`;
    else pct=(x.pr<0.01&&x.pr>0?"<1%":Math.round(x.pr*100)+"%");
    return `<button class="cand${lock==null&&x.j===lead?" lead":""}" data-s="${i}" data-c="${x.j}" aria-pressed="${pressed}" aria-label="${esc(x.c.nm)}, ${esc(x.c.pl)}, ${pct.replace(/<[^>]+>/g,"")}" ${useSim&&lock==null?`data-tip="${esc(x.c.nm)} wins ${esc(s.n)} in ${fmtP(x.pr)} of the ${sim.N.toLocaleString()} simulated elections."`:""}><span class="dot" style="background:${color(x.c.p)}"></span>${esc(x.c.nm)} <span style="color:var(--muted)">${x.c.p==="OTH"||x.c.p==="MIN"?esc(x.c.pl):x.c.p}</span> <b>${pct}</b>${pressed?' <span class="lock">called</span>':""}</button>`; }).join("");
  const topI=argmax(p), topP=p[topI], topC=s.c[topI], who=`${topC.nm} (${topC.p==="OTH"||topC.p==="MIN"?topC.pl:NAMES[topC.p]})`;
  const src=useSim?`of the ${sim.N.toLocaleString()} simulated elections`:"by the model's estimate";
  const cur= lock!=null?null: rt.startsWith("Goes to")?null: rt.split(" ")[0];
  const rows=[["Safe","85% or more"],["Likely","70–85%"],["Leans","57–70%"],["Toss-up","under 57%"]];
  const rateTip= lock!=null ? `<b>Called by you</b><br>Wins this seat in every simulation.`
    : cur==null ? `<b>Not simulated</b><br>Goes to the favourite in every run.`
    : `<table class="ratetbl"><tr><th colspan="2">Chance the leader wins</th></tr>${rows.map(([k,v])=>`<tr class="${k===cur?"cur":""}"><td>${k}</td><td>${v}</td></tr>`).join("")}<tr class="this"><td>This seat</td><td>${fmtP(topP)}</td></tr></table>`;
  return `<div class="seat"><div class="seathead"><span class="name">${esc(s.n)}</span><span class="rate ${cls}" tabindex="0" data-tip="" data-tiphtml="${esc(rateTip)}">${rt}</span></div>
    <div class="cands">${chips}</div><p class="why">Held by ${NAMES[s.held]} in 2023. ${esc(s.note)}</p>
    <details><summary>All ${s.c.length} candidates</summary><p style="margin-top:4px">${s.c.map(c=>`${esc(c.nm)} (${esc(c.pl)})`).join(", ")}</p></details></div>`;
}
function drawSeatNote(){
  const n=document.getElementById("seatModeNote"), sim=state.sim, off=state.err===0;
  document.getElementById("simSeats").checked=state.simSeats; document.getElementById("simSeats").disabled=off;
  n.textContent= off ? "Simulations are off, so every seat goes to its favourite (or your call)."
    : state.simSeats ? "On: each simulated election decides every seat by chance, so a 60% favourite loses about 4 times in 10. The percentages show how often each candidate wins across the simulations."
    : "Off: every seat goes to the highlighted favourite (or your call) in every simulation, so only the party vote varies. The percentages shown are the model's estimates, for reference.";
}
function drawSeatList(){
  drawSeatNote();
  const q=document.getElementById("seatSearch").value.trim().toLowerCase(), f=document.getElementById("seatFilter").value, E=eff(), winners=projectWinners(E), rows=[];
  ESEATS.forEach((s,i)=>{ const p=seatProbs(s,E), w=s.c[winners[i]];
    if(q){ if(!(s.n.toLowerCase().includes(q)||s.c.some(c=>c.nm.toLowerCase().includes(q)))) return; }
    else{ if(f==="key"&&!KEY.includes(s.n)) return; if(f==="close"&&!(Math.max(...p)<0.75&&state.locks[i]==null)) return;
      if(f==="flip"&&w.p===s.held) return; if(f==="maori"&&!s.m) return; if(f==="locked"&&state.locks[i]==null) return; if(f==="oth"&&!s.c.some(c=>c.p==="OTH")) return; }
    rows.push(i); });
  const e=elecCounts(winners);
  document.getElementById("seatSummary").textContent=`If every seat went to its current favourite: ${[...PARTIES,OTH].filter(p=>e[p.c]).sort((a,b)=>e[b.c]-e[a.c]).map(p=>`${NAMES[p.c]} ${e[p.c]}`).join(", ")}. Showing ${rows.length} seat${rows.length===1?"":"s"}.`;
  const el=document.getElementById("seatList");
  el.innerHTML=rows.length?rows.map(seatCard).join(""):`<p class="hint">No seats match. Try "All 71" or a different name.</p>`;
  bindCards(el);
}

/* ---------- 3b. Electorate map ---------- */
const MAPV={view:"list", set:"general", sel:null, vb:null, built:null};
const SHADE={Called:1, Safe:0.9, Likely:0.66, Leans:0.42};
const MAP_MINW=70; // narrowest view, in map units (about 3.5 km)
let mapAnim=0, mapHintTimer=null;
const plab=c=>c.p==="OTH"||c.p==="MIN"?c.pl:NAMES[c.p];
const surname=nm=>nm.split(" ").slice(-1)[0];
function seatOdds(i){
  const s=ESEATS[i], sim=state.sim, lock=state.locks[i], useSim=sim&&!sim.off&&state.simSeats;
  const p= lock!=null ? s.c.map((c,j)=>j===lock?1:0) : useSim ? Array.from(sim.seatWin[i]).map(v=>v/sim.N) : seatProbs(s,eff());
  const ord=s.c.map((c,j)=>j).filter(j=>s.c[j].w>0||p[j]>0).sort((a,b)=>p[b]-p[a]);
  return {p, ord, rt: lock!=null?"Called":rating(p)[0], lock, useSim};
}
function mapSize(){ const r=document.getElementById("mapWrap").getBoundingClientRect(); return {W:Math.max(1,r.width),H:Math.max(1,r.height)}; }
function fitBox(b,pad){ const {W,H}=mapSize(), bw=b[2]-b[0], bh=b[3]-b[1], w=Math.max(MAP_MINW,Math.max(bw,bh*W/H)*(1+2*pad)), h=w*H/W;
  return {x:(b[0]+b[2])/2-w/2, y:(b[1]+b[3])/2-h/2, w, h}; }
const fullView=()=>fitBox(MAP.box,0.03);
function clampV(v){
  const {W,H}=mapSize(), B=MAP.box, w=Math.min(Math.max(v.w,MAP_MINW),fullView().w*1.6), h=w*H/W;
  const cx=Math.min(B[2],Math.max(B[0],v.x+v.w/2)), cy=Math.min(B[3],Math.max(B[1],v.y+v.h/2));
  return {x:cx-w/2, y:cy-h/2, w, h};
}
function setView(t, animate){
  cancelAnimationFrame(mapAnim);
  const to=clampV(t), from=MAPV.vb;
  if(!animate || !from || matchMedia("(prefers-reduced-motion: reduce)").matches){ MAPV.vb=to; applyView(); return; }
  const t0=performance.now(), D=450, fc=[from.x+from.w/2,from.y+from.h/2], tc=[to.x+to.w/2,to.y+to.h/2];
  const step=now=>{ const u=Math.min(1,(now-t0)/D), e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
    const w=from.w*Math.pow(to.w/from.w,e), h=w*to.h/to.w, cx=fc[0]+(tc[0]-fc[0])*e, cy=fc[1]+(tc[1]-fc[1])*e;
    MAPV.vb={x:cx-w/2, y:cy-h/2, w, h}; applyView(); if(u<1) mapAnim=requestAnimationFrame(step); };
  mapAnim=requestAnimationFrame(step);
}
function zoomBy(k){ const v=MAPV.vb, cx=v.x+v.w/2, cy=v.y+v.h/2; setView({x:cx-v.w*k/2, y:cy-v.h*k/2, w:v.w*k, h:v.h*k}, true); }
function applyView(){
  const v=MAPV.vb, svg=document.getElementById("seatMap"); if(!v||MAPV.built==null) return;
  svg.setAttribute("viewBox",`${v.x} ${v.y} ${v.w} ${v.h}`);
  const sc=mapSize().W/v.w, S=8/sc;
  svg.querySelectorAll("pattern").forEach(p=>{ p.setAttribute("width",S); p.setAttribute("height",S);
    const [a,b]=p.children; a.setAttribute("width",S); a.setAttribute("height",S); b.setAttribute("width",S/2); b.setAttribute("height",S); });
  MAP[MAPV.built].forEach((e,k)=>{ const t=svg.querySelector(`text[data-k="${k}"]`); if(!t) return;
    const bw=(e.b[2]-e.b[0])*sc, bh=(e.b[3]-e.b[1])*sc, on=bw>78&&bh>30, two=bh>64;
    t.setAttribute("visibility",on?"visible":"hidden"); t.setAttribute("font-size",(12/sc).toFixed(3)); t.setAttribute("stroke-width",(3/sc).toFixed(3));
    if(t.lastChild) t.lastChild.setAttribute("visibility",two?"inherit":"hidden"); });
}
function buildMap(){
  const set=MAP[MAPV.set], svg=document.getElementById("seatMap");
  svg.innerHTML=`<defs>${set.map((e,k)=>`<pattern id="mp${k}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect/><rect/></pattern>`).join("")}</defs>`
    +`<g>${set.map((e,k)=>`<path class="el" data-k="${k}" data-i="${SEAT_IDX[e.n]}" d="${e.d}" fill-rule="evenodd" tabindex="0" role="button"></path>`).join("")}</g>`
    +`<g>${set.map((e,k)=>`<text class="maplab" data-k="${k}" x="${e.l[0]}" y="${e.l[1]}"></text>`).join("")}</g>`;
  MAPV.built=MAPV.set;
}
function paintMap(){
  if(MAPV.view!=="map") return;
  if(MAPV.built!==MAPV.set) buildMap();
  if(!MAPV.vb) MAPV.vb=clampV(fullView());
  const svg=document.getElementById("seatMap");
  MAP[MAPV.set].forEach((e,k)=>{
    const i=SEAT_IDX[e.n], s=ESEATS[i], o=seatOdds(i), a=s.c[o.ord[0]], b=s.c[o.ord[1]]||a, pa=o.p[o.ord[0]];
    const path=svg.querySelector(`path[data-k="${k}"]`), pat=svg.getElementById("mp"+k);
    if(o.rt==="Toss-up"){ pat.children[0].setAttribute("fill",color(a.p)); pat.children[1].setAttribute("fill",color(b.p));
      path.setAttribute("fill",`url(#mp${k})`); path.setAttribute("fill-opacity",0.8); }
    else { path.setAttribute("fill",color(a.p)); path.setAttribute("fill-opacity",SHADE[o.rt]); }
    const desc= o.lock!=null ? `called for ${a.nm} (${plab(a)})` : o.rt==="Toss-up" ? `toss-up: ${a.nm} (${plab(a)}) ${fmtP(pa)}, ${b.nm} (${plab(b)}) ${fmtP(o.p[o.ord[1]])}` : `${o.rt.toLowerCase()} ${plab(a)}: ${a.nm} ${fmtP(pa)}`;
    path.setAttribute("aria-label",`${s.n}, ${desc}`); path.dataset.desc=desc;
    path.classList.toggle("sel",MAPV.sel===i);
    svg.querySelector(`text[data-k="${k}"]`).innerHTML=`<tspan x="${e.l[0]}" dy="-0.1em">${esc(s.n)}</tspan><tspan class="sub" x="${e.l[0]}" dy="1.2em">${esc(surname(a.nm))} ${o.lock!=null?"(called)":fmtP(pa)}</tspan>`;
  });
  const sel=svg.querySelector("path.el.sel"); if(sel) sel.parentNode.appendChild(sel); // draw the selected outline on top
  drawMapSide(); applyView();
}
function drawMapSide(){
  const el=document.getElementById("mapSide"), set=MAP[MAPV.set];
  document.getElementById("mapGo").value= MAPV.sel==null?"":String(MAPV.sel);
  if(MAPV.sel!=null){
    el.innerHTML=seatCard(MAPV.sel)+`<div class="presets back"><button class="btn" id="mapBack">Back to all electorates</button></div>`;
    bindCards(el);
    document.getElementById("mapBack").onclick=()=>{ MAPV.sel=null; paintMap(); setView(fullView(),true); };
    return;
  }
  const t={}; set.forEach(e=>{ const i=SEAT_IDX[e.n], o=seatOdds(i), c=ESEATS[i].c[o.ord[0]], key=c.p==="MIN"||c.p==="OTH"?c.pl:c.p;
    (t[key]=t[key]||{c:c.p==="MIN"?"MIN":c.p,label:plab(c),n:0}).n++; });
  const rows=Object.values(t).sort((a,b)=>b.n-a.n).map(x=>`<li><span class="swatch" style="background:${color(x.c)}"></span>${esc(x.label)}<span class="n">${x.n}</span></li>`).join("");
  el.innerHTML=`<div class="empty"><p><b>Tap or click an electorate</b> to see its candidates and their chances, and to call the seat. Drag to move around; pinch, or hold Ctrl or ⌘ and scroll, to zoom.</p>
    <p style="margin-top:10px">Who's ahead in the ${set.length} ${MAPV.set==="general"?"general":"Māori"} electorates:</p><ul class="tally">${rows}</ul></div>`;
}
function selectSeat(i, zoom){
  track("Map electorate",{electorate:ESEATS[i].n});
  const set=ESEATS[i].m?"maori":"general";
  if(set!==MAPV.set){ MAPV.set=set; document.querySelectorAll("#mapSet button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.m===set)); }
  MAPV.sel=i; paintMap();
  if(zoom){ const e=MAP[set].find(x=>x.n===ESEATS[i].n); setView(fitBox(e.b,0.3),true); }
}
function mapHint(txt){ const h=document.getElementById("mapHint"); h.textContent=txt; h.hidden=false; clearTimeout(mapHintTimer); mapHintTimer=setTimeout(()=>h.hidden=true,1600); }
function setSeatView(v){
  MAPV.view=v;
  document.querySelectorAll("#seatView button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===v));
  document.getElementById("seatMapView").hidden= v!=="map"; document.getElementById("seatListView").hidden= v==="map";
  document.getElementById("seatSection").classList.toggle("mapmode",v==="map");
  if(v==="map") paintMap();
}
function bindMap(){
  const svg=document.getElementById("seatMap"), wrap=document.getElementById("mapWrap"), tip=document.getElementById("mapTip");
  document.querySelectorAll("#seatView button").forEach(b=>b.onclick=()=>setSeatView(b.dataset.v));
  document.querySelectorAll("#mapSet button").forEach(b=>b.onclick=()=>{ if(MAPV.set===b.dataset.m) return; MAPV.set=b.dataset.m; MAPV.sel=null;
    document.querySelectorAll("#mapSet button").forEach(x=>x.setAttribute("aria-pressed",x===b)); paintMap(); });
  const go=document.getElementById("mapGo"), opt=m=>ESEATS.map((s,i)=>({s,i})).filter(x=>x.s.m===m).sort((a,b)=>a.s.n.localeCompare(b.s.n)).map(x=>`<option value="${x.i}">${esc(x.s.n)}</option>`).join("");
  go.innerHTML=`<option value="">Choose an electorate</option><optgroup label="General electorates">${opt(false)}</optgroup><optgroup label="Māori electorates">${opt(true)}</optgroup>`;
  go.onchange=()=>{ if(go.value!=="") selectSeat(+go.value,true); };
  const rg=document.getElementById("mapRegions");
  rg.innerHTML=`<button class="btn" data-r="-1">All of New Zealand</button>`+MAP.regions.map((r,k)=>`<button class="btn" data-r="${k}">${esc(r.n)}</button>`).join("");
  rg.querySelectorAll("button").forEach(b=>b.onclick=()=>{ const k=+b.dataset.r; setView(k<0?fullView():fitBox(MAP.regions[k].b,0.02),true); });
  document.getElementById("mapIn").onclick=()=>zoomBy(0.5);
  document.getElementById("mapOut").onclick=()=>zoomBy(2);
  document.getElementById("mapAll").onclick=()=>setView(fullView(),true);
  const lg=[["Called by you",1],["Safe: 85% or more",0.9],["Likely: 70–85%",0.66],["Leans: 57–70%",0.42]];
  document.getElementById("mapLegend").innerHTML=`<span class="lead">Colour shows who's ahead. The stronger the colour, the surer the result; stripes mean a toss-up between the top two.</span>`
    +lg.map(([l,o])=>`<span class="lg"><i style="background:var(--ink);opacity:${o}"></i>${l}</span>`).join("")
    +`<span class="lg"><i style="background:repeating-linear-gradient(45deg,var(--ink) 0 3px,var(--muted) 3px 6px);opacity:.8"></i>Toss-up: under 57%</span>`;
  document.getElementById("mapNote").textContent=`${MAP.source}. The Chatham Islands, part of Wellington Bays and Te Tai Tonga, aren't shown. Chances are the same as in the list view.`;
  // drag, pinch and click
  const ptrs=new Map(); let g0=null, moved=false;
  const toUser=(x,y,inv)=>new DOMPoint(x,y).matrixTransform(inv);
  const mid=()=>{ const p=[...ptrs.values()]; return {x:p.reduce((a,q)=>a+q.x,0)/p.length, y:p.reduce((a,q)=>a+q.y,0)/p.length, d:p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0}; };
  const begin=()=>{ const inv=svg.getScreenCTM().inverse(), m=mid(); g0={inv, vb:{...MAPV.vb}, m:toUser(m.x,m.y,inv), d:m.d}; };
  svg.addEventListener("pointerdown",e=>{ if(e.button>0||!MAPV.vb) return; cancelAnimationFrame(mapAnim); svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t:e.target.closest("path.el")}); if(ptrs.size===1) moved=false; begin(); tip.hidden=true; });
  svg.addEventListener("pointermove",e=>{
    const p=ptrs.get(e.pointerId);
    if(!p){ const el=e.target.closest("path.el"); if(!el||e.pointerType!=="mouse"){ tip.hidden=true; return; }
      const wr=wrap.getBoundingClientRect(); tip.innerHTML=`<b>${esc(ESEATS[+el.dataset.i].n)}</b><br>${esc(el.dataset.desc.replace(/^./,c=>c.toUpperCase()))}`;
      tip.hidden=false; tip.style.left=Math.max(tip.offsetWidth/2+4,Math.min(wr.width-tip.offsetWidth/2-4,e.clientX-wr.left))+"px"; tip.style.top=(e.clientY-wr.top-8)+"px"; return; }
    p.x=e.clientX; p.y=e.clientY; if(Math.hypot(p.x-p.x0,p.y-p.y0)>5||ptrs.size>1){ moved=true; svg.classList.add("dragging"); }
    if(!moved) return;
    const m=mid(), u=toUser(m.x,m.y,g0.inv), k=ptrs.size>1&&g0.d&&m.d?g0.d/m.d:1;
    MAPV.vb=clampV({x:g0.m.x-(u.x-g0.vb.x)*k, y:g0.m.y-(u.y-g0.vb.y)*k, w:g0.vb.w*k, h:g0.vb.h*k}); applyView();
  });
  const end=e=>{ const p=ptrs.get(e.pointerId); if(!p) return; ptrs.delete(e.pointerId);
    if(!ptrs.size){ svg.classList.remove("dragging"); if(!moved&&p.t&&e.type==="pointerup") selectSeat(+p.t.dataset.i,false); }
    else begin(); };
  svg.addEventListener("pointerup",end); svg.addEventListener("pointercancel",end);
  svg.addEventListener("pointerleave",e=>{ if(e.pointerType==="mouse") tip.hidden=true; });
  svg.addEventListener("wheel",e=>{ if(!MAPV.vb) return;
    if(!(e.ctrlKey||e.metaKey)){ mapHint("Hold Ctrl or ⌘ and scroll to zoom"); return; }
    e.preventDefault(); cancelAnimationFrame(mapAnim);
    const u=toUser(e.clientX,e.clientY,svg.getScreenCTM().inverse()), v=MAPV.vb, k=Math.exp(Math.max(-60,Math.min(60,e.deltaY))*0.012);
    MAPV.vb=clampV({x:u.x-(u.x-v.x)*k, y:u.y-(u.y-v.y)*k, w:v.w*k, h:v.h*k}); applyView(); },{passive:false});
  svg.addEventListener("keydown",e=>{ const el=e.target.closest("path.el"); if(el&&(e.key==="Enter"||e.key===" ")){ e.preventDefault(); selectSeat(+el.dataset.i,true); } });
  new ResizeObserver(()=>{ if(MAPV.view==="map"&&MAPV.vb) MAPV.vb=clampV(MAPV.vb), applyView(); }).observe(wrap);
}

/* ---------- 4. Lists ---------- */
function listRows(pc, limit, detail){
  const sim=state.sim, rep=sim.rep, m=members(rep)[pc], list=LISTS[pc]||[], N=sim.N, pi=sim.codes.indexOf(pc);
  const lastIn=m.listIn.length?m.listIn[m.listIn.length-1]:null; let firstOut=null;
  for(const n of list){ if(!m.won.has(n)&&!m.listIn.includes(n)){ firstOut=n; break; } }
  const cut=firstOut!=null?list.indexOf(firstOut):list.length;
  const showTo=limit==null?Math.min(list.length,cut+8):Math.min(list.length,limit);
  const pill=p=>`<span class="chance ${p>=0.7?"hi":p>=0.3?"mid":"lo"}">${fmtP(p)}</span>`;
  const rows=[];
  for(let r=0;r<showTo;r++){ const n=list[r], st=STAND[pc+"|"+n], seatName=st?ESEATS[st.i].n:"List only";
    const status= m.won.has(n)?`<span class="status st-seat">Wins ${esc(seatName)}</span>`: n===lastIn?`<span class="status st-last">Last in</span>`: m.listIn.includes(n)?`<span class="status st-in">In from list</span>`: n===firstOut?`<span class="status st-edge">First out</span>`:`<span class="status st-out">Out</span>`;
    let sub="", totTip="";
    if(detail){ const pS=st?sim.seatWin[st.i][st.j]/N:0, pL=sim.listIn[pi][r]/N;
      const T=(txt,val)=>`<span class="tipnum" tabindex="0" data-tip="${esc(txt)}">${val}</span>`;
      const tS=T(`In ${fmtP(pS)} of the ${N.toLocaleString()} simulated elections, ${n} wins ${seatName}.`,fmtP(pS));
      const tL=T(st?`In another ${fmtP(pL)} of runs, ${n} loses ${seatName}, but ${NAMES[pc]} wins enough list seats to reach #${r+1} on its list, so they still get in.`:`${n} isn't standing in an electorate. In ${fmtP(pL)} of runs, ${NAMES[pc]} wins enough list seats to reach #${r+1} on its list.`,fmtP(pL));
      const plus= pL>=0.01?`, plus ${tL} through the list when they lose it`:"";
      sub= !st?`<span class="rsub">List only: in through the list in ${tL} of runs</span>`
        : pS>=0.9?`<span class="rsub">Safe in ${esc(seatName)}: wins it in ${tS} of runs${plus}</span>`
        : `<span class="rsub">Wins ${esc(seatName)} in ${tS} of runs${pL>=0.01?plus:"; list place too low to help if they lose"}</span>`;
      totTip= st?`Total chance ${n} is in Parliament: ${fmtP(pS)} from winning ${seatName}${pL>=0.01?` plus ${fmtP(pL)} from the list`:""} = ${fmtP(pIn(pc,n))}.`:`Total chance ${n} is in Parliament, all through the list: ${fmtP(pIn(pc,n))}.`; }
    rows.push(`<tr class="${n===firstOut?"cut":""}"><td>${r+1}</td><td style="white-space:normal">${esc(n)}${sub}</td><td style="text-align:left">${esc(seatName)}</td><td style="text-align:left">${status}</td><td>${detail?`<span class="tipnum" tabindex="0" data-tip="${esc(totTip)}">${pill(pIn(pc,n))}</span>`:fmtP(pIn(pc,n))}</td></tr>`);
  }
  return {rows,cut,firstOut,lastIn,m};
}
function drawLists(){
  const sim=state.sim; if(!sim) return;
  const rep=sim.rep, mem=members(rep), pc=state.listParty, m=mem[pc], list=LISTS[pc]||[];
  document.getElementById("listParty").innerHTML=PARTIES.map(p=>`<button data-p="${p.c}" aria-pressed="${p.c===pc}">${swatch(p.c)}${p.n}</button>`).join("");
  document.querySelectorAll("#listParty button").forEach(b=>b.onclick=()=>{ state.listParty=b.dataset.p; state.listFull=false; drawLists(); });
  const seats=rep.seats[pc], sw=m.seatWins.length, li=m.listIn.length;
  document.getElementById("listSummary").textContent= seats===0?`${NAMES[pc]} wins no seats in the most likely Parliament.`:`${NAMES[pc]}: ${seats} seat${seats>1?"s":""}, ${sw} from electorates and ${li} from the list.`;
  const {rows,cut}=listRows(pc,state.listFull?1e9:null,false);
  document.getElementById("listBody").innerHTML=rows.join("");
  const more=document.getElementById("listMore"); more.hidden=list.length<=cut+8&&!state.listFull;
  more.textContent=state.listFull?"Show fewer":`Show all ${list.length} on the list`; more.onclick=()=>{ state.listFull=!state.listFull; drawLists(); };

}

/* ---------- custom blocs ---------- */
const CB_COLORS=["#7F77DD","#1D9E75","#D85A30","#D4537E","#378ADD","#BA7517","#5F5E5A"];
const CB_KEY="nzSeatForecast.customBlocs.v1";
const CB_PRESETS=[
  {name:"Labour, Greens and Opportunity",parties:["LAB","GRN","OPP"],leader:"LAB",color:"#D85A30"},
  {name:"National, ACT, NZ First and Opportunity",parties:["NAT","ACT","NZF","OPP"],leader:"NAT",color:"#378ADD"},
  {name:"Labour, Greens and Te Pāti Māori",parties:["LAB","GRN","TPM"],leader:"LAB",color:"#D4537E"},
  {name:"Grand coalition: National and Labour",parties:["NAT","LAB"],leader:null,color:"#7F77DD"},
];
state.custom=(()=>{ try{ const v=JSON.parse(localStorage.getItem(CB_KEY)||"null"); if(Array.isArray(v)) return v; }catch(e){} return []; })();
function saveCustom(){ try{ localStorage.setItem(CB_KEY, JSON.stringify(state.custom)); }catch(e){} }
let cbSeq=Date.now();
function addBloc(p){ state.custom.push({id:"b"+(cbSeq++), name:p?.name||`Bloc ${state.custom.length+1}`, color:p?.color||CB_COLORS[state.custom.length%CB_COLORS.length], parties:[...(p?.parties||[])], leader:p?.leader||null}); saveCustom(); drawCustom(); }
function blocStats(bl){
  const sim=state.sim; if(!sim) return null; const N=sim.N, idx=bl.parties.filter(c=>c!=="OTH").map(c=>sim.codes.indexOf(c)).filter(i=>i>=0), oth=bl.parties.includes("OTH");
  const arr=new Int16Array(N); let win=0; const short=[];
  for(let s=0;s<N;s++){ let t=oth?sim.othS[s]:0; for(const i of idx) t+=sim.seatsS[i][s]; arr[s]=t; const maj=Math.floor(sim.totS[s]/2)+1; if(t>=maj) win++; else short.push(maj-t); }
  const srt=Array.from(arr).sort((a,b)=>a-b), q=f=>srt[Math.min(N-1,Math.floor(f*N))];
  short.sort((a,b)=>a-b);
  return {p:win/N, med:q(0.5), lo:q(0.1), hi:q(0.9), short:short.length?short[Math.floor(short.length/2)]:0, majMed:Math.floor(sim.modeTot/2)+1};
}
function drawCustom(){
  const pr=document.getElementById("customPresets");
  const key=a=>[...a].sort().join("+");
  const have=new Set(state.custom.map(bl=>key(bl.parties)));
  pr.innerHTML=`<span class="thr" style="align-self:center;margin:0">Quick add:</span>`+CB_PRESETS.map((p,i)=>{ const dup=have.has(key(p.parties));
    return `<button class="btn${dup?" added":""}" data-i="${i}" ${dup?'disabled aria-disabled="true" title="Already in your custom blocs"':""}>${dup?"✓ ":""}${esc(p.name)}</button>`; }).join("");
  pr.querySelectorAll("button:not([disabled])").forEach(b=>b.onclick=()=>{ const p=CB_PRESETS[+b.dataset.i]; if(state.custom.some(bl=>key(bl.parties)===key(p.parties))) return; addBloc(p); });
  document.getElementById("addBloc").onclick=()=>addBloc();
  const list=document.getElementById("customList");
  if(!state.custom.length){ list.innerHTML=`<p class="cbempty">No custom blocs yet. Add one, or start from a quick-add coalition above.</p>`; return; }
  const all=[...PARTIES,OTH];
  list.innerHTML=state.custom.map(bl=>{
    const st=blocStats(bl), maxS=Math.max(80,(st?st.hi:0)+5), pos=v=>(v/maxS*100).toFixed(1)+"%";
    const members=bl.parties.length;
    const res= !st?`<p class="cbempty">Waiting for simulations…</p>` : !members?`<p class="cbempty">Tick at least one party.</p>` :
      `<div class="cbres"><span class="big" style="color:${bl.color}">${fmtP(st.p)}</span><span class="lab">chance of a majority on its own${st.p<1&&st.short?`; when it falls short, it's typically ${st.short} seat${st.short>1?"s":""} away`:""}</span>
       <span></span><span class="lab">Most likely <b style="color:var(--ink)">${st.med} seats</b> (80% of runs between ${st.lo} and ${st.hi}); about ${st.majMed} needed</span></div>
       <div class="cbbar" aria-hidden="true"><i style="left:${pos(st.lo)};width:calc(${pos(st.hi)} - ${pos(st.lo)});background:${bl.color}"></i><b style="left:${pos(st.med)};background:${bl.color}"></b><span class="mj" style="left:${pos(st.majMed)}" title="Majority"></span></div>`;
    return `<div class="cb" style="--cbc:${bl.color}" data-id="${bl.id}">
      <div class="cbhead"><input class="cbname" value="${esc(bl.name)}" aria-label="Bloc name">
        <div class="cbtools">
          <div class="swatches" role="group" aria-label="Colour">${CB_COLORS.map(cl=>`<button data-col="${cl}" style="background:${cl}" aria-pressed="${bl.color===cl}" aria-label="Colour ${cl}"></button>`).join("")}</div>
          <button class="cbdel" data-del>Delete</button>
        </div></div>
      <div class="cbparties" role="group" aria-label="Parties in ${esc(bl.name)}">${all.map(p=>{ const on=bl.parties.includes(p.c);
        return `<button data-p="${p.c}" aria-pressed="${on}">${swatch(p.c)}${p.n}</button>`; }).join("")}</div>
      ${res}</div>`;
  }).join("");
  list.querySelectorAll(".cb").forEach(card=>{
    const bl=state.custom.find(x=>x.id===card.dataset.id);
    card.querySelector(".cbname").onchange=e=>{ bl.name=e.target.value.trim()||bl.name; saveCustom(); drawCustom(); };
    card.querySelectorAll("[data-col]").forEach(b=>b.onclick=()=>{ bl.color=b.dataset.col; saveCustom(); drawCustom(); });
    card.querySelector("[data-del]").onclick=()=>{ state.custom=state.custom.filter(x=>x!==bl); saveCustom(); drawCustom(); };
    card.querySelectorAll(".cbparties button").forEach(b=>b.onclick=()=>{ const c=b.dataset.p;
      bl.parties= bl.parties.includes(c)? bl.parties.filter(x=>x!==c) : [...bl.parties,c]; saveCustom(); drawCustom(); });
  });
}

/* ---------- 5. More tools ---------- */
function drawVotes(){
  const party=document.getElementById("vparty").value, amt=parseInt(document.getElementById("vamt").value,10);
  const steps=160, ppv=100/TOTAL_VOTES, E=eff(), winners=projectWinners(E), base=compute(E,winners);
  const xs=[], series={}; const parts=[...PARTIES.filter(p=>base.seats[p.c]>0||p.c===party)];
  parts.forEach(p=>series[p.c]=[]);
  const results=[];
  for(let j=0;j<=steps;j++){
    const v=-amt+2*amt*j/steps, delta=v*ppv, sh={...E}; sh[party]=Math.max(0,sh[party]+delta);
    const res=compute(sh,winners,100+delta); xs.push(v); results.push(res); parts.forEach(p=>series[p.c].push(res.seats[p.c]));
  }
  // describe changes moving outward from today's result, so gains read as gains and losses as losses
  const mid=steps/2, evUp=[], evDown=[];
  const diff=(from,to,v,list)=>{ const ch=[]; parts.forEach(p=>{ const d=to.seats[p.c]-from.seats[p.c]; if(d) ch.push({c:p.c,d}); }); if(!ch.length) return;
    const A=members(from), B=members(to), who=[];
    PARTIES.forEach(p=>{ const a=new Set(A[p.c].listIn), b=new Set(B[p.c].listIn); B[p.c].listIn.filter(n=>!a.has(n)).forEach(n=>who.push(`${esc(n)} in`)); A[p.c].listIn.filter(n=>!b.has(n)).forEach(n=>who.push(`${esc(n)} out`)); });
    list.push(`<li><b>${v>=0?"+":"−"}${fmt(Math.abs(Math.round(v/100)*100))} votes:</b> ${ch.map(x=>`${NAMES[x.c]} ${x.d>0?"+":""}${x.d}`).join(", ")}${who.length?` (${who.join(", ")})`:""}</li>`); };
  for(let j=mid+1;j<=steps;j++) diff(results[j-1],results[j],xs[j],evUp);
  for(let j=mid-1;j>=0;j--) diff(results[j+1],results[j],xs[j],evDown);
  const s0=base.seats[party], sMin=Math.min(...series[party]), sMax=Math.max(...series[party]);
  document.getElementById("vsummary").textContent= sMin===sMax ? `Within ±${fmt(amt)} votes, ${NAMES[party]} stays on ${s0} seats.` : `Within ±${fmt(amt)} votes, ${NAMES[party]} ranges from ${sMin} to ${sMax} seats (now ${s0}).`;
  // chart
  const W=680,H=340,L=44,R=86,T=14,B=40, yMax=Math.ceil((Math.max(...parts.map(p=>Math.max(...series[p.c])))+2)/5)*5;
  const X=v=>L+(W-L-R)*(v+amt)/(2*amt), Y=n=>T+(H-T-B)*(1-n/yMax);
  let g="";
  for(let n=0;n<=yMax;n+=5) g+=`<line class="ax" x1="${L}" x2="${W-R}" y1="${Y(n)}" y2="${Y(n)}"/><text x="${L-8}" y="${Y(n)+4}" text-anchor="end">${n}</text>`;
  [-1,-0.5,0,0.5,1].forEach(f=>{ const v=amt*f; g+=`<text x="${X(v)}" y="${H-B+18}" text-anchor="middle">${v===0?"0":(v>0?"+":"−")+fmt(Math.abs(v))}</text>`; });
  g+=`<line class="zero" x1="${X(0)}" x2="${X(0)}" y1="${T}" y2="${H-B}"/>`;
  g+=`<text x="${(L+W-R)/2}" y="${H-4}" text-anchor="middle">Change in ${NAMES[party]}'s party votes</text>`;
  g+=`<text transform="translate(12 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">Seats</text>`;
  const ord=[...parts].sort((a,b)=>(a.c===party)-(b.c===party));
  const off={}; parts.forEach((p,k)=>off[p.c]=(k-(parts.length-1)/2)*1.6); // nudge lines apart so equal seat counts don't hide each other
  ord.forEach(p=>{ const ys=series[p.c], o=off[p.c]; let d=`M${X(xs[0]).toFixed(1)},${(Y(ys[0])+o).toFixed(1)}`;
    for(let j=1;j<xs.length;j++){ d+=` H${X(xs[j]).toFixed(1)}`; if(ys[j]!==ys[j-1]) d+=` V${(Y(ys[j])+o).toFixed(1)}`; }
    g+=`<path class="ln${p.c===party?" sel":""}" d="${d}" stroke="var(--${p.c})" opacity="${p.c===party?1:.75}"/>`; });
  // end labels with collision avoidance
  const labs=parts.map(p=>({c:p.c,n:series[p.c][xs.length-1],y:Y(series[p.c][xs.length-1])})).sort((a,b)=>a.y-b.y);
  for(let k=1;k<labs.length;k++) if(labs[k].y-labs[k-1].y<12) labs[k].y=labs[k-1].y+12;
  labs.forEach(l=>g+=`<text class="endlab" x="${W-R+6}" y="${(l.y+4).toFixed(1)}" style="fill:var(--${l.c})">${l.c==="OTH"?"Ind":l.c} ${l.n}</text>`);
  g+=`<line class="cross" id="vcross" x1="0" x2="0" y1="${T}" y2="${H-B}" visibility="hidden"/>`;
  g+=`<rect id="vhit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/>`;
  const svg=document.getElementById("stair"); svg.innerHTML=g;
  document.getElementById("vlegend").innerHTML=parts.map(p=>`<span>${swatch(p.c)}${p.n}${p.c===party?" (votes changing)":""}</span>`).join("");
  document.getElementById("vevents").innerHTML=`<li class="evh">If ${NAMES[party]} gains votes</li>${evUp.join("")||"<li>No seat changes hands.</li>"}<li class="evh">If ${NAMES[party]} loses votes</li>${evDown.join("")||"<li>No seat changes hands.</li>"}`;
  // hover
  const hit=document.getElementById("vhit"), cross=document.getElementById("vcross"), tip=document.getElementById("vtip"), wrap=document.getElementById("vchartwrap");
  const move=e=>{ const r=svg.getBoundingClientRect(), sx=(e.clientX-r.left)*W/r.width; const j=Math.max(0,Math.min(xs.length-1,Math.round((sx-L)/(W-L-R)*steps)));
    cross.setAttribute("x1",X(xs[j])); cross.setAttribute("x2",X(xs[j])); cross.setAttribute("visibility","visible");
    const v=xs[j]; tip.innerHTML=`<b>${v>=0?"+":"−"}${fmt(Math.abs(Math.round(v/100)*100))} votes for ${NAMES[party]}</b><table>${[...parts].sort((a,b)=>series[b.c][j]-series[a.c][j]).map(p=>`<tr><td>${swatch(p.c)}${p.n}</td><td>${series[p.c][j]}</td></tr>`).join("")}</table>`;
    tip.hidden=false; const wr=wrap.getBoundingClientRect(), px=e.clientX-wr.left; tip.style.left=(px>wr.width/2?px-tip.offsetWidth-12:px+12)+"px"; tip.style.top="10px"; };
  hit.onpointermove=move; hit.onpointerdown=move; hit.onpointerleave=()=>{ tip.hidden=true; cross.setAttribute("visibility","hidden"); };
}
/* ---------- controls ---------- */
function buildControls(){
  { const now=new Date(), d=Math.round((new Date(2026,10,7)-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/864e5);
    document.getElementById("daysLeft").textContent= d>1?` · ${d} days to go`: d===1?" · tomorrow": d===0?" · today":""; }
  const sel=document.getElementById("scenario");
  sel.innerHTML=`<option value="0">Latest poll: ${POLLS[0].id}</option><option value="avg">Average of ${POLLS.filter(p=>p.inc).length} polls since 1 Sep</option><optgroup label="Earlier polls">`+POLLS.slice(1).map((p,i)=>`<option value="${i+1}">${p.id}</option>`).join("")+`</optgroup>`+`<option value="custom" disabled>Custom (edited)</option>`;
  sel.onchange=()=>{ state.shares={...(sel.value==="avg"?AVG:POLLS[+sel.value].s)}; state.pollBase={...state.shares}; state.pollName=sel.value==="avg"?"Poll average":POLLS[+sel.value].id; syncVotes(); syncLevers(); update(); };
  document.getElementById("nsim").onchange=update;
  const tr=document.getElementById("trend"); tr.oninput=()=>{ state.trend=+tr.value; drawCampaign(); syncLevers(); update(true); }; tr.onchange=()=>{ state.trend=+tr.value; update(); };
  const sq=document.getElementById("squeeze"); sq.oninput=()=>{ state.squeeze=+sq.value; drawCampaign(); syncLevers(); simStatus("st-opp","drag"); update(true); }; sq.onchange=()=>{ state.squeeze=+sq.value; simStatus("st-opp","full"); update(); };
  document.getElementById("simAll").onchange=e=>{ if(e.target.checked){ state.err=state.prevErr||1.6; } else { if(state.err!==0) state.prevErr=state.err; state.err=0; } syncLevers(); drawSeatList(); update(); };
  document.getElementById("simSeats").onchange=e=>{ state.simSeats=e.target.checked; drawSeatList(); update(); };
  const ov=document.getElementById("oppVote"); ov.oninput=()=>{ state.shares.OPP=+ov.value; sel.value="custom"; syncVotes(); syncLevers(); simStatus("st-opp","drag"); update(true); }; ov.onchange=()=>{ simStatus("st-opp","full"); update(); };
  const sp=document.getElementById("split"); sp.oninput=()=>{ state.split=+sp.value; syncLevers(); simStatus("st-split","drag"); update(true); }; sp.onchange=()=>{ state.split=+sp.value; syncLevers(); simStatus("st-split","full"); update(); };
  document.querySelectorAll("#errSeg button").forEach(b=>b.onclick=()=>{ if(state.err!==0) state.prevErr=state.err; state.err=+b.dataset.k; if(state.err!==0) state.prevErr=state.err; syncLevers(); drawSeatList(); update(); });
  document.getElementById("corr").onchange=e=>{ state.corr=e.target.checked; update(); };
  const doReset=()=>{ state.swing=0; state.split=0; state.trend=0; state.squeeze=0; state.oppMode="direct"; state.squeezeTo={LAB:35,NAT:25,GRN:20,NZF:10,ACT:5,NONE:5}; const st=document.getElementById("sqTo"); if(st) delete st.dataset.built; state.err=1.6; state.corr=true; state.shares={...POLLS[0].s}; state.pollBase={...POLLS[0].s}; state.pollName=POLLS[0].id; sel.value="0"; syncVotes(); syncLevers(); update(); };
  document.getElementById("resetLevers").onclick=doReset; document.getElementById("dockReset").onclick=doReset;
  document.getElementById("votes").innerHTML=PARTIES.map(p=>`<div class="prow"><span class="pn">${swatch(p.c)}${p.n}</span>
    <input type="range" min="0" max="45" step="0.1" data-p="${p.c}" aria-label="${p.n} party vote"><input type="number" min="0" max="60" step="0.1" data-p="${p.c}" aria-label="${p.n} party vote percent"></div>`).join("");
  document.querySelectorAll("#votes input").forEach(inp=>inp.oninput=()=>{ const v=parseFloat(inp.value); if(isNaN(v)) return; state.shares[inp.dataset.p]=Math.max(0,v); sel.value="custom"; syncVotes(inp); syncLevers(); update(inp.type==="range"); }); document.querySelectorAll("#votes input[type=range]").forEach(inp=>inp.onchange=()=>update());
  syncVotes();
  const pr=document.getElementById("presets");
  pr.innerHTML=PRESETS.map((p,i)=>`<button class="btn" data-i="${i}">${p.n}</button>`).join("");
  pr.querySelectorAll("button").forEach(b=>b.onclick=()=>{ const x=PRESETS[+b.dataset.i]; if(!x.set) state.locks={}; else x.set.forEach(([sn,cn])=>{ const i=SEAT_IDX[sn], j=ESEATS[i].c.findIndex(c=>c.nm===cn); if(j>=0) state.locks[i]=j; }); drawSeatList(); update(); });
  document.getElementById("seatSearch").oninput=drawSeatList; document.getElementById("seatFilter").onchange=drawSeatList;
  document.getElementById("clearLocks").onclick=()=>{ state.locks={}; drawSeatList(); update(); };
  const vp=document.getElementById("vparty"); vp.innerHTML=PARTIES.map(p=>`<option value="${p.c}">${p.n}</option>`).join(""); vp.value="OPP";
  ["vparty","vamt"].forEach(id=>document.getElementById(id).onchange=drawVotes);
  document.querySelector("details.more").addEventListener("toggle",e=>{ if(e.target.open) drawVotes(); });
}
function syncLevers(){
  document.getElementById("oppVote").value=state.shares.OPP; { const a=state.shares.OPP, e=eff().OPP; document.getElementById("oppOut").textContent= Math.abs(a-e)>=0.05?`${a.toFixed(1)}% → ${e.toFixed(1)}%`:`${e.toFixed(1)}%`; }
  { const v=state.pollBase.OPP, f=Math.max(0,Math.min(1,v/20)), pm=document.getElementById("pollmark");
    pm.style.left=`calc(8px + (100% - 16px) * ${f.toFixed(4)})`; pm.title=`${state.pollName}: ${v.toFixed(1)}%`;
    document.getElementById("pollmarkLab").textContent=`Polling ${v.toFixed(1)}%`; }
  document.getElementById("split").value=state.split; document.getElementById("splitOut").textContent=state.split===0?"Same as party":`${Math.abs(state.split)} pts ${state.split>0?"better":"worse"}`;
  document.querySelectorAll("#errSeg button").forEach(b=>b.setAttribute("aria-pressed",+b.dataset.k===state.err));
  document.getElementById("corr").checked=state.corr;
  document.getElementById("nsim").disabled=state.err===0; document.getElementById("corr").disabled=state.err===0;
  document.getElementById("simAll").checked=state.err!==0; document.querySelector(".topswitch").lastChild.textContent=state.err!==0?" Simulations on":" Simulations off";
}
function syncVotes(except){
  document.querySelectorAll("#votes input").forEach(i=>{ if(i!==except) i.value=state.shares[i.dataset.p].toFixed(1); });
  document.getElementById("votesum").textContent=`These parties total ${PARTIES.reduce((a,p)=>a+state.shares[p.c],0).toFixed(1)}%. The rest goes to minor parties.`;
}
let timer=null, statusEl=null, statusTimer=null;
function simStatus(id, phase, delta){
  const el=document.getElementById(id); if(!el) return; clearTimeout(statusTimer); statusEl=el; el.hidden=false;
  const N=parseInt(document.getElementById("nsim").value,10).toLocaleString();
  if(phase==="drag") el.innerHTML=`<span class="spin" aria-hidden="true"></span> Re-running simulations...`;
  else if(phase==="full") el.innerHTML=`<span class="spin" aria-hidden="true"></span> Re-running simulations...`;
  else if(state.err===0) el.innerHTML=`<span class="tick" aria-hidden="true">✓</span> <span>Updated (simulations off). ${delta?`Changed: ${delta}.`:""}</span>`;
  else el.innerHTML=`<span class="tick" aria-hidden="true">✓</span> <span>Reran ${N} simulations. ${delta?`Changed: ${delta}.`:""} <span class="thr" style="display:block;margin:2px 0 0">The same ${N} simulated elections are replayed every time, so these changes come only from what you moved.</span></span>`;
}
function snapshot(){
  const sim=state.sim; if(!sim) return null; const N=sim.N; let g=0,o=0,inO=0; const oi=sim.codes.indexOf("OPP");
  for(let i=0;i<N;i++){ if(sim.outc[i]===0) g++; else if(sim.outc[i]===1) o++; if(sim.seatsS[oi][i]>0) inO++; }
  return {house:sim.rep.total, ent:sim.rep.entNat, elec:sim.rep.elecNat, nat:sim.rep.seats.NAT, opp:sim.rep.seats.OPP,
    gov:g/N, lab:o/N, hung:(N-g-o)/N, oppIn:inO/N, willis:pIn("NAT","Nicola Willis")};
}
function deltaText(a,b,ctx){
  if(!a||!b) return "";
  const parts=[], arrow=(x,y,f=v=>v)=>`${f(x)} → ${f(y)}`, pc=(k,label)=>{ if(Math.round(a[k]*100)!==Math.round(b[k]*100)) parts.push(`${label} ${arrow(a[k],b[k],fmtP)}`); };
  if(ctx==="opp"||ctx==="st-opp"){
    if(a.opp!==b.opp) parts.push(`Opportunity seats ${arrow(a.opp,b.opp)}`);
    pc("oppIn","chance Opportunity gets in");
    if(a.house!==b.house) parts.push(`House ${arrow(a.house,b.house)}`);
    pc("gov","National-led majority"); pc("lab","Labour-led majority"); pc("hung","kingmakers decide");
  } else {
    if(a.elec!==b.elec) parts.push(`National electorates ${arrow(a.elec,b.elec)}`);
    if(a.ent!==b.ent) parts.push(`seats earned ${arrow(a.ent,b.ent)}`);
    if(a.house!==b.house) parts.push(`House ${arrow(a.house,b.house)}`);
    pc("willis","Willis"); pc("gov","National-led majority");
  }
  return parts.length?parts.join(", "):"no change in the headline numbers";
}
let lastSnap=null, lastOutcome=null;
function confetti(colors, host, opts={}){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches || !host) return;
  let cv=host.querySelector(":scope > canvas.confetti");
  if(!cv){ cv=document.createElement("canvas"); cv.className="confetti"; cv.setAttribute("aria-hidden","true"); host.appendChild(cv); }
  const W=host.clientWidth, H=host.clientHeight, dpr=window.devicePixelRatio||1;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+"px"; cv.style.height=H+"px";
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  const n=opts.count||120, fall=opts.fall||1;
  const parts=Array.from({length:n},()=>({x:W*(0.05+Math.random()*0.9), y:-10-Math.random()*H*0.3, vx:(Math.random()-0.5)*1.6, vy:(0.4+Math.random()*1.2)*fall, s:(opts.size||5)+Math.random()*5, r:Math.random()*6.28, vr:(Math.random()-0.5)*0.08, sway:Math.random()*6.28, c:colors[Math.floor(Math.random()*colors.length)]}));
  const css=getComputedStyle(document.documentElement); const col=c=>c.startsWith("--")?css.getPropertyValue(c).trim():c;
  const t0=performance.now(), dur=opts.dur||4500;
  (function frame(t){
    const el=t-t0; ctx.clearRect(0,0,W,H);
    parts.forEach(p=>{ p.vy=Math.min(p.vy+0.015*fall,2.2*fall); p.sway+=0.03; p.x+=p.vx+Math.sin(p.sway)*0.6; p.y+=p.vy; p.r+=p.vr;
      ctx.save(); ctx.globalAlpha=el<dur-1300?1:Math.max(0,1-(el-(dur-1300))/1300); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle=col(p.c); ctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2); ctx.restore(); });
    if(el<dur) requestAnimationFrame(frame); else ctx.clearRect(0,0,W,H);
  })(t0);
}
function celebrate(){
  const sim=state.sim; if(!sim||sim.off===undefined) return; const N=sim.N; let g=0,o=0; for(let i=0;i<N;i++){ if(sim.outc[i]===0) g++; else if(sim.outc[i]===1) o++; }
  const k=N-g-o, top= g>=o&&g>=k?"gov":o>=k?"opp":"und";
  if(top==="und") return; // no confetti unless one side is most likely to govern
  const palette={gov:["--NAT","--ACT","--NZF"],opp:["--LAB","--GRN","--TPM"]}[top];
  confetti(palette, document.getElementById("houseSection"));
  const dock=document.getElementById("dock");
  if(dock.classList.contains("on")) confetti(palette, dock, {count:45, fall:0.45, size:3, dur:4500});
}
function loading(on, frac, quick){
  const lb=document.getElementById("loadbar"), pill=document.getElementById("loadpill");
  if(!on){ lb.classList.remove("on"); pill.hidden=true; return; }
  lb.classList.add("on"); lb.firstElementChild.style.width=Math.round((frac||0)*100)+"%";
  if(!quick){ pill.hidden=false; const N=state.err===0?1:parseInt(document.getElementById("nsim").value,10);
    pill.innerHTML=`<span class="spin" aria-hidden="true"></span> ${state.err===0?"Recalculating":`Running ${N.toLocaleString()} simulations`} <b>${Math.round((frac||0)*100)}%</b>`; }
}
// Phones only: a small pill at the bottom pointing to the simulation controls, until the visitor scrolls.
const scrollCue=(()=>{ const el=document.getElementById("scrollCue"), phone=matchMedia("(max-width:760px)"); let done=false;
  const hide=()=>{ if(done) return; done=true; el.classList.remove("on"); setTimeout(()=>el.hidden=true,300); removeEventListener("scroll",onScroll); };
  const onScroll=()=>{ if(scrollY>40) hide(); };
  addEventListener("scroll",onScroll,{passive:true});
  el.onclick=()=>{ document.getElementById("simSection").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}); hide(); };
  return {show:()=>{ if(done||!phone.matches||scrollY>40) return; el.hidden=false; requestAnimationFrame(()=>el.classList.add("on")); }};
})();
function showScrollCue(){ scrollCue.show(); }
function renderAll(){ drawHouse(); drawFactors(); drawLists(); drawSeatList(); paintMap(); drawCustom(); if(document.querySelector("details.more").open) drawVotes(); }
// On page load, draw a quick estimate first, then refine. The seed is fixed, so the quick runs are the first runs of the full set.
async function firstLoad(){
  const token=++SIMTOKEN, n=parseInt(document.getElementById("nsim").value,10);
  loading(true,0.05,true);
  if(await simulate(600,null,token)){ renderAll();
    document.getElementById("houseHint").textContent=`Quick estimate from the first 600 simulated elections. Running all ${n.toLocaleString()} now…`; }
  update();
}
function update(quick){
  clearTimeout(timer);
  const wrap=document.getElementById("chamberwrap"), sec=document.getElementById("simSection");
  wrap.classList.add("busy"); sec.classList.add("busy");
  const before=quick?null:(lastSnap||snapshot());
  if(!quick) lastSnap=lastSnap||before;
  timer=setTimeout(async ()=>{
    const token=++SIMTOKEN;
    loading(true,0,quick);
    const ok=await simulate(quick?600:null, f=>loading(true,f,quick), token);
    if(!ok) return;
    loading(true,1,quick);
    renderAll();
    if(!quick){
      wrap.classList.remove("busy"); sec.classList.remove("busy");
      const after=snapshot(); if(statusEl) simStatus(statusEl.id,"done",deltaText(lastSnap,after,statusEl.id)); statusEl=null; lastSnap=null;
      celebrate();
      setTimeout(()=>{ loading(false); showScrollCue(); },250);
    } else loading(false);
  }, quick?40:150);
}
document.addEventListener("mouseover",e=>{ const b=e.target.closest('[data-info="sim"]'); if(b) simPop(b); });
document.addEventListener("mouseout",e=>{ const b=e.target.closest('[data-info="sim"]'); if(b && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".pop"))) schedClose(); });
document.addEventListener("focusin",e=>{ const b=e.target.closest('[data-info="sim"]'); if(b) simPop(b); });
document.addEventListener("click",e=>{ const b=e.target.closest('[data-info="sim"]'); if(b){ e.stopPropagation(); e.preventDefault(); simPop(b); } },true);
document.getElementById("simPanelClose").onclick=()=>document.getElementById("simPanel").close();
document.getElementById("simPanel").addEventListener("click",e=>{ if(e.target.id==="simPanel") e.target.close(); });
["blocs","dockBar"].forEach(id=>{ const el=document.getElementById(id);
  el.addEventListener("mouseover",e=>{ const g=e.target.closest(".pseg"); if(g) segPop(g); });
  el.addEventListener("mouseout",e=>{ const g=e.target.closest(".pseg"); if(g && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".pop"))) schedClose(); });
  el.addEventListener("click",e=>{ const g=e.target.closest(".pseg"); if(g){ e.stopPropagation(); segPop(g); } });
  el.addEventListener("focusin",e=>{ const g=e.target.closest(".pseg"); if(g) segPop(g); });
});
(function(){ const ft=document.getElementById("ftip");
  const show=el=>{ if(el.dataset.tiphtml) ft.innerHTML=el.dataset.tiphtml; else ft.textContent=el.dataset.tip; ft.hidden=false; const r=el.getBoundingClientRect(), w=ft.offsetWidth, h=ft.offsetHeight;
    ft.style.left=Math.max(8,Math.min(window.innerWidth-w-8, r.left+r.width/2-w/2))+window.scrollX+"px";
    ft.style.top=((r.top-h-8>8)?r.top-h-8:r.bottom+8)+window.scrollY+"px"; };
  document.addEventListener("mouseover",e=>{ const el=e.target.closest("[data-tip]"); if(el) show(el); });
  document.addEventListener("mouseout",e=>{ if(e.target.closest("[data-tip]")) ft.hidden=true; });
  document.addEventListener("focusin",e=>{ const el=e.target.closest("[data-tip]"); if(el) show(el); });
  document.addEventListener("focusout",e=>{ if(e.target.closest("[data-tip]")) ft.hidden=true; });
  document.addEventListener("click",e=>{ const el=e.target.closest("[data-tip]"); if(el) show(el); else ft.hidden=true; });
})();
buildControls(); bindOpen(); syncLevers(); drawOppMode(); bindTips(); bindMap(); drawSeatList(); firstLoad();
window.addEventListener("resize",()=>{ placeMaj(document.getElementById("blocs")); placeMaj(document.getElementById("dockBar")); });
(function(){ const dock=document.getElementById("dock"), target=document.getElementById("hemi");
  const io=new IntersectionObserver(es=>es.forEach(e=>{ const on=!e.isIntersecting && e.boundingClientRect.top<0; dock.classList.toggle("on",on); dock.setAttribute("aria-hidden",!on); }),{threshold:0});
  io.observe(target); })();

/* ---------- comments ---------- */
// GitHub-issue comments (utterances), loaded only when the section nears the screen so it never slows the forecast.
(function(){ const box=document.getElementById("commentsBox"); if(!box||!("IntersectionObserver" in window)) return;
  const io=new IntersectionObserver(es=>{ if(!es.some(e=>e.isIntersecting)) return; io.disconnect();
    const s=document.createElement("script"); s.src="https://utteranc.es/client.js"; s.async=true; s.crossOrigin="anonymous";
    for(const [k,v] of Object.entries({"repo":"DanCRichards/nzpolls","issue-term":"Comments on nzpolls.co.nz","label":"comment","theme":"preferred-color-scheme"})) s.setAttribute(k,v);
    s.onload=()=>{ const l=document.getElementById("commentsLoading"); if(l) l.remove(); };
    s.onerror=()=>{ const l=document.getElementById("commentsLoading"); if(l) l.textContent="Comments couldn't load. Use the GitHub link above instead."; };
    box.appendChild(s); },{rootMargin:"400px"});
  io.observe(box); })();

/* ---------- analytics ---------- */
// Umami (loaded in head.html, counts only on nzpolls.co.nz). One listener maps controls to named events,
// so tracking never touches the forecast logic. Sliders report on release, not while dragging.
function track(name,data){ try{ if(window.umami) window.umami.track(name,data); }catch(e){} }
(function(){
  const txt=el=>el.textContent.trim().replace(/\s+/g," ").slice(0,60);
  const on=(sel,el)=>el.closest&&el.closest(sel);
  const CLICK=[
    ["#seatView button", b=>["Electorate view",{view:b.dataset.v}]],
    ["#mapSet button", b=>["Map electorates",{set:b.dataset.m}]],
    ["#mapRegions button", b=>["Map zoom",{area:txt(b)}]],
    [".cand", b=>{ const i=+b.dataset.s, j=+b.dataset.c, c=ESEATS[i].c[j]; return ["Call seat",{electorate:ESEATS[i].n, candidate:c.nm, party:plab(c), action:state.locks[i]===j?"uncall":"call"}]; }],
    ["#presets button", b=>["Seat preset",{preset:txt(b)}]],
    ["#clearLocks", ()=>["Clear calls"]],
    ["#oppSide button", b=>["Opportunity side",{side:BLOCS[b.dataset.b]}]],
    ["#oppMode button", b=>["Opportunity vote mode",{mode:b.dataset.m}]],
    ["#errSeg button", b=>["Polling error",{level:txt(b)}]],
    ["#sides .sideseg button", b=>["Bloc change",{party:NAMES[b.dataset.p], bloc:BLOCS[b.dataset.b]}]],
    ["#resetLevers, #dockReset", b=>["Reset",{from:b.id==="dockReset"?"pinned bar":"simulation"}]],
    [".lvbtn", b=>b.getAttribute("aria-expanded")==="false"?["Open card",{card:b.dataset.open}]:null],
    ["#listParty button", b=>["Party list",{party:NAMES[b.dataset.p]}]],
    ["#listMore", ()=>["Full party list"]],
    ["#scrollCue", ()=>["Scroll cue"]],
    ["#customPresets button", b=>["Add custom bloc",{bloc:txt(b)}]],
    ["#addBloc", ()=>["Add custom bloc",{bloc:"blank"}]],
    [".pseg", g=>["Party bar",{party:NAMES[g.dataset.p]}]],
    [".pop [data-go]", b=>["Popup button",{button:txt(b)}]],
    ['a[href*="github.com/DanCRichards/nzpolls/issues"]', ()=>["Open GitHub issue"]],
    ['a[href^="http"]', a=>["Outbound link",{url:a.hostname+a.pathname}]],
  ];
  document.addEventListener("click",e=>{ for(const [sel,f] of CLICK){ const el=on(sel,e.target); if(el){ const r=f(el); if(r) track(r[0],r[1]); return; } } },true);
  const v=id=>document.getElementById(id);
  const CHANGE={
    scenario:()=>["Poll",{poll:v("scenario").selectedOptions[0].textContent}],
    nsim:()=>["Simulation count",{runs:v("nsim").value}],
    simAll:()=>["Simulations switch",{on:v("simAll").checked}],
    simSeats:()=>["Simulate electorates switch",{on:v("simSeats").checked}],
    corr:()=>["Correlated error switch",{on:v("corr").checked}],
    oppVote:()=>["Opportunity vote",{vote:+v("oppVote").value}],
    squeeze:()=>["Opportunity squeeze",{percent:+v("squeeze").value}],
    split:()=>["National split ticket",{points:+v("split").value}],
    trend:()=>["Late swing",{percent:+v("trend").value}],
    seatFilter:()=>["Seat filter",{filter:v("seatFilter").selectedOptions[0].textContent}],
    vparty:()=>["Extra votes party",{party:NAMES[v("vparty").value]}],
    showMps:()=>["Show MP initials",{on:v("showMps").checked}],
  };
  document.addEventListener("change",e=>{ const t=e.target; if(CHANGE[t.id]){ const r=CHANGE[t.id](); track(r[0],r[1]); }
    else if(on("#votes",t)) track("Party vote edit",{party:NAMES[t.dataset.p]}); },true);
  document.addEventListener("toggle",e=>{ const d=e.target; if(!d.open) return;
    if(d.matches("details.more")) track("Open more tools"); else if(d.id==="tableDetails") track("Open party detail table"); else if(d.id==="faq") track("Open FAQ"); },true);
})();

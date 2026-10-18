const PARTIES = [
  {c:"GRN",n:"Green"},{c:"TPM",n:"Te Pāti Māori"},{c:"LAB",n:"Labour"},{c:"OPP",n:"Opportunity"},
  {c:"NZF",n:"NZ First"},{c:"NAT",n:"National"},{c:"ACT",n:"ACT"}
];
const OTH = {c:"OTH",n:"Independent / other"};
const NAMES = Object.fromEntries([...PARTIES,OTH].map(p=>[p.c,p.n]));
NAMES.MIN = "Other";
const THRESH = 0.05, SEATS = 120, TOTAL_VOTES = 2900000, BETA = 0.09;
const ESEATS = DATA.seats, LISTS = DATA.lists;
const MODEL_CODES = new Set(PARTIES.map(p=>p.c));
const RANK = {}; Object.entries(LISTS).forEach(([c,l])=>{ RANK[c]={}; l.forEach((n,i)=>RANK[c][n]=i); });
const STAND = {}; ESEATS.forEach((s,i)=>s.c.forEach((c,j)=>{ STAND[c.p+"|"+c.nm]={i,j}; }));

const POLLS = [
 {id:"1News–Verian, 8–12 Oct",mid:"2026-10-10",inc:1,s:{NAT:28,LAB:28,GRN:15,ACT:10,NZF:10,TPM:0.4,OPP:8}},
 {id:"Anacta, 6–10 Oct",mid:"2026-10-08",inc:1,s:{NAT:28,LAB:29,GRN:15,ACT:9,NZF:10,TPM:2,OPP:5}},
 {id:"Curia, 1–5 Oct",mid:"2026-10-03",inc:1,s:{NAT:28.5,LAB:28.2,GRN:13.3,ACT:9.2,NZF:12,TPM:1.4,OPP:4.8}},
 {id:"1News–Verian, 1–5 Oct",mid:"2026-10-03",inc:1,s:{NAT:29,LAB:28,GRN:16,ACT:9,NZF:10,TPM:0.6,OPP:7}},
 {id:"RNZ–Reid, 24 Sep–1 Oct",mid:"2026-09-28",inc:1,s:{NAT:25.9,LAB:30.8,GRN:14.8,ACT:9,NZF:10.6,TPM:null,OPP:5.5}},
 {id:"1News–Verian, 23–27 Sep",mid:"2026-09-25",inc:1,s:{NAT:28,LAB:28,GRN:16,ACT:11,NZF:9,TPM:1.2,OPP:6}},
 {id:"Roy Morgan, 31 Aug–27 Sep",mid:"2026-09-13",inc:1,s:{NAT:31,LAB:23.5,GRN:16,ACT:11,NZF:10,TPM:2,OPP:6.5}},
 {id:"Freshwater, 4–11 Sep",mid:"2026-09-08",inc:1,s:{NAT:27,LAB:28,GRN:14,ACT:9,NZF:13,TPM:2,OPP:6}},
 {id:"Anacta, 4–10 Sep",mid:"2026-09-07",inc:1,s:{NAT:30,LAB:31,GRN:12,ACT:8,NZF:10,TPM:2,OPP:7}},
 {id:"Curia, 1–3 Sep",mid:"2026-09-02",inc:1,s:{NAT:29,LAB:25.9,GRN:13.9,ACT:10.5,NZF:8.4,TPM:2,OPP:4.5}},
 {id:"Roy Morgan, Jul–Aug",mid:"2026-08-10",inc:0,s:{NAT:31,LAB:24,GRN:15.5,ACT:10.5,NZF:7.5,TPM:1.5,OPP:9.5}},
 {id:"RNZ–Reid, 14–21 Aug",mid:"2026-08-18",inc:0,s:{NAT:29.1,LAB:32.2,GRN:10.2,ACT:7.7,NZF:11.9,TPM:3.0,OPP:5.3}},
 {id:"1News–Verian, 8–11 Aug",mid:"2026-08-10",inc:0,s:{NAT:29,LAB:30,GRN:12,ACT:9,NZF:8,TPM:1.1,OPP:8}},
 {id:"Talbot Mills, 1–11 Aug",mid:"2026-08-06",inc:0,s:{NAT:29,LAB:34,GRN:8,ACT:7,NZF:13,TPM:3,OPP:5.2}},
 {id:"Curia, 1–4 Aug",mid:"2026-08-03",inc:0,s:{NAT:31,LAB:27.8,GRN:10.1,ACT:7.3,NZF:9.1,TPM:1.5,OPP:6.1}},
];
const AVG = {};
PARTIES.forEach(p=>{
  const v = POLLS.filter(x=>x.inc && x.s[p.c]!=null).map(x=>x.s[p.c]);
  AVG[p.c] = +(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2);
});
POLLS.forEach(x=>PARTIES.forEach(p=>{ if(x.s[p.c]==null) x.s[p.c]=AVG[p.c]; }));
// late-swing trend: least-squares slope of each party's share across all listed polls (points per day, using fieldwork midpoints)
const ELECTION_DAY=new Date("2026-11-07"), TREND={};
(function(){ const xs=POLLS.map(p=>(new Date(p.mid)-ELECTION_DAY)/864e5);
  PARTIES.forEach(pt=>{ const ys=POLLS.map(p=>p.s[pt.c]); const n=xs.length, mx=xs.reduce((a,b)=>a+b,0)/n, my=ys.reduce((a,b)=>a+b,0)/n;
    let sxy=0,sxx=0; for(let i=0;i<n;i++){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)**2; } TREND[pt.c]=sxx?sxy/sxx:0; }); })();
const TREND_DAYS=Math.round((ELECTION_DAY-new Date(POLLS[0].mid))/864e5);
const SPECIALS = {NAT:-1.0,LAB:0.45,GRN:0.55,ACT:-0.35,NZF:-0.25,TPM:0.35,OPP:0.05};

const KEY = ["Epsom","Tāmaki","Auckland Central","Wellington North","Wellington Bays","Mount Albert","Northland","Port Waikato","Rangitīkei","Hauraki-Waikato","Tāmaki Makaurau","Te Tai Hauāuru","Waiariki","Ikaroa-Rāwhiti","Te Tai Tokerau","Te Tai Tonga"];
const SEAT_IDX = Object.fromEntries(ESEATS.map((s,i)=>[s.n,i]));
const PRESETS = [
  {n:"Model's calls",set:null},
  {n:"Te Pāti Māori holds 2",set:[["Hauraki-Waikato","Kingi Kiriona"],["Te Tai Hauāuru","Te Pūoho Kātene"]]},
  {n:"Greens lose Auckland Central",set:[["Auckland Central","Candace Kinser"]]},
  {n:"ACT loses Epsom",set:[["Epsom","Paul Goldsmith"]]},
  {n:"NZ First wins Northland",set:[["Northland","Shane Jones"]]},
  {n:"Te Tai Tokerau Party wins",set:[["Te Tai Tokerau","Mariameno Kapa-Kingi"]]},
  {n:"Opportunity wins Mount Albert",set:[["Mount Albert","Qiulae Wong"]]},
];


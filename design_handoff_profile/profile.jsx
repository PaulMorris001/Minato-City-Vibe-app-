// NightVibe — Profile screen (simplified)
// Two variants, both pared back: smaller avatar, fewer chips, single action.

const PR_BG = '#0B0613';
const PR_SURFACE = 'rgba(26,16,48,0.7)';
const PR_STROKE = 'rgba(255,255,255,0.08)';
const PR_STROKE_HI = 'rgba(255,255,255,0.14)';
const PR_TEXT = '#F4EEFF';
const PR_TEXT_DIM = 'rgba(244,238,255,0.62)';
const PR_TEXT_MUTE = 'rgba(244,238,255,0.38)';
const PR_PURPLE = '#A855F7';
const PR_PURPLE_SOFT = '#C084FC';
const PR_PINK = '#EC4899';

const DEMO_PROFILE = {
  name: 'SetemiL',
  handle: '@setemil',
  email: 'setemiloye@gmail.com',
  avatar: 'linear-gradient(160deg, #22D3EE 0%, #7C3AED 50%, #EC4899 100%)',
  initial: 'S',
  isVendor: true,
  isVerified: true,
  followers: 4,
  following: 11,
  eventsTotal: 5,
  eventsHosted: 2,
  eventsAttended: 3,
  events: [
    { id: 'e1', title: 'BADDDD',         date: 'Apr 30, 2026', loc: 'Atlanta',   role: 'created',  cover: 'linear-gradient(135deg, #EC4899 0%, #F59E0B 100%)',             emoji: '🌺' },
    { id: 'e2', title: 'Mood2',          date: 'Apr 30, 2026', loc: 'My house',  role: 'attended', cover: 'linear-gradient(135deg, #22D3EE 0%, #0B0613 100%)',             emoji: '🎧' },
    { id: 'e3', title: 'Tunmishe party', date: 'Apr 24, 2026', loc: 'Atlanta',   role: 'attended', cover: 'linear-gradient(135deg, #A855F7 0%, #F59E0B 100%)',             emoji: '⚡' },
    { id: 'e4', title: 'Mood',           date: 'Apr 7, 2026',  loc: 'Somewhere', role: 'created',  cover: 'linear-gradient(135deg, #34D399 0%, #7C3AED 100%)',             emoji: '🌅' },
    { id: 'e5', title: 'Side B vol. 02', date: 'Mar 22, 2026', loc: 'Bushwick',  role: 'attended', cover: 'linear-gradient(200deg, #0B0613 0%, #7C3AED 60%, #EC4899 100%)', emoji: '🎛️' },
  ],
};

function PRStatusBar() {
  return (
    <div style={{
      height: 54, padding: '14px 28px 0', display: 'flex',
      justifyContent: 'space-between', alignItems: 'center',
      fontFamily: 'Inter, system-ui', fontWeight: 600, fontSize: 16, color: PR_TEXT,
      flexShrink: 0, position: 'relative', zIndex: 30,
    }}>
      <div>9:41</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M1 8.5h2v3H1v-3zm4-2h2v5H5v-5zm4-2.5h2v7.5H9V4zm4-2.5h2v10h-2v-10zm4-1.5h2v11.5h-2V1.5z" fill={PR_TEXT}/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M8 2.5a9 9 0 016.4 2.65l1.4-1.4A11 11 0 008 .5a11 11 0 00-7.8 3.25l1.4 1.4A9 9 0 018 2.5zm0 4a5 5 0 013.55 1.47l1.4-1.4a7 7 0 00-9.9 0l1.4 1.4A5 5 0 018 6.5zm0 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" fill={PR_TEXT}/></svg>
        <div style={{ width: 26, height: 12, border: `1.5px solid ${PR_TEXT}`, borderRadius: 3, position: 'relative', opacity: 0.9 }}>
          <div style={{ position: 'absolute', inset: 1.5, width: '78%', background: PR_TEXT, borderRadius: 1 }}/>
          <div style={{ position: 'absolute', right: -3, top: 3, width: 2, height: 6, background: PR_TEXT, borderRadius: 1 }}/>
        </div>
      </div>
    </div>
  );
}

function PRTabBar({ active = 'profile' }) {
  const tabs = [
    { id: 'home',     label: 'Home',     icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2V11z"/></svg> },
    { id: 'vendors',  label: 'Vendors',  icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></svg> },
    { id: 'best',     label: 'Best Of',  icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M6 4h12v5a6 6 0 01-12 0V4zM8 22h8M12 17v5"/></svg> },
    { id: 'events',   label: 'Events',   icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg> },
    { id: 'profile',  label: 'Profile',  icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill={c === PR_PURPLE ? c : 'none'} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg> },
  ];
  return (
    <div style={{
      paddingTop: 10, paddingBottom: 26,
      background: 'linear-gradient(to top, rgba(11,6,19,0.98) 40%, rgba(11,6,19,0))',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      borderTop: `1px solid ${PR_STROKE}`,
      flexShrink: 0,
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        const c = isActive ? PR_PURPLE : PR_TEXT_MUTE;
        return (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            {t.icon(c)}
            <div style={{ fontFamily: 'Inter', fontSize: 10.5, fontWeight: isActive ? 700 : 500, color: c }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function PRRoundBtn({ children }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${PR_STROKE}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: PR_TEXT, cursor: 'pointer',
    }}>{children}</div>
  );
}

// Event row — compact
function PREventRow({ ev }) {
  const isCreated = ev.role === 'created';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14, display: 'flex', gap: 12, alignItems: 'center',
      background: PR_SURFACE, border: `1px solid ${PR_STROKE}`, cursor: 'pointer',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 10, flexShrink: 0,
        background: ev.cover, position: 'relative', overflow: 'hidden',
        border: `1px solid ${PR_STROKE_HI}`,
      }}>
        <div style={{
          position: 'absolute', right: -6, bottom: -10, fontSize: 38, opacity: 0.45,
          transform: 'rotate(-8deg)',
        }}>{ev.emoji}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: '"Bricolage Grotesque"', fontWeight: 700, fontSize: 14.5, color: PR_TEXT,
          letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ev.title}</div>
        <div style={{
          fontFamily: 'Inter', fontSize: 11.5, color: PR_TEXT_DIM, marginTop: 3, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>{ev.date}</span>
          <span style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: PR_TEXT_MUTE }}/>
          <span>{ev.loc}</span>
        </div>
      </div>
      {/* Role: subtle dot+label, not a heavy chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        fontFamily: 'Inter', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: isCreated ? PR_PURPLE_SOFT : PR_TEXT_MUTE,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isCreated ? PR_PURPLE : 'rgba(255,255,255,0.35)',
          boxShadow: isCreated ? '0 0 10px rgba(168,85,247,0.6)' : 'none',
        }}/>
        {ev.role}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIANT A — "Quiet editorial"
// Minimal hero. Small avatar w/ subtle ring, name + handle,
// one verified mark, stats inline, no badges/vibes/buttons.
// ─────────────────────────────────────────────────────────────
function ProfileEditorial({ p = DEMO_PROFILE }) {
  const [tab, setTab] = React.useState('hosted');
  const events = tab === 'hosted'
    ? p.events.filter(e => e.role === 'created')
    : p.events.filter(e => e.role === 'attended');

  return (
    <div style={{
      width: '100%', height: '100%', background: PR_BG, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <PRStatusBar/>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {/* Top row */}
        <div style={{
          padding: '8px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 13,
            color: PR_TEXT_DIM, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>Profile</div>
          <PRRoundBtn>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </PRRoundBtn>
        </div>

        {/* Soft aurora behind hero only */}
        <div style={{ position: 'relative', padding: '20px 22px 0' }}>
          <div style={{
            position: 'absolute', top: -30, left: '50%', width: 320, height: 220,
            transform: 'translateX(-50%)', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)',
            filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none',
          }}/>

          {/* Avatar + name row — left aligned, tidy */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 68, height: 68, borderRadius: '50%', background: p.avatar,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 30, color: '#fff',
              letterSpacing: '-0.04em', flexShrink: 0,
              boxShadow: 'inset 0 0 30px rgba(0,0,0,0.25)',
            }}>{p.initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  fontFamily: '"Bricolage Grotesque"', fontWeight: 900, fontSize: 26,
                  letterSpacing: '-0.03em', color: PR_TEXT, lineHeight: 1.05,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</div>
                {p.isVerified && (
                  <div title="Verified" style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #A855F7, #EC4899)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, lineHeight: 1,
                    boxShadow: '0 4px 12px rgba(168,85,247,0.45)',
                  }}>✦</div>
                )}
              </div>
              <div style={{
                fontFamily: 'Inter', fontSize: 12.5, color: PR_TEXT_DIM, marginTop: 3, fontWeight: 500,
              }}>{p.handle}{p.isVendor && <span style={{ marginLeft: 8, color: PR_PURPLE_SOFT, fontWeight: 700 }}>· Vendor</span>}</div>
            </div>
          </div>

          {/* Stats — flat row, no card */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 22 }}>
            {[
              { v: p.followers,   l: 'Followers' },
              { v: p.following,   l: 'Following' },
              { v: p.eventsTotal, l: 'Events'    },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 20, color: PR_TEXT,
                  letterSpacing: '-0.02em', lineHeight: 1,
                }}>{s.v}</span>
                <span style={{
                  fontFamily: 'Inter', fontSize: 11.5, color: PR_TEXT_DIM, fontWeight: 500,
                }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '20px 22px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${PR_STROKE}`,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PR_TEXT_MUTE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <span style={{ fontFamily: 'Inter', fontSize: 13, color: PR_TEXT_MUTE, fontWeight: 500 }}>Search users…</span>
          </div>
        </div>

        {/* Events */}
        <div style={{ padding: '22px 22px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
          }}>
            <div style={{
              fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 20, color: PR_TEXT,
              letterSpacing: '-0.02em',
            }}>Events</div>
            {/* Filter pills — text-only, no boxes */}
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { id: 'hosted',   label: 'Hosted' },
                { id: 'attended', label: 'Attended' },
              ].map(t => {
                const on = tab === t.id;
                return (
                  <div key={t.id} onClick={() => setTab(t.id)} style={{
                    cursor: 'pointer', position: 'relative', paddingBottom: 4,
                    fontFamily: 'Inter', fontSize: 12, fontWeight: 700,
                    color: on ? PR_TEXT : PR_TEXT_MUTE,
                    letterSpacing: '0.02em',
                  }}>
                    {t.label}
                    {on && <div style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 2,
                      background: 'linear-gradient(90deg, #A855F7, #EC4899)',
                    }}/>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map(ev => <PREventRow key={ev.id} ev={ev}/>)}
          </div>
        </div>
      </div>

      <PRTabBar active="profile"/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIANT B — "Quiet card"
// Simpler member-card hero, smaller, less stamped chrome.
// ─────────────────────────────────────────────────────────────
function ProfileMemberCard({ p = DEMO_PROFILE }) {
  const [tab, setTab] = React.useState('hosted');
  const events = tab === 'hosted' ? p.events.filter(e => e.role === 'created') : p.events.filter(e => e.role === 'attended');

  return (
    <div style={{
      width: '100%', height: '100%', background: PR_BG, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <PRStatusBar/>

      {/* Top */}
      <div style={{
        padding: '8px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{
          fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 13,
          color: PR_TEXT_DIM, letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>Profile</div>
        <PRRoundBtn>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </PRRoundBtn>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Small member card */}
        <div style={{ padding: '16px 18px 0' }}>
          <div style={{
            position: 'relative', borderRadius: 18, padding: '16px 16px 14px', overflow: 'hidden',
            background: 'linear-gradient(140deg, #1A1030 0%, #2A1654 60%, #4B1A6E 100%)',
            border: `1px solid ${PR_STROKE_HI}`,
            boxShadow: '0 20px 50px -20px rgba(124,58,237,0.5)',
          }}>
            <div style={{
              position: 'absolute', right: -50, top: -50, width: 180, height: 180, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(236,72,153,0.45), transparent 70%)',
            }}/>

            <div style={{ position: 'relative', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
                background: 'conic-gradient(from 180deg at 50% 50%, #A855F7, #EC4899, #22D3EE, #A855F7)',
                padding: 2,
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%', background: p.avatar,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 26, color: '#fff',
                  letterSpacing: '-0.04em',
                }}>{p.initial}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    fontFamily: '"Bricolage Grotesque"', fontWeight: 900, fontSize: 22,
                    color: '#fff', letterSpacing: '-0.03em', lineHeight: 1,
                  }}>{p.name}</div>
                  {p.isVerified && <span style={{ color: '#FBCFE8', fontSize: 13 }}>✦</span>}
                </div>
                <div style={{
                  fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4, fontWeight: 500,
                }}>{p.handle}{p.isVendor && <span style={{ marginLeft: 6 }}>· Vendor</span>}</div>
              </div>
            </div>

            <div style={{
              position: 'relative', marginTop: 14, paddingTop: 12,
              borderTop: '1px dashed rgba(255,255,255,0.2)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              {[
                { v: p.followers,   l: 'FOLLOWERS' },
                { v: p.following,   l: 'FOLLOWING' },
                { v: p.eventsTotal, l: 'EVENTS'    },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{
                    fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 18, color: '#fff',
                    letterSpacing: '-0.02em', lineHeight: 1,
                  }}>{s.v}</div>
                  <div style={{
                    marginTop: 3, fontFamily: 'Inter', fontSize: 9, fontWeight: 700,
                    color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em',
                  }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${PR_STROKE}`,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PR_TEXT_MUTE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <span style={{ fontFamily: 'Inter', fontSize: 13, color: PR_TEXT_MUTE, fontWeight: 500 }}>Search users…</span>
          </div>
        </div>

        {/* Events with simple text tabs */}
        <div style={{ padding: '22px 18px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
          }}>
            <div style={{
              fontFamily: '"Bricolage Grotesque"', fontWeight: 800, fontSize: 20, color: PR_TEXT,
              letterSpacing: '-0.02em',
            }}>Events</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { id: 'hosted',   label: 'Hosted' },
                { id: 'attended', label: 'Attended' },
              ].map(t => {
                const on = tab === t.id;
                return (
                  <div key={t.id} onClick={() => setTab(t.id)} style={{
                    cursor: 'pointer', position: 'relative', paddingBottom: 4,
                    fontFamily: 'Inter', fontSize: 12, fontWeight: 700,
                    color: on ? PR_TEXT : PR_TEXT_MUTE,
                  }}>
                    {t.label}
                    {on && <div style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 2,
                      background: 'linear-gradient(90deg, #A855F7, #EC4899)',
                    }}/>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map(ev => <PREventRow key={ev.id} ev={ev}/>)}
          </div>
        </div>
      </div>

      <PRTabBar active="profile"/>
    </div>
  );
}

Object.assign(window, { ProfileEditorial, ProfileMemberCard, DEMO_PROFILE });

import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import useAuth from '@/store/useAuth';

gsap.registerPlugin(useGSAP);

const NAV_ITEMS = [
  { path: '/index', icon: '📊', label: '概览' },
  { path: '/tasks', icon: '📋', label: '任务列表' },
  { path: '/agents', icon: '🖥️', label: 'Agent 管理' },
  { path: '/settings', icon: '⚙️', label: '设置' },
];

export default function AppLayout() {
  const { isAuth, loading, uid, userName } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !isAuth) {
      navigate('/login', { replace: true });
    }
  }, [loading, isAuth, navigate]);

  useGSAP(() => {
    const el = document.querySelector('.main-content');
    if (el) gsap.from(el, { opacity: 0, y: 8, duration: 0.35, ease: 'power2.out' });
  }, [location.pathname]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>加载中...</div>;
  if (!isAuth) return <Navigate to="/login" replace />;

  return (
    <div style={{ minHeight: '100vh', background: '#1a1e2e' }}>
      {/* 背景 */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background:
          'radial-gradient(ellipse at 30% 40%, rgba(45,55,80,0.8) 0%, transparent 60%), ' +
          'radial-gradient(ellipse at 70% 30%, rgba(35,45,65,0.6) 0%, transparent 50%), ' +
          'radial-gradient(ellipse at 50% 80%, rgba(25,30,50,0.9) 0%, transparent 60%), ' +
          'linear-gradient(180deg, #151928 0%, #1a2035 40%, #1e2540 100%)',
        pointerEvents: 'none',
      }} />

      {/* Top Header */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 100,
        background: 'transparent',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 800,
          }}>M</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Mini-Drop</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
            padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
          }}>
            {userName || '用户'}
          </span>
          <div style={{
            width: 28, height: 28,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: 'rgba(255,255,255,0.6)',
          }}>
            {(userName || '?')[0].toUpperCase()}
          </div>
          <button
            onClick={() => useAuth.getState().logout()}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 14px', fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.5)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            退出
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', top: 56, left: 0, bottom: 0,
        width: collapsed ? 60 : 220, zIndex: 90,
        background: 'transparent',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '0.5px solid rgba(255,255,255,0.06)',
        padding: '16px 0', overflow: 'hidden', transition: 'width 0.2s',
      }}>
        {/* Collapse Toggle */}
        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '0 16px 12px', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 12,
          }}
        >
          {collapsed ? '→' : '← 收起'}
        </div>

        {/* Nav Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: collapsed ? '10px 0' : '8px 16px',
                  margin: '2px 8px', borderRadius: 8,
                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ width: 18, textAlign: 'center', fontSize: 15, flexShrink: 0 }}>
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: 16, borderTop: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          {!collapsed && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
              性能采集与分析平台
            </p>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{
        marginLeft: collapsed ? 60 : 220, marginTop: 56,
        padding: 32, minHeight: 'calc(100vh - 56px)',
        transition: 'margin-left 0.2s',
        position: 'relative', zIndex: 1,
      }}>
        <div className="main-content" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>加载中...</div>;
  if (!isAuth) return <Navigate to="/login" replace />;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Top Header */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 100,
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, background: '#0f172a', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 800,
          }}>M</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Mini-Drop</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            background: '#eff6ff', color: '#2563eb',
            padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
          }}>
            {userName || '用户'}
          </span>
          <div style={{
            width: 28, height: 28, background: '#e2e8f0', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#64748b',
          }}>
            {(userName || '?')[0].toUpperCase()}
          </div>
          <button
            onClick={() => useAuth.getState().logout()}
            style={{
              background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '6px 14px', fontSize: 13, color: '#64748b', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.color = '#dc2626'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
          >
            退出
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', top: 56, left: 0, bottom: 0,
        width: collapsed ? 60 : 220, zIndex: 90,
        background: '#fff', borderRight: '1px solid #e2e8f0',
        padding: '16px 0', overflow: 'hidden', transition: 'width 0.2s',
      }}>
        {/* Collapse Toggle */}
        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '0 16px 12px', cursor: 'pointer', color: '#94a3b8', fontSize: 12,
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
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#2563eb' : '#64748b',
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = '#f1f5f9';
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
          padding: 16, borderTop: '1px solid #e2e8f0',
        }}>
          {!collapsed && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>
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
      }}>
        <div className="main-content" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

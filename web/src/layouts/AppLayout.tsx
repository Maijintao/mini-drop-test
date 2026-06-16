import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  AppstoreOutlined,
  ClusterOutlined,
  ControlOutlined,
  DeploymentUnitOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import useAuth from '@/store/useAuth';

gsap.registerPlugin(useGSAP);

const NAV_ITEMS = [
  { path: '/index', label: '概览', icon: AppstoreOutlined },
  { path: '/tasks', label: '任务列表', icon: UnorderedListOutlined },
  { path: '/agents', label: 'Agent 管理', icon: DeploymentUnitOutlined },
  { path: '/groups', label: '用户组', icon: ClusterOutlined },
  { path: '/settings', label: '设置', icon: ControlOutlined },
];

export default function AppLayout() {
  const { isAuth, loading, userName } = useAuth();
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
    if (el) {
      gsap.fromTo(
        el,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' },
      );
    }
  }, [location.pathname]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>加载中...</div>;
  if (!isAuth) return <Navigate to="/login" replace />;

  return (
    <div style={{ minHeight: '100vh', background: '#151515' }}>
      {/* 背景 */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background:
          'radial-gradient(ellipse at 28% 18%, rgba(255,255,255,0.035) 0%, transparent 42%), ' +
          'radial-gradient(ellipse at 78% 12%, rgba(150,145,135,0.04) 0%, transparent 38%), ' +
          'radial-gradient(ellipse at 52% 92%, rgba(95,92,86,0.055) 0%, transparent 56%), ' +
          'linear-gradient(180deg, #151515 0%, #151515 48%, #121212 100%)',
        pointerEvents: 'none',
      }} />

      {/* Top Header */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 100,
        background: 'transparent',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.085)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Mini-Drop</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            background: 'rgba(255,255,255,0.085)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
            padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
          }}>
            {userName || '用户'}
          </span>
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
        borderRight: '0.5px solid rgba(255,255,255,0.085)',
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
            const Icon = item.icon;
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
                  color: active ? '#fff' : 'rgba(255,255,255,0.64)',
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.76)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.64)';
                  }
                }}
              >
                <Icon style={{ fontSize: 15, color: active ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.42)', flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: 16, borderTop: '0.5px solid rgba(255,255,255,0.085)',
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

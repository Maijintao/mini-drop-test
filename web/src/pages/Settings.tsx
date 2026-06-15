import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import api, { getUsers } from '@/api';

gsap.registerPlugin(useGSAP);

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(25px)',
  WebkitBackdropFilter: 'blur(25px)',
  border: '0.5px solid rgba(255,255,255,0.085)',
  boxShadow:
    'inset 0 0 0 0.5px rgba(255,255,255,0.1), ' +
    'inset 0 1px 0 rgba(255,255,255,0.08), ' +
    '0 0 0 0.5px rgba(255,255,255,0.05), ' +
    '0 4px 24px rgba(0,0,0,0.1)',
  borderRadius: 16,
};

interface UserInfo {
  uid: string;
  name: string;
  groups?: unknown;
}

export default function Settings() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [apiHealthy, setApiHealthy] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [error, setError] = useState('');

  useGSAP(() => {
    gsap.fromTo('.settings-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.settings-section', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const load = async () => {
    setError('');
    setApiHealthy('checking');
    try {
      await api.get('/healthz');
      setApiHealthy('ok');
    } catch {
      setApiHealthy('fail');
    }

    try {
      const res = await getUsers();
      if (res.code === 0) setUser(res.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '用户信息加载失败');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = [
    { label: 'API Base URL', value: '/api/v1' },
    { label: '请求超时', value: '30000 ms' },
    { label: 'Cookie 鉴权', value: 'Drop_user_uid / Drop_user_name' },
    { label: 'API 健康状态', value: apiHealthy === 'checking' ? '检查中' : apiHealthy === 'ok' ? '正常' : '异常', color: apiHealthy === 'ok' ? '#4ade80' : apiHealthy === 'fail' ? '#f87171' : 'rgba(255,255,255,0.55)' },
  ];

  return (
    <div ref={containerRef}>
      <div className="settings-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>设置</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>查看当前前端运行配置和用户上下文</p>
      </div>

      {error && <div style={{ ...glassCard, padding: 18, marginBottom: 20, color: '#f87171' }}>{error}</div>}

      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 20px' }}>API 服务</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{item.label}</span>
              <span style={{ color: item.color || 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 20px' }}>当前用户</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'UID', value: user?.uid || '-' },
            { label: '用户名', value: user?.name || '-' },
            { label: '用户组', value: user?.groups ? JSON.stringify(user.groups) : '-' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{item.label}</span>
              <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={load}
        style={{
          padding: '10px 24px',
          background: 'rgba(255,255,255,0.1)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          color: '#fff',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        刷新状态
      </button>
    </div>
  );
}

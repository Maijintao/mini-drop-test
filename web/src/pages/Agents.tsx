import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(25px)',
  WebkitBackdropFilter: 'blur(25px)',
  border: '0.5px solid rgba(255,255,255,0.06)',
  boxShadow:
    'inset 0 0 0 0.5px rgba(255,255,255,0.1), ' +
    'inset 0 1px 0 rgba(255,255,255,0.08), ' +
    '0 0 0 0.5px rgba(255,255,255,0.05), ' +
    '0 4px 24px rgba(0,0,0,0.1)',
  borderRadius: 16,
};

const mockAgents = [
  { uid: 'agent-001', name: 'web-server-01', ip: '192.168.1.100', status: 'online', cpu: '12%', mem: '45%', tasks: 8, lastSeen: '2 分钟前' },
  { uid: 'agent-002', name: 'api-gateway-02', ip: '192.168.1.101', status: 'online', cpu: '8%', mem: '32%', tasks: 3, lastSeen: '1 分钟前' },
  { uid: 'agent-003', name: 'db-proxy-03', ip: '192.168.1.102', status: 'offline', cpu: '-', mem: '-', tasks: 0, lastSeen: '3 小时前' },
  { uid: 'agent-004', name: 'worker-node-04', ip: '192.168.1.103', status: 'online', cpu: '25%', mem: '68%', tasks: 12, lastSeen: '刚刚' },
];

export default function Agents() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  useGSAP(() => {
    gsap.fromTo(
      '.agent-header',
      { y: -10, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.35, ease: 'power2.out', clearProps: 'transform,opacity,visibility' },
    );
    gsap.fromTo(
      '.agent-card',
      { y: 14, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        stagger: 0.06,
        duration: 0.35,
        ease: 'power2.out',
        delay: 0.08,
        clearProps: 'transform,opacity,visibility',
      },
    );
  }, { scope: containerRef });

  const filtered = mockAgents.filter(a =>
    a.name.includes(search) || a.ip.includes(search)
  );

  return (
    <div ref={containerRef}>
      <div className="agent-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Agent 管理</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>查看和管理已注册的性能采集代理</p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '在线 Agent', value: '3', icon: '🟢', color: '#4ade80' },
          { label: '离线 Agent', value: '1', icon: '⚪', color: 'rgba(255,255,255,0.4)' },
          { label: '总任务数', value: '23', icon: '📊', color: '#60a5fa' },
        ].map((s, i) => (
          <div key={i} style={{ ...glassCard, padding: '20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{s.label}</span>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="搜索 Agent 名称或 IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 280, padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 10, fontSize: 13, color: '#fff', outline: 'none',
          }}
        />
      </div>

      {/* Agent Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {filtered.map((agent, i) => {
          const online = agent.status === 'online';
          return (
            <div key={i} className="agent-card" style={{
              ...glassCard, padding: 24, transition: 'all 0.15s',
            }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: online ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>🖥️</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{agent.name}</div>
                    <code style={{
                      fontSize: 12, color: 'rgba(255,255,255,0.35)',
                      background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4,
                    }}>{agent.ip}</code>
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: online ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
                  color: online ? '#4ade80' : 'rgba(255,255,255,0.35)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : 'rgba(255,255,255,0.3)' }} />
                  {online ? '在线' : '离线'}
                </span>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                padding: '12px 0', borderTop: '0.5px solid rgba(255,255,255,0.05)',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>CPU</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{agent.cpu}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>内存</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{agent.mem}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>任务数</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{agent.tasks}</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                最后活跃: {agent.lastSeen}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

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
    gsap.from('.agent-header', { y: -10, opacity: 0, duration: 0.4, ease: 'power2.out' });
    gsap.from('.agent-card', { y: 15, opacity: 0, stagger: 0.08, duration: 0.4, ease: 'power2.out', delay: 0.15 });
  }, { scope: containerRef });

  const filtered = mockAgents.filter(a =>
    a.name.includes(search) || a.ip.includes(search)
  );

  return (
    <div ref={containerRef}>
      <div className="agent-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 6px' }}>
          Agent 管理
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
          查看和管理已注册的性能采集代理
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '在线 Agent', value: '3', icon: '🟢', color: '#16a34a' },
          { label: '离线 Agent', value: '1', icon: '⚪', color: '#94a3b8' },
          { label: '总任务数', value: '23', icon: '📊', color: '#2563eb' },
        ].map((s, i) => (
          <div key={i} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{s.label}</span>
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
            width: 280, padding: '8px 14px', background: '#fff',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', outline: 'none',
          }}
        />
      </div>

      {/* Agent Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {filtered.map((agent, i) => {
          const online = agent.status === 'online';
          return (
            <div key={i} className="agent-card" style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: 24, transition: 'all 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: online ? '#f0fdf4' : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    🖥️
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{agent.name}</div>
                    <code style={{ fontSize: 12, color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>
                      {agent.ip}
                    </code>
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: online ? '#f0fdf4' : '#f1f5f9',
                  color: online ? '#16a34a' : '#94a3b8',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#16a34a' : '#94a3b8' }} />
                  {online ? '在线' : '离线'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>CPU</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{agent.cpu}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>内存</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{agent.mem}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>任务数</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{agent.tasks}</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                最后活跃: {agent.lastSeen}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

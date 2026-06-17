import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { getAgents, statAgent } from '@/api';
import type { AgentInfo, AgentStatData } from '@/domain';
import { formatRelativeTime } from '@/domain';

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

export default function Agents() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [stats, setStats] = useState<Record<string, AgentStatData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const loadAgents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAgents();
      const list = res.code === 0 ? (res.data || []) : [];
      setAgents(list);

      const statEntries = await Promise.all(
        list
          .filter(agent => agent.online)
          .map(async (agent) => {
            try {
              const stat = await statAgent(agent.ip_addr);
              return [agent.ip_addr, stat.data] as const;
            } catch {
              return [agent.ip_addr, undefined] as const;
            }
          }),
      );
      setStats(Object.fromEntries(statEntries.filter((entry): entry is readonly [string, AgentStatData] => Boolean(entry[1]))));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Agent 列表加载失败');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const filtered = useMemo(() => (
    agents.filter(a => a.hostname.includes(search) || a.ip_addr.includes(search))
  ), [agents, search]);

  const onlineCount = agents.filter(agent => agent.online).length;
  const offlineCount = agents.length - onlineCount;

  return (
    <div ref={containerRef}>
      <div className="agent-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Agent 管理</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>查看和管理已注册的性能采集代理</p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '在线 Agent', value: String(onlineCount), color: '#fff' },
          { label: '离线 Agent', value: String(offlineCount), color: '#fff' },
          { label: '总 Agent', value: String(agents.length), color: '#fff' },
        ].map((s, i) => (
          <div key={i} style={{ ...glassCard, padding: '20px 16px' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
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
          <button
            onClick={loadAgents}
            style={{
              padding: '10px 16px',
              background: 'rgba(255,255,255,0.085)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
            }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* Agent Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {loading && (
          <div style={{ ...glassCard, padding: 28, color: 'rgba(255,255,255,0.45)', gridColumn: '1 / -1' }}>加载 Agent 中...</div>
        )}
        {!loading && error && (
          <div style={{ ...glassCard, padding: 28, color: '#f87171', gridColumn: '1 / -1' }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ ...glassCard, padding: 28, color: 'rgba(255,255,255,0.45)', gridColumn: '1 / -1' }}>暂无 Agent</div>
        )}
        {!loading && filtered.map((agent) => {
          const online = agent.online;
          const stat = stats[agent.ip_addr];
          const cpu = stat?.self_pstats?.cpu_percent;
          const rssKb = stat?.self_pstats?.rss_kb;
          return (
            <div key={agent.id || agent.ip_addr} className="agent-card" style={{
              ...glassCard, padding: 24, transition: 'all 0.15s', cursor: 'pointer',
            }}
              onClick={() => navigate(`/agents/${encodeURIComponent(agent.ip_addr)}`)}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.085)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{agent.hostname || '-'}</div>
                    <code style={{
                      fontSize: 12, color: 'rgba(255,255,255,0.35)',
                      background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4,
                    }}>{agent.ip_addr}</code>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{typeof cpu === 'number' ? `${cpu.toFixed(1)}%` : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>RSS</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{typeof rssKb === 'number' ? `${Math.round(rssKb / 1024)} MB` : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>环境</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{agent.environment || '-'}</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                版本: {agent.version || '-'} · 最后心跳: {formatRelativeTime(agent.last_heartbeat)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

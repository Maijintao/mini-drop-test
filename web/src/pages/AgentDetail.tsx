import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { getAgents, getTasks, statAgent } from '@/api';
import type { AgentInfo, AgentStatData, HotmethodTask } from '@/domain';
import { formatDate, formatRelativeTime, statusMap } from '@/domain';

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

export default function AgentDetail() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const params = useParams();
  const ip = decodeURIComponent(params.ip || '');
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [stat, setStat] = useState<AgentStatData | null>(null);
  const [tasks, setTasks] = useState<HotmethodTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useGSAP(() => {
    gsap.fromTo('.agent-detail-block', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const load = async () => {
    if (!ip) return;
    setLoading(true);
    setError('');
    try {
      const [agentRes, taskRes] = await Promise.all([
        getAgents(),
        getTasks({ page: 1, size: 100, keyword: ip }),
      ]);
      const list = agentRes.code === 0 ? (agentRes.data || []) : [];
      const current = list.find(item => item.ip_addr === ip) || null;
      setAgent(current);
      setTasks((taskRes.data?.list || []).filter(task => task.target_ip === ip).slice(0, 12));
      if (current?.online) {
        const statRes = await statAgent(ip);
        setStat(statRes.data || null);
      } else {
        setStat(null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Agent 详情加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [ip]);

  const statRows = useMemo(() => {
    const self = stat?.self_pstats;
    const children = stat?.children_pstats;
    return [
      { label: 'Agent CPU', value: typeof self?.cpu_percent === 'number' ? `${self.cpu_percent.toFixed(1)}%` : '-' },
      { label: 'Agent RSS', value: typeof self?.rss_kb === 'number' ? `${Math.round(self.rss_kb / 1024)} MB` : '-' },
      { label: '子进程 CPU', value: typeof children?.cpu_percent === 'number' ? `${children.cpu_percent.toFixed(1)}%` : '-' },
      { label: '子进程 RSS', value: typeof children?.rss_kb === 'number' ? `${Math.round(children.rss_kb / 1024)} MB` : '-' },
    ];
  }, [stat]);

  return (
    <div ref={containerRef}>
      <div className="agent-detail-block" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <button onClick={() => navigate('/agents')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, padding: '2px 6px', borderRadius: 6 }}>←</button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Agent 详情</h1>
        </div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, paddingLeft: 36 }}>{ip || '-'}</p>
      </div>

      {loading && <div style={{ ...glassCard, padding: 24, color: 'rgba(255,255,255,0.45)' }}>加载 Agent 详情中...</div>}
      {!loading && error && <div style={{ ...glassCard, padding: 24, color: '#f87171' }}>{error}</div>}
      {!loading && !error && !agent && <div style={{ ...glassCard, padding: 24, color: 'rgba(255,255,255,0.45)' }}>Agent 不存在或无权限访问</div>}
      {!loading && !error && agent && (
        <>
          <div className="agent-detail-block" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginBottom: 20 }}>
            <div style={{ ...glassCard, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 20, color: '#fff', margin: '0 0 6px' }}>{agent.hostname || '-'}</h2>
                  <code style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', padding: '2px 7px', borderRadius: 5 }}>{agent.ip_addr}</code>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 6, background: agent.online ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)', color: agent.online ? '#4ade80' : 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600 }}>
                  {agent.online ? '在线' : '离线'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                {[
                  { label: '环境', value: agent.environment || '-' },
                  { label: '版本', value: agent.version || '-' },
                  { label: 'UID', value: agent.uid || '-' },
                  { label: 'GID', value: String(agent.gid || '-') },
                  { label: '最后心跳', value: formatRelativeTime(agent.last_heartbeat) },
                  { label: '注册时间', value: formatDate(agent.created_at) },
                ].map(item => (
                  <div key={item.label} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)', paddingBottom: 10 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.34)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...glassCard, padding: 22 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 18px' }}>实时资源</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {statRows.map(item => (
                  <div key={item.label} style={{ padding: 14, border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 10, background: 'rgba(255,255,255,0.025)' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.34)', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="agent-detail-block" style={{ ...glassCard, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.085)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, color: '#fff', margin: 0 }}>最近任务</h3>
              <button onClick={() => navigate(`/tasks`)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 13 }}>查看全部</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {tasks.length === 0 && <tr><td style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>暂无相关任务</td></tr>}
                {tasks.map((task, i) => {
                  const s = statusMap[task.status] || statusMap[0];
                  return (
                    <tr key={task.tid} style={{ borderBottom: i < tasks.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td style={{ padding: '13px 16px', color: 'rgba(255,255,255,0.82)', fontSize: 14 }}>{task.name || '-'}</td>
                      <td style={{ padding: '13px 16px', color: s.color, fontSize: 13 }}>{s.label}</td>
                      <td style={{ padding: '13px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{formatDate(task.create_time)}</td>
                      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                        <button onClick={() => navigate(`/task/result?tid=${task.tid}`)} style={{ background: 'none', border: 'none', color: 'rgba(96,165,250,0.9)', cursor: 'pointer', fontSize: 13 }}>详情</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

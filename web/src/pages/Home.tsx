import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { getTasks } from '@/api';

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

interface Task {
  tid: string;
  name: string;
  status: number;
  analysis_status: number;
  create_time: string;
}

const mockAgents = [
  {
    id: 'agent-001',
    hostname: 'web-server-01',
    ip: '192.168.1.100',
    online: true,
    version: '1.0.0',
    environment: 'production',
    lastHeartbeat: '刚刚',
  },
  {
    id: 'agent-002',
    hostname: 'api-gateway-02',
    ip: '192.168.1.101',
    online: true,
    version: '1.0.0',
    environment: 'staging',
    lastHeartbeat: '2 分钟前',
  },
  {
    id: 'agent-003',
    hostname: 'worker-node-04',
    ip: '192.168.1.103',
    online: false,
    version: '0.9.8',
    environment: 'dev',
    lastHeartbeat: '34 分钟前',
  },
];

const statusLabel: Record<number, { label: string; color: string }> = {
  0: { label: '新建', color: 'rgba(255,255,255,0.45)' },
  1: { label: '执行中', color: '#60a5fa' },
  2: { label: '成功', color: '#4ade80' },
  3: { label: '失败', color: '#f87171' },
};

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useGSAP(() => {
    gsap.from('.stat-card', { y: 15, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power2.out' });
    gsap.from('.section-card', { y: 15, opacity: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.2 });
    gsap.from('.hero-card', { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.1 });
  }, { scope: containerRef });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const taskRes = await getTasks({ page: 1, size: 100 });
        if ((taskRes as any).code === 0) setTasks((taskRes as any).data?.list || []);
      } catch (e) {
        console.error('Failed to fetch home data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const recentTasks = tasks.slice(0, 3);

  return (
    <div ref={containerRef}>
      {/* Hero Card */}
      <div className="hero-card" style={{
        ...glassCard, padding: 32, marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center',
      }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 12 }}>
            性能采集与分析
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 20 }}>
            一键采集 CPU/内存/IO 性能数据，自动生成火焰图和热点分析，AI 驱动的优化建议。
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px',
                background: 'rgba(255,255,255,0.1)',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            >
              + 新建采样
            </button>
            <button
              onClick={() => navigate('/tasks')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            >
              查看任务
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: '🔥', title: '火焰图分析', desc: '直观展示调用栈热点' },
            { icon: '📊', title: 'Top-N 热点函数', desc: '自动排序 CPU 消耗最高的函数' },
            { icon: '💡', title: 'AI 优化建议', desc: '基于分析结果给出优化方向' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
            }}>
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* My Agents */}
        <div className="section-card" style={{ ...glassCard, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                background: 'rgba(255,255,255,0.06)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}>A</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>我的 Agent</h3>
            </div>
            <button
              onClick={() => navigate('/agents')}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              查看全部 →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mockAgents.map((agent) => (
              <div key={agent.id} style={{
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: agent.online ? '#4ade80' : 'rgba(255,255,255,0.3)',
                      boxShadow: agent.online ? '0 0 10px rgba(74,222,128,0.45)' : 'none',
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.86)' }}>
                      {agent.hostname}
                    </span>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: 5,
                      background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.38)',
                      fontSize: 11,
                    }}>
                      {agent.environment}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.36)' }}>
                    {agent.ip} · v{agent.version} · 心跳 {agent.lastHeartbeat}
                  </div>
                </div>
                <button
                  onClick={() => setShowCreate(true)}
                  disabled={!agent.online}
                  style={{
                    padding: '7px 12px',
                    background: agent.online ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.025)',
                    border: '0.5px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    color: agent.online ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.28)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: agent.online ? 'pointer' : 'not-allowed',
                  }}
                >
                  采样
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="section-card" style={{ ...glassCard, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                background: 'rgba(255,255,255,0.06)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}>📋</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>最近任务</h3>
            </div>
            <button
              onClick={() => navigate('/tasks')}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              查看全部 →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                加载中...
              </div>
            ) : recentTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                暂无任务
              </div>
            ) : recentTasks.map((task) => {
              const s = statusLabel[task.status] || statusLabel[0];
              return (
                <div key={task.tid} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '0.5px solid rgba(255,255,255,0.05)',
                  borderRadius: 10,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onClick={() => navigate(`/task/result?tid=${task.tid}`)}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{task.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                      {task.create_time ? new Date(task.create_time).toLocaleString() : '-'}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: 'rgba(255,255,255,0.05)', color: s.color,
                  }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showCreate && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.58)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{ ...glassCard, padding: 28, width: '90%', maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>新建采样</h3>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>选择 Agent、采集类型和基础采样参数</div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  width: 32,
                  height: 32,
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.55)',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: 15 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.48)', marginBottom: 6 }}>目标 Agent</label>
                <select defaultValue={mockAgents.find(agent => agent.online)?.ip} style={{
                  width: '100%', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: '#fff',
                  outline: 'none',
                }}>
                  {mockAgents.map(agent => (
                    <option key={agent.id} value={agent.ip} disabled={!agent.online} style={{ background: '#1a1e2e' }}>
                      {agent.hostname} ({agent.ip}) {agent.online ? '' : '- 离线'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.48)', marginBottom: 6 }}>采集类型</label>
                  <select defaultValue="cpu" style={{
                    width: '100%', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#fff',
                    outline: 'none',
                  }}>
                    <option value="cpu" style={{ background: '#1a1e2e' }}>CPU / perf</option>
                    <option value="memory" style={{ background: '#1a1e2e' }}>内存采样</option>
                    <option value="io" style={{ background: '#1a1e2e' }}>IO 采样</option>
                    <option value="java" style={{ background: '#1a1e2e' }}>Java async-profiler</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.48)', marginBottom: 6 }}>目标 PID</label>
                  <input type="number" placeholder="例如 12345" style={{
                    width: '100%', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.48)', marginBottom: 6 }}>时长</label>
                  <input type="number" defaultValue={30} style={{
                    width: '100%', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.48)', marginBottom: 6 }}>频率 Hz</label>
                  <input type="number" defaultValue={99} style={{
                    width: '100%', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.48)', marginBottom: 6 }}>Callgraph</label>
                  <select defaultValue="dwarf" style={{
                    width: '100%', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#fff',
                    outline: 'none',
                  }}>
                    <option value="dwarf" style={{ background: '#1a1e2e' }}>dwarf</option>
                    <option value="fp" style={{ background: '#1a1e2e' }}>fp</option>
                    <option value="lbr" style={{ background: '#1a1e2e' }}>lbr</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '10px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: 'rgba(255,255,255,0.62)',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.12)',
                  border: '0.5px solid rgba(255,255,255,0.16)',
                  borderRadius: 10,
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                创建采样
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

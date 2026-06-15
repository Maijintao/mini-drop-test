import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { createTask, getAgents, getTasks } from '@/api';
import type { AgentInfo, CreateTaskParams, HotmethodTask } from '@/domain';
import { formatDate, formatRelativeTime, statusMap } from '@/domain';
import { waitForTaskResult } from '@/taskPolling';
import CreateTaskModal from '@/components/CreateTaskModal';

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

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<HotmethodTask[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateTaskParams>({
    name: '',
    type: 0,
    profiler_type: 0,
    target_ip: '',
    pid: 0,
    duration: 30,
    hz: 99,
    callgraph: 'dwarf',
    subprocess: true,
    event: 'cpu-cycles',
  });

  useGSAP(() => {
    gsap.from('.stat-card', { y: 15, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power2.out' });
    gsap.from('.section-card', { y: 15, opacity: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.2 });
    gsap.from('.hero-card', { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.1 });
  }, { scope: containerRef });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [taskRes, agentRes] = await Promise.all([
          getTasks({ page: 1, size: 100 }),
          getAgents(),
        ]);
        if (taskRes.code === 0) setTasks(taskRes.data?.list || []);
        if (agentRes.code === 0) {
          const list = agentRes.data || [];
          setAgents(list);
          const firstOnline = list.find(agent => agent.online);
          if (firstOnline) {
            setForm(prev => ({ ...prev, target_ip: prev.target_ip || firstOnline.ip_addr }));
          }
        }
      } catch (e) {
        console.error('Failed to fetch home data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const recentTasks = tasks.slice(0, 3);

  const submitTask = async () => {
    if (!form.target_ip || !form.pid || !form.duration) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        name: form.name || `CPU 采样 - ${form.target_ip}`,
        pid: Number(form.pid),
        duration: Number(form.duration),
        hz: Number(form.hz || 99),
      };
      const res = await createTask(payload);
      const tid = res.data?.tid;
      setShowCreate(false);
      const taskRes = await getTasks({ page: 1, size: 100 });
      if (taskRes.code === 0) setTasks(taskRes.data?.list || []);
      if (tid) {
        navigate(`/task/result?tid=${tid}`);
        void waitForTaskResult(tid).then(() => {
          navigate(`/task/result?tid=${tid}`, { replace: true });
        }).catch((e: any) => {
          console.error('task polling failed:', e);
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

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
            {agents.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                暂无 Agent
              </div>
            ) : agents.slice(0, 4).map((agent) => (
              <div key={agent.id || agent.ip_addr} style={{
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
                    {agent.ip_addr} · v{agent.version || '-'} · 心跳 {formatRelativeTime(agent.last_heartbeat)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setForm(prev => ({ ...prev, target_ip: agent.ip_addr }));
                    setShowCreate(true);
                  }}
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
              const s = statusMap[task.status] || statusMap[0];
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
                      {formatDate(task.create_time)}
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
        <CreateTaskModal
          agents={agents}
          form={form}
          submitting={submitting}
          title="新建采样"
          onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
          onCancel={() => setShowCreate(false)}
          onSubmit={submitTask}
        />
      )}
    </div>
  );
}

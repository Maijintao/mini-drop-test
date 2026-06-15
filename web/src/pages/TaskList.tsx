import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const mockTasks = [
  { tid: 'abc123', name: 'CPU 采样 - nginx', agent: 'web-server-01', ip: '192.168.1.100', status: 2, analysis: 2, duration: '30s', time: '2024-01-15 10:30' },
  { tid: 'def456', name: '内存分析 - java-app', agent: 'api-gateway-02', ip: '192.168.1.101', status: 1, analysis: 1, duration: '60s', time: '2024-01-15 11:00' },
  { tid: 'ghi789', name: 'IO 瓶颈排查', agent: 'worker-node-04', ip: '192.168.1.103', status: 0, analysis: 0, duration: '45s', time: '2024-01-15 11:30' },
  { tid: 'jkl012', name: 'CPU Profiling - redis', agent: 'web-server-01', ip: '192.168.1.100', status: 2, analysis: 2, duration: '30s', time: '2024-01-14 16:20' },
  { tid: 'mno345', name: '内存泄漏排查 - node-app', agent: 'api-gateway-02', ip: '192.168.1.101', status: 3, analysis: 0, duration: '120s', time: '2024-01-14 14:00' },
];

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '新建', color: 'rgba(255,255,255,0.45)' },
  1: { label: '执行中', color: '#60a5fa' },
  2: { label: '成功', color: '#4ade80' },
  3: { label: '失败', color: '#f87171' },
};

const analysisMap: Record<number, { label: string; color: string }> = {
  0: { label: '待分析', color: 'rgba(255,255,255,0.45)' },
  1: { label: '分析中', color: '#60a5fa' },
  2: { label: '已完成', color: '#4ade80' },
  3: { label: '失败', color: '#f87171' },
};

export default function TaskList() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useGSAP(() => {
    gsap.from('.task-header', { y: -10, opacity: 0, duration: 0.4, ease: 'power2.out' });
    gsap.from('.task-table-wrap', { y: 15, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.15 });
  }, { scope: containerRef });

  const filtered = mockTasks.filter(t =>
    t.name.includes(search) || t.ip.includes(search) || t.agent.includes(search)
  );

  return (
    <div ref={containerRef}>
      <div className="task-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>任务列表</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>管理和查看所有性能采集任务</p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '总任务', value: '23', color: '#fff' },
          { label: '进行中', value: '2', color: '#60a5fa' },
          { label: '已完成', value: '18', color: '#4ade80' },
          { label: '失败', value: '3', color: '#f87171' },
        ].map((s, i) => (
          <div key={i} style={{ ...glassCard, padding: '16px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="搜索任务名称、Agent 或 IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 300, padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 10, fontSize: 13, color: '#fff', outline: 'none',
          }}
        />
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '10px 20px',
            background: 'rgba(255,255,255,0.1)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          + 新建任务
        </button>
      </div>

      {/* Table */}
      <div className="task-table-wrap" style={{ ...glassCard, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              {['任务ID', '任务名称', 'Agent', '状态', '分析状态', '时长', '创建时间', '操作'].map(h => (
                <th key={h} style={{
                  padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                  color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((task, i) => {
              const s = statusMap[task.status];
              const a = analysisMap[task.analysis];
              return (
                <tr key={i} style={{
                  borderBottom: i < filtered.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 16px', fontSize: 13 }}>
                    <code style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '0.5px solid rgba(255,255,255,0.06)',
                      padding: '2px 8px', borderRadius: 4, fontSize: 12, color: 'rgba(255,255,255,0.55)',
                    }}>
                      {task.tid}
                    </code>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                    {task.name}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                    <div>{task.agent}</div>
                    <code style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{task.ip}</code>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)', color: s.color,
                    }}>
                      {s.label}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)', color: a.color,
                    }}>
                      {a.label}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{task.duration}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{task.time}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => navigate(`/task/result?tid=${task.tid}`)}
                        style={{
                          background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                          fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4,
                          transition: 'color 0.1s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                      >
                        详情
                      </button>
                      <button style={{
                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                        fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4,
                        transition: 'color 0.1s',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>共 {filtered.length} 条</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {['<', '1', '>'].map((p, i) => (
              <button key={i} style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: p === '1' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 6,
                color: p === '1' ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer',
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            ...glassCard, padding: 28, width: '90%', maxWidth: 520,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>新建采集任务</h3>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: 'none', border: 'none', fontSize: 20, color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                }}
              >✕</button>
            </div>

            <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>任务名称</label>
                <input type="text" placeholder="例: CPU 采样 - nginx" style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, fontSize: 14, outline: 'none', color: '#fff', boxSizing: 'border-box',
                }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>目标 Agent</label>
                <select style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, fontSize: 14, outline: 'none', color: '#fff', boxSizing: 'border-box',
                }}>
                  <option style={{ background: '#1a1e2e' }}>web-server-01 (192.168.1.100)</option>
                  <option style={{ background: '#1a1e2e' }}>api-gateway-02 (192.168.1.101)</option>
                  <option style={{ background: '#1a1e2e' }}>worker-node-04 (192.168.1.103)</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>采集类型</label>
                  <select style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, fontSize: 14, outline: 'none', color: '#fff', boxSizing: 'border-box',
                  }}>
                    <option style={{ background: '#1a1e2e' }}>CPU Profiling</option>
                    <option style={{ background: '#1a1e2e' }}>内存分析</option>
                    <option style={{ background: '#1a1e2e' }}>IO 分析</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>采集时长 (秒)</label>
                  <input type="number" defaultValue={30} style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, fontSize: 14, outline: 'none', color: '#fff', boxSizing: 'border-box',
                  }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 20px',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>取消</button>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 20px',
                background: 'rgba(255,255,255,0.1)',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>创建任务</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

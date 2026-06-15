import { useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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

const mockTopN = [
  { rank: 1, name: 'runtime.mallocgc', self: '12.5%', total: '18.2%', module: 'runtime' },
  { rank: 2, name: 'net/http.(*conn).serve', self: '8.3%', total: '15.7%', module: 'net/http' },
  { rank: 3, name: 'gin.(*Engine).ServeHTTP', self: '6.1%', total: '14.3%', module: 'gin' },
  { rank: 4, name: 'runtime.schedule', self: '5.8%', total: '9.2%', module: 'runtime' },
  { rank: 5, name: 'syscall.Syscall', self: '4.2%', total: '4.2%', module: 'syscall' },
  { rank: 6, name: 'runtime.mcall', self: '3.9%', total: '3.9%', module: 'runtime' },
  { rank: 7, name: 'json.(*decodeState).object', self: '3.1%', total: '7.8%', module: 'encoding/json' },
  { rank: 8, name: 'sync.(*Mutex).Lock', self: '2.8%', total: '2.8%', module: 'sync' },
];

const mockSuggestions = [
  { icon: '🔴', title: '高频内存分配', desc: 'runtime.mallocgc 占比过高(12.5%)，建议使用 sync.Pool 或预分配减少 GC 压力', severity: 'high' },
  { icon: '🟡', title: 'JSON 解析瓶颈', desc: 'encoding/json 占比 7.8%，考虑使用 jsoniter 或 easyjson 替代标准库', severity: 'medium' },
  { icon: '🟡', title: '锁竞争', desc: 'sync.(*Mutex).Lock 出现频繁，检查是否有热点锁或考虑使用 atomic 操作', severity: 'medium' },
  { icon: '🟢', title: 'IO 表现良好', desc: 'syscall.Syscall 占比较低(4.2%)，IO 操作不是当前瓶颈', severity: 'low' },
];

export default function TaskResult() {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('tid') || 'demo-task';
  const [activeTab, setActiveTab] = useState('flame');
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.from('.result-header', { y: -10, opacity: 0, duration: 0.4, ease: 'power2.out' });
    gsap.from('.result-stats > div', { y: 10, opacity: 0, stagger: 0.08, duration: 0.4, ease: 'power2.out', delay: 0.1 });
    gsap.from('.result-content', { y: 15, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.25 });
  }, { scope: containerRef });

  return (
    <div ref={containerRef}>
      <div className="result-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <button onClick={() => navigate('/tasks')} style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer', fontSize: 18, padding: '2px 6px', borderRadius: 6,
              }}>←</button>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>任务详情</h1>
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0, paddingLeft: 36 }}>
              任务 ID: <code style={{
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.06)',
                padding: '2px 8px', borderRadius: 4, fontSize: 13, color: 'rgba(255,255,255,0.55)',
              }}>{tid}</code>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>刷新</button>
            <button style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '0.5px solid rgba(255,255,255,0.15)',
              borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>触发分析</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="result-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '采集时长', value: '30', suffix: '秒', color: '#60a5fa' },
          { label: '采样数', value: '2,970', suffix: '', color: '#4ade80' },
          { label: '文件大小', value: '12.5', suffix: 'MB', color: '#a78bfa' },
          { label: '分析状态', value: '已完成', suffix: '', color: '#4ade80' },
        ].map((stat, i) => (
          <div key={i} style={{ ...glassCard, padding: '20px 16px' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>
              {stat.value}
              {stat.suffix && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>{stat.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + Content */}
      <div style={{ ...glassCard, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', gap: 4, padding: '16px 16px 0',
        }}>
          {[
            { key: 'flame', label: '🔥 火焰图' },
            { key: 'topn', label: '📊 热点函数' },
            { key: 'suggestions', label: '💡 优化建议' },
            { key: 'info', label: 'ℹ️ 基本信息' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s', border: 'none',
              background: activeTab === tab.key ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.45)',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="result-content" style={{ padding: '20px 24px 24px' }}>
          {activeTab === 'flame' && (
            <div style={{
              height: 420,
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 48 }}>🔥</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>火焰图将在此展示</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>需要先触发分析任务</div>
              <button style={{
                marginTop: 8, padding: '10px 24px',
                background: 'rgba(255,255,255,0.1)',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>触发分析</button>
            </div>
          )}

          {activeTab === 'topn' && (
            <div style={{
              border: '0.5px solid rgba(255,255,255,0.06)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                    {['排名', '函数名', 'Self %', 'Total %', '模块'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                        color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockTopN.map((fn, i) => (
                    <tr key={i} style={{
                      borderBottom: i < mockTopN.length - 1 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: 6, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                          background: i < 3 ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)',
                          color: i < 3 ? '#f87171' : 'rgba(255,255,255,0.45)',
                        }}>{fn.rank}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, fontFamily: 'monospace', color: 'rgba(255,255,255,0.85)' }}>{fn.name}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#f87171' }}>{fn.self}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{fn.total}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <code style={{
                          background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.06)',
                          padding: '2px 8px', borderRadius: 4, fontSize: 12, color: 'rgba(255,255,255,0.55)',
                        }}>{fn.module}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'suggestions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mockSuggestions.map((s, i) => (
                <div key={i} style={{
                  padding: '16px 20px', display: 'flex', gap: 14,
                  background: 'rgba(255,255,255,0.02)',
                  border: '0.5px solid rgba(255,255,255,0.06)',
                  borderLeft: `3px solid ${s.severity === 'high' ? 'rgba(248,113,113,0.6)' : s.severity === 'medium' ? 'rgba(251,191,36,0.6)' : 'rgba(74,222,128,0.6)'}`,
                  borderRadius: 12,
                }}>
                  <span style={{ fontSize: 24 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'info' && (
            <div style={{ padding: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                {[
                  { label: '任务ID', value: tid },
                  { label: '状态', value: '已完成', color: '#4ade80' },
                  { label: '目标 Agent', value: 'web-server-01' },
                  { label: '目标 IP', value: '192.168.1.100' },
                  { label: '采集类型', value: 'CPU Profiling' },
                  { label: '采样频率', value: '99 Hz' },
                  { label: '采集时长', value: '30 秒' },
                  { label: '创建时间', value: '2024-01-15 10:30:00' },
                  { label: '完成时间', value: '2024-01-15 10:30:35' },
                  { label: 'COS 路径', value: 'mini-drop/tasks/abc123/', color: '#60a5fa' },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '12px 0',
                    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{item.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: item.color || 'rgba(255,255,255,0.85)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

const mockTopN = [
  { rank: 1, name: 'runtime.mallocgc', self: '12.5%', total: '18.2%', module: 'runtime' },
  { rank: 2, name: 'net/http.(*conn).serve', self: '8.3%', total: '15.7%', module: 'net/http' },
  { rank: 3, name: 'github.com/gin-gonic/gin.(*Engine).ServeHTTP', self: '6.1%', total: '14.3%', module: 'gin' },
  { rank: 4, name: 'runtime.schedule', self: '5.8%', total: '9.2%', module: 'runtime' },
  { rank: 5, name: 'syscall.Syscall', self: '4.2%', total: '4.2%', module: 'syscall' },
  { rank: 6, name: 'runtime.mcall', self: '3.9%', total: '3.9%', module: 'runtime' },
  { rank: 7, name: 'encoding/json.(*decodeState).object', self: '3.1%', total: '7.8%', module: 'encoding/json' },
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
      {/* Page Title */}
      <div className="result-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <button
                onClick={() => navigate('/tasks')}
                style={{
                  background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                  fontSize: 18, padding: '2px 6px', borderRadius: 6,
                }}
              >
                ←
              </button>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                任务详情
              </h1>
            </div>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, paddingLeft: 36 }}>
              任务 ID: <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{tid}</code>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
              color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
              刷新
            </button>
            <button style={{
              padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
              触发分析
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="result-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '采集时长', value: '30', suffix: '秒', color: '#2563eb' },
          { label: '采样数', value: '2,970', suffix: '', color: '#16a34a' },
          { label: '文件大小', value: '12.5', suffix: 'MB', color: '#8b5cf6' },
          { label: '分析状态', value: '已完成', suffix: '', color: '#16a34a' },
        ].map((stat, i) => (
          <div key={i} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 16px',
          }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>
              {stat.value}
              {stat.suffix && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>{stat.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, margin: 16, borderRadius: 12, width: 'fit-content',
        }}>
          {[
            { key: 'flame', label: '🔥 火焰图' },
            { key: 'topn', label: '📊 热点函数' },
            { key: 'suggestions', label: '💡 优化建议' },
            { key: 'info', label: 'ℹ️ 基本信息' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s',
                background: activeTab === tab.key ? '#2563eb' : 'transparent',
                color: activeTab === tab.key ? '#fff' : '#64748b',
                border: 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="result-content" style={{ padding: '0 24px 24px' }}>
          {activeTab === 'flame' && (
            <div style={{
              height: 420, background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 48 }}>🔥</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#475569' }}>火焰图将在此展示</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>需要先触发分析任务</div>
              <button style={{
                marginTop: 8, padding: '10px 24px', background: '#2563eb', border: 'none',
                borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>
                触发分析
              </button>
            </div>
          )}

          {activeTab === 'topn' && (
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['排名', '函数名', 'Self %', 'Total %', '模块'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                        color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px',
                        borderBottom: '1px solid #e2e8f0',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockTopN.map((fn, i) => (
                    <tr key={i} style={{ borderBottom: i < mockTopN.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: 6, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                          background: i < 3 ? '#fef2f2' : '#f1f5f9', color: i < 3 ? '#dc2626' : '#64748b',
                        }}>
                          {fn.rank}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, fontFamily: 'monospace', color: '#1e293b' }}>
                        {fn.name}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
                        {fn.self}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                        {fn.total}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#475569' }}>
                          {fn.module}
                        </code>
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
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                  padding: '16px 20px', display: 'flex', gap: 14,
                  borderLeft: `3px solid ${s.severity === 'high' ? '#dc2626' : s.severity === 'medium' ? '#f59e0b' : '#16a34a'}`,
                }}>
                  <span style={{ fontSize: 24 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'info' && (
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                {[
                  { label: '任务ID', value: tid },
                  { label: '状态', value: '已完成', color: '#16a34a' },
                  { label: '目标 Agent', value: 'web-server-01' },
                  { label: '目标 IP', value: '192.168.1.100' },
                  { label: '采集类型', value: 'CPU Profiling' },
                  { label: '采样频率', value: '99 Hz' },
                  { label: '采集时长', value: '30 秒' },
                  { label: '创建时间', value: '2024-01-15 10:30:00' },
                  { label: '完成时间', value: '2024-01-15 10:30:35' },
                  { label: 'COS 路径', value: 'mini-drop/tasks/abc123/', color: '#2563eb' },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '12px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{item.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: item.color || '#1e293b' }}>{item.value}</span>
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

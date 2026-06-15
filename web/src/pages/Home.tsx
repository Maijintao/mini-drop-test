import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.from('.stat-card', { y: 15, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power2.out' });
    gsap.from('.section-card', { y: 15, opacity: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.2 });
    gsap.from('.hero-card', { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.1 });
  }, { scope: containerRef });

  return (
    <div ref={containerRef}>
      {/* Hero Card */}
      <div className="hero-card" style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
        padding: 32, marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center',
      }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', lineHeight: 1.3, marginBottom: 12 }}>
            性能采集与分析
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 20 }}>
            一键采集 CPU/内存/IO 性能数据，自动生成火焰图和热点分析，AI 驱动的优化建议。
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => navigate('/tasks')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
            >
              📋 查看任务
            </button>
            <button
              onClick={() => navigate('/agents')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0',
                borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#1e293b'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
            >
              🖥️ 管理 Agent
            </button>
          </div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {[
            { icon: '🔥', title: '火焰图分析', desc: '直观展示调用栈热点' },
            { icon: '📊', title: 'Top-N 热点函数', desc: '自动排序 CPU 消耗最高的函数' },
            { icon: '💡', title: 'AI 优化建议', desc: '基于分析结果给出优化方向' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: '#f8fafc', borderRadius: 10,
              border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '在线 Agent', value: '3', icon: '🟢', color: '#16a34a' },
          { label: '进行中任务', value: '2', icon: '⚡', color: '#2563eb' },
          { label: '完成任务', value: '18', icon: '✓', color: '#16a34a' },
          { label: '分析报告', value: '15', icon: '📊', color: '#8b5cf6' },
        ].map((stat, i) => (
          <div key={i} className="stat-card" style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '20px 16px',
            transition: 'all 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{stat.label}</span>
              <span style={{ fontSize: 16 }}>{stat.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Quick Start */}
        <div className="section-card" style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 32, height: 32, background: '#eff6ff', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            }}>🚀</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>快速开始</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { step: '1', title: '添加 Agent', desc: '在目标服务器部署 drop-agent，自动注册到平台' },
              { step: '2', title: '创建采集任务', desc: '选择目标进程，配置采样参数，一键下发' },
              { step: '3', title: '查看分析结果', desc: '火焰图、热点函数、AI 建议一目了然' },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '14px 16px', background: '#f8fafc', borderRadius: 10,
                borderLeft: '3px solid #2563eb',
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', marginBottom: 4 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="section-card" style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, background: '#f0fdf4', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}>📋</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>最近任务</h3>
            </div>
            <button
              onClick={() => navigate('/tasks')}
              style={{
                background: 'none', border: 'none', color: '#2563eb', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              查看全部 →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { name: 'CPU 采样 - nginx', status: '成功', color: '#16a34a', time: '10 分钟前' },
              { name: '内存分析 - java-app', status: '执行中', color: '#2563eb', time: '5 分钟前' },
              { name: 'IO 瓶颈排查', status: '新建', color: '#94a3b8', time: '刚刚' },
            ].map((task, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: '#f8fafc', borderRadius: 10,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onClick={() => navigate('/task/result?tid=demo')}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{task.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{task.time}</div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: task.color === '#16a34a' ? '#f0fdf4' : task.color === '#2563eb' ? '#eff6ff' : '#f1f5f9',
                  color: task.color,
                }}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

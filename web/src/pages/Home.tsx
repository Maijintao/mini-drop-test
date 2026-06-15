import { useRef } from 'react';
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

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.from('.section-card', { y: 15, opacity: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.2 });
    gsap.from('.hero-card', { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.1 });
  }, { scope: containerRef });

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
              onClick={() => navigate('/tasks')}
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
              📋 查看任务
            </button>
            <button
              onClick={() => navigate('/agents')}
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
              🖥️ 管理 Agent
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
        {/* Quick Start */}
        <div className="section-card" style={{ ...glassCard, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 32, height: 32,
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            }}>🚀</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>快速开始</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { step: '1', title: '添加 Agent', desc: '在目标服务器部署 drop-agent，自动注册到平台' },
              { step: '2', title: '创建采集任务', desc: '选择目标进程，配置采样参数，一键下发' },
              { step: '3', title: '查看分析结果', desc: '火焰图、热点函数、AI 建议一目了然' },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
                borderLeft: '3px solid rgba(255,255,255,0.2)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{item.desc}</div>
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
            {[
              { name: 'CPU 采样 - nginx', status: '成功', color: '#4ade80', time: '10 分钟前' },
              { name: '内存分析 - java-app', status: '执行中', color: '#60a5fa', time: '5 分钟前' },
              { name: 'IO 瓶颈排查', status: '新建', color: 'rgba(255,255,255,0.4)', time: '刚刚' },
            ].map((task, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onClick={() => navigate('/task/result?tid=demo')}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{task.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{task.time}</div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(255,255,255,0.05)',
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

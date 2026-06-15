import { useRef, useState } from 'react';
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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 10, fontSize: 14, color: '#fff', outline: 'none',
  boxSizing: 'border-box' as const,
};

export default function Settings() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);

  useGSAP(() => {
    gsap.from('.settings-header', { y: -10, opacity: 0, duration: 0.4, ease: 'power2.out' });
    gsap.from('.settings-section', { y: 15, opacity: 0, stagger: 0.1, duration: 0.4, ease: 'power2.out', delay: 0.15 });
  }, { scope: containerRef });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div ref={containerRef}>
      <div className="settings-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>设置</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>配置平台参数和分析引擎</p>
      </div>

      {/* API Server */}
      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>🌐</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>API 服务</h3>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>API 地址</label>
            <input type="text" defaultValue="http://localhost:8191" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>请求超时 (ms)</label>
            <input type="number" defaultValue="10000" style={{ ...inputStyle, width: 200 }} />
          </div>
        </div>
      </div>

      {/* Analysis Engine */}
      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>⚙️</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>分析引擎</h3>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Python 分析服务地址</label>
            <input type="text" defaultValue="http://localhost:8192" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>默认采样频率 (Hz)</label>
            <input type="number" defaultValue="99" style={{ ...inputStyle, width: 200 }} />
          </div>
        </div>
      </div>

      {/* COS Storage */}
      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>☁️</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>对象存储</h3>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>COS Bucket</label>
            <input type="text" defaultValue="mini-drop-1250000000" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Region</label>
            <input type="text" defaultValue="ap-guangzhou" style={{ ...inputStyle, width: 300 }} />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 24px',
            background: 'rgba(255,255,255,0.1)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          保存配置
        </button>
        {saved && (
          <span style={{ fontSize: 14, color: '#4ade80', fontWeight: 500 }}>✓ 已保存</span>
        )}
      </div>
    </div>
  );
}

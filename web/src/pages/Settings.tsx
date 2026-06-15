import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

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
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 6px' }}>
          设置
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
          配置平台参数和分析引擎
        </p>
      </div>

      {/* API Server */}
      <div className="settings-section" style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32, background: '#eff6ff', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>🌐</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>API 服务</h3>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
              API 地址
            </label>
            <input
              type="text"
              defaultValue="http://localhost:8191"
              style={{
                width: '100%', padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
              请求超时 (ms)
            </label>
            <input
              type="number"
              defaultValue="10000"
              style={{
                width: 200, padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Analysis Engine */}
      <div className="settings-section" style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32, background: '#f0fdf4', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>⚙️</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>分析引擎</h3>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
              Python 分析服务地址
            </label>
            <input
              type="text"
              defaultValue="http://localhost:8192"
              style={{
                width: '100%', padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
              默认采样频率 (Hz)
            </label>
            <input
              type="number"
              defaultValue="99"
              style={{
                width: 200, padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* COS Storage */}
      <div className="settings-section" style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32, background: '#fef3c7', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>☁️</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>对象存储</h3>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
              COS Bucket
            </label>
            <input
              type="text"
              defaultValue="mini-drop-1250000000"
              style={{
                width: '100%', padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
              Region
            </label>
            <input
              type="text"
              defaultValue="ap-guangzhou"
              style={{
                width: 300, padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 24px', background: '#2563eb', border: 'none', borderRadius: 10,
            color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
        >
          保存配置
        </button>
        {saved && (
          <span style={{ fontSize: 14, color: '#16a34a', fontWeight: 500 }}>✓ 已保存</span>
        )}
      </div>
    </div>
  );
}

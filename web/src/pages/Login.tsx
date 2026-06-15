import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import useAuth from '@/store/useAuth';

gsap.registerPlugin(useGSAP);

export default function Login() {
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.login-card', { y: 30, opacity: 0, duration: 0.8 }, 0.3)
      .from('.login-logo', { scale: 0.8, opacity: 0, duration: 0.5 }, 0.5)
      .from('.login-title', { y: -10, opacity: 0, duration: 0.4 }, 0.6)
      .from('.login-field', { y: 10, opacity: 0, stagger: 0.1, duration: 0.4 }, 0.7)
      .from('.login-hint', { opacity: 0, duration: 0.5 }, 1.0);
  }, { scope: containerRef });

  const handleLogin = async () => {
    if (!userName.trim()) return;
    setLoading(true);
    const uid = 'user-' + userName.trim();
    await login(uid, userName.trim());
    setLoading(false);
    navigate('/index', { replace: true });
  };

  return (
    <div ref={containerRef} style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
      background: '#0a0a0c',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'fixed', inset: 0,
        background:
          'radial-gradient(ellipse at 28% 18%, rgba(255,255,255,0.045) 0%, transparent 42%), ' +
          'radial-gradient(ellipse at 78% 12%, rgba(135,125,110,0.05) 0%, transparent 38%), ' +
          'radial-gradient(ellipse at 52% 92%, rgba(80,75,68,0.075) 0%, transparent 56%), ' +
          'linear-gradient(180deg, #0a0a0c 0%, #0d0d10 46%, #08080a 100%)',
        pointerEvents: 'none',
      }} />

      {/* 毛玻璃卡片 */}
      <div
        className="login-card"
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 420,
          padding: '48px 40px',
          borderRadius: 20,

          /* 纯透明毛玻璃 */
          background: 'transparent',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          border: '0.5px solid transparent',
          backgroundClip: 'padding-box',

          /* 多层阴影营造边框质感 */
          boxShadow:
            'inset 0 0 0 0.5px rgba(255,255,255,0.1), ' +
            'inset 0 1px 0 rgba(255,255,255,0.08), ' +
            '0 0 0 0.5px rgba(255,255,255,0.05), ' +
            '0 4px 24px rgba(0,0,0,0.1)',

          color: 'rgba(255,255,255,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* 顶部高光边 */}
        <div style={{
          position: 'absolute', top: 0, left: 16, right: 16, height: 1,
          background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.15) 15%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 85%, transparent 95%)',
          borderRadius: '20px 20px 0 0',
          pointerEvents: 'none',
        }} />
        {/* 左侧高光边 */}
        <div style={{
          position: 'absolute', top: 16, left: 0, bottom: 16, width: 1,
          background: 'linear-gradient(180deg, transparent 5%, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 80%, transparent 95%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div className="login-logo" style={{ textAlign: 'center', marginBottom: 12, position: 'relative' }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>M</span>
          </div>
        </div>

        {/* 标题 */}
        <div className="login-title" style={{ textAlign: 'center', marginBottom: 36, position: 'relative' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
            Mini-Drop
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            性能采集与分析平台
          </p>
        </div>

        {/* 输入框 */}
        <div className="login-field" style={{ marginBottom: 20, position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            用户名
          </label>
          <input
            type="text"
            placeholder="输入任意用户名即可登录"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%', padding: '14px 18px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              color: '#fff', fontSize: 15, outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.25)';
              e.target.style.background = 'rgba(255,255,255,0.08)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.1)';
              e.target.style.background = 'rgba(255,255,255,0.05)';
            }}
          />
        </div>

        {/* 登录按钮 */}
        <button
          className="login-field"
          onClick={handleLogin}
          disabled={loading || !userName.trim()}
          style={{
            width: '100%', padding: '14px 0', marginTop: 4,
            background: userName.trim() ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 14,
            color: userName.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 15, fontWeight: 600,
            cursor: userName.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (userName.trim()) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.18)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = userName.trim() ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
          }}
        >
          {loading ? '登录中...' : '登 录'}
        </button>

        {/* 底部提示 */}
        <p className="login-hint" style={{
          textAlign: 'center', fontSize: 12,
          color: 'rgba(255,255,255,0.3)', marginTop: 32, marginBottom: 0,
          position: 'relative',
        }}>
          开发模式 · 输入任意用户名即可进入
        </p>
      </div>
    </div>
  );
}

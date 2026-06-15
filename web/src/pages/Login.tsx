import { useState, useRef, useCallback } from 'react';
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
  const glowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const glow = glowRef.current;
    if (!glow) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    glow.style.background = `radial-gradient(400px circle at ${x}px ${y}px, rgba(37,99,235,0.1), transparent 60%)`;
  }, []);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.login-card', { y: 30, opacity: 0, duration: 0.7 }, 0.2)
      .from('.login-logo', { scale: 0.8, opacity: 0, duration: 0.5 }, 0.35)
      .from('.login-title', { y: -10, opacity: 0, duration: 0.4 }, 0.45)
      .from('.login-field', { y: 10, opacity: 0, stagger: 0.1, duration: 0.4 }, 0.55)
      .from('.login-hint', { opacity: 0, duration: 0.5 }, 0.85)
      .from('.bg-blob', { scale: 0, opacity: 0, stagger: 0.15, duration: 0.8, ease: 'elastic.out(1, 0.5)' }, 0.1);
  });

  const handleLogin = async () => {
    if (!userName.trim()) return;
    setLoading(true);
    const uid = 'user-' + userName.trim();
    await login(uid, userName.trim());
    setLoading(false);
    navigate('/index', { replace: true });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: '#f0f2f5',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background Decorations - 让毛玻璃有效果 */}
      <div className="bg-blob" style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />
      <div className="bg-blob" style={{
        position: 'absolute', bottom: '-15%', right: '-5%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />
      <div className="bg-blob" style={{
        position: 'absolute', top: '30%', right: '20%',
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
        filter: 'blur(35px)', pointerEvents: 'none',
      }} />

      {/* 毛玻璃卡片 */}
      <div
        ref={cardRef}
        className="login-card"
        onMouseMove={handleMouseMove}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 420,
          padding: '48px 40px',
          borderRadius: 24,
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* 鼠标跟随高光 */}
        <div
          ref={glowRef}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 24,
            pointerEvents: 'none',
            transition: 'background 0.1s',
          }}
        />

        {/* 顶部高光线 */}
        <div style={{
          position: 'absolute', top: 0, left: 32, right: 32, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.8) 70%, transparent)',
        }} />

        {/* Logo */}
        <div className="login-logo" style={{ textAlign: 'center', marginBottom: 12, position: 'relative' }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18,
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(15,23,42,0.2)',
          }}>
            <span style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>M</span>
          </div>
        </div>

        {/* 标题 */}
        <div className="login-title" style={{ textAlign: 'center', marginBottom: 36, position: 'relative' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
            Mini-Drop
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            性能采集与分析平台
          </p>
        </div>

        {/* 输入框 */}
        <div className="login-field" style={{ marginBottom: 20, position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
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
              background: 'rgba(255, 255, 255, 0.5)',
              border: '1.5px solid rgba(226, 232, 240, 0.8)',
              borderRadius: 14,
              color: '#1e293b', fontSize: 15, outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#2563eb';
              e.target.style.background = 'rgba(255, 255, 255, 0.8)';
              e.target.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.08)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(226, 232, 240, 0.8)';
              e.target.style.background = 'rgba(255, 255, 255, 0.5)';
              e.target.style.boxShadow = 'none';
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
            background: userName.trim() ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#e2e8f0',
            border: 'none',
            borderRadius: 14,
            color: userName.trim() ? '#fff' : '#94a3b8',
            fontSize: 15, fontWeight: 600,
            cursor: userName.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            boxShadow: userName.trim() ? '0 4px 12px rgba(37,99,235,0.25)' : 'none',
          }}
          onMouseEnter={(e) => {
            if (userName.trim()) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = userName.trim() ? '0 4px 12px rgba(37,99,235,0.25)' : 'none';
          }}
        >
          {loading ? '登录中...' : '登 录'}
        </button>

        {/* 底部提示 */}
        <p className="login-hint" style={{
          textAlign: 'center', fontSize: 12,
          color: '#94a3b8', marginTop: 32, marginBottom: 0,
          position: 'relative',
        }}>
          开发模式 · 输入任意用户名即可进入
        </p>
      </div>
    </div>
  );
}

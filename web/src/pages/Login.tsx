import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import useAuth from '@/store/useAuth';

gsap.registerPlugin(useGSAP);

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
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

  const handleSubmit = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      navigate('/index', { replace: true });
    } catch (e: any) {
      setError(e?.message || (mode === 'login' ? '登录失败' : '注册失败'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.trim().length >= 2 && password.length >= 4 && !loading;

  return (
    <div ref={containerRef} style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
      background: '#151515',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'fixed', inset: 0,
        background:
          'radial-gradient(ellipse at 28% 18%, rgba(255,255,255,0.035) 0%, transparent 42%), ' +
          'radial-gradient(ellipse at 78% 12%, rgba(150,145,135,0.04) 0%, transparent 38%), ' +
          'radial-gradient(ellipse at 52% 92%, rgba(95,92,86,0.055) 0%, transparent 56%), ' +
          'linear-gradient(180deg, #151515 0%, #151515 48%, #121212 100%)',
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
          background: 'transparent',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          border: '0.5px solid transparent',
          backgroundClip: 'padding-box',
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

        {/* 用户名 */}
        <div className="login-field" style={{ marginBottom: 16, position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            用户名
          </label>
          <input
            type="text"
            placeholder="2-32 个字符"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
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

        {/* 密码 */}
        <div className="login-field" style={{ marginBottom: 20, position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            密码
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="至少 4 个字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              style={{
                width: '100%', padding: '14px 48px 14px 18px',
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
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 4,
              }}
            >
              {showPassword ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{
            marginBottom: 16, padding: '10px 14px',
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 10, fontSize: 13, color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          className="login-field"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '14px 0', marginTop: 4,
            background: canSubmit ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 14,
            color: canSubmit ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 15, fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (canSubmit) e.currentTarget.style.background = 'rgba(255,255,255,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = canSubmit ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
          }}
        >
          {loading ? '处理中...' : mode === 'login' ? '登 录' : '注 册'}
        </button>

        {/* 切换登录/注册 */}
        <p className="login-hint" style={{
          textAlign: 'center', fontSize: 13,
          color: 'rgba(255,255,255,0.35)', marginTop: 20, marginBottom: 0,
          position: 'relative',
        }}>
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{
              background: 'none', border: 'none', color: 'rgba(96,165,250,0.8)',
              cursor: 'pointer', fontSize: 13, marginLeft: 4,
            }}
          >
            {mode === 'login' ? '去注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  );
}

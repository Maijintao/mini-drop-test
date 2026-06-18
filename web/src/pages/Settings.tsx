import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import api, { getLLMSettings, getUsers, updateLLMSettings } from '@/api';
import type { LLMSettings } from '@/domain';

gsap.registerPlugin(useGSAP);

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(25px)',
  WebkitBackdropFilter: 'blur(25px)',
  border: '0.5px solid rgba(255,255,255,0.085)',
  boxShadow:
    'inset 0 0 0 0.5px rgba(255,255,255,0.1), ' +
    'inset 0 1px 0 rgba(255,255,255,0.08), ' +
    '0 0 0 0.5px rgba(255,255,255,0.05), ' +
    '0 4px 24px rgba(0,0,0,0.1)',
  borderRadius: 16,
};

interface UserInfo {
  uid: string;
  name: string;
  groups?: unknown;
}

export default function Settings() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [apiHealthy, setApiHealthy] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [error, setError] = useState('');
  const [llm, setLlm] = useState<LLMSettings>({ base_url: '', model: 'gpt-4o-mini' });
  const [llmTokenInput, setLlmTokenInput] = useState('');
  const [savingLLM, setSavingLLM] = useState(false);

  useGSAP(() => {
    gsap.fromTo('.settings-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.settings-section', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const load = async () => {
    setError('');
    setApiHealthy('checking');
    try {
      await api.get('/healthz');
      setApiHealthy('ok');
    } catch {
      setApiHealthy('fail');
    }

    try {
      const res = await getUsers();
      if (res.code === 0) setUser(res.data || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '用户信息加载失败');
    }

    try {
      const res = await getLLMSettings();
      if (res.code === 0 && res.data) setLlm(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'LLM 设置加载失败');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = [
    { label: 'API Base URL', value: '/api/v1' },
    { label: '请求超时', value: '30000 ms' },
    { label: 'Cookie 鉴权', value: 'Drop_user_uid / Drop_user_name' },
    { label: 'API 健康状态', value: apiHealthy === 'checking' ? '检查中' : apiHealthy === 'ok' ? '正常' : '异常', color: apiHealthy === 'ok' ? '#4ade80' : apiHealthy === 'fail' ? '#f87171' : 'rgba(255,255,255,0.55)' },
  ];

  const saveLLM = async (clearToken = false) => {
    setSavingLLM(true);
    setError('');
    try {
      const res = await updateLLMSettings({
        base_url: llm.base_url || '',
        model: llm.model || 'gpt-4o-mini',
        token: clearToken ? '' : llmTokenInput,
        clear_token: clearToken,
      });
      if (res.code !== 0) throw new Error(res.message || 'LLM 设置保存失败');
      if (res.data) setLlm(res.data);
      setLlmTokenInput('');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'LLM 设置保存失败');
    } finally {
      setSavingLLM(false);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="settings-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>设置</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>查看当前前端运行配置和用户上下文</p>
      </div>

      {error && <div style={{ ...glassCard, padding: 18, marginBottom: 20, color: '#f87171' }}>{error}</div>}

      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 20px' }}>API 服务</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{item.label}</span>
              <span style={{ color: item.color || 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 20px' }}>当前用户</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'UID', value: user?.uid || '-' },
            { label: '用户名', value: user?.name || '-' },
            { label: '用户组', value: user?.groups ? JSON.stringify(user.groups) : '-' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{item.label}</span>
              <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section" style={{ ...glassCard, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 20px' }}>LLM 归因</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 7 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Base URL</span>
            <input
              value={llm.base_url || ''}
              onChange={(e) => setLlm(prev => ({ ...prev, base_url: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              style={{ padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', outline: 'none' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 7 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Model</span>
            <input
              value={llm.model || ''}
              onChange={(e) => setLlm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="gpt-4o-mini"
              style={{ padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', outline: 'none' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 7 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
              Token {llm.token_configured ? `(${llm.token_masked || '已配置'})` : '(未配置)'}
            </span>
            <input
              value={llmTokenInput}
              onChange={(e) => setLlmTokenInput(e.target.value)}
              placeholder={llm.token_configured ? '留空则保留当前 token' : 'sk-...'}
              type="password"
              style={{ padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', outline: 'none' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => saveLLM(false)}
              disabled={savingLLM}
              style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 9, color: '#fff', cursor: savingLLM ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              {savingLLM ? '保存中...' : '保存 LLM 设置'}
            </button>
            <button
              onClick={() => saveLLM(true)}
              disabled={savingLLM || !llm.token_configured}
              style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.035)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 9, color: 'rgba(255,255,255,0.58)', cursor: savingLLM || !llm.token_configured ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              清除 Token
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={load}
        style={{
          padding: '10px 24px',
          background: 'rgba(255,255,255,0.1)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          color: '#fff',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        刷新状态
      </button>
    </div>
  );
}

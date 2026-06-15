import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { createScheduleTask, deleteScheduleTask, getAgents, getScheduleTasks } from '@/api';
import type { AgentInfo, CreateScheduleTaskParams, HotmethodTask } from '@/domain';
import { formatDate, parseTaskParams, taskTypeMap } from '@/domain';

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

const fieldStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  background: 'rgba(255,255,255,0.035)',
  border: '0.5px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...fieldStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  color: 'rgba(255,255,255,0.56)',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.3) 50%), ' +
    'linear-gradient(135deg, rgba(255,255,255,0.3) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 17px) 17px, calc(100% - 12px) 17px',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  paddingRight: 34,
};

const buttonStyle: React.CSSProperties = {
  padding: '9px 14px',
  background: 'rgba(255,255,255,0.075)',
  border: '0.5px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.78)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const defaultForm: CreateScheduleTaskParams = {
  task_name: '',
  type: 0,
  profiler_type: 0,
  target_ip: '',
  pid: 0,
  duration: 30,
  hz: 99,
  callgraph: 'dwarf',
  cron_expr: '0 * * * *',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.44)' }}>{label}</span>
      {children}
    </label>
  );
}

export default function Schedules() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<HotmethodTask[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [form, setForm] = useState<CreateScheduleTaskParams>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useGSAP(() => {
    gsap.fromTo('.schedule-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.schedule-panel', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const onlineAgents = useMemo(() => agents.filter(agent => agent.online), [agents]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [scheduleRes, agentRes] = await Promise.all([
        getScheduleTasks(),
        getAgents(),
      ]);
      if (scheduleRes.code === 0) setTasks(scheduleRes.data || []);
      if (agentRes.code === 0) {
        const list = agentRes.data || [];
        setAgents(list);
        const firstOnline = list.find(agent => agent.online);
        if (firstOnline) setForm(prev => ({ ...prev, target_ip: prev.target_ip || firstOnline.ip_addr }));
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '定时任务加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const canSubmit = Boolean(form.task_name.trim() && form.target_ip && form.pid && form.duration && form.cron_expr.trim() && !submitting);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await createScheduleTask({
        ...form,
        task_name: form.task_name.trim(),
        pid: Number(form.pid),
        duration: Number(form.duration),
        hz: Number(form.hz || 99),
        cron_expr: form.cron_expr.trim(),
      });
      setMessage('定时任务已创建');
      setForm(prev => ({ ...defaultForm, target_ip: prev.target_ip }));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '创建定时任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (tid: string) => {
    if (!window.confirm(`确认删除定时任务 ${tid}？`)) return;
    setError('');
    setMessage('');
    try {
      await deleteScheduleTask(tid);
      setMessage('定时任务已删除');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '删除定时任务失败');
    }
  };

  const stats = {
    total: tasks.length,
    activeAgents: onlineAgents.length,
    cronCount: tasks.filter(task => parseTaskParams(task.request_params).cron_expr).length,
  };

  return (
    <div ref={containerRef}>
      <div className="schedule-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>定时任务</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>创建和管理周期性性能采集任务</p>
      </div>

      {(error || message) && (
        <div style={{ ...glassCard, padding: 16, marginBottom: 18, color: error ? '#f87171' : '#4ade80' }}>
          {error || message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: '定时任务', value: String(stats.total), color: '#fff' },
          { label: '可用 Agent', value: String(stats.activeAgents), color: '#4ade80' },
          { label: 'Cron 配置', value: String(stats.cronCount), color: '#60a5fa' },
        ].map(item => (
          <div key={item.label} style={{ ...glassCard, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="schedule-panel" style={{ ...glassCard, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>创建定时采集</h3>
          <button onClick={load} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.42)', cursor: 'pointer', fontSize: 13 }}>刷新</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.8fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="任务名称">
            <input value={form.task_name} onChange={(e) => setForm(prev => ({ ...prev, task_name: e.target.value }))} placeholder="hourly-cpu" style={fieldStyle} />
          </Field>
          <Field label="目标 Agent">
            <select value={form.target_ip} onChange={(e) => setForm(prev => ({ ...prev, target_ip: e.target.value }))} style={selectStyle}>
              <option value="" style={{ background: '#0a0a0c', color: 'rgba(255,255,255,0.5)' }}>选择在线 Agent</option>
              {agents.map(agent => (
                <option key={agent.id || agent.ip_addr} value={agent.ip_addr} disabled={!agent.online} style={{ background: '#0a0a0c', color: 'rgba(255,255,255,0.58)' }}>
                  {agent.hostname || agent.ip_addr} / {agent.ip_addr}{agent.online ? '' : ' / 离线'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PID">
            <input type="number" value={form.pid || ''} onChange={(e) => setForm(prev => ({ ...prev, pid: Number(e.target.value) }))} placeholder="1234" style={fieldStyle} />
          </Field>
          <Field label="时长">
            <input type="number" value={form.duration || ''} onChange={(e) => setForm(prev => ({ ...prev, duration: Number(e.target.value) }))} style={fieldStyle} />
          </Field>
          <Field label="频率">
            <input type="number" value={form.hz || ''} onChange={(e) => setForm(prev => ({ ...prev, hz: Number(e.target.value) }))} style={fieldStyle} />
          </Field>
          <Field label="Cron">
            <input value={form.cron_expr} onChange={(e) => setForm(prev => ({ ...prev, cron_expr: e.target.value }))} placeholder="0 * * * *" style={fieldStyle} />
          </Field>
          <button onClick={submit} disabled={!canSubmit} style={{ ...buttonStyle, height: 40, opacity: canSubmit ? 1 : 0.45 }}>
            创建
          </button>
        </div>
      </div>

      <div className="schedule-panel" style={{ ...glassCard, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              {['任务ID', '任务名称', '目标 IP', 'Cron', '类型', 'PID', '时长', '创建时间', '操作'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>加载定时任务中...</td></tr>}
            {!loading && tasks.length === 0 && <tr><td colSpan={9} style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>暂无定时任务</td></tr>}
            {!loading && tasks.map((task, i) => {
              const params = parseTaskParams(task.request_params);
              return (
                <tr key={task.tid} style={{ borderBottom: i < tasks.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '14px 16px', fontSize: 13 }}><code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'rgba(255,255,255,0.55)' }}>{task.tid}</code></td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{task.name || '-'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{task.target_ip}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#60a5fa', fontFamily: 'monospace' }}>{params.cron_expr || '-'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{taskTypeMap[task.type] || task.type}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{params.pid || '-'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{params.duration ? `${params.duration}s` : '-'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{formatDate(task.create_time)}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => remove(task.tid)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.85)', cursor: 'pointer', fontSize: 13 }}>删除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

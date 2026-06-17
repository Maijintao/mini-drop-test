import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { createTask, deleteTask, getAgents, getTasks, retryTask } from '@/api';
import type { AgentInfo, CreateTaskParams, HotmethodTask } from '@/domain';
import { analysisMap, formatDate, formatDuration, statusMap } from '@/domain';
import { waitForTaskResult } from '@/taskPolling';
import CreateTaskModal from '@/components/CreateTaskModal';
import ScheduleTasksPanel from '@/components/ScheduleTasksPanel';

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  fontSize: 14,
  outline: 'none',
  color: '#fff',
  boxSizing: 'border-box',
};

const defaultForm: CreateTaskParams = {
  name: '',
  type: 0,
  profiler_type: 0,
  target_ip: '',
  pid: 0,
  duration: 30,
  hz: 99,
  callgraph: 'dwarf',
  subprocess: true,
  event: 'cpu-cycles',
};

export default function TaskList() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [tasks, setTasks] = useState<HotmethodTask[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateTaskParams>(defaultForm);
  const [activeView, setActiveView] = useState<'tasks' | 'schedules'>('tasks');

  useGSAP(() => {
    gsap.fromTo('.task-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.task-table-wrap', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const loadTasks = async (nextPage = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await getTasks({ page: nextPage, size: pageSize, keyword: search || undefined });
      if (res.code === 0) {
        setTasks(res.data?.list || []);
        setTotal(res.data?.total || 0);
        setPage(res.data?.page || nextPage);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '任务列表加载失败');
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const res = await getAgents();
      const list = res.code === 0 ? (res.data || []) : [];
      setAgents(list);
      const firstOnline = list.find(agent => agent.online);
      if (firstOnline) setForm(prev => ({ ...prev, target_ip: prev.target_ip || firstOnline.ip_addr }));
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    setActiveView(viewParam === 'schedules' ? 'schedules' : 'tasks');
  }, [viewParam]);

  useEffect(() => {
    loadTasks(1);
    loadAgents();
  }, []);

  const stats = useMemo(() => ({
    total,
    running: tasks.filter(task => task.status === 1).length,
    done: tasks.filter(task => task.status === 3).length,
    failed: tasks.filter(task => task.status === 4).length,
  }), [tasks, total]);

  const submitCreate = async () => {
    if (!form.target_ip || !form.pid || !form.duration) return;
    setSubmitting(true);
    try {
      const res = await createTask({
        ...form,
        name: form.name || `CPU 采样 - ${form.target_ip}`,
        pid: Number(form.pid),
        duration: Number(form.duration),
        hz: Number(form.hz || 99),
      });
      const tid = res.data?.tid;
      setShowCreate(false);
      setForm(prev => ({ ...defaultForm, target_ip: prev.target_ip }));
      await loadTasks(1);
      if (tid) {
        navigate(`/task/result?tid=${tid}`);
        void waitForTaskResult(tid).then(() => {
          navigate(`/task/result?tid=${tid}`, { replace: true });
        }).catch((e: any) => {
          console.error('task polling failed:', e);
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const removeTask = async (tid: string) => {
    if (!window.confirm(`确认删除任务 ${tid}？`)) return;
    await deleteTask(tid);
    await loadTasks(page);
  };

  const retry = async (tid: string) => {
    await retryTask(tid);
    await loadTasks(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div ref={containerRef}>
      <div className="task-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>任务列表</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>管理和查看所有性能采集任务</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '总任务', value: String(stats.total), color: '#fff' },
          { label: '进行中', value: String(stats.running), color: '#fff' },
          { label: '已完成', value: String(stats.done), color: '#fff' },
          { label: '失败', value: String(stats.failed), color: '#fff' },
        ].map((s) => (
          <div key={s.label} style={{ ...glassCard, padding: '16px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'tasks', label: '采集任务' },
          { key: 'schedules', label: '定时任务' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key as 'tasks' | 'schedules')}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '0.5px solid rgba(255,255,255,0.08)',
              background: activeView === tab.key ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              color: activeView === tab.key ? '#fff' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === 'tasks' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder="搜索任务名称或 IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadTasks(1)}
                style={{ ...inputStyle, width: 300, fontSize: 13 }}
              />
              <button onClick={() => loadTasks(1)} style={{
                padding: '10px 16px',
                background: 'rgba(255,255,255,0.085)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }}>搜索</button>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '10px 20px',
                background: 'rgba(255,255,255,0.1)',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              + 新建任务
            </button>
          </div>

          <div className="task-table-wrap" style={{ ...glassCard, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.085)' }}>
                  {['任务ID', '任务名称', '目标 IP', '状态', '分析状态', '时长', '创建时间', '操作'].map(h => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                      color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>加载任务中...</td></tr>
                )}
                {!loading && error && (
                  <tr><td colSpan={8} style={{ padding: 24, color: '#f87171' }}>{error}</td></tr>
                )}
                {!loading && !error && tasks.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>暂无任务</td></tr>
                )}
                {!loading && tasks.map((task, i) => {
                  const s = statusMap[task.status] || statusMap[0];
                  const a = analysisMap[task.analysis_status] || analysisMap[0];
                  return (
                    <tr key={task.tid} style={{ borderBottom: i < tasks.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td style={{ padding: '14px 16px', fontSize: 13 }}>
                        <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'rgba(255,255,255,0.55)' }}>{task.tid}</code>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{task.name || '-'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{task.target_ip}</td>
                      <td style={{ padding: '14px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: s.color }}>{s.label}</span></td>
                      <td style={{ padding: '14px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: a.color }}>{a.label}</span></td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{formatDuration(task)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{formatDate(task.create_time)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => navigate(`/task/result?tid=${task.tid}`)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>详情</button>
                          <button onClick={() => retry(task.tid)} style={{ background: 'none', border: 'none', color: 'rgba(96,165,250,0.9)', cursor: 'pointer' }}>重试</button>
                          <button onClick={() => removeTask(task.tid)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.85)', cursor: 'pointer' }}>删除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '0.5px solid rgba(255,255,255,0.085)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>共 {total} 条</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button disabled={page <= 1} onClick={() => loadTasks(page - 1)} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>{'<'}</button>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => loadTasks(page + 1)} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>{'>'}</button>
              </div>
            </div>
          </div>

          {showCreate && (
            <CreateTaskModal
              agents={agents}
              form={form}
              submitting={submitting}
              onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
              onCancel={() => setShowCreate(false)}
              onSubmit={submitCreate}
            />
          )}
        </>
      )}

      {activeView === 'schedules' && (
        <ScheduleTasksPanel agents={agents} />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { fetchSignedJson, getFlameData, getSuggestions, getTaskDetail, triggerAnalysis } from '@/api';
import type { AnalysisSuggestion, HotmethodTask, TopFunction } from '@/domain';
import { analysisMap, basename, formatDate, formatDuration, parseTaskParams, profilerTypeMap, statusMap, taskTypeMap } from '@/domain';

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

export default function TaskResult() {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('tid') || '';
  const [activeTab, setActiveTab] = useState('flame');
  const [task, setTask] = useState<HotmethodTask | null>(null);
  const [suggestions, setSuggestions] = useState<AnalysisSuggestion[]>([]);
  const [flameUrl, setFlameUrl] = useState('');
  const [topn, setTopn] = useState<TopFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.fromTo('.result-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.result-stats > div', { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.result-content', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, delay: 0.15, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const loadTask = useCallback(async () => {
    if (!tid) return;
    setError('');
    try {
      const detailRes = await getTaskDetail(tid);
      if (detailRes.code === 0 && detailRes.data?.task) {
        setTask(detailRes.data.task);
        setSuggestions(detailRes.data.suggestions || []);
      }

      try {
        const suggestionRes = await getSuggestions(tid);
        if (suggestionRes.code === 0) setSuggestions(suggestionRes.data || []);
      } catch {
        // suggestions are also included in task detail; keep whatever we have.
      }

      try {
        const flameRes = await getFlameData(tid);
        if (flameRes.code === 0 && flameRes.data?.url) {
          if (flameRes.data.type === 'svg') {
            setFlameUrl(flameRes.data.url);
          } else if (flameRes.data.type === 'json') {
            const data = await fetchSignedJson<TopFunction[]>(flameRes.data.url);
            setTopn(Array.isArray(data) ? data : []);
          }
        }
      } catch {
        setFlameUrl('');
      }

      const files = Array.isArray(detailRes.data?.cos_files) ? detailRes.data.cos_files : [];
      const topFile = files.find(file => basename(file.key || file.name).toLowerCase() === 'top.json');
      if (topFile?.url) {
        try {
          const data = await fetchSignedJson<TopFunction[]>(topFile.url);
          setTopn(Array.isArray(data) ? data : []);
        } catch {
          setTopn([]);
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '任务详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [tid]);

  useEffect(() => {
    setLoading(true);
    loadTask();
  }, [loadTask]);

  useEffect(() => {
    if (!task || task.status >= 2) return;
    const id = window.setInterval(loadTask, 3000);
    return () => window.clearInterval(id);
  }, [task, loadTask]);

  const runAnalysis = async () => {
    if (!tid) return;
    setAnalysisMessage('');
    try {
      await triggerAnalysis(tid);
      setAnalysisMessage('分析已触发');
      await loadTask();
    } catch (e: any) {
      setAnalysisMessage(e?.response?.data?.message || e?.message || '触发分析失败');
    }
  };

  const params = useMemo(() => parseTaskParams(task?.request_params), [task]);
  const totalSamples = topn.reduce((sum, item) => sum + (Number(item.self) || 0), 0);
  const status = task ? (statusMap[task.status] || statusMap[0]) : statusMap[0];
  const analysis = task ? (analysisMap[task.analysis_status] || analysisMap[0]) : analysisMap[0];

  return (
    <div ref={containerRef}>
      <div className="result-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <button onClick={() => navigate('/tasks')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, padding: '2px 6px', borderRadius: 6 }}>←</button>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>任务详情</h1>
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0, paddingLeft: 36 }}>
              任务 ID: <code style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{tid || '-'}</code>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {analysisMessage && <span style={{ color: analysisMessage.includes('失败') ? '#f87171' : '#4ade80', fontSize: 13 }}>{analysisMessage}</span>}
            <button onClick={loadTask} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>刷新</button>
            <button onClick={runAnalysis} disabled={!task || task.status !== 2} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 500, cursor: !task || task.status !== 2 ? 'not-allowed' : 'pointer' }}>触发分析</button>
          </div>
        </div>
      </div>

      {loading && <div style={{ ...glassCard, padding: 24, color: 'rgba(255,255,255,0.45)' }}>加载任务详情中...</div>}
      {!loading && error && <div style={{ ...glassCard, padding: 24, color: '#f87171' }}>{error}</div>}
      {!loading && !error && task && (
        <>
          <div className="result-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: '采集时长', value: formatDuration(task), color: '#60a5fa' },
              { label: '采样数', value: String(totalSamples || '-'), color: '#4ade80' },
              { label: '任务状态', value: status.label, color: status.color },
              { label: '分析状态', value: analysis.label, color: analysis.color },
            ].map((stat) => (
              <div key={stat.label} style={{ ...glassCard, padding: '20px 16px' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{stat.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ ...glassCard, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 4, padding: '16px 16px 0' }}>
              {[
                { key: 'info', label: '基本信息' },
                { key: 'flame', label: '火焰图' },
                { key: 'topn', label: '热点函数' },
                { key: 'suggestions', label: '优化建议' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '8px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', border: 'none', background: activeTab === tab.key ? 'rgba(255,255,255,0.1)' : 'transparent', color: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.45)' }}>{tab.label}</button>
              ))}
            </div>

            <div className="result-content" style={{ padding: '20px 24px 24px' }}>
              {activeTab === 'flame' && (
                flameUrl ? (
                  <iframe title="flamegraph" src={flameUrl} style={{ width: '100%', height: 520, border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, background: '#fff' }} />
                ) : (
                  <div style={{ height: 420, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>暂无火焰图</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>任务完成并分析后会显示 flamegraph.svg</div>
                    <button onClick={runAnalysis} disabled={task.status !== 2} style={{ marginTop: 8, padding: '10px 24px', background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: task.status !== 2 ? 'not-allowed' : 'pointer' }}>触发分析</button>
                  </div>
                )
              )}

              {activeTab === 'topn' && (
                <div style={{ border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>{['排名', '函数名', 'Self', 'Inclusive', 'Self %'].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: 0 }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {topn.length === 0 && <tr><td colSpan={5} style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>暂无 TopN 数据</td></tr>}
                      {topn.map((fn, i) => (
                        <tr key={`${fn.func}-${i}`} style={{ borderBottom: i < topn.length - 1 ? '0.5px solid rgba(255,255,255,0.03)' : 'none' }}>
                          <td style={{ padding: '14px 16px' }}><span style={{ width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: i < 3 ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)', color: i < 3 ? '#f87171' : 'rgba(255,255,255,0.45)' }}>{i + 1}</span></td>
                          <td style={{ padding: '14px 16px', fontSize: 13, fontFamily: 'monospace', color: 'rgba(255,255,255,0.85)' }}>{fn.func}</td>
                          <td style={{ padding: '14px 16px', color: '#f87171', fontWeight: 600 }}>{fn.self}</td>
                          <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.85)' }}>{fn.total}</td>
                          <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.65)' }}>{totalSamples ? `${((fn.self / totalSamples) * 100).toFixed(2)}%` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'suggestions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {suggestions.length === 0 && <div style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>暂无优化建议</div>}
                  {suggestions.map((item) => (
                    <div key={item.id || item.func} style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(96,165,250,0.65)', borderRadius: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>{item.func || '建议'}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{item.suggestion || item.ai_suggestion || '-'}</div>
                      {item.ai_suggestion && <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{item.ai_suggestion}</div>}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'info' && (
                <div style={{ padding: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                    {[
                      { label: '任务ID', value: task.tid },
                      { label: '任务名称', value: task.name || '-' },
                      { label: '状态', value: status.label, color: status.color },
                      { label: '目标 IP', value: task.target_ip },
                      { label: '采集类型', value: taskTypeMap[task.type] || String(task.type) },
                      { label: '采集器', value: profilerTypeMap[task.profiler_type] || String(task.profiler_type) },
                      { label: '目标 PID', value: String(params.pid || '-') },
                      { label: '采样频率', value: params.hz ? `${params.hz} Hz` : '-' },
                      { label: 'Callgraph', value: params.callgraph || '-' },
                      { label: '创建时间', value: formatDate(task.create_time) },
                      { label: '开始时间', value: formatDate(task.begin_time) },
                      { label: '结束时间', value: formatDate(task.end_time) },
                      { label: '状态说明', value: task.status_info || '-' },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{item.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 500, color: item.color || 'rgba(255,255,255,0.85)', textAlign: 'right' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

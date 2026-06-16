import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Button, Card, Table, Tabs, Typography, Space, message, Spin, Empty } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { fetchSignedJson, getCosFiles, getFlameData, getSuggestions, getTaskDetail, triggerAnalysis } from '@/api';
import type { AnalysisSuggestion, CosFile, HotmethodTask, TopFunction } from '@/domain';
import { analysisMap, basename, formatDate, formatDuration, parseTaskParams, profilerTypeMap, statusMap, taskTypeMap } from '@/domain';
import FlameGraph from '@/components/FlameGraph';

const { Text, Title } = Typography;

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

export default function TaskResult() {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('tid') || '';
  const [activeTab, setActiveTab] = useState('flame');
  const [task, setTask] = useState<HotmethodTask | null>(null);
  const [suggestions, setSuggestions] = useState<AnalysisSuggestion[]>([]);
  const [flameUrl, setFlameUrl] = useState('');
  const [flameLoading, setFlameLoading] = useState(false);
  const [flameError, setFlameError] = useState('');
  const [topn, setTopn] = useState<TopFunction[]>([]);
  const [cosFiles, setCosFiles] = useState<CosFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.fromTo('.result-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.result-stats', { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.result-content', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, delay: 0.15, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const loadTask = useCallback(async () => {
    if (!tid) {
      setError('缺少任务 ID');
      setLoading(false);
      return;
    }
    setError('');

    try {
      const detailRes = await getTaskDetail(tid);
      if (detailRes.code === 0 && detailRes.data?.task) {
        setTask(detailRes.data.task);
        setSuggestions(detailRes.data.suggestions || []);
        setCosFiles(Array.isArray(detailRes.data.cos_files) ? detailRes.data.cos_files : []);
      } else {
        throw new Error(detailRes.message || '任务不存在');
      }

      try {
        const suggestionRes = await getSuggestions(tid);
        if (suggestionRes.code === 0) setSuggestions(suggestionRes.data || []);
      } catch {
        // suggestions are also included in task detail; keep whatever we have.
      }

      try {
        const flameRes = await getFlameData(tid);
        setFlameError('');
        if (flameRes.code === 0 && flameRes.data?.url) {
          if (flameRes.data.type === 'svg') {
            setFlameUrl(flameRes.data.url);
          } else if (flameRes.data.type === 'json') {
            const data = await fetchSignedJson<TopFunction[]>(flameRes.data.url);
            setTopn(Array.isArray(data) ? data : []);
            setFlameUrl('');
          }
        }
      } catch {
        setFlameUrl('');
        setFlameError('暂无可渲染的 flamegraph.svg');
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

      if (files.length === 0) {
        try {
          const fileRes = await getCosFiles(tid);
          setCosFiles(Array.isArray(fileRes.data) ? fileRes.data : []);
        } catch {
          setCosFiles([]);
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

  useEffect(() => {
    if (flameUrl) setFlameLoading(true);
  }, [flameUrl]);

  const runAnalysis = async () => {
    if (!tid) return;
    try {
      await triggerAnalysis(tid);
      message.success('分析已触发');
      await loadTask();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '触发分析失败');
    }
  };

  const params = useMemo(() => parseTaskParams(task?.request_params), [task]);
  const totalSamples = topn.reduce((sum, item) => sum + (Number(item.self) || 0), 0);
  const status = task ? (statusMap[task.status] || statusMap[0]) : statusMap[0];
  const analysis = task ? (analysisMap[task.analysis_status] || analysisMap[0]) : analysisMap[0];

  // TopN 表格列定义
  const topnColumns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 60,
      render: (_: any, __: any, index: number) => (
        <span style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          background: index < 3 ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)',
          color: index < 3 ? '#f87171' : 'rgba(255,255,255,0.45)',
        }}>
          {index + 1}
        </span>
      ),
    },
    {
      title: '函数名',
      dataIndex: 'func',
      key: 'func',
      render: (text: string) => (
        <Text code style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Self',
      dataIndex: 'self',
      key: 'self',
      width: 100,
      render: (text: number) => <Text style={{ color: '#f87171', fontWeight: 600 }}>{text}</Text>,
    },
    {
      title: 'Inclusive',
      dataIndex: 'total',
      key: 'total',
      width: 100,
      render: (text: number) => <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{text}</Text>,
    },
    {
      title: 'Self %',
      key: 'self_pct',
      width: 100,
      render: (_: any, record: TopFunction) => (
        <Text style={{ color: 'rgba(255,255,255,0.65)' }}>
          {totalSamples ? `${((record.self / totalSamples) * 100).toFixed(2)}%` : '-'}
        </Text>
      ),
    },
  ];

  // 文件表格列定义
  const fileColumns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record: CosFile) => {
        const key = record.key || record.name || '';
        const name = basename(key);
        const isPerfData = name === 'perf.data';
        return <Text style={{ color: isPerfData ? '#fbbf24' : 'rgba(255,255,255,0.85)', fontWeight: isPerfData ? 700 : 500 }}>{name || '-'}</Text>;
      },
    },
    {
      title: '对象 Key',
      dataIndex: 'key',
      key: 'key',
      render: (text: string) => <Text code style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{text || '-'}</Text>,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (text: number) => <Text style={{ color: 'rgba(255,255,255,0.45)' }}>{text ? `${(text / 1024).toFixed(1)} KB` : '-'}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: CosFile) => (
        <Button type="link" href={record.url} target="_blank" rel="noopener noreferrer" style={{ padding: 0 }}>
          下载
        </Button>
      ),
    },
  ];

  // 任务信息项
  const infoItems = [
    { label: '任务ID', value: task?.tid },
    { label: '任务名称', value: task?.name || '-' },
    { label: '状态', value: status.label, color: status.color },
    { label: '目标 IP', value: task?.target_ip },
    { label: '采集类型', value: taskTypeMap[task?.type || 0] || String(task?.type || 0) },
    { label: '采集器', value: profilerTypeMap[task?.profiler_type || 0] || String(task?.profiler_type || 0) },
    { label: '目标 PID', value: String(params.pid || '-') },
    { label: '采样频率', value: params.hz ? `${params.hz} Hz` : '-' },
    { label: 'Callgraph', value: params.callgraph || '-' },
    { label: '创建时间', value: formatDate(task?.create_time) },
    { label: '开始时间', value: formatDate(task?.begin_time) },
    { label: '结束时间', value: formatDate(task?.end_time) },
    { label: '状态说明', value: task?.status_info || '-' },
  ];

  return (
    <div ref={containerRef}>
      <div className="result-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')} style={{ color: 'rgba(255,255,255,0.4)' }} />
              <Title level={4} style={{ margin: 0, color: '#fff' }}>任务详情</Title>
            </div>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingLeft: 36 }}>
              任务 ID: <Text code style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.085)', padding: '2px 8px', borderRadius: 4, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{tid || '-'}</Text>
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadTask}>刷新</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={runAnalysis} disabled={!task || task.status !== 2}>触发分析</Button>
          </Space>
        </div>
      </div>

      {loading && <Card style={glassCard}><Spin tip="加载任务详情中..." /></Card>}
      {!loading && error && <Card style={glassCard}><Text type="danger">{error}</Text></Card>}
      {!loading && !error && task && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="result-stats">
            {[
              { label: '采集时长', value: formatDuration(task), color: '#60a5fa' },
              { label: '采样数', value: String(totalSamples || '-'), color: '#4ade80' },
              { label: '任务状态', value: status.label, color: status.color },
              { label: '分析状态', value: analysis.label, color: analysis.color },
            ].map((s) => (
              <div key={s.label} style={{ ...glassCard, padding: '16px' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <Card className="result-content" style={{ ...glassCard, overflow: 'hidden' }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'info',
                  label: '基本信息',
                  children: (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                      {infoItems.map((item) => (
                        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</Text>
                          <Text style={{ fontWeight: 500, color: item.color || 'rgba(255,255,255,0.85)', textAlign: 'right' }}>{item.value}</Text>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'flame',
                  label: '火焰图',
                  children: (
                    flameUrl ? (
                      <div style={{ border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 12px',
                          background: '#f8fafc',
                          borderBottom: '1px solid #e5e7eb',
                        }}>
                          <Text strong style={{ color: '#111827', fontSize: 13 }}>
                            flamegraph.svg
                            {flameLoading && <Text style={{ marginLeft: 8, color: '#64748b', fontWeight: 500 }}>加载中...</Text>}
                          </Text>
                          <Space>
                            <Button size="small" onClick={() => setFlameUrl((url) => `${url}${url.includes('?') ? '&' : '?'}_reload=${Date.now()}`)}>刷新</Button>
                            <Button size="small" onClick={() => window.open(flameUrl, '_blank', 'noopener,noreferrer')}>新窗口打开</Button>
                          </Space>
                        </div>
                        {flameError && (
                          <div style={{ padding: '8px 12px', color: '#b91c1c', background: '#fee2e2', fontSize: 12 }}>
                            {flameError}
                          </div>
                        )}
                        <iframe
                          title={`flamegraph-${tid}`}
                          src={flameUrl}
                          onLoad={() => {
                            setFlameLoading(false);
                            setFlameError('');
                          }}
                          onError={() => {
                            setFlameLoading(false);
                            setFlameError('火焰图加载失败，签名 URL 可能已过期');
                          }}
                          style={{ width: '100%', height: 560, border: 0, display: 'block', background: '#fff' }}
                        />
                      </div>
                    ) : topn.length > 0 ? (
                      <FlameGraph data={topn} width={900} height={400} />
                    ) : (
                      <Empty description={flameError || '暂无可渲染的火焰图数据'} />
                    )
                  ),
                },
                {
                  key: 'topn',
                  label: '热点函数',
                  children: (
                    <Table
                      dataSource={topn}
                      columns={topnColumns}
                      rowKey={(record) => `${record.func}-${record.self}`}
                      pagination={false}
                      size="small"
                      style={{ background: 'transparent' }}
                    />
                  ),
                },
                {
                  key: 'suggestions',
                  label: '优化建议',
                  children: (
                    suggestions.length === 0 ? (
                      <Empty description="暂无优化建议" />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {suggestions.map((item) => (
                          <Card key={item.id || item.func} size="small" style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.085)', borderLeft: '3px solid rgba(96,165,250,0.65)' }}>
                            <Text strong style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', display: 'block', marginBottom: 6 }}>{item.func || '建议'}</Text>
                            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{item.suggestion || item.ai_suggestion || '-'}</Text>
                            {item.ai_suggestion && <Text style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, display: 'block' }}>{item.ai_suggestion}</Text>}
                          </Card>
                        ))}
                      </div>
                    )
                  ),
                },
                {
                  key: 'files',
                  label: '文件下载',
                  children: (
                    <Table
                      dataSource={cosFiles}
                      columns={fileColumns}
                      rowKey={(record) => record.key || record.url || Math.random().toString()}
                      pagination={false}
                      size="small"
                      style={{ background: 'transparent' }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

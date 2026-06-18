import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Button, Card, Table, Tabs, Typography, Space, message, Spin, Statistic, Row, Col } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, ArrowLeftOutlined, FireOutlined } from '@ant-design/icons';
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
  const [collapsedText, setCollapsedText] = useState('');
  const [cosFiles, setCosFiles] = useState<CosFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eBpfData, setEBpfData] = useState<any>(null);
  const [eBpfLoading, setEBpfLoading] = useState(false);
  const [pprofCpuData, setPprofCpuData] = useState<Record<string, number> | null>(null);
  const [pprofHeapData, setPprofHeapData] = useState<any[] | null>(null);
  const [pprofLoading, setPprofLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<HotmethodTask | null>(null);
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
    setEBpfData(null);
    setEBpfLoading(false);
    setPprofCpuData(null);
    setPprofHeapData(null);
    setPprofLoading(false);

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

      // 确保 files 列表有数据（task detail 可能返回 null）
      let files = Array.isArray(detailRes.data?.cos_files) ? detailRes.data.cos_files : [];
      if (files.length === 0) {
        try {
          const fileRes = await getCosFiles(tid);
          const freshFiles = Array.isArray(fileRes.data) ? fileRes.data : [];
          setCosFiles(freshFiles);
          files = freshFiles;
        } catch {
          setCosFiles([]);
        }
      }

      // 加载 top.json（如果 getFlameData 没有返回，从 cos_files 加载）
      const topFile = files.find(file => basename(file.key || file.name).toLowerCase() === 'top.json');
      if (topFile?.url) {
        try {
          const data = await fetchSignedJson<TopFunction[]>(topFile.url);
          setTopn(Array.isArray(data) ? data : []);
        } catch {
          setTopn([]);
        }
      }

      // 加载 collapsed.txt 用于层次火焰图渲染
      const collapsedFile = files.find(file => basename(file.key || file.name).toLowerCase() === 'collapsed.txt');
      if (collapsedFile?.url) {
        try {
          const res = await axios.get<string>(collapsedFile.url, { withCredentials: false, timeout: 30000, responseType: 'text' });
          if (typeof res.data === 'string' && res.data.length > 0) {
            setCollapsedText(res.data);
          }
        } catch {
          setCollapsedText('');
        }
      }

      // 加载 eBPF 分析数据（biosnoop_stats.json 等）
      const allFiles = files;
      const eBpfFile = allFiles.find(f => {
        const name = basename(f.key || f.name || '').toLowerCase();
        return name === 'biosnoop_stats.json' || name === 'resource_stats.json';
      });
      if (eBpfFile?.url) {
        setEBpfLoading(true);
        try {
          const data = await fetchSignedJson<any>(eBpfFile.url);
          setEBpfData(data);
        } catch {
          setEBpfData(null);
        } finally {
          setEBpfLoading(false);
        }
      }

      // 加载用户态语言级采集器分析数据（pprof CPU / Heap）
      const pprofCpuFile = allFiles.find(f => basename(f.key || f.name || '').toLowerCase() === 'pprof_cpu.json');
      const pprofHeapFile = allFiles.find(f => basename(f.key || f.name || '').toLowerCase() === 'pprof_heap.json');
      if (pprofCpuFile?.url || pprofHeapFile?.url) {
        setPprofLoading(true);
        try {
          if (pprofCpuFile?.url) {
            const data = await fetchSignedJson<Record<string, number>>(pprofCpuFile.url);
            setPprofCpuData(data && typeof data === 'object' && !Array.isArray(data) ? data : null);
          }
          if (pprofHeapFile?.url) {
            const data = await fetchSignedJson<any[]>(pprofHeapFile.url);
            setPprofHeapData(Array.isArray(data) ? data : null);
          }
        } catch {
          setPprofCpuData(null);
          setPprofHeapData(null);
        } finally {
          setPprofLoading(false);
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
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!loadTask) return;
    const id = window.setInterval(() => {
      const t = taskRef.current;
      if (!t || t.status >= 4) {
        window.clearInterval(id);
        return;
      }
      loadTask();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadTask]);

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
  const pprofCpuRows = useMemo(() => {
    if (!pprofCpuData) return [];
    return Object.entries(pprofCpuData)
      .map(([func, flat]) => ({ func, flat: Number(flat) || 0 }))
      .sort((a, b) => b.flat - a.flat);
  }, [pprofCpuData]);
  const pprofCpuTotal = pprofCpuRows.reduce((sum, row) => sum + row.flat, 0);
  const pprofHeapRows = useMemo(() => {
    if (!pprofHeapData) return [];
    return pprofHeapData
      .map((row) => ({
        func: String(row.func || '-'),
        flat_space: Number(row.flat_space) || 0,
        cum_space: Number(row.cum_space) || 0,
        flat_objects: Number(row.flat_objects) || 0,
        cum_objects: Number(row.cum_objects) || 0,
      }))
      .sort((a, b) => b.flat_space - a.flat_space || b.cum_space - a.cum_space);
  }, [pprofHeapData]);

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
    { label: '状态', value: status.label },
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
            <Button icon={<FireOutlined />} onClick={() => navigate(`/flame/diff?tid1=${tid}`)}>火焰图对比</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={runAnalysis} disabled={!task || task.status !== 4}>触发分析</Button>
          </Space>
        </div>
      </div>

      {loading && <Card style={glassCard}><Spin tip="加载任务详情中..." /></Card>}
      {!loading && error && <Card style={glassCard}><Text type="danger">{error}</Text></Card>}
      {!loading && !error && task && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="result-stats">
            {[
              { label: '采集时长', value: formatDuration(task) },
              { label: '采样数', value: String(totalSamples || '-') },
              { label: '任务状态', value: status.label },
              { label: '分析状态', value: analysis.label },
            ].map((s) => (
              <div key={s.label} style={{ ...glassCard, padding: '16px' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{s.value}</div>
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
                          <Text style={{ color: 'rgba(255,255,255,0.5)' }}>{item.label}</Text>
                          <Text style={{ fontWeight: 500, color: 'rgba(255,255,255,0.85)', textAlign: 'right' }}>{item.value}</Text>
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
                      <div style={{ border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                        }}>
                          <Text strong style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                            flamegraph.svg
                            {flameLoading && <Text style={{ marginLeft: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>加载中...</Text>}
                          </Text>
                          <Space>
                            <Button size="small" onClick={() => setFlameUrl((url) => `${url}${url.includes('?') ? '&' : '?'}_reload=${Date.now()}`)}>刷新</Button>
                            <Button size="small" onClick={() => window.open(flameUrl, '_blank', 'noopener,noreferrer')}>新窗口打开</Button>
                          </Space>
                        </div>
                        {flameError && (
                          <div style={{ padding: '8px 12px', color: '#f87171', background: 'rgba(248,113,113,0.1)', fontSize: 12 }}>
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
                    ) : (topn.length > 0 || collapsedText) ? (
                      <FlameGraph data={topn} collapsedText={collapsedText} width={900} height={400} />
                    ) : (
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>{flameError || '暂无可渲染的火焰图数据'}</div>
                      </div>
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
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>暂无优化建议</div>
                      </div>
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
                  key: 'ebpf',
                  label: 'eBPF 分析',
                  children: (
                    eBpfLoading ? (
                      <Spin tip="加载 eBPF 数据中..." />
                    ) : eBpfData ? (
                      <div>
                        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                          {eBpfData.total_events !== undefined && (
                            <Col span={6}>
                              <Statistic title="总事件数" value={eBpfData.total_events} />
                            </Col>
                          )}
                          {eBpfData.total_reads !== undefined && (
                            <Col span={6}>
                              <Statistic title="读操作" value={eBpfData.total_reads} />
                            </Col>
                          )}
                          {eBpfData.total_writes !== undefined && (
                            <Col span={6}>
                              <Statistic title="写操作" value={eBpfData.total_writes} />
                            </Col>
                          )}
                          {eBpfData.avg_latency_ms !== undefined && (
                            <Col span={6}>
                              <Statistic title="平均延迟" value={eBpfData.avg_latency_ms} suffix="ms" precision={2} />
                            </Col>
                          )}
                          {eBpfData.max_latency_ms !== undefined && (
                            <Col span={6}>
                              <Statistic title="最大延迟" value={eBpfData.max_latency_ms} suffix="ms" precision={2} />
                            </Col>
                          )}
                          {eBpfData.total_bytes !== undefined && (
                            <Col span={6}>
                              <Statistic title="总字节数" value={eBpfData.total_bytes} />
                            </Col>
                          )}
                        </Row>
                        {eBpfData.top_devices && eBpfData.top_devices.length > 0 && (
                          <>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>热点设备</Typography.Text>
                            <Table
                              dataSource={eBpfData.top_devices}
                              columns={[
                                { title: '设备', dataIndex: 'device', key: 'device' },
                                { title: '操作数', dataIndex: 'count', key: 'count' },
                                { title: '字节数', dataIndex: 'bytes', key: 'bytes' },
                              ]}
                              rowKey="device"
                              pagination={false}
                              size="small"
                            />
                          </>
                        )}
                        {eBpfData.top_processes && eBpfData.top_processes.length > 0 && (
                          <>
                            <Typography.Text strong style={{ display: 'block', marginTop: 24, marginBottom: 12 }}>热点进程</Typography.Text>
                            <Table
                              dataSource={eBpfData.top_processes}
                              columns={[
                                { title: '进程', dataIndex: 'process', key: 'process' },
                                { title: 'PID', dataIndex: 'pid', key: 'pid' },
                                { title: '操作数', dataIndex: 'count', key: 'count' },
                              ]}
                              rowKey="pid"
                              pagination={false}
                              size="small"
                            />
                          </>
                        )}
                        {eBpfData.summary && (
                          <Card size="small" style={{ marginTop: 24, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.085)' }}>
                            <Typography.Text style={{ color: 'rgba(255,255,255,0.65)' }}>{eBpfData.summary}</Typography.Text>
                          </Card>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>暂无 eBPF 分析数据（需先触发分析）</div>
                      </div>
                    )
                  ),
                },
                {
                  key: 'pprof',
                  label: 'pprof 分析',
                  children: (
                    pprofLoading ? (
                      <Spin tip="加载 pprof 数据中..." />
                    ) : (pprofCpuRows.length > 0 || pprofHeapRows.length > 0) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {pprofCpuRows.length > 0 && (
                          <div>
                            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                              <Col span={6}>
                                <Statistic title="CPU 样本函数" value={pprofCpuRows.length} />
                              </Col>
                              <Col span={6}>
                                <Statistic title="累计 Flat" value={pprofCpuTotal} suffix="s" precision={3} />
                              </Col>
                            </Row>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>CPU Top Functions</Typography.Text>
                            <Table
                              dataSource={pprofCpuRows}
                              columns={[
                                { title: '函数', dataIndex: 'func', key: 'func', render: (text: string) => <Text code style={{ color: 'rgba(255,255,255,0.85)' }}>{text}</Text> },
                                { title: 'Flat(s)', dataIndex: 'flat', key: 'flat', width: 120, render: (value: number) => <Text style={{ color: '#f87171', fontWeight: 600 }}>{value.toFixed(6)}</Text> },
                                { title: '占比', key: 'pct', width: 100, render: (_: any, record: { flat: number }) => <Text>{pprofCpuTotal ? `${((record.flat / pprofCpuTotal) * 100).toFixed(2)}%` : '-'}</Text> },
                              ]}
                              rowKey="func"
                              pagination={{ pageSize: 10, size: 'small' }}
                              size="small"
                            />
                          </div>
                        )}
                        {pprofHeapRows.length > 0 && (
                          <div>
                            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                              <Col span={6}>
                                <Statistic title="Heap 样本函数" value={pprofHeapRows.length} />
                              </Col>
                              <Col span={6}>
                                <Statistic title="最大 Flat Space" value={formatBytes(pprofHeapRows[0]?.flat_space || 0)} />
                              </Col>
                            </Row>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>Heap Allocators</Typography.Text>
                            <Table
                              dataSource={pprofHeapRows}
                              columns={[
                                { title: '函数', dataIndex: 'func', key: 'func', render: (text: string) => <Text code style={{ color: 'rgba(255,255,255,0.85)' }}>{text}</Text> },
                                { title: 'Flat Space', dataIndex: 'flat_space', key: 'flat_space', width: 130, render: (value: number) => <Text style={{ color: '#f87171', fontWeight: 600 }}>{formatBytes(value)}</Text> },
                                { title: 'Cum Space', dataIndex: 'cum_space', key: 'cum_space', width: 130, render: (value: number) => <Text>{formatBytes(value)}</Text> },
                                { title: 'Flat Objects', dataIndex: 'flat_objects', key: 'flat_objects', width: 120 },
                                { title: 'Cum Objects', dataIndex: 'cum_objects', key: 'cum_objects', width: 120 },
                              ]}
                              rowKey={(record) => `${record.func}-${record.flat_space}-${record.cum_space}`}
                              pagination={{ pageSize: 10, size: 'small' }}
                              size="small"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>暂无 pprof 分析数据（需使用 pprof 采集器并触发分析）</div>
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

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

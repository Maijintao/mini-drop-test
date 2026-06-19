import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Button, Card, Table, Tabs, Typography, Space, message, Spin, Statistic, Row, Col, Timeline } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, ArrowLeftOutlined, FireOutlined } from '@ant-design/icons';
import { fetchSignedJson, getCosFiles, getFlameData, getSuggestions, getTaskDetail, triggerAnalysis } from '@/api';
import type { AnalysisSuggestion, CosFile, HotmethodTask, TaskStateHistory, TopFunction } from '@/domain';
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

function shouldPollTask(task: HotmethodTask | null) {
  if (!task) return false;
  if (task.status < 4) return true;
  if (task.status === 4 && task.analysis_status === 1) return true;
  return false;
}

function stateHistoryLabel(item: TaskStateHistory, field: 'from_state' | 'to_state') {
  const value = item[field];
  if (value < 0) return '创建';
  const mapping = item.change_type === 1 ? analysisMap : statusMap;
  return mapping[value]?.label || String(value);
}

function stateHistoryColor(item: TaskStateHistory) {
  const mapping = item.change_type === 1 ? analysisMap : statusMap;
  return mapping[item.to_state]?.color || 'gray';
}

export default function TaskResult() {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('tid') || '';
  const [activeTab, setActiveTab] = useState('flame');
  const [task, setTask] = useState<HotmethodTask | null>(null);
  const [suggestions, setSuggestions] = useState<AnalysisSuggestion[]>([]);
  const [stateHistory, setStateHistory] = useState<TaskStateHistory[]>([]);
  const [flameUrl, setFlameUrl] = useState('');
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
  const [memoryData, setMemoryData] = useState<any>(null);
  const [heapData, setHeapData] = useState<any>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [attributionEvidence, setAttributionEvidence] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<HotmethodTask | null>(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.fromTo('.result-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.result-stats', { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.result-content', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, delay: 0.15, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  useEffect(() => {
    setTask(null);
    setSuggestions([]);
    setStateHistory([]);
    setCosFiles([]);
    setFlameUrl('');
    setFlameError('');
    setTopn([]);
    setCollapsedText('');
    setEBpfData(null);
    setEBpfLoading(false);
    setPprofCpuData(null);
    setPprofHeapData(null);
    setPprofLoading(false);
    setMemoryData(null);
    setHeapData(null);
    setResourceData(null);
    setAttributionEvidence(null);
  }, [tid]);

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
    setMemoryData(null);
    setHeapData(null);
    setResourceData(null);
    setAttributionEvidence(null);

    try {
      const detailRes = await getTaskDetail(tid);
      if (detailRes.code === 0 && detailRes.data?.task) {
        setTask(detailRes.data.task);
        setSuggestions(detailRes.data.suggestions || []);
        setCosFiles(Array.isArray(detailRes.data.cos_files) ? detailRes.data.cos_files : []);
        setStateHistory(Array.isArray(detailRes.data.state_history) ? detailRes.data.state_history : []);
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
            // COS 返回的 SVG 会触发下载，不在 iframe 中渲染；继续走 collapsed.txt / top.json 的 D3 渲染路径。
            setFlameUrl('');
          } else if (flameRes.data.type === 'json') {
            const data = await fetchSignedJson<TopFunction[]>(flameRes.data.url);
            setTopn(Array.isArray(data) ? data : []);
            setFlameUrl('');
          } else if (flameRes.data.type === 'collapsed') {
            const res = await axios.get<string>(flameRes.data.url, { withCredentials: false, timeout: 30000, responseType: 'text' });
            setCollapsedText(typeof res.data === 'string' ? res.data : '');
            setFlameUrl('');
          }
        }
      } catch {
        setFlameUrl('');
        setFlameError('暂无可渲染的火焰图数据');
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

      // 加载 eBPF biosnoop 分析数据；resource_stats.json 属于资源统计，避免混入 eBPF 页。
      const allFiles = files;
      const eBpfFile = allFiles.find(f => {
        const name = basename(f.key || f.name || '').toLowerCase();
        return name === 'biosnoop_stats.json';
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
            const data = await fetchSignedJson<any>(pprofCpuFile.url);
            const samples = data?.samples ?? data;
            setPprofCpuData(samples && typeof samples === 'object' && !Array.isArray(samples) ? samples : null);
          }
          if (pprofHeapFile?.url) {
            const data = await fetchSignedJson<any>(pprofHeapFile.url);
            const samples = data?.samples ?? data;
            setPprofHeapData(Array.isArray(samples) ? samples : null);
          }
        } catch {
          setPprofCpuData(null);
          setPprofHeapData(null);
        } finally {
          setPprofLoading(false);
        }
      }

      const memleakFile = allFiles.find(f => basename(f.key || f.name || '').toLowerCase() === 'memleak.json');
      const heapFile = allFiles.find(f => basename(f.key || f.name || '').toLowerCase() === 'heap_stats.json');
      const resourceFile = allFiles.find(f => basename(f.key || f.name || '').toLowerCase() === 'resource_stats.json');
      const attributionEvidenceFile = allFiles.find(f => basename(f.key || f.name || '').toLowerCase() === 'attribution_evidence.json');
      try {
        if (memleakFile?.url) setMemoryData(await fetchSignedJson<any>(memleakFile.url));
        if (heapFile?.url) setHeapData(await fetchSignedJson<any>(heapFile.url));
        if (resourceFile?.url) setResourceData(await fetchSignedJson<any>(resourceFile.url));
        if (attributionEvidenceFile?.url) setAttributionEvidence(await fetchSignedJson<any>(attributionEvidenceFile.url));
      } catch {
        // Optional extended artifacts should not block the main result page.
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
      if (!shouldPollTask(t)) {
        window.clearInterval(id);
        return;
      }
      loadTask();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadTask]);

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
  const eBpfReadCount = Number(eBpfData?.total_reads ?? eBpfData?.read_count ?? 0);
  const eBpfWriteCount = Number(eBpfData?.total_writes ?? eBpfData?.write_count ?? 0);
  const eBpfProbeType = String(eBpfData?.probe_type || 'io');
  const isSchedProbe = eBpfProbeType === 'sched';
  const eBpfAvgLatencyMs = Number(eBpfData?.avg_latency_ms ?? ((eBpfData?.latency_avg_us ?? 0) / 1000));
  const eBpfMaxLatencyMs = Number(eBpfData?.max_latency_ms ?? ((eBpfData?.latency_max_us ?? 0) / 1000));
  const eBpfTotalBytes = Number(eBpfData?.total_bytes ?? ((eBpfData?.read_bytes ?? 0) + (eBpfData?.write_bytes ?? 0)));
  const eBpfTopDevices = useMemo(() => {
    if (Array.isArray(eBpfData?.top_devices)) return eBpfData.top_devices;
    return Object.entries(eBpfData?.by_disk || {}).map(([device, value]: [string, any]) => ({
      device,
      count: Number(value?.count) || 0,
      bytes: Number(value?.bytes) || 0,
      latency_avg_ms: Number(value?.latency_avg || 0) / 1000,
    }));
  }, [eBpfData]);
  const eBpfTopProcesses = useMemo(() => {
    if (Array.isArray(eBpfData?.top_processes)) return eBpfData.top_processes;
    return Object.entries(eBpfData?.top_processes || eBpfData?.by_process || {}).map(([process, value]: [string, any]) => ({
      process,
      pid: value?.pid || process,
      count: Number(value?.count) || 0,
      bytes: Number(value?.bytes) || 0,
    }));
  }, [eBpfData]);
  const memoryLeakRows = useMemo(() => Array.isArray(memoryData?.leaks) ? memoryData.leaks : [], [memoryData]);
  const heapRows = useMemo(() => {
    const rows = Array.isArray(heapData?.classes) ? heapData.classes : (Array.isArray(heapData?.top_classes) ? heapData.top_classes : []);
    return rows.map((row: any) => ({
      name: String(row.name || row.class_name || row.class || '-'),
      count: Number(row.count || row.instances || 0),
      bytes: Number(row.bytes || row.total_bytes || row.size || 0),
    })).sort((a: any, b: any) => b.bytes - a.bytes);
  }, [heapData]);
  const resourceSummary = resourceData?.summary || resourceData;
  const attributionEvidenceRows = useMemo(() => flattenAttributionEvidence(attributionEvidence), [attributionEvidence]);

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
                  key: 'states',
                  label: '状态迁移',
                  children: (
                    stateHistory.length === 0 ? (
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>暂无状态迁移记录</div>
                      </div>
                    ) : (
                      <Timeline
                        items={stateHistory.map((item) => ({
                          color: stateHistoryColor(item),
                          children: (
                            <div>
                              <Text style={{ color: item.change_type === 1 ? '#93c5fd' : '#fbbf24', fontSize: 12, display: 'block', marginBottom: 2 }}>
                                {item.change_type === 1 ? '分析状态' : '任务状态'}
                              </Text>
                              <Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                                {stateHistoryLabel(item, 'from_state')}
                                {' -> '}
                                {stateHistoryLabel(item, 'to_state')}
                              </Text>
                              <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{item.reason || '-'}</div>
                              <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.32)', fontSize: 12 }}>{formatDate(item.created_at)}</div>
                            </div>
                          ),
                        }))}
                      />
                    )
                  ),
                },
                {
                  key: 'flame',
                  label: '火焰图',
                  children: (
                    flameUrl ? (
                      <FlameGraph url={flameUrl} width={900} height={560} />
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
                  label: '归因分析',
                  children: (
                    suggestions.length === 0 ? (
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>暂无归因分析</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {suggestions.map((item) => {
                          const sections = parseAttributionReport(item.ai_suggestion || '');
                          const isOverall = item.func === '整体归因报告' || Boolean(item.ai_suggestion?.includes('## 证据'));
                          return (
                            <Card key={item.id || item.func} size="small" style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.085)', borderLeft: '3px solid rgba(96,165,250,0.65)' }}>
                              <Text strong style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', display: 'block', marginBottom: 10 }}>{item.func || '归因项'}</Text>
                              {isOverall ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                                  <AttributionSection
                                    title="证据"
                                    content={sections.evidence || item.suggestion}
                                    extra={attributionEvidenceRows.length > 0 ? attributionEvidenceRows.slice(0, 8).map(row => `${row.id} ${row.text}`).join('\n') : ''}
                                  />
                                  <AttributionSection title="结论" content={sections.conclusion || item.suggestion} />
                                  <AttributionSection title="可验证假设" content={sections.hypothesis} />
                                  <AttributionSection title="追加采集" content={sections.collection || sections.repair} />
                                </div>
                              ) : (
                                <>
                                  {item.suggestion && (
                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, display: 'block' }}>
                                      <Text style={{ color: 'rgba(255,255,255,0.7)' }}>规则命中：</Text>{item.suggestion}
                                    </Text>
                                  )}
                                  {item.ai_suggestion && (
                                    <Text style={{ marginTop: item.suggestion ? 8 : 0, whiteSpace: 'pre-wrap', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, display: 'block' }}>
                                      <Text style={{ color: 'rgba(255,255,255,0.7)' }}>归因说明：</Text>{item.ai_suggestion}
                                    </Text>
                                  )}
                                  {!item.suggestion && !item.ai_suggestion && <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>-</Text>}
                                </>
                              )}
                            </Card>
                          );
                        })}
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
                          {!isSchedProbe && eBpfReadCount > 0 && (
                            <Col span={6}>
                              <Statistic title="读操作" value={eBpfReadCount} />
                            </Col>
                          )}
                          {!isSchedProbe && eBpfWriteCount > 0 && (
                            <Col span={6}>
                              <Statistic title="写操作" value={eBpfWriteCount} />
                            </Col>
                          )}
                          {eBpfAvgLatencyMs > 0 && (
                            <Col span={6}>
                              <Statistic title={isSchedProbe ? '平均调度延迟' : '平均延迟'} value={eBpfAvgLatencyMs} suffix="ms" precision={2} />
                            </Col>
                          )}
                          {eBpfMaxLatencyMs > 0 && (
                            <Col span={6}>
                              <Statistic title={isSchedProbe ? '最大调度延迟' : '最大延迟'} value={eBpfMaxLatencyMs} suffix="ms" precision={2} />
                            </Col>
                          )}
                          {!isSchedProbe && eBpfTotalBytes > 0 && (
                            <Col span={6}>
                              <Statistic title="总字节数" value={eBpfTotalBytes} />
                            </Col>
                          )}
                        </Row>
                        {!isSchedProbe && eBpfTopDevices.length > 0 && (
                          <>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>热点设备</Typography.Text>
                            <Table
                              dataSource={eBpfTopDevices}
                              columns={[
                                { title: '设备', dataIndex: 'device', key: 'device' },
                                { title: '操作数', dataIndex: 'count', key: 'count' },
                                { title: '字节数', dataIndex: 'bytes', key: 'bytes' },
                                { title: '平均延迟(ms)', dataIndex: 'latency_avg_ms', key: 'latency_avg_ms', render: (value: number) => Number.isFinite(value) ? value.toFixed(3) : '-' },
                              ]}
                              rowKey="device"
                              pagination={false}
                              size="small"
                            />
                          </>
                        )}
                        {eBpfTopProcesses.length > 0 && (
                          <>
                            <Typography.Text strong style={{ display: 'block', marginTop: isSchedProbe ? 0 : 24, marginBottom: 12 }}>
                              {isSchedProbe ? '热点调度目标' : '热点进程'}
                            </Typography.Text>
                            <Table
                              dataSource={eBpfTopProcesses}
                              columns={[
                                { title: '进程', dataIndex: 'process', key: 'process' },
                                { title: 'PID', dataIndex: 'pid', key: 'pid' },
                                { title: isSchedProbe ? '调度事件数' : '操作数', dataIndex: 'count', key: 'count' },
                                ...(!isSchedProbe ? [{ title: '字节数', dataIndex: 'bytes', key: 'bytes' }] : []),
                              ]}
                              rowKey={(record: any) => `${record.process}-${record.pid}`}
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
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>Heap Top Functions</Typography.Text>
                            <Table
                              dataSource={pprofHeapRows}
                              columns={[
                                { title: '函数', dataIndex: 'func', key: 'func', render: (text: string) => <Text code style={{ color: 'rgba(255,255,255,0.85)' }}>{text}</Text> },
                                { title: 'Flat', dataIndex: 'flat_space', key: 'flat_space', width: 130, render: (value: number) => <Text style={{ color: '#f87171', fontWeight: 600 }}>{formatBytes(value)}</Text> },
                                { title: 'Cum', dataIndex: 'cum_space', key: 'cum_space', width: 130, render: (value: number) => <Text>{formatBytes(value)}</Text> },
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
                  key: 'memory',
                  label: '内存/资源',
                  children: (
                    memoryData || heapRows.length > 0 || resourceSummary ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {memoryData && (
                          <>
                            <Row gutter={[16, 16]}>
                              <Col span={6}>
                                <Statistic title="泄漏字节" value={formatBytes(Number(memoryData.total_leaked_bytes) || 0)} />
                              </Col>
                              <Col span={6}>
                                <Statistic title="泄漏块数" value={Number(memoryData.total_leaked_blocks) || 0} />
                              </Col>
                            </Row>
                            {memoryData.summary && (
                              <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.085)' }}>
                                <Typography.Text style={{ color: 'rgba(255,255,255,0.65)' }}>{memoryData.summary}</Typography.Text>
                              </Card>
                            )}
                          </>
                        )}
                        {memoryLeakRows.length > 0 && (
                          <div>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>泄漏 TopN</Typography.Text>
                            <Table
                              dataSource={memoryLeakRows}
                              columns={[
                                { title: '类型', dataIndex: 'leak_type', key: 'leak_type', width: 120 },
                                { title: '大小', dataIndex: 'size', key: 'size', width: 120, render: (value: number) => formatBytes(value) },
                                { title: '次数', dataIndex: 'count', key: 'count', width: 100 },
                                { title: '调用栈', dataIndex: 'stack', key: 'stack', render: (value: string[]) => <Text code style={{ color: 'rgba(255,255,255,0.75)' }}>{Array.isArray(value) ? value.slice(0, 4).join(' -> ') : '-'}</Text> },
                              ]}
                              rowKey={(_, index) => `leak-${index}`}
                              pagination={{ pageSize: 8, size: 'small' }}
                              size="small"
                            />
                          </div>
                        )}
                        {heapRows.length > 0 && (
                          <div>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>堆对象 TopN</Typography.Text>
                            <Table
                              dataSource={heapRows}
                              columns={[
                                { title: '类/对象', dataIndex: 'name', key: 'name', render: (value: string) => <Text code style={{ color: 'rgba(255,255,255,0.75)' }}>{value}</Text> },
                                { title: '数量', dataIndex: 'count', key: 'count', width: 120 },
                                { title: '大小', dataIndex: 'bytes', key: 'bytes', width: 140, render: (value: number) => formatBytes(value) },
                              ]}
                              rowKey={(record: any) => record.name}
                              pagination={{ pageSize: 8, size: 'small' }}
                              size="small"
                            />
                          </div>
                        )}
                        {resourceSummary && (
                          <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.085)' }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                              {typeof resourceSummary === 'string' ? resourceSummary : JSON.stringify(resourceSummary, null, 2)}
                            </pre>
                          </Card>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>暂无内存或资源分析数据</div>
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

function AttributionSection({ title, content, extra }: { title: string; content?: string; extra?: string }) {
  const text = [extra, content].filter(Boolean).join('\n');
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 12, minHeight: 120 }}>
      <Text strong style={{ display: 'block', marginBottom: 8, color: 'rgba(255,255,255,0.78)' }}>{title}</Text>
      <Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.65, color: text ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.28)' }}>
        {text || '暂无'}
      </Text>
    </div>
  );
}

function parseAttributionReport(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  if (!markdown) return sections;

  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length === 0) {
    sections.conclusion = markdown.trim();
    return sections;
  }

  matches.forEach((match, index) => {
    const title = match[1].trim();
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index || markdown.length) : markdown.length;
    const body = markdown.slice(start, end).trim();
    const key = normalizeAttributionSectionTitle(title);
    if (key && body) sections[key] = body;
  });

  return sections;
}

function normalizeAttributionSectionTitle(title: string): string {
  if (title.includes('证据')) return 'evidence';
  if (title.includes('结论')) return 'conclusion';
  if (title.includes('假设')) return 'hypothesis';
  if (title.includes('追加采集') || title.includes('建议追加采集')) return 'collection';
  if (title.includes('优先修复') || title.includes('修复')) return 'repair';
  return '';
}

function flattenAttributionEvidence(data: any): Array<{ id: string; text: string }> {
  const evidence = data?.evidence;
  if (!evidence || typeof evidence !== 'object') return [];
  const rows: Array<{ id: string; text: string }> = [];

  const concentration = evidence.concentration;
  if (concentration?.evidence_id) {
    rows.push({
      id: concentration.evidence_id,
      text: `总采样 ${concentration.total_samples || 0}，Top1 ${concentration.top_1_pct || 0}%，Top3 ${concentration.top_3_pct || 0}%，Gini ${concentration.gini_coefficient ?? 0}`,
    });
  }

  for (const item of evidence.topn_hotspots || []) {
    rows.push({
      id: item.evidence_id,
      text: `Top${item.rank} ${item.func} self=${item.self}，占比 ${item.self_pct}%`,
    });
  }
  for (const item of evidence.hot_paths || []) {
    rows.push({
      id: item.evidence_id,
      text: `热路径占比 ${item.pct}%：${Array.isArray(item.stack_tail) ? item.stack_tail.join(' -> ') : '-'}`,
    });
  }
  for (const item of evidence.rule_hits || []) {
    rows.push({
      id: item.evidence_id,
      text: `规则命中 ${item.func}：${item.advice || '-'}`,
    });
  }
  return rows.filter(row => row.id);
}

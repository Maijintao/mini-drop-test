import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import flamegraph, { colorMapper } from 'd3-flame-graph';
import { select as d3Select } from 'd3-selection';
import { flameDiff, getTasks } from '@/api';
import type { DiffTreeNode, FlameDiffResult } from '@/domain';

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

const flamegraphStyles = `
.d3-flame-graph rect { stroke: rgba(0,0,0,0.4); stroke-width: 0.5; }
.d3-flame-graph rect:hover { stroke: #fff; stroke-width: 1; }
.d3-flame-graph .label { pointer-events: none; }
.d3-flame-graph .title { font-size: 14px; font-family: monospace; color: #fff; }
.d3-flame-graph svg { font: 11px monospace; background: transparent; }
.d3-flame-graph .d3-flame-graph-tip { background: rgba(0,0,0,0.85); color: #fff; border: 0.5px solid rgba(255,255,255,0.15); border-radius: 6px; font-size: 12px; padding: 6px 10px; }
`;

export default function FlameDiff() {
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const [tid1, setTid1] = useState(searchParams.get('tid1') || '');
  const [tid2, setTid2] = useState(searchParams.get('tid2') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlameDiffResult | null>(null);
  const [error, setError] = useState('');
  const [taskOptions, setTaskOptions] = useState<{ tid: string; name: string }[]>([]);

  useGSAP(() => {
    gsap.fromTo('.diff-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.diff-panel', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.08, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  useEffect(() => {
    getTasks({ page: 1, size: 50 }).then((res) => {
      if (res.code === 0 && res.data?.list) {
        setTaskOptions(res.data.list.map((t) => ({ tid: t.tid, name: t.name || t.tid })));
      }
    }).catch(() => {});
  }, []);

  const doDiff = useCallback(async () => {
    if (!tid1.trim() || !tid2.trim()) return;
    if (tid1.trim() === tid2.trim()) { setError('两个任务 ID 不能相同'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await flameDiff(tid1.trim(), tid2.trim());
      if (res.code === 0 && res.data) {
        setResult(res.data);
      } else {
        setError(res.message || '对比失败');
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '请求失败');
    } finally {
      setLoading(false);
    }
  }, [tid1, tid2]);

  const swapTids = () => { setTid1(tid2); setTid2(tid1); setResult(null); };

  const renderTidHelper = (value: string, setter: (v: string) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {taskOptions.filter((t) => t.tid !== (value === tid1 ? tid2 : tid1)).slice(0, 6).map((t) => (
        <button
          key={t.tid}
          onClick={() => setter(t.tid)}
          style={{
            padding: '2px 8px', fontSize: 11, borderRadius: 6,
            background: value === t.tid ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${value === t.tid ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: value === t.tid ? '#60a5fa' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
          }}
        >{t.tid}</button>
      ))}
    </div>
  );

  const canSubmit = tid1.trim().length > 0 && tid2.trim().length > 0 && !loading;

  return (
    <div ref={containerRef}>
      <div className="diff-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>火焰图对比</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>选择两个任务，对比热点函数差异</p>
      </div>

      {/* 输入区 */}
      <div className="diff-panel" style={{ ...glassCard, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>基准任务 (Base)</label>
            <input
              value={tid1}
              onChange={(e) => { setTid1(e.target.value); setResult(null); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && doDiff()}
              placeholder="输入基准任务 ID"
              style={inputStyle}
            />
            {renderTidHelper(tid1, (v) => { setTid1(v); setResult(null); })}
          </div>

          <button onClick={swapTids} title="交换" style={{ ...buttonStyle, height: 40, marginBottom: taskOptions.length > 0 ? 28 : 0 }}>
            ⇄
          </button>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>对比任务 (Compare)</label>
            <input
              value={tid2}
              onChange={(e) => { setTid2(e.target.value); setResult(null); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && doDiff()}
              placeholder="输入对比任务 ID"
              style={inputStyle}
            />
            {renderTidHelper(tid2, (v) => { setTid2(v); setResult(null); })}
          </div>

          <button
            onClick={doDiff}
            disabled={!canSubmit}
            style={{ ...buttonStyle, height: 40, opacity: canSubmit ? 1 : 0.4, marginBottom: taskOptions.length > 0 ? 28 : 0 }}
          >
            {loading ? '对比中...' : '对比'}
          </button>
        </div>
      </div>

      {/* 错误 */}
      {error && (
        <div className="diff-panel" style={{ ...glassCard, padding: 16, marginBottom: 18, color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* 差异火焰图 */}
      {result && <DiffFlamePanel result={result} />}

      {/* 空状态 */}
      {!result && !loading && !error && (
        <div className="diff-panel" style={{ ...glassCard, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>输入两个任务 ID 开始对比</div>
        </div>
      )}
    </div>
  );
}

// ========== 差异火焰图渲染 ==========

function DiffFlamePanel({ result }: { result: FlameDiffResult }) {
  const flameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  // 渲染 d3-flame-graph
  useEffect(() => {
    if (!result.tree || !flameRef.current) return;

    const el = flameRef.current;
    el.innerHTML = '';

    const chart = flamegraph()
      .width(el.offsetWidth || 960)
      .height(480)
      .cellHeight(18)
      .transitionDuration(300)
      .tooltip(true)
      .title('')
      .selfValue(true)
      .setColorMapper((colorMapper as any).differentialColorMapper);

    chartRef.current = chart;

    // 先绑定数据，再初始化图表（避免 processData 时 datum 为空）
    const selection = d3Select(el);
    selection.datum(result.tree);
    chart(selection);

    return () => { el.innerHTML = ''; };
  }, [result.tree]);

  // 搜索
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    if (!chartRef.current) return;
    if (searchTerm) {
      chartRef.current.search(searchTerm);
    } else {
      chartRef.current.clear();
    }
  }, [searchTerm]);

  // 如果没有 tree 数据（只有扁平 diff），显示简化的消息
  if (!result.tree) {
    return (
      <div className="diff-panel" style={{ ...glassCard, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
          暂无层次火焰图数据（需要 collapsed.txt）
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
          后端返回扁平 diff: {result.changed.length} 个变化函数, {result.added.length} 个新增, {result.removed.length} 个移除
        </div>
      </div>
    );
  }

  return (
    <div className="diff-panel" style={{ ...glassCard, padding: 20 }}>
      {/* 头部信息 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '3px 10px', borderRadius: 6, background: 'rgba(96,165,250,0.12)', border: '0.5px solid rgba(96,165,250,0.25)' }}>
            Base
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{result.base_tid}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>→</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '3px 10px', borderRadius: 6, background: 'rgba(168,85,247,0.12)', border: '0.5px solid rgba(168,85,247,0.25)' }}>
            Compare
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{result.curr_tid}</span>
        </div>
        {/* 图例 */}
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#ef4444', marginRight: 4, verticalAlign: -1 }} />回归</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#3b82f6', marginRight: 4, verticalAlign: -1 }} />优化</span>
        </div>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="搜索函数名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ ...inputStyle, width: 240, height: 34 }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} style={{ ...buttonStyle, padding: '6px 12px', fontSize: 12 }}>
            清除
          </button>
        )}
      </div>

      {/* 火焰图容器 */}
      <div
        ref={flameRef}
        style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

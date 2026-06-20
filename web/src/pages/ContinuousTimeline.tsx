import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchArtifactJson, fetchArtifactText, getContinuousWindows, stopContinuousTask, getFlameData } from '@/api';
import type { ContinuousWindow, TopFunction } from '@/domain';
import FlameGraph from '@/components/FlameGraph';

export default function ContinuousTimeline() {
  const [params] = useSearchParams();
  const tid = params.get('tid') || '';

  const [windows, setWindows] = useState<ContinuousWindow[]>([]);
  const [selected, setSelected] = useState<ContinuousWindow | null>(null);
  const [collapsedText, setCollapsedText] = useState('');
  const [topn, setTopn] = useState<TopFunction[]>([]);
  const [svgMarkup, setSvgMarkup] = useState('');
  const [flameError, setFlameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);

  // 时间范围过滤
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);

  const fetchWindows = useCallback(async () => {
    if (!tid) return;
    try {
      const timeParams: { from?: string; to?: string } = {};
      if (isFiltering && fromTime) timeParams.from = new Date(fromTime).toISOString();
      if (isFiltering && toTime) timeParams.to = new Date(toTime).toISOString();

      const res = await getContinuousWindows(tid, isFiltering ? timeParams : undefined);
      if (res.code === 0 && res.data) {
        setWindows(res.data);
        // 自动选中最新的已完成窗口
        if (!selected) {
          const done = res.data.filter((w: ContinuousWindow) => w.status === 1);
          if (done.length > 0) setSelected(done[done.length - 1]);
        }
      }
    } catch (e) {
      console.error('fetch windows failed:', e);
    }
  }, [tid, selected, isFiltering, fromTime, toTime]);

  // 轮询窗口列表（过滤模式下暂停轮询）
  useEffect(() => {
    fetchWindows();
    if (isFiltering) return; // 过滤模式不轮询
    const timer = setInterval(fetchWindows, 5000);
    return () => clearInterval(timer);
  }, [fetchWindows, isFiltering]);

  // 加载选中窗口的火焰图
  useEffect(() => {
    if (!selected || !selected.cos_key) {
      setCollapsedText('');
      setTopn([]);
      setSvgMarkup('');
      setFlameError('');
      return;
    }
    if (selected.status !== 1) {
      setCollapsedText('');
      setTopn([]);
      setSvgMarkup('');
      setFlameError(selected.status === 2 ? '该窗口采集失败' : '该窗口仍在采集中');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setCollapsedText('');
    setTopn([]);
    setSvgMarkup('');
    setFlameError('');
    getFlameData(selected.window_tid)
      .then(async (res) => {
        if (cancelled) return;
        if (res.code !== 0 || !res.data?.key) {
          setFlameError(res.message || '该窗口暂无可渲染的火焰图数据');
          return;
        }
        if (res.data.type === 'collapsed') {
          const text = await fetchArtifactText(selected.window_tid, res.data.key);
          if (!cancelled) setCollapsedText(typeof text === 'string' ? text : '');
        } else if (res.data.type === 'json') {
          const data = await fetchArtifactJson<TopFunction[]>(selected.window_tid, res.data.key);
          if (!cancelled) setTopn(Array.isArray(data) ? data : []);
        } else if (res.data.type === 'svg') {
          const text = await fetchArtifactText(selected.window_tid, res.data.key);
          if (!cancelled) setSvgMarkup(typeof text === 'string' ? text : '');
        } else {
          setFlameError('该窗口暂无可直接渲染的火焰图数据');
        }
      })
      .catch((e) => {
        if (!cancelled) setFlameError(e?.response?.data?.message || e?.message || '火焰图加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleStop = async () => {
    if (!tid) return;
    setStopping(true);
    try {
      await stopContinuousTask(tid);
    } catch (e) {
      console.error('stop failed:', e);
    }
    setStopping(false);
  };

  const handleSearch = () => {
    setSelected(null);
    setIsFiltering(true);
  };

  const handleLastFiveMinutes = () => {
    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);
    setFromTime(toDateTimeLocalValue(start));
    setToTime(toDateTimeLocalValue(end));
    setSelected(null);
    setIsFiltering(true);
  };

  const handleFiveMinuteWindow = () => {
    if (!toTime) return;
    const end = new Date(toTime);
    if (Number.isNaN(end.getTime())) return;
    const start = new Date(end.getTime() - 5 * 60 * 1000);
    setFromTime(toDateTimeLocalValue(start));
    setSelected(null);
    setIsFiltering(true);
  };

  const handleReset = () => {
    setFromTime('');
    setToTime('');
    setSelected(null);
    setIsFiltering(false);
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
  };

  const toDateTimeLocalValue = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', gap: 0 }}>
      {/* 左侧：时间轴 */}
      <div style={{
        width: 280,
        borderRight: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(20,20,20,0.6)',
      }}>
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>时间轴</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {tid} / {windows.length} 个窗口
              </div>
            </div>
            <button
              onClick={handleStop}
              disabled={stopping}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '0.5px solid rgba(248,113,113,0.3)',
                background: 'rgba(248,113,113,0.08)',
                color: '#f87171',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {stopping ? '停止中...' : '停止'}
            </button>
          </div>

              {/* 时间范围搜索 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              按时间范围查询
            </div>
                <input
              type="datetime-local"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              placeholder="起始时间"
              style={{
                width: '100%',
                height: 30,
                padding: '0 8px',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                fontSize: 11,
                color: 'rgba(255,255,255,0.6)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="datetime-local"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              placeholder="结束时间"
              style={{
                width: '100%',
                height: 30,
                padding: '0 8px',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                fontSize: 11,
                color: 'rgba(255,255,255,0.6)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
                />
                <button
                  onClick={handleFiveMinuteWindow}
                  disabled={!toTime}
                  style={{
                    height: 28,
                    borderRadius: 6,
                    border: '0.5px solid rgba(255,255,255,0.08)',
                    background: toTime ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.03)',
                    color: toTime ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.3)',
                    cursor: toTime ? 'pointer' : 'not-allowed',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  取结束前 5 分钟
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleSearch}
                disabled={!fromTime && !toTime}
                style={{
                  flex: 1,
                  height: 28,
                  borderRadius: 6,
                  border: '0.5px solid rgba(96,165,250,0.3)',
                  background: (fromTime || toTime) ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)',
                  color: (fromTime || toTime) ? '#60a5fa' : 'rgba(255,255,255,0.3)',
                  cursor: (fromTime || toTime) ? 'pointer' : 'not-allowed',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                查询
              </button>
              {isFiltering && (
                <button
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    border: '0.5px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  重置
                </button>
              )}
                </div>
                <button
                  onClick={handleLastFiveMinutes}
                  style={{
                    height: 28,
                    borderRadius: 6,
                    border: '0.5px solid rgba(96,165,250,0.28)',
                    background: 'rgba(96,165,250,0.08)',
                    color: '#93c5fd',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  最近 5 分钟
                </button>
                {isFiltering && (
              <div style={{ fontSize: 10, color: 'rgba(96,165,250,0.6)', textAlign: 'center' }}>
                已启用时间过滤，自动轮询已暂停
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {windows.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              {isFiltering ? '该时间范围内无窗口数据' : '等待第一个窗口完成...'}
            </div>
          )}
          {windows.map((w) => (
            <div
              key={w.window_tid}
              onClick={() => setSelected(w)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                background: selected?.window_tid === w.window_tid ? 'rgba(96,165,250,0.1)' : 'transparent',
                borderLeft: selected?.window_tid === w.window_tid ? '2px solid #60a5fa' : '2px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  窗口 #{w.seq}
                </span>
                <span style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: w.status === 1 ? 'rgba(74,222,128,0.12)' : w.status === 2 ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.06)',
                  color: w.status === 1 ? '#4ade80' : w.status === 2 ? '#f87171' : 'rgba(255,255,255,0.4)',
                }}>
                  {w.status === 1 ? '完成' : w.status === 2 ? '失败' : '采集中'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                {formatTime(w.start_time)} ~ {formatTime(w.end_time)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：火焰图 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selected ? (
          <>
            <div style={{
              padding: '12px 20px',
              borderBottom: '0.5px solid rgba(255,255,255,0.06)',
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                窗口 #{selected.seq}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                {selected.window_tid}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                {new Date(selected.start_time).toLocaleString()} ~ {new Date(selected.end_time).toLocaleString()}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                  加载火焰图中...
                </div>
              ) : collapsedText || topn.length > 0 ? (
                <FlameGraph collapsedText={collapsedText} data={topn} />
              ) : svgMarkup ? (
                <div style={{ overflow: 'auto', background: '#fff', borderRadius: 8, margin: 12, padding: 8 }} dangerouslySetInnerHTML={{ __html: svgMarkup }} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                  {flameError || '该窗口暂无火焰图数据'}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 14,
          }}>
            {isFiltering ? '选择窗口查看火焰图' : '选择左侧窗口查看火焰图'}
          </div>
        )}
      </div>
    </div>
  );
}

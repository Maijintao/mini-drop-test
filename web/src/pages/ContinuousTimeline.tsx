import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getContinuousWindows, stopContinuousTask, getFlameData } from '@/api';
import type { ContinuousWindow } from '@/domain';
import FlameGraph from '@/components/FlameGraph';

export default function ContinuousTimeline() {
  const [params] = useSearchParams();
  const tid = params.get('tid') || '';

  const [windows, setWindows] = useState<ContinuousWindow[]>([]);
  const [selected, setSelected] = useState<ContinuousWindow | null>(null);
  const [flameUrl, setFlameUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);

  const fetchWindows = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await getContinuousWindows(tid);
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
  }, [tid, selected]);

  // 轮询窗口列表
  useEffect(() => {
    fetchWindows();
    const timer = setInterval(fetchWindows, 5000);
    return () => clearInterval(timer);
  }, [fetchWindows]);

  // 加载选中窗口的火焰图
  useEffect(() => {
    if (!selected || !selected.cos_key) {
      setFlameUrl('');
      return;
    }
    setLoading(true);
    getFlameData(selected.window_tid)
      .then((res) => {
        if (res.code === 0 && res.data?.url) {
          setFlameUrl(res.data.url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
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

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {windows.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              等待第一个窗口完成...
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
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                  加载火焰图中...
                </div>
              ) : flameUrl ? (
                <FlameGraph url={flameUrl} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                  该窗口暂无火焰图数据
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
            选择左侧窗口查看火焰图
          </div>
        )}
      </div>
    </div>
  );
}

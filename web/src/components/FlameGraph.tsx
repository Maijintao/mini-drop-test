import { useEffect, useRef, useState } from 'react';
import flamegraph from 'd3-flame-graph';

// d3-flame-graph CSS styles (inline to avoid export issues)
const flamegraphStyles = `
.d3-flame-graph rect { stroke: #EEEEEE; fill-opacity: 0.8; }
.d3-flame-graph rect:hover { stroke: #474747; stroke-width: 0.5; fill-opacity: 1.0; }
.d3-flame-graph .label { pointer-events: none; }
.d3-flame-graph .title { font-size: 14px; font-family: Arial; }
.d3-flame-graph svg { font: 10px sans-serif; }
`;

interface FlameGraphProps {
  data: { func: string; self: number; total?: number }[];
  width?: number;
  height?: number;
}

export default function FlameGraph({ data, width = 960, height = 400 }: FlameGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    // 清空容器
    containerRef.current.innerHTML = '';

    // 按 self 排序，取 top 100
    const sorted = [...data].sort((a, b) => b.self - a.self).slice(0, 100);
    const totalSamples = sorted.reduce((sum, item) => sum + item.self, 0);

    // 构建火焰图树结构
    // TopN 数据是扁平的，每个函数独立展示为一个子树
    // 这样可以在火焰图中看到每个函数的占比
    const root = {
      name: 'all',
      value: totalSamples,
      children: sorted.map(item => ({
        name: item.func,
        value: item.self,
      })),
    };

    // 创建火焰图
    const chart = flamegraph()
      .width(width)
      .height(height)
      .cellHeight(18)
      .transitionDuration(300)
      .tooltip(true)
      .title('');

    chartRef.current = chart;

    // 渲染
    chart(containerRef.current);
    chart.update(root);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [data, width, height]);

  // 搜索高亮
  useEffect(() => {
    if (!chartRef.current) return;
    if (searchTerm) {
      chartRef.current.search(searchTerm);
    } else {
      chartRef.current.clear();
    }
  }, [searchTerm]);

  if (!data || data.length === 0) {
    return <div style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>暂无火焰图数据</div>;
  }

  return (
    <div>
      <style>{flamegraphStyles}</style>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="搜索函数名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            width: 240,
          }}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            style={{
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.6)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            清除
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        style={{
          background: '#1a1a2e',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

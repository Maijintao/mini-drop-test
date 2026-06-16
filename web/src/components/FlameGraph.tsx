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

interface FlameNode {
  name: string;
  value?: number;
  children?: FlameNode[];
}

interface FlameGraphProps {
  data: { func: string; self: number; total?: number }[];
  collapsedText?: string;
  width?: number;
  height?: number;
}

/**
 * 解析 collapsed 格式文本为 d3-flame-graph 树结构。
 * 格式: "func1;func2;func3 count" 每行一条调用栈。
 */
function parseCollapsedToTree(text: string): FlameNode | null {
  const root: FlameNode = { name: 'all', children: [] };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const lastSpace = line.lastIndexOf(' ');
    if (lastSpace <= 0) continue;

    const stackStr = line.substring(0, lastSpace);
    const count = parseInt(line.substring(lastSpace + 1), 10);
    if (isNaN(count) || count <= 0) continue;

    const frames = stackStr.split(';');
    let current = root;

    for (const frame of frames) {
      if (!current.children) current.children = [];
      let child = current.children.find(c => c.name === frame);
      if (!child) {
        child = { name: frame, value: 0 };
        current.children.push(child);
      }
      current = child;
    }
    // 叶子节点累加采样数
    current.value = (current.value || 0) + count;
  }

  return root.children && root.children.length > 0 ? root : null;
}

/**
 * 从扁平 top.json 数据构建树（fallback，无层次信息）。
 */
function flatDataToTree(data: { func: string; self: number }[]): FlameNode {
  const sorted = [...data].sort((a, b) => b.self - a.self).slice(0, 100);
  const totalSamples = sorted.reduce((sum, item) => sum + item.self, 0);
  return {
    name: 'all',
    value: totalSamples,
    children: sorted.map(item => ({
      name: item.func,
      value: item.self,
    })),
  };
}

export default function FlameGraph({ data, collapsedText, width = 960, height = 400 }: FlameGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;

    // 优先使用 collapsed 层次数据，fallback 到扁平 top.json
    let root: FlameNode | null = null;
    if (collapsedText) {
      root = parseCollapsedToTree(collapsedText);
    }
    if (!root && data && data.length > 0) {
      root = flatDataToTree(data);
    }
    if (!root) return;

    // 清空容器
    containerRef.current.innerHTML = '';

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
  }, [data, collapsedText, width, height]);

  // 搜索高亮
  useEffect(() => {
    if (!chartRef.current) return;
    if (searchTerm) {
      chartRef.current.search(searchTerm);
    } else {
      chartRef.current.clear();
    }
  }, [searchTerm]);

  if ((!data || data.length === 0) && !collapsedText) {
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

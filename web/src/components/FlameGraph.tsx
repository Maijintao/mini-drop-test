import { useEffect, useRef, useState } from 'react';
import flamegraph from 'd3-flame-graph';
import { select as d3Select } from 'd3-selection';

// d3-flamegraph.css 内联（package 未导出 CSS）
const flamegraphBaseCSS = `
.d3-flame-graph .frame { rx: 2; ry: 2; }
.d3-flame-graph .frame:hover { stroke: #fff; stroke-width: 1; }
.d3-flame-graph .label { pointer-events: none; fill: #fff; }
`;

// 暗色主题覆盖
const darkThemeCSS = `
.d3-flame-graph rect { stroke: rgba(0,0,0,0.5); stroke-width: 0.5; }
.d3-flame-graph rect:hover { stroke: #fff; stroke-width: 1; }
.d3-flame-graph .label { pointer-events: none; color: #fff; }
.d3-flame-graph .title { font-size: 14px; font-family: monospace; color: #fff; }
.d3-flame-graph svg { font: 11px monospace; background: transparent; }
.d3-flame-graph .d3-flame-graph-tip { background: rgba(0,0,0,0.9); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-size: 12px; padding: 6px 10px; }
`;

// CSS 一次性注入
let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.textContent = flamegraphBaseCSS + darkThemeCSS;
  document.head.appendChild(style);
  cssInjected = true;
}

interface FlameNode {
  name: string;
  value?: number;
  children?: FlameNode[];
}

interface FlameGraphProps {
  data?: { func: string; self: number; total?: number }[];
  collapsedText?: string;
  url?: string;
  width?: number;
  height?: number;
}

/**
 * 解析 collapsed 格式为 d3-flame-graph 树结构。
 * 格式: "func1;func2;func3 count"
 *
 * 使用 selfValue(true) 模式，只在叶子节点累加 value。
 */
function parseCollapsedToTree(text: string): FlameNode | null {
  const root: FlameNode = { name: 'all', value: 0, children: [] };

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
    // 只在叶子节点累加 value
    current.value = (current.value || 0) + count;
  }

  // 不做 accumulate，让 d3-flame-graph 自己处理
  return root.children && root.children.length > 0 ? root : null;
}

/**
 * 从扁平 top.json 构建树（fallback）。
 */
function flatDataToTree(data: { func: string; self: number }[]): FlameNode {
  // 不截断，保留全部数据
  const sorted = [...data].sort((a, b) => b.self - a.self);
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

export default function FlameGraph({ data, collapsedText, url, width = 960, height = 400 }: FlameGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const rootRef = useRef<FlameNode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 注入 CSS（只执行一次）
  useEffect(() => {
    injectCSS();
  }, []);

  // 渲染火焰图的函数
  const renderChart = () => {
    if (!containerRef.current || !rootRef.current) return;

    const el = containerRef.current;
    el.innerHTML = '';

    const chart = flamegraph()
      .width(el.offsetWidth || width)
      .height(height)
      .cellHeight(18)
      .transitionDuration(300)
      .tooltip(true)
      .title('')
      .selfValue(true);

    chartRef.current = chart;

    d3Select(el)
      .datum(rootRef.current)
      .call(chart);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // 优先 collapsed 层次数据，fallback 扁平 top.json
    let root: FlameNode | null = null;
    if (collapsedText) {
      root = parseCollapsedToTree(collapsedText);
    }
    if (!root && data && data.length > 0) {
      root = flatDataToTree(data);
    }
    if (!root) return;

    rootRef.current = root;
    renderChart();

    return () => {
      chartRef.current?.destroy?.();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [data, collapsedText, width, height]);

  // 监听窗口 resize 事件
  useEffect(() => {
    const handleResize = () => {
      // 延迟执行，避免频繁重绘
      setTimeout(() => {
        if (rootRef.current) {
          renderChart();
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    if (searchTerm) {
      chartRef.current.search(searchTerm);
    } else {
      chartRef.current.clear();
    }
  }, [searchTerm]);

  if (url) {
    return (
      <iframe
        src={url}
        title="flamegraph"
        style={{
          width: '100%',
          height,
          border: 0,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
        }}
      />
    );
  }

  if ((!data || data.length === 0) && !collapsedText) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>这里空空如也</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>暂无火焰图数据</div>
      </div>
    );
  }

  return (
    <div>
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
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

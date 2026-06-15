import type { AgentInfo, CreateTaskParams } from '@/domain';

interface CreateTaskModalProps {
  agents: AgentInfo[];
  form: CreateTaskParams;
  submitting: boolean;
  title?: string;
  onChange: (patch: Partial<CreateTaskParams>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const panelStyle: React.CSSProperties = {
  width: 'min(760px, calc(100vw - 40px))',
  maxHeight: 'calc(100vh - 56px)',
  overflow: 'auto',
  borderRadius: 16,
  background: 'rgba(10, 10, 12, 0.88)',
  border: '0.5px solid rgba(255,255,255,0.08)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.06), ' +
    '0 24px 80px rgba(0,0,0,0.42)',
  backdropFilter: 'blur(28px)',
  WebkitBackdropFilter: 'blur(28px)',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  background: 'rgba(255,255,255,0.03)',
  border: '0.5px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  color: 'rgba(255,255,255,0.62)',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...fieldStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  color: 'rgba(255,255,255,0.56)',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.32) 50%), ' +
    'linear-gradient(135deg, rgba(255,255,255,0.32) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 17px) 17px, calc(100% - 12px) 17px',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  paddingRight: 34,
};

const sectionStyle: React.CSSProperties = {
  padding: 16,
  border: '0.5px solid rgba(255,255,255,0.045)',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.018)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.46)' }}>{label}</span>
      {children}
    </label>
  );
}

export default function CreateTaskModal({
  agents,
  form,
  submitting,
  title = '新建采集任务',
  onChange,
  onCancel,
  onSubmit,
}: CreateTaskModalProps) {
  const onlineAgents = agents.filter(agent => agent.online);
  const canSubmit = Boolean(form.target_ip && form.pid && form.duration && !submitting);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0, 0, 0, 0.68)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div style={panelStyle}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 18,
          padding: '22px 24px 18px',
          borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <h3 style={{ fontSize: 18, lineHeight: 1.2, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{title}</h3>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>选择在线 Agent，配置采样目标和采集参数。</div>
          </div>
          <button
            onClick={onCancel}
            aria-label="关闭"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.035)',
              border: '0.5px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: '30px',
            }}
          >
            x
          </button>
        </div>

        <div style={{ padding: 24, display: 'grid', gap: 16 }}>
          <div style={sectionStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
              <Field label="任务名称">
                <input
                  value={form.name}
                  onChange={(event) => onChange({ name: event.target.value })}
                  type="text"
                  placeholder="例: CPU 采样 - checkout-service"
                  style={fieldStyle}
                />
              </Field>
              <Field label="目标 Agent">
                <select
                  value={form.target_ip}
                  onChange={(event) => onChange({ target_ip: event.target.value })}
                  style={selectStyle}
                >
                  <option value="" style={{ background: '#0a0a0c' }}>选择在线 Agent</option>
                  {agents.map(agent => (
                    <option key={agent.id || agent.ip_addr} value={agent.ip_addr} disabled={!agent.online} style={{ background: '#0a0a0c' }}>
                      {agent.hostname || agent.ip_addr} ({agent.ip_addr}) {agent.online ? '' : '- 离线'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {onlineAgents.length === 0 && (
              <div style={{
                marginTop: 12,
                padding: '9px 11px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 12,
              }}>
                当前没有在线 Agent，无法创建采集任务。
              </div>
            )}
          </div>

          <div style={sectionStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="采集类型">
                <select
                  value={form.type}
                  onChange={(event) => {
                    const type = Number(event.target.value);
                    onChange({ type, profiler_type: type === 1 ? 1 : 0 });
                  }}
                  style={selectStyle}
                >
                  <option value={0} style={{ background: '#0a0a0c' }}>CPU / perf</option>
                  <option value={1} style={{ background: '#0a0a0c' }}>Java / async-profiler</option>
                  <option value={4} style={{ background: '#0a0a0c' }}>MemCheck</option>
                  <option value={6} style={{ background: '#0a0a0c' }}>Java Heap</option>
                </select>
              </Field>
              <Field label="目标 PID">
                <input
                  type="number"
                  placeholder="例如 12345"
                  value={form.pid || ''}
                  onChange={(event) => onChange({ pid: Number(event.target.value) })}
                  style={fieldStyle}
                />
              </Field>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <Field label="采样时长">
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min={1}
                    value={form.duration}
                    onChange={(event) => onChange({ duration: Number(event.target.value) })}
                    style={{ ...fieldStyle, paddingRight: 38 }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 11, color: 'rgba(255,255,255,0.34)', fontSize: 12 }}>s</span>
                </div>
              </Field>
              <Field label="采样频率">
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min={1}
                    value={form.hz}
                    onChange={(event) => onChange({ hz: Number(event.target.value) })}
                    style={{ ...fieldStyle, paddingRight: 42 }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 11, color: 'rgba(255,255,255,0.34)', fontSize: 12 }}>Hz</span>
                </div>
              </Field>
              <Field label="Callgraph">
                <select
                  value={form.callgraph}
                  onChange={(event) => onChange({ callgraph: event.target.value })}
                  style={selectStyle}
                >
                  <option value="dwarf" style={{ background: '#0a0a0c' }}>dwarf</option>
                  <option value="fp" style={{ background: '#0a0a0c' }}>fp</option>
                  <option value="lbr" style={{ background: '#0a0a0c' }}>lbr</option>
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px 22px',
          borderTop: '0.5px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.34)' }}>
            创建后会自动轮询任务状态，并在分析完成后进入结果页。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onCancel}
              style={{
                padding: '9px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.58)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              取消
            </button>
            <button
              disabled={!canSubmit}
              onClick={onSubmit}
              style={{
                padding: '9px 18px',
                background: canSubmit ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: canSubmit ? '#fff' : 'rgba(255,255,255,0.28)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontWeight: 700,
              }}
            >
              {submitting ? '创建中...' : '创建任务'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

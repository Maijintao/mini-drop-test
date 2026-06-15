import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { addMember, createGroup, deleteGroup, getGroupMembers, getGroups, removeMember } from '@/api';
import type { GroupInfo, GroupMemberInfo } from '@/domain';
import { formatDate } from '@/domain';

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

export default function Groups() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [members, setMembers] = useState<Record<number, GroupMemberInfo[]>>({});
  const [selectedGid, setSelectedGid] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('');
  const [memberUid, setMemberUid] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useGSAP(() => {
    gsap.fromTo('.groups-header', { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, clearProps: 'transform,opacity,visibility' });
    gsap.fromTo('.groups-panel', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, delay: 0.08, clearProps: 'transform,opacity,visibility' });
  }, { scope: containerRef });

  const selectedGroup = useMemo(() => (
    groups.find(group => group.gid === selectedGid) || groups[0]
  ), [groups, selectedGid]);

  const loadMembers = async (gid: number) => {
    const res = await getGroupMembers(gid);
    if (res.code === 0) {
      setMembers(prev => ({ ...prev, [gid]: res.data || [] }));
    }
  };

  const loadGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getGroups();
      const list = res.code === 0 ? (res.data || []) : [];
      setGroups(list);
      const nextGid = selectedGid && list.some(group => group.gid === selectedGid) ? selectedGid : list[0]?.gid || null;
      setSelectedGid(nextGid);
      if (nextGid) await loadMembers(nextGid);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '用户组加载失败');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const selectGroup = async (gid: number) => {
    setSelectedGid(gid);
    setMessage('');
    setError('');
    if (!members[gid]) {
      try {
        await loadMembers(gid);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || '成员列表加载失败');
      }
    }
  };

  const submitGroup = async () => {
    if (!groupName.trim()) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await createGroup({ name: groupName.trim() });
      setGroupName('');
      setMessage('用户组已创建');
      await loadGroups();
      if (res.data?.gid) await selectGroup(res.data.gid);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '创建用户组失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMember = async () => {
    if (!selectedGroup || !memberUid.trim()) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await addMember(selectedGroup.gid, memberUid.trim());
      setMemberUid('');
      setMessage('成员已添加');
      await loadMembers(selectedGroup.gid);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '添加成员失败');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (uid: string) => {
    if (!selectedGroup || !window.confirm(`确认移除成员 ${uid}？`)) return;
    setError('');
    setMessage('');
    try {
      await removeMember(selectedGroup.gid, uid);
      setMessage('成员已移除');
      await loadMembers(selectedGroup.gid);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '移除成员失败');
    }
  };

  const removeGroup = async (group: GroupInfo) => {
    if (!window.confirm(`确认删除用户组 ${group.name}？`)) return;
    setError('');
    setMessage('');
    try {
      await deleteGroup(group.gid);
      setMessage('用户组已删除');
      setMembers(prev => {
        const next = { ...prev };
        delete next[group.gid];
        return next;
      });
      await loadGroups();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '删除用户组失败');
    }
  };

  const currentMembers = selectedGroup ? (members[selectedGroup.gid] || []) : [];

  return (
    <div ref={containerRef}>
      <div className="groups-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>用户组管理</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>管理组成员和共享可见范围</p>
      </div>

      {(error || message) && (
        <div style={{ ...glassCard, padding: 16, marginBottom: 18, color: error ? '#f87171' : '#4ade80' }}>
          {error || message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 18 }}>
        <div className="groups-panel" style={{ ...glassCard, padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>创建用户组</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitGroup()}
              placeholder="用户组名称"
              style={inputStyle}
            />
            <button onClick={submitGroup} disabled={submitting || !groupName.trim()} style={{ ...buttonStyle, opacity: submitting || !groupName.trim() ? 0.45 : 1 }}>
              创建
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>我的用户组</span>
            <button onClick={loadGroups} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.42)', cursor: 'pointer', fontSize: 13 }}>刷新</button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {loading && <div style={{ padding: 16, color: 'rgba(255,255,255,0.45)' }}>加载用户组中...</div>}
            {!loading && groups.length === 0 && <div style={{ padding: 16, color: 'rgba(255,255,255,0.45)' }}>暂无用户组</div>}
            {!loading && groups.map(group => {
              const active = selectedGroup?.gid === group.gid;
              return (
                <button
                  key={group.gid}
                  onClick={() => selectGroup(group.gid)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '0.5px solid rgba(255,255,255,0.085)',
                    background: active ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.025)',
                    color: active ? '#fff' : 'rgba(255,255,255,0.68)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{group.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginTop: 4 }}>GID {group.gid} · Owner {group.owner_id}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="groups-panel" style={{ ...glassCard, padding: 20 }}>
          {selectedGroup ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{selectedGroup.name}</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
                    创建时间 {formatDate(selectedGroup.created_at)} · 成员 {currentMembers.length}
                  </p>
                </div>
                <button onClick={() => removeGroup(selectedGroup)} style={{ ...buttonStyle, color: 'rgba(248,113,113,0.9)' }}>删除组</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 18 }}>
                <input
                  value={memberUid}
                  onChange={(e) => setMemberUid(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitMember()}
                  placeholder="输入用户 UID"
                  style={inputStyle}
                />
                <button onClick={submitMember} disabled={submitting || !memberUid.trim()} style={{ ...buttonStyle, opacity: submitting || !memberUid.trim() ? 0.45 : 1 }}>
                  添加成员
                </button>
              </div>

              <div style={{ border: '0.5px solid rgba(255,255,255,0.085)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.085)' }}>
                      {['GID', 'UID', '操作'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentMembers.length === 0 && <tr><td colSpan={3} style={{ padding: 20, color: 'rgba(255,255,255,0.45)' }}>暂无成员</td></tr>}
                    {currentMembers.map((member, i) => (
                      <tr key={`${member.gid}-${member.uid}`} style={{ borderBottom: i < currentMembers.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{member.gid}</td>
                        <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.86)', fontSize: 13, fontFamily: 'monospace' }}>{member.uid}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={() => remove(member.uid)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.85)', cursor: 'pointer', fontSize: 13 }}>移除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ padding: 24, color: 'rgba(255,255,255,0.45)' }}>请选择或创建一个用户组</div>
          )}
        </div>
      </div>
    </div>
  );
}

import { getTaskDetail, triggerAnalysis } from '@/api';
import type { HotmethodTask } from '@/domain';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_COUNT = 120;

export type TaskPollPhase = 'collecting' | 'analyzing';

interface WaitForTaskResultOptions {
  onUpdate?: (task: HotmethodTask, phase: TaskPollPhase) => void;
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function loadTask(tid: string): Promise<HotmethodTask> {
  const res = await getTaskDetail(tid);
  if (res.code !== 0 || !res.data?.task) {
    throw new Error(res.message || '任务状态加载失败');
  }
  return res.data.task;
}

export async function waitForTaskResult(tid: string, options: WaitForTaskResultOptions = {}) {
  let analysisTriggered = false;

  for (let i = 0; i < MAX_POLL_COUNT; i += 1) {
    const task = await loadTask(tid);

    if (task.status === 3) {
      throw new Error(task.status_info || '任务执行失败');
    }

    if (task.status < 2) {
      options.onUpdate?.(task, 'collecting');
      await wait(POLL_INTERVAL_MS);
      continue;
    }

    if (!analysisTriggered && task.analysis_status === 0) {
      analysisTriggered = true;
      await triggerAnalysis(tid);
    }

    options.onUpdate?.(task, 'analyzing');

    if (task.analysis_status === 2 || task.analysis_status === 3) {
      return task;
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error('任务轮询超时');
}

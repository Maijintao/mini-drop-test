import { getTaskDetail, triggerAnalysis } from '@/api';
import type { HotmethodTask } from '@/domain';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_COUNT = 120;

export type TaskPollPhase = 'collecting' | 'analyzing';

interface WaitForTaskResultOptions {
  onUpdate?: (task: HotmethodTask, phase: TaskPollPhase) => void;
  signal?: AbortSignal;
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function loadTask(tid: string): Promise<HotmethodTask> {
  const res = await getTaskDetail(tid);
  if (res.code !== 0 || !res.data?.task) {
    throw new Error(res.message || '任务状态加载失败');
  }
  return res.data.task;
}

export async function waitForTaskResult(tid: string, options: WaitForTaskResultOptions = {}): Promise<HotmethodTask> {
  const { signal, onUpdate } = options;
  let analysisTriggered = false;

  for (let i = 0; i < MAX_POLL_COUNT; i += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const task = await loadTask(tid);

    if (task.status === 3) {
      throw new Error(task.status_info || '任务执行失败');
    }

    if (task.status < 2) {
      onUpdate?.(task, 'collecting');
      await wait(POLL_INTERVAL_MS, signal);
      continue;
    }

    if (!analysisTriggered && task.analysis_status === 0) {
      analysisTriggered = true;
      await triggerAnalysis(tid);
    }

    onUpdate?.(task, 'analyzing');

    if (task.analysis_status === 2 || task.analysis_status === 3) {
      return task;
    }

    await wait(POLL_INTERVAL_MS, signal);
  }

  throw new Error('任务轮询超时');
}

export function createTaskPoller(tid: string, options: WaitForTaskResultOptions = {}) {
  const controller = new AbortController();
  const promise = waitForTaskResult(tid, { ...options, signal: controller.signal });
  return { promise, abort: () => controller.abort() };
}

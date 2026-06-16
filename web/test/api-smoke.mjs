#!/usr/bin/env node

const baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8191/api/v1';
const uid = process.env.DROP_TEST_UID || 'web-test-user';
const userName = encodeURIComponent(process.env.DROP_TEST_USER_NAME || 'web-test-user');
const allowWrite = process.env.DROP_TEST_WRITE === '1';
const testPid = Number(process.env.DROP_TEST_PID || process.pid);

const headers = {
  'Content-Type': 'application/json',
  Drop_user_uid: uid,
  Drop_user_name: userName,
};

const results = [];

async function request(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}

function fail(name, detail) {
  results.push({ name, status: 'FAIL', detail });
}

function skip(name, detail) {
  results.push({ name, status: 'SKIP', detail });
}

function assertApiOk(name, response) {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.json)}`);
  }
  if (!response.json || response.json.code !== 0) {
    throw new Error(`API code is not 0: ${JSON.stringify(response.json)}`);
  }
}

async function runTest(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (error) {
    fail(name, error?.message || String(error));
  }
}

let agents = [];
let tasks = [];

await runTest('GET /healthz', async () => {
  const response = await request('GET', '/healthz');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.json)}`);
  }
  if (response.json?.code !== 0 && response.json?.status !== 'ok') {
    throw new Error(`unexpected health response: ${JSON.stringify(response.json)}`);
  }
  return 'apiserver healthy';
});

await runTest('GET /auth/check', async () => {
  const response = await request('GET', '/auth/check');
  assertApiOk('GET /auth/check', response);
  if (!response.json.data?.uid) throw new Error('missing data.uid');
  return `uid=${response.json.data.uid}`;
});

await runTest('GET /users', async () => {
  const response = await request('GET', '/users');
  assertApiOk('GET /users', response);
  if (!response.json.data?.uid) throw new Error('missing user uid');
  return `uid=${response.json.data.uid}`;
});

await runTest('GET /agents', async () => {
  const response = await request('GET', '/agents');
  assertApiOk('GET /agents', response);
  if (!Array.isArray(response.json.data)) throw new Error('data is not an array');
  agents = response.json.data;
  return `${agents.length} agents`;
});

const onlineAgent = agents.find((agent) => agent.online && agent.ip_addr);
if (onlineAgent) {
  await runTest('GET /agent/stat', async () => {
    const response = await request('GET', `/agent/stat?ip=${encodeURIComponent(onlineAgent.ip_addr)}`);
    assertApiOk('GET /agent/stat', response);
    return `ip=${onlineAgent.ip_addr}`;
  });
} else {
  skip('GET /agent/stat', 'no online agent returned by /agents');
}

await runTest('GET /tasks', async () => {
  const response = await request('GET', '/tasks?page=1&size=20');
  assertApiOk('GET /tasks', response);
  if (!Array.isArray(response.json.data?.list)) throw new Error('data.list is not an array');
  tasks = response.json.data.list;
  return `${tasks.length}/${response.json.data.total || 0} tasks`;
});

const firstTask = tasks[0];
if (firstTask?.tid) {
  await runTest('GET /tasks/:tid', async () => {
    const response = await request('GET', `/tasks/${encodeURIComponent(firstTask.tid)}`);
    assertApiOk('GET /tasks/:tid', response);
    if (!response.json.data?.task?.tid) throw new Error('missing data.task.tid');
    return `tid=${firstTask.tid}`;
  });

  await runTest('GET /tasks/:tid/suggestions', async () => {
    const response = await request('GET', `/tasks/${encodeURIComponent(firstTask.tid)}/suggestions`);
    assertApiOk('GET /tasks/:tid/suggestions', response);
    if (!Array.isArray(response.json.data)) throw new Error('data is not an array');
    return `${response.json.data.length} suggestions`;
  });

  await runTest('GET /tasks/:tid/flame', async () => {
    const response = await request('GET', `/tasks/${encodeURIComponent(firstTask.tid)}/flame`);
    if (response.status === 404) return 'no flame data yet';
    assertApiOk('GET /tasks/:tid/flame', response);
    if (!response.json.data?.url) throw new Error('missing data.url');
    return `${response.json.data.type}: ${response.json.data.url}`;
  });

  await runTest('GET /cosfiles', async () => {
    const response = await request('GET', `/cosfiles?tid=${encodeURIComponent(firstTask.tid)}`);
    assertApiOk('GET /cosfiles', response);
    const files = response.json.data || [];
    if (!Array.isArray(files)) throw new Error('data is not an array or null');
    return `${files.length} files`;
  });
} else {
  skip('GET /tasks/:tid', 'no task returned by /tasks');
  skip('GET /tasks/:tid/suggestions', 'no task returned by /tasks');
  skip('GET /tasks/:tid/flame', 'no task returned by /tasks');
  skip('GET /cosfiles', 'no task returned by /tasks');
}

if (allowWrite) {
  if (!onlineAgent) {
    skip('POST /tasks', 'DROP_TEST_WRITE=1 but no online agent is available');
  } else {
    let createdTid = '';
    await runTest('POST /tasks', async () => {
      const response = await request('POST', '/tasks', {
        name: `web-api-smoke-${Date.now()}`,
        type: 0,
        profiler_type: 0,
        target_ip: onlineAgent.ip_addr,
        pid: testPid,
        duration: 1,
        hz: 49,
        callgraph: 'dwarf',
        subprocess: false,
        event: 'cpu-cycles',
      });
      assertApiOk('POST /tasks', response);
      createdTid = response.json.data?.tid || '';
      if (!createdTid) throw new Error('missing created tid');
      return `tid=${createdTid}`;
    });

    if (createdTid) {
      await runTest('GET /tasks/:tid after create', async () => {
        const response = await request('GET', `/tasks/${encodeURIComponent(createdTid)}`);
        assertApiOk('GET /tasks/:tid after create', response);
        if (response.json.data?.task?.tid !== createdTid) {
          throw new Error(`unexpected tid: ${JSON.stringify(response.json.data)}`);
        }
        return `tid=${createdTid}`;
      });

      await runTest('GET /tasks/:tid/suggestions after create', async () => {
        const response = await request('GET', `/tasks/${encodeURIComponent(createdTid)}/suggestions`);
        assertApiOk('GET /tasks/:tid/suggestions after create', response);
        if (!Array.isArray(response.json.data)) throw new Error('data is not an array');
        return `${response.json.data.length} suggestions`;
      });

      await runTest('GET /tasks/:tid/flame after create', async () => {
        const response = await request('GET', `/tasks/${encodeURIComponent(createdTid)}/flame`);
        if (response.status === 404) return 'no flame data yet';
        assertApiOk('GET /tasks/:tid/flame after create', response);
        return `${response.json.data?.type || 'unknown'}`;
      });

      await runTest('GET /cosfiles after create', async () => {
        const response = await request('GET', `/cosfiles?tid=${encodeURIComponent(createdTid)}`);
        assertApiOk('GET /cosfiles after create', response);
        const files = response.json.data || [];
        if (!Array.isArray(files)) throw new Error('data is not an array or null');
        return `${files.length} files`;
      });

      await runTest('DELETE /tasks/:tid', async () => {
        const response = await request('DELETE', `/tasks/${encodeURIComponent(createdTid)}`);
        assertApiOk('DELETE /tasks/:tid', response);
        return `deleted ${createdTid}`;
      });
    }
  }
} else {
  skip('POST /tasks', 'set DROP_TEST_WRITE=1 to create a real collection task');
  skip('DELETE /tasks/:tid', 'set DROP_TEST_WRITE=1 to create and delete a test task');
}

const failed = results.filter((result) => result.status === 'FAIL');
const width = Math.max(...results.map((result) => result.name.length), 12);

for (const result of results) {
  const detail = result.detail ? ` - ${result.detail}` : '';
  console.log(`${result.status.padEnd(4)} ${result.name.padEnd(width)}${detail}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}

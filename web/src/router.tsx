import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/layouts/AppLayout';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import TaskList from '@/pages/TaskList';
import TaskResult from '@/pages/TaskResult';
import Agents from '@/pages/Agents';
import Settings from '@/pages/Settings';
import Groups from '@/pages/Groups';
import AgentDetail from '@/pages/AgentDetail';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/index" replace /> },
      { path: 'index', element: <Home /> },
      { path: 'tasks', element: <TaskList /> },
      { path: 'task/result', element: <TaskResult /> },
      { path: 'agents', element: <Agents /> },
      { path: 'agents/:ip', element: <AgentDetail /> },
      { path: 'groups', element: <Groups /> },
      { path: 'schedules', element: <Navigate to="/tasks?view=schedules" replace /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);

export default router;

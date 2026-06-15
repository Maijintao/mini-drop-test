import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/layouts/AppLayout';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import TaskList from '@/pages/TaskList';
import TaskResult from '@/pages/TaskResult';

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
    ],
  },
]);

export default router;

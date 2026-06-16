import { Navigate } from 'react-router-dom';

export default function Schedules() {
  return <Navigate to="/tasks?view=schedules" replace />;
}

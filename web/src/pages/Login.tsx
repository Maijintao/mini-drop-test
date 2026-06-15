import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Space } from 'antd';
import useAuth from '@/store/useAuth';

export default function Login() {
  const { isAuth, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuth) {
      navigate('/index', { replace: true });
    }
  }, [isAuth, navigate]);

  const handleLogin = async () => {
    await login();
    if (useAuth.getState().isAuth) {
      navigate('/index', { replace: true });
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400, textAlign: 'center' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Typography.Title level={2}>Mini-Drop</Typography.Title>
          <Typography.Text type="secondary">性能采集与分析平台</Typography.Text>
          <Button type="primary" size="large" block onClick={handleLogin}>
            登录
          </Button>
        </Space>
      </Card>
    </div>
  );
}

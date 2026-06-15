import { useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, Button, Space, Typography, Spin } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import useAuth from '@/store/useAuth';

const { Header, Content } = Layout;

export default function AppLayout() {
  const { uid, userName, isAuth, loading, login, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuth && !loading) {
      login();
    }
  }, [isAuth, loading, login]);

  // 未登录时显示 loading
  if (loading || !isAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="正在验证登录状态..." />
      </div>
    );
  }

  // 当前选中的菜单项
  const selectedKey = location.pathname === '/index' ? '/index' : location.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 18 }}>
            Mini-Drop
          </Typography.Text>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={[
              { key: '/index', label: <Link to="/index">主页</Link> },
              { key: '/tasks', label: <Link to="/tasks">任务列表</Link> },
            ]}
            style={{ flex: 1, minWidth: 0 }}
          />
        </div>
        <Space>
          <UserOutlined style={{ color: '#fff' }} />
          <Typography.Text style={{ color: '#fff' }}>{userName || uid}</Typography.Text>
          <Button type="link" icon={<LogoutOutlined />} onClick={logout} style={{ color: '#fff' }}>
            退出
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: '24px', background: '#f5f5f5' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}

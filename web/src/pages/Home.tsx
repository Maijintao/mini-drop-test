import { Card, Typography } from 'antd';

export default function Home() {
  return (
    <div>
      <Typography.Title level={3}>主页</Typography.Title>
      <Card>
        <Typography.Text type="secondary">Agent 列表和任务概览将在此展示</Typography.Text>
      </Card>
    </div>
  );
}

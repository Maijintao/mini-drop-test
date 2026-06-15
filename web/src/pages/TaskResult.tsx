import { Card, Typography } from 'antd';

export default function TaskResult() {
  return (
    <div>
      <Typography.Title level={3}>任务详情</Typography.Title>
      <Card>
        <Typography.Text type="secondary">任务详情（火焰图/热点/建议）将在此展示</Typography.Text>
      </Card>
    </div>
  );
}

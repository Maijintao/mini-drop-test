import { Card, Typography } from 'antd';

export default function TaskList() {
  return (
    <div>
      <Typography.Title level={3}>任务列表</Typography.Title>
      <Card>
        <Typography.Text type="secondary">任务表格（分页/搜索/删除）将在此展示</Typography.Text>
      </Card>
    </div>
  );
}

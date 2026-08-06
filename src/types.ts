export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | '已完成' | '进行中' | '未开始';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  assigneeAvatar?: string;
  dueDate?: string;
  project?: string;
  category?: 'requirement' | 'design' | 'dev' | 'test';
}

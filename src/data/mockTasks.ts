export interface Task {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  time?: string;
  status: string;
  description: string;
  project: string;
  assignee: string;
  assigneeAvatar: string;
  deadline: string;
  aiSuggestions: string[];
}

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  tasks: Task[];
}

export const INITIAL_CATEGORIES: TaskCategory[] = [
  {
    id: 'requirement',
    name: '需求评审',
    color: 'bg-emerald-500',
    tasks: [
      { 
        id: 'WXB-2025-001', 
        title: '需求评审会', 
        priority: 'high', 
        time: '今天 10:00',
        status: '进行中',
        description: '与业务团队对齐需求范围，明确核心目标与验收标准，输出需求评审结论。',
        project: 'WenXiBuddy 2.0',
        assignee: 'Brandon',
        assigneeAvatar: 'BR',
        deadline: '2025-05-24 18:00',
        aiSuggestions: [
          '建议关联相似历史评审文档3份，参考风险点。',
          '检测到潜在风险：需求范围可能变更。'
        ]
      },
      { 
        id: 'WXB-2025-002', 
        title: '用户调研分析', 
        priority: 'medium', 
        time: '今天 14:00',
        status: '未开始',
        description: '整理本周用户访谈记录，提炼核心痛点，并输出调研报告。',
        project: 'WenXiBuddy 2.0',
        assignee: 'Alice',
        assigneeAvatar: 'AL',
        deadline: '2025-05-25 12:00',
        aiSuggestions: [
          '发现有两份访谈记录情绪偏负面，建议重点关注。',
          '已自动为您提炼访谈高频词：加载慢、找不到入口。'
        ]
      },
      { 
        id: 'WXB-2025-003', 
        title: '竞品功能梳理', 
        priority: 'medium', 
        time: '明天 09:30',
        status: '进行中',
        description: '对比竞品核心功能模块，分析差异化优势。',
        project: '数据看板重构',
        assignee: 'Zack',
        assigneeAvatar: 'ZX',
        deadline: '2025-05-26 18:00',
        aiSuggestions: [
          '网上有最新竞品评测报告，建议参考。'
        ]
      },
    ]
  },
  {
    id: 'design',
    name: '产品设计',
    color: 'bg-blue-500',
    tasks: [
      { 
        id: 'WXB-2025-004', 
        title: '交互流程设计', 
        priority: 'high', 
        status: '进行中',
        description: '完成任务管理模块的核心交互流程设计。',
        project: 'WenXiBuddy 2.0',
        assignee: 'Brandon',
        assigneeAvatar: 'BR',
        deadline: '2025-05-28 18:00',
        aiSuggestions: [
          '当前流程较为复杂，建议拆分为两个子步骤。'
        ]
      },
      { 
        id: 'WXB-2025-005', 
        title: '原型评审', 
        priority: 'medium', 
        status: '未开始',
        description: '组织设计团队和开发团队进行原型评审。',
        project: '移动端适配V3',
        assignee: 'Alice',
        assigneeAvatar: 'AL',
        deadline: '2025-05-30 14:00',
        aiSuggestions: [
          '已自动为您草拟会议议程，是否直接发送邀请？'
        ]
      },
    ]
  },
  {
    id: 'dev',
    name: '开发实现',
    color: 'bg-purple-500',
    tasks: []
  }
];

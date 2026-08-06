import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { ProductDocument } from '../../data/mockProducts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogBody,
  Button,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui';

interface Props {
  productId: string;
  onClose: () => void;
}

export function AddDocumentModal({ productId, onClose }: Props) {
  const { addProductDocument } = useApp();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProductDocument['category']>('PRD需求');
  const [version, setVersion] = useState('v1.0.0');
  const [author, setAuthor] = useState('Brandon (PM)');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newDoc: ProductDocument = {
      id: `doc-${Date.now()}`,
      title: title.trim(),
      category,
      version: version.trim() || 'v1.0',
      author: author.trim() || 'Brandon',
      updatedAt: '刚刚',
      wordCount: `${(content.length || 200) * 2} 字`,
      summary: summary.trim() || '该文档记录了最新的业务规格与技术方案。',
      content: content.trim() || `### 1. 文档概述\n${summary || title}\n\n### 2. 详细规范说明\n- 核心逻辑待细化\n- 异常分支待补充`
    };

    addProductDocument(productId, newDoc);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader
          title="新建产品文档"
          description="录入 PRD 需求、技术架构方案、API 协议或用户调研报告"
        />

        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="文档名称 *"
              type="text"
              required
              placeholder="例如: PRD_核心数据看板与异常预警规格_v2.0.docx"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="font-medium"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-primary">文档类别</label>
                <Select value={category} onValueChange={(v) => setCategory(v as ProductDocument['category'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRD需求">PRD需求</SelectItem>
                    <SelectItem value="架构设计">架构设计</SelectItem>
                    <SelectItem value="API规范">API规范</SelectItem>
                    <SelectItem value="用户调研">用户调研</SelectItem>
                    <SelectItem value="发版规划">发版规划</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Input
                label="版本号"
                type="text"
                placeholder="v1.0"
                value={version}
                onChange={e => setVersion(e.target.value)}
                className="font-mono"
              />

              <Input
                label="维护作者"
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
              />
            </div>

            <Textarea
              label="文档摘要概览"
              rows={2}
              placeholder="简要概括该文档涉及的核心业务逻辑与影响模块..."
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />

            <Textarea
              label="Markdown 文档内容"
              rows={6}
              placeholder="支持 Markdown 语法，如 ### 1. 背景与目标..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="font-mono"
            />

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="primary">
                保存并发布文档
              </Button>
            </DialogFooter>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Project Generation Endpoint
  app.post('/api/generate-project', async (req, res) => {
    try {
      const { prompt, filesContext } = req.body;

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemPrompt = `You are an expert project manager. 
The user wants to create a new project with this prompt: "${prompt}".
Here is the context of their selected files/workspace:
${filesContext}

Please generate a structured project plan with milestones and individual tasks. 
Each milestone should have a date.
Each task should belong to a milestone and have a priority ('high', 'medium', 'low') and an AI suggested status.
Output as JSON matching the schema requested.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: systemPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectName: {
                type: Type.STRING,
                description: "Name of the project"
              },
              projectDescription: {
                type: Type.STRING,
                description: "Short description of the project"
              },
              milestones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "Milestone title" },
                    date: { type: Type.STRING, description: "Milestone date in YYYY-MM-DD format" },
                    status: { type: Type.STRING, description: "Status: pending, in-progress, or completed" }
                  },
                  required: ["title", "date", "status"]
                }
              },
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    priority: { type: Type.STRING, description: "high, medium, or low" },
                    deadline: { type: Type.STRING, description: "Deadline date in YYYY-MM-DD format" },
                    milestoneIndex: { type: Type.INTEGER, description: "Index of the milestone this task belongs to in the milestones array" }
                  },
                  required: ["title", "description", "priority", "deadline", "milestoneIndex"]
                }
              }
            },
            required: ["projectName", "projectDescription", "milestones", "tasks"]
          }
        }
      });

      const text = response.text.trim();
      const jsonStr = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      const result = JSON.parse(jsonStr);
      res.json(result);
    } catch (error: any) {
      console.error("Project generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Workspace Files Summary Endpoint
  app.post('/api/summarize-workspace', async (req, res) => {
    try {
      const { workspaceName, folderPath, files, projectName, projectProgress, taskCount } = req.body;

      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const filesDescription = Array.isArray(files)
          ? files.map((f: any) => `- 【${f.name}】(${f.type || 'file'}): ${f.contentSnippet || '无详情预览'}`).join('\n')
          : '暂无文件列表';

        const prompt = `你是一个高级AI项目与文档分析专家。请根据以下工作区的文件信息与关联项目上下文，生成一份中文工作区文件总结报告：
工作区名称: ${workspaceName}
工作区路径: ${folderPath || '未指定'}
关联项目: ${projectName || '未关联'} (当前项目进度: ${projectProgress || 0}%, 关联任务数: ${taskCount || 0})

工作区内文件清单与摘要:
${filesDescription}

请从以下4个维度进行精炼结构化总结：
1. 🎯 核心目标与技术业务范围
2. 📑 关键文档核心提炼 (重点提炼 PRD/架构/API/规范/测试报告)
3. ⚠️ 风险点与阻塞项预警 (结合项目进度和文件内容)
4. 📌 下一步行动建议

要求格式清晰、分段明了，使用 Markdown 格式输出。`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
        });

        return res.json({ summary: response.text });
      }

      // Fallback if no API key
      const fallbackSummary = `### 📁 【${workspaceName || '工作区'}】AI 文档与资产全景总结

🎯 **核心目标与技术业务范围**
本工作区关联项目 **${projectName || '未关联项目'}**（当前进度：${projectProgress || 0}%，关联任务数：${taskCount || 0}），主要沉淀了项目关键需求规格、架构设计拓扑、接口协议以及阶段测试报告。

📑 **关键文档核心提炼**
${Array.isArray(files) && files.length > 0 ? files.map((f: any) => `• **${f.name}**：${f.contentSnippet || '已完成版本归档与校验。'}`).join('\n') : '• 当前工作区暂未归档核心文件。'}

⚠️ **风险点与状态分析**
• 关联项目进度目前处于 ${projectProgress || 0}% 阶段，需确保文档与最新代码实现版本保持同步；
• 部分关键资产建议定期做多副本备份与权限审查。

📌 **下一步行动建议**
1. 针对核心模块推进下一阶段开发与自动化测试验证；
2. 及时在任务管理板块中更新已完成的文件交付物。`;

      res.json({ summary: fallbackSummary });
    } catch (error: any) {
      console.error("Workspace summary error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Local File Workspace Mock Endpoint
  app.get('/api/workspace-files', (req, res) => {
    // In a real app we'd read from local fs. 
    // Here we'll just mock a few files for the UI to pick.
    const files = [
      { id: '1', name: 'requirements_v2.md', type: 'doc' },
      { id: '2', name: 'design_specs.pdf', type: 'doc' },
      { id: '3', name: 'api_docs.ts', type: 'code' },
      { id: '4', name: 'architecture_diagram.png', type: 'image' },
    ];
    res.json(files);
  });

  // AI Product Deliverable Generator Endpoint
  app.post('/api/rnd/generate-deliverable', async (req, res) => {
    try {
      const { product, code, deliverableTitle, customPrompt } = req.body;

      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `你是一个资深大厂首席产品总监与系统架构师。请为产品【${product?.name || '新产品'}】深度生成专业产研成果物【${deliverableTitle}】(编号: ${code})。
产品定位: ${product?.tagline || ''}
产品描述: ${product?.description || ''}
当前阶段: ${product?.stage || '研发中'}
附加生成要求: ${customPrompt || '生成符合互联网大厂规范的高质量、可直接交付的内容'}

请生成格式优美、结构严谨、细节充实的内容。若是 Markdown 则使用清晰的多级标题与表格；若是 JSON 或 SQL 则输出标准格式代码。`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
        });

        return res.json({ content: response.text });
      }

      res.json({ status: 'fallback', message: 'Ready' });
    } catch (err: any) {
      console.error('Deliverable generation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // AI Knowledge Article Polish Endpoint
  app.post('/api/rnd/polish-knowledge-article', async (req, res) => {
    try {
      const { title, content, action } = req.body;

      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `你是一个企业级知识库与技术文档专家。请对以下产品知识库文档执行操作【${action || '优化润色与结构化排版'}】：
文档标题: ${title}
原始内容:
${content}

要求：保持专业严谨、逻辑清晰，补充关键技术细节或业务规范，输出格式精美的 Markdown 文本。`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
        });

        return res.json({ content: response.text });
      }

      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // D-23: bind 127.0.0.1 only — dev fallback, never expose on LAN (CONCERNS.md HIGH).
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Dev-only server running at http://127.0.0.1:${PORT} (not for production)`);
  });
}

startServer();

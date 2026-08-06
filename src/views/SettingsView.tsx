import { User, Bell, Shield, Palette, Layout, Globe, Save } from 'lucide-react';

export function SettingsView() {
  return (
    <div className="flex bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-[calc(100vh-140px)] min-h-[600px]">
      <div className="w-64 border-r border-slate-100 bg-slate-50/50 p-4 space-y-1">
        <h3 className="text-xs font-bold text-slate-400 mb-4 px-3 uppercase tracking-wider">个人设置</h3>
        <button className="w-full flex items-center gap-3 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium transition-colors">
          <User size={18} /> 账号信息
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
          <Bell size={18} /> 消息通知
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
          <Shield size={18} /> 隐私与安全
        </button>

        <h3 className="text-xs font-bold text-slate-400 mb-4 mt-8 px-3 uppercase tracking-wider">系统偏好</h3>
        <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
          <Palette size={18} /> 外观主题
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
          <Layout size={18} /> 界面布局
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
          <Globe size={18} /> 语言与时区
        </button>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-slate-800">账号信息</h2>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">
              <Save size={16} /> 保存修改
            </button>
          </div>

          <div className="space-y-8">
            {/* Avatar Section */}
            <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
              <div className="w-24 h-24 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-3xl font-bold border-4 border-white shadow-sm">
                BR
              </div>
              <div>
                <div className="flex gap-3 mb-2">
                  <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">更换头像</button>
                  <button className="px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-medium transition-colors">删除</button>
                </div>
                <p className="text-xs text-slate-500">支持 JPG, GIF 或 PNG 格式，最大 2MB</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">姓名</label>
                <input type="text" defaultValue="Brandon" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">用户名</label>
                <input type="text" defaultValue="brandon_dev" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-bold text-slate-700">邮箱地址</label>
                <input type="email" defaultValue="brandon@example.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">职位/角色</label>
                <input type="text" defaultValue="产品经理" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">所在部门</label>
                <input type="text" defaultValue="产品研发部" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-bold text-slate-700">个人简介</label>
                <textarea rows={4} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none" defaultValue="关注用户体验与产品创新。"></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

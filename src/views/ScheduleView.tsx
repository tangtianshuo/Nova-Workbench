import { ChevronLeft, ChevronRight, Clock, MapPin, Video } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store/AppContext';

export function ScheduleView() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 4, 15)); // May 15, 2025
  const { events } = useApp();

  // Generate calendar days for May 2025
  const daysInMonth = 31;
  const firstDayOfMonth = 4; // Thursday
  
  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDayOfMonth + 1;
    return {
      date: day,
      isCurrentMonth: day > 0 && day <= daysInMonth,
      isToday: day === 15,
      hasEvents: events.some(e => e.date === day),
      dayEvents: events.filter(e => e.date === day)
    };
  });

  const upcomingEvents = events
    .filter(e => e.date >= 15)
    .sort((a, b) => a.date - b.date)
    .slice(0, 5);

  return (
    <div className="flex gap-6 h-full min-h-[700px]">
      {/* Calendar Section */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-slate-800">2025年 5月</h2>
            <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1">
              <button className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-all"><ChevronLeft size={18} /></button>
              <button className="px-3 py-1.5 text-sm font-medium hover:bg-white rounded shadow-sm text-slate-700 transition-all">今天</button>
              <button className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-all"><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="flex gap-2">
             <button className="px-4 py-2 bg-blue-50 text-blue-600 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors">月视图</button>
             <button className="px-4 py-2 text-slate-500 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">周视图</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-xl overflow-hidden flex-1 border border-slate-100">
          {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map(day => (
            <div key={day} className="bg-slate-50 py-3 text-center text-sm font-medium text-slate-500">
              {day}
            </div>
          ))}
          
          {days.map((day, i) => (
            <div 
              key={i} 
              className={`bg-white min-h-[100px] p-2 transition-colors hover:bg-slate-50 ${!day.isCurrentMonth ? 'opacity-30 bg-slate-50' : ''}`}
            >
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 ${day.isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'}`}>
                {day.date > 0 && day.date <= 31 ? day.date : (day.date <= 0 ? 30 + day.date : day.date - 31)}
              </div>
              
              {day.isCurrentMonth && day.hasEvents && (
                <div className="space-y-1">
                  {day.dayEvents.map(e => (
                    <div key={e.id} className={`px-1.5 py-0.5 text-[10px] rounded border truncate font-medium ${
                      e.type === 'meeting' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      e.type === 'review' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                      'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {e.time.split(' ')[0]} {e.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agenda Section */}
      <div className="w-80 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center justify-between">
          近期日程
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{upcomingEvents.length} 个事件</span>
        </h3>
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {upcomingEvents.map(event => (
            <div key={event.id} className="relative pl-6 pb-6 border-l-2 border-slate-100 last:border-transparent last:pb-0">
              <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white ${
                event.type === 'meeting' ? 'bg-blue-500' : 
                event.type === 'review' ? 'bg-purple-500' : 'bg-emerald-500'
              }`}></div>
              <div className="bg-slate-50 rounded-xl p-4 hover:bg-slate-100/80 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{event.title}</h4>
                  {event.date === 15 ? (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">今天</span>
                  ) : event.date === 16 ? (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">明天</span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">5月{event.date}日</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock size={14} className="text-slate-400" />
                    {event.time}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 w-fit">
                  {event.location.includes('线上') || event.location.includes('Meeting') ? 
                    <Video size={14} className="text-blue-500" /> : 
                    <MapPin size={14} className="text-rose-500" />
                  }
                  {event.location}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-bold transition-colors shadow-sm">
          + 新建日程
        </button>
      </div>
    </div>
  );
}

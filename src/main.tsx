import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initializeDatabase } from './stores/storage/initializeDatabase';
import './index.css';

// ponytail: previously top-level await — silent on rejection (Vite swallows it),
// leaving the static boot splash visible forever = "white screen with NOVA".
// Now renders an error screen so target-machine failures surface without devtools.
const root = createRoot(document.getElementById('root')!);

initializeDatabase()
  .then(() => root.render(<StrictMode><App /></StrictMode>))
  .catch((err) => {
    console.error('[Nova boot] initializeDatabase failed:', err);
    const e = err as Error;
    root.render(
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#F2F4F8', color: '#161A22' }}>
        <h1 style={{ marginBottom: 16 }}>Nova 启动失败</h1>
        <p style={{ color: '#dc2626', marginBottom: 16, fontWeight: 600 }}>{String(e?.message ?? err)}</p>
        {e?.stack && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#666', lineHeight: 1.5 }}>{e.stack}</pre>}
        <p style={{ marginTop: 24, fontSize: 13, color: '#666' }}>请把上面的红色错误信息 + 堆栈截图发回开发。app data 目录(Windows: %APPDATA%\com.nova.pm-workspace\)里可以删除 nova.db 重试。</p>
      </div>,
    );
  });

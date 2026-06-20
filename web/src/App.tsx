import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ModuleStub from './pages/ModuleStub';
import { MODULES } from './domain/modules';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {MODULES.filter((m) => m.id !== 'dashboard').map((m) => (
            <Route key={m.id} path={m.path} element={<ModuleStub module={m} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

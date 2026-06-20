import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ModuleStub from './pages/ModuleStub';
import Login from './pages/Login';
import { MODULES } from './domain/modules';
import { useAuth } from './auth/AuthContext';

export default function App() {
  const { user } = useAuth();

  if (!user) return <Login />;

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

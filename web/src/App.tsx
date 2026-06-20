import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import ModuleStub from './pages/ModuleStub';
import Login from './pages/Login';
import { MODULES } from './domain/modules';
import { useAuth } from './auth/AuthContext';
import { JobsProvider } from './data/JobsContext';

const CUSTOM_PAGES: Record<string, React.ComponentType> = {
  schedule: Schedule,
};

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;

  return (
    <JobsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            {MODULES.filter((m) => m.id !== 'dashboard').map((m) => {
              const Custom = CUSTOM_PAGES[m.id];
              return <Route key={m.id} path={m.path} element={Custom ? <Custom /> : <ModuleStub module={m} />} />;
            })}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </JobsProvider>
  );
}

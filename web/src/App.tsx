import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Dispatch from './pages/Dispatch';
import Reporting from './pages/Reporting';
import Installation from './pages/Installation';
import PostInstall from './pages/PostInstall';
import Delivery from './pages/Delivery';
import Service from './pages/Service';
import Customers from './pages/Customers';
import Routing from './pages/Routing';
import Import from './pages/Import';
import Estimator from './pages/Estimator';
import Readiness from './pages/Readiness';
import Closeout from './pages/Closeout';
import Manager from './pages/Manager';
import UserManagement from './pages/UserManagement';
import Company from './pages/Company';
import Plans from './pages/Plans';
import Invoicing from './pages/Invoicing';
import TimeOff from './pages/TimeOff';
import Field from './pages/Field';
import ModuleStub from './pages/ModuleStub';
import Login from './pages/Login';
import { MODULES } from './domain/modules';
import { useAuth } from './auth/AuthContext';
import { JobsProvider } from './data/JobsContext';
import { PlanProvider } from './data/PlanContext';
import Gated from './components/Gated';

const CUSTOM_PAGES: Record<string, React.ComponentType> = {
  schedule: Schedule,
  dispatch: Dispatch,
  reporting: Reporting,
  installation: Installation,
  postinstall: PostInstall,
  delivery: Delivery,
  service: Service,
  customers: Customers,
  routing: Routing,
  import: Import,
  estimator: Estimator,
  readiness: Readiness,
  closeout: Closeout,
  manager: Manager,
  users: UserManagement,
  company: Company,
  plans: Plans,
  invoicing: Invoicing,
  timeoff: TimeOff,
  field: Field,
};

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;

  return (
    <JobsProvider>
      <PlanProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              {MODULES.filter((m) => m.id !== 'dashboard').map((m) => {
                const Custom = CUSTOM_PAGES[m.id];
                const page = Custom ? <Custom /> : <ModuleStub module={m} />;
                return <Route key={m.id} path={m.path} element={<Gated id={m.id}>{page}</Gated>} />;
              })}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PlanProvider>
    </JobsProvider>
  );
}

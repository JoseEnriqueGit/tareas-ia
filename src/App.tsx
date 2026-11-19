import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { signOut, useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import TasksPage from './pages/TasksPage';
import TaskFormPage from './pages/TaskFormPage';
import ChatPage from './pages/ChatPage';
import { useOnline } from './lib/useOnline';

export default function App() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="center muted">Cargando…</p>;

  if (!session) {
    // RF-02: sin sesión, cualquier ruta lleva al login.
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TasksPage />} />
        <Route path="/tareas/nueva" element={<TaskFormPage />} />
        <Route path="/tareas/:id" element={<TaskFormPage />} />
        <Route path="/asistente" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const online = useOnline();
  return (
    <>
      <header className="header">
        <div className="header-row">
          <strong className="user-name">
            {profile?.full_name ?? 'Usuario'}
            {profile?.role === 'supervisor' && <span className="badge">Supervisor</span>}
          </strong>
          <button className="btn-link" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Tareas
          </NavLink>
          <NavLink to="/asistente">Asistente</NavLink>
        </nav>
      </header>
      {!online && <div className="offline">Sin conexión: mostrando las últimas tareas cargadas.</div>}
      <main className="main">{children}</main>
    </>
  );
}

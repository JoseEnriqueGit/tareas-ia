import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import TasksPage from './pages/TasksPage';
import TaskFormPage from './pages/TaskFormPage';
import TaskDetailPage from './pages/TaskDetailPage';
import ChatPage from './pages/ChatPage';
import { useOnline } from './lib/useOnline';
import { tasksSavedAtKey, timeOf } from './lib/format';
import { ChatIcon, OfflineIcon, TasksIcon } from './components/Icons';

export default function App() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="splash" role="status">Cargando…</p>;

  if (!session) {
    // RF-02: sin sesión, cualquier ruta lleva al login.
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  // El formulario usa su propia barra fija de acciones, así que no lleva la barra inferior.
  const showTabbar = !location.pathname.startsWith('/tareas/');

  return (
    <>
      <OfflineBanner userId={session.user.id} />
      <Routes>
        <Route path="/" element={<TasksPage />} />
        <Route path="/tareas/nueva" element={<TaskFormPage />} />
        <Route path="/tareas/:id" element={<TaskDetailPage />} />
        <Route path="/tareas/:id/editar" element={<TaskFormPage />} />
        <Route path="/asistente" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showTabbar && (
        <nav className="tabbar" aria-label="Principal">
          <NavLink to="/" end>
            <TasksIcon />
            Tareas
          </NavLink>
          <NavLink to="/asistente">
            <ChatIcon />
            Asistente
          </NavLink>
        </nav>
      )}
    </>
  );
}

/** RF-24: aviso sin conexión con la hora de las últimas tareas guardadas. */
function OfflineBanner({ userId }: { userId: string }) {
  // También con red, si la sesión venció y no se pudo renovar (modo sin conexión de solo lectura).
  const { offline } = useAuth();
  const online = useOnline() && !offline;
  if (online) return null;
  const savedAt = localStorage.getItem(tasksSavedAtKey(userId));
  return (
    <div className="offline" role="status">
      <OfflineIcon />
      {savedAt ? `Sin conexión · tareas de las ${timeOf(Number(savedAt))}` : 'Sin conexión: mostrando las últimas tareas cargadas.'}
    </div>
  );
}

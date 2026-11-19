import { useState, type FormEvent } from 'react';
import { supabase, errorMessage } from '../lib/supabase';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && !fullName.trim()) return setError('Escribe tu nombre.');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    setBusy(true);
    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() } } });
    setBusy(false);
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : errorMessage(error));
    }
    // Si todo va bien, AuthProvider detecta la sesión y App muestra las tareas.
  }

  return (
    <main className="main login">
      <h1>Tareas IA</h1>
      <p className="muted">Escribe lo que tienes pendiente y el asistente lo organiza.</p>
      <form onSubmit={submit} className="form" noValidate>
        {mode === 'register' && (
          <label>
            Nombre
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <button className="btn-link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
      </button>
    </main>
  );
}

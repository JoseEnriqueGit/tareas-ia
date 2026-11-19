import { useId, useRef, useState, type FormEvent } from 'react';
import { supabase, errorMessage } from '../lib/supabase';
import { CheckIcon } from '../components/Icons';
import './form.css';

type Field = 'fullName' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mensaje en español para los errores de Supabase Auth más comunes. */
function authMessage(error: { message: string }): string {
  if (error.message === 'Invalid login credentials') return 'Email o contraseña incorrectos.';
  if (error.message === 'User already registered') return 'Ese email ya está registrado. ¿Quieres iniciar sesión?';
  return errorMessage(error);
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refs = { fullName: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const uid = useId();
  const isLogin = mode === 'login';

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!isLogin && !fullName.trim()) errors.fullName = 'Escribe tu nombre.';
    if (!EMAIL.test(email.trim())) errors.email = 'Escribe un email válido.';
    if (password.length < 6) errors.password = 'La contraseña debe tener al menos 6 caracteres.';
    return errors;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const errors = validate();
    setFieldErrors(errors);
    const first = (['fullName', 'email', 'password'] as Field[]).find((f) => errors[f]);
    if (first) return refs[first].current?.focus();

    setBusy(true);
    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
    setBusy(false);
    if (error) setError(authMessage(error));
    // Si todo va bien, AuthProvider detecta la sesión y App muestra las tareas.
  }

  function switchMode() {
    // Se conserva lo escrito; solo se limpian los errores.
    setMode(isLogin ? 'register' : 'login');
    setError('');
    setFieldErrors({});
  }

  /** Props comunes de un campo con su error debajo. */
  function field(name: Field, onChange: (value: string) => void) {
    return {
      id: `${uid}-${name}`,
      ref: refs[name],
      className: 'input',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
        setFieldErrors((errs) => ({ ...errs, [name]: undefined }));
      },
      'aria-invalid': !!fieldErrors[name],
      'aria-describedby': fieldErrors[name] ? `${uid}-${name}-error` : undefined,
    };
  }

  const fieldError = (name: Field) =>
    fieldErrors[name] && <span id={`${uid}-${name}-error`} className="field-error">{fieldErrors[name]}</span>;

  return (
    <main className="login-page">
      <form onSubmit={submit} className="login-form" noValidate>
        {isLogin ? (
          <>
            <div className="logo" aria-hidden="true"><CheckIcon size={34} /></div>
            <div>
              <h1>Tareas IA</h1>
              <p className="muted login-sub">Escribe lo que tienes pendiente y el asistente lo ordena.</p>
            </div>
          </>
        ) : (
          <h1>Crear cuenta</h1>
        )}

        {error && <p className="form-alert" role="alert">{error}</p>}

        {!isLogin && (
          <div>
            <label className="label" htmlFor={`${uid}-fullName`}>Nombre</label>
            <input {...field('fullName', setFullName)} value={fullName} autoComplete="name" maxLength={80} />
            {fieldError('fullName')}
          </div>
        )}
        <div>
          <label className="label" htmlFor={`${uid}-email`}>Email</label>
          <input {...field('email', setEmail)} type="email" value={email} autoComplete="email" inputMode="email" />
          {fieldError('email')}
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-password`}>Contraseña</label>
          <input
            {...field('password', setPassword)}
            type="password"
            value={password}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {fieldError('password')}
        </div>

        <button className="btn block lg" disabled={busy}>
          {busy ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
        </button>

        <p className="login-switch">
          <button type="button" className="link-btn" onClick={switchMode}>
            {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </p>
      </form>
    </main>
  );
}

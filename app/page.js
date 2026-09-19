'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setMensaje('Procesando...');

    if (isLogin) {
      // Flujo de Inicio de Sesión
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) return setMensaje('Correo o contraseña incorrectos.');
      
      // Verificar rol en la tabla perfiles
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('rol, estado')
        .eq('id', data.user.id)
        .single();
      
      if (perfilError && perfilError.code !== 'PGRST116') {
        return setMensaje(`Error al comprobar tu usuario: ${perfilError.message}`);
      }

      if (perfil?.estado !== 'aprobado') {
        await supabase.auth.signOut();
        return setMensaje('Tu cuenta aún no ha sido aprobada o está pausada por el encargado.');
      }
      
      setMensaje('¡Listo! Entrando al sistema...');
      setTimeout(() => {
        router.push(perfil.rol === 'gerente' ? '/dashboard' : '/operador');
      }, 800);

    } else {
      // Flujo de Registro (Solo Operadores)
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) return setMensaje(`No se pudo crear la cuenta: ${error.message}`);
      
      // Insertar en tabla perfiles con estado 'pendiente' por defecto
      const { error: dbError } = await supabase.from('perfiles').insert([
        { id: data.user.id, nombre_completo: nombre, rol: 'operador', estado: 'pendiente' }
      ]);
      
      if (dbError) return setMensaje(`Error al guardar datos: ${dbError.message}`);
      setMensaje('¡Listo! Tu solicitud fue enviada. Espera a que el encargado te dé acceso.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">
            Cross<span className="text-blue-600">-Station</span>
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {isLogin ? 'Inicia sesión para empezar a trabajar' : 'Pide tu cuenta de operador'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Nombre y Apellido</label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-700">Correo Electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Contraseña</label>
            <div className="relative mt-1" style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 pr-11 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                style={{ paddingRight: '42px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-700 cursor-pointer"
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b'
                }}
                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '20px', height: '20px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '20px', height: '20px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isLogin ? 'Entrar' : 'Enviar solicitud'}
          </button>
        </form>

        {mensaje && (
          <div className="mt-4 p-3 bg-slate-100 text-slate-700 text-sm rounded-lg text-center">
            {mensaje}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-slate-600">
          {isLogin ? '¿Eres nuevo aquí? ' : '¿Ya tienes cuenta? '}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 font-bold hover:underline"
          >
            {isLogin ? 'Pide tu cuenta aquí' : 'Inicia sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}

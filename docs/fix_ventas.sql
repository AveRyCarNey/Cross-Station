-- Permitir que un usuario autenticado inserte su propio perfil
CREATE POLICY "Permitir insercion de perfil propio" ON perfiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);
import { Elysia, t } from 'elysia';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';
import * as schema from './schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_super_seguro';
const MAX_REFRESH_TIME = 3 * 60; // 3 minutos en segundos

const authModule = new Elysia({ prefix: '/auth' })
  // Login
  .post('/login-ticket', async ({ body, set }) => {
    const { username, password } = body;
  
    // Obtener usuario por nombre de usuario
    const [user] = await db
    .select()
    .from(schema.usuario)
    .where(eq(schema.usuario.username, username))
    .limit(1);
    // Verificar si el usuario existe y la contraseña es correcta
    if (!user ||user.username!==username|| !(await bcrypt.compare(password, user.password))) {
      set.status = 401;
      return { error: 'Credenciales inválidas' };
    }
    // Generar y devolver el token si no se especifica categoriaServicio
    const token = jwt.sign({ userId: user.id, rolId: user.rolId }, JWT_SECRET, {
      expiresIn: '30d',
    });
    return { token};
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .post('/login', async ({ body, set }) => {
    const { username, password } = body;

    // Obtener usuario por nombre de usuario
    const [user] = await db
      .select()
      .from(schema.usuario)
      .where(eq(schema.usuario.username, username))
      .limit(1);

    // Verificar si el usuario existe y la contraseña es correcta
    if (!user || user.username !== username || !(await bcrypt.compare(password, user.password))) {
      set.status = 401;
      return { error: 'Credenciales inválidas' };
    }

    // Obtener el rol y los permisos del usuario
    const [rol] = await db
      .select()
      .from(schema.rol)
      .where(eq(schema.rol.id, user.rolId))
      .limit(1);

    if (!rol) {
      set.status = 401;
      return { error: 'Rol de usuario no encontrado' };
    }

    // Asumimos que 'permisos' es un array de strings
    const permisos = Array.isArray(rol.permisos) ? rol.permisos : JSON.parse(rol.permisos as string);

    // Generar token incluyendo los permisos
    const token = jwt.sign(
      { 
        userId: user.id, 
        rolId: user.rolId, 
        permisos: permisos 
      }, 
      JWT_SECRET, 
      { expiresIn: '30m' }
    );
    const [empleado] = await db
      .select()
      .from(schema.empleado)
      .where(eq(schema.empleado.id, user.empleadoId))
      .limit(1);
    if(!empleado){
      set.status = 401;
      return { error: 'Credenciales inválidas' };
    }
    return { token, rol: rol.nombre,empleado,usuario:{id:user.id,empleadoId:user.empleadoId,username:user.username,rolId:user.rolId}, permisos: permisos };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .post('/refresh', async ({ headers, set }) => {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401;
      return { error: 'Token no proporcionado' };
    }

    const token = authHeader.split(' ')[1];

    try {
      // Attempt to decode the token without verification
      const decoded = jwt.decode(token) as { exp: number; userId: string; rolId: string; permisos: string[] } | null;

      if (!decoded || !decoded.exp) {
        set.status = 401;
        return { error: 'Token inválido' };
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const tokenExpiration = decoded.exp;
      const timeUntilExpiration = tokenExpiration - currentTime;

      // Check if the token is within the valid refresh window
      if (timeUntilExpiration > -MAX_REFRESH_TIME && timeUntilExpiration <= 60) {
        // Verify if the user still exists in the database
        const [user] = await db
          .select()
          .from(schema.usuario)
          .where(eq(schema.usuario.id, decoded.userId))
          .limit(1);

        if (!user) {
          set.status = 401;
          return { error: 'Usuario no encontrado' };
        }

        // Generate a new token with a 5-minute expiration
        const newToken = jwt.sign(
          { userId: decoded.userId, rolId: decoded.rolId, permisos: decoded.permisos },
          JWT_SECRET,
          { expiresIn: '30m' }
        );

        return { newToken };
      } else if (timeUntilExpiration > 60) {
        // Token is still valid
        return { message: 'Token aún válido', token };
      } else {
        // Token has expired and is outside the refresh window
        set.status = 401;
        return { error: 'Token expirado y fuera de la ventana de actualización' };
      }
    } catch (error) {
      set.status = 401;
      return { error: 'Error al procesar el token' };
    }
  })
  // CRUD Empleados
  .group('/empleados', app => app
    // Crear empleado
    .post('/', async ({ body, set }) => {
      const empleadoId = uuidv4();
      try {
        await db.insert(schema.empleado).values({
          id: empleadoId,
          ...body
        });

        set.status = 201;
        return { message: 'Empleado creado con éxito', empleadoId };
      } catch (error) {
        set.status = 400;
        return { error: 'Error al crear empleado' };
      }
    }, {
      body: t.Object({
        usuarioId: t.String(),
        nombres: t.String(),
        apellidos: t.String(),
        tipoAtencion: t.Union([t.Literal('Ejecutivo'), t.Literal('Caja')])
      })
    })

    // Obtener todos los empleados
    .get('/', async () => {
      return await db.select().from(schema.empleado);
    })

    // Obtener un empleado por ID
    .get('/:id', async ({ params, set }) => {
      const [empleado] = await db.select().from(schema.empleado).where(eq(schema.empleado.id, params.id)).limit(1);
      if (!empleado) {
        set.status = 404;
        return { error: 'Empleado no encontrado' };
      }
      return empleado;
    })

    // Actualizar empleado
    .put('/:id', async ({ params, body, set }) => {
      try {
        await db.update(schema.empleado)
          .set(body)
          .where(eq(schema.empleado.id, params.id));

        const [updatedEmpleado] = await db.select().from(schema.empleado).where(eq(schema.empleado.id, params.id)).limit(1);

        if (!updatedEmpleado) {
          set.status = 404;
          return { error: 'Empleado no encontrado' };
        }

        return { message: 'Empleado actualizado con éxito', empleado: updatedEmpleado };
      } catch (error) {
        set.status = 400;
        return { error: 'Error al actualizar empleado' };
      }
    }, {
      body: t.Object({
        nombres: t.Optional(t.String()),
        apellidos: t.Optional(t.String()),
        tipoAtencion: t.Optional(t.Union([t.Literal('Ejecutivo'), t.Literal('Caja')]))
      })
    })

    // Eliminar empleado
    .delete('/:id', async ({ params, set }) => {
      const [empleado] = await db.select().from(schema.empleado).where(eq(schema.empleado.id, params.id)).limit(1);
      
      if (!empleado) {
        set.status = 404;
        return { error: 'Empleado no encontrado' };
      }

      await db.delete(schema.empleado).where(eq(schema.empleado.id, params.id));

      return { message: 'Empleado eliminado con éxito' };
    })
  );

export default authModule;
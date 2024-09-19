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
    const { username, password, categoriaServicio } = body;
  
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
  
    // Obtener empleado asociado al usuario
    const [empleado] = await db
      .select()
      .from(schema.empleado)
      .where(eq(schema.empleado.id, user.empleadoId))
      .limit(1);
    if(!empleado){
      set.status = 401;
      return { error: 'Credenciales inválidas' };
    }
    // Si se proporciona categoriaServicio, verificar que el empleado tenga ese servicio asignado
    if (categoriaServicio) {
      const [categoria]=await db.select()
        .from(schema.categoriaServicio)
        .where(eq(schema.categoriaServicio.nombre,categoriaServicio))
        .limit(1);
      const [puntoAtencion] = await db
        .select()
        .from(schema.puntoAtencion)
        .where(and(eq(schema.puntoAtencion.empleadoId, empleado.id),eq(schema.puntoAtencion.categoriaId,categoria.id)))
        .limit(1);

      if (!puntoAtencion) {
        set.status = 401;
        return { error: 'Credenciales inválidas para la categoría de servicio especificada' };
      }
  
      // Generar y devolver el token junto con la información adicional de servicio
      const token = jwt.sign({ userId: user.id, rolId: user.rolId, categoriaServicio }, JWT_SECRET, {
        expiresIn: '5m', // Expiración en 1 minuto
      });
      
      return { token, empleado, puntoAtencion };
    }
    const [rol]=await db
          .select()
          .from(schema.rol)
          .where(eq(schema.rol.id,user.rolId))
          .limit(1);
    if(JSON.parse(rol.permisos as string)===undefined){
      set.status = 401;
      return { error: 'Credenciales inválidas para la categoría de servicio especificada' };
    }
    // Generar y devolver el token si no se especifica categoriaServicio
    const token = jwt.sign({ userId: user.id, rolId: user.rolId }, JWT_SECRET, {
      expiresIn: '5m',
    });
    return { token, empleado, permisos:rol.permisos };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
      categoriaServicio: t.Optional(t.Union([t.Literal('Caja'), t.Literal('Ejecutivo')])),
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
      // Intentar verificar el token
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET) as { exp: number; userId: string; rolId: string; categoriaServicio?: string };
      } catch (error) {
        // Si el token ha expirado, intentamos decodificarlo sin verificar
        if (error instanceof jwt.TokenExpiredError) {
          decoded = jwt.decode(token) as { exp: number; userId: string; rolId: string; categoriaServicio?: string };
        } else {
          throw error;
        }
      }
  
      if (!decoded || !decoded.exp) {
        set.status = 401;
        return { error: 'Token inválido' };
      }
  
      const currentTime = Math.floor(Date.now() / 1000);
      const tokenExpiration = decoded.exp;
      const timeUntilExpiration = tokenExpiration - currentTime;
  
      // Renovar si el token expirará en menos de 1 minuto o ha expirado hace menos de 3 minutos
      if (timeUntilExpiration > 60 && timeUntilExpiration <= MAX_REFRESH_TIME) {
        set.status = 200;
        return { message: 'Token aún válido', token };
      }
  
      // Verificar si el usuario aún existe en la base de datos
      const [user] = await db
        .select()
        .from(schema.usuario)
        .where(eq(schema.usuario.id, decoded.userId))
        .limit(1);
  
      if (!user) {
        set.status = 401;
        return { error: 'Usuario no encontrado' };
      }
  
      // Generar un nuevo token con expiración de 5 minutos
      const newToken = jwt.sign(
        { userId: decoded.userId, rolId: decoded.rolId, categoriaServicio: decoded.categoriaServicio },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
  
      return { newToken };
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
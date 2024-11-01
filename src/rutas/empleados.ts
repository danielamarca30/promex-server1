import Elysia,{t} from 'elysia';
import * as schema from '../schema';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql, desc, not, or,lte,gte } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {db} from '../db';
import { authMiddleware, createAuthGuard } from '../authMiddleware';

const EstadoEmpleado = t.Enum({
    Disponible: 'Disponible',
    Ocupado: 'Ocupado'
  })
export const empleados=new Elysia({prefix:'empleados'})
    .use(authMiddleware)
    .get('/', async ({ set }) => {
        const empleados = await db.select().from(schema.empleado)
        set.status = 200
        return empleados
    })
    .get('/:id', async ({ params, set }) => {
        const empleado = await db.select().from(schema.empleado).where(eq(schema.empleado.id, params.id)).limit(1)
        if (empleado.length === 0) {
            set.status = 404
            return { error: 'Empleado not found' }
        }
        set.status = 200
        return empleado[0]
        }, {
        params: t.Object({
            id: t.String()
        })
    })
  .post('/', async ({ body, set }) => {
    const id = uuidv4()
    await db.insert(schema.empleado).values({
      id,
      nombres: body.nombres,
      apellidos: body.apellidos,
      estado: body.estado
    })
    set.status = 201
    return { id, ...body }
  }, {
    body: t.Object({
      nombres: t.String(),
      apellidos: t.String(),
      estado: EstadoEmpleado
    })
  })
  
  .put('/:id', async ({ params, body, set }) => {
    await db.update(schema.empleado)
      .set({
        nombres: body.nombres,
        apellidos: body.apellidos,
        estado: body.estado
      })
      .where(eq(schema.empleado.id, params.id))
    set.status = 200
    return { id: params.id, ...body }
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      nombres: t.String(),
      apellidos: t.String(),
      estado: EstadoEmpleado
    })
  })
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      await db.transaction(async (trx) => {
        // Verificar si el empleado existe
        const [employee] = await trx.select()
          .from(schema.empleado)
          .where(eq(schema.empleado.id, id))
          .limit(1);

        if (!employee) {
          set.status = 404;
          return { error: 'Empleado no encontrado' };
        }

        // Eliminar registros relacionados en la tabla 'atencion'
        await trx.delete(schema.atencion)
          .where(eq(schema.atencion.empleadoId, id));

        // Eliminar registros relacionados en la tabla 'ficha'
        await trx.delete(schema.ficha)
          .where(eq(schema.ficha.empleadoId, id));

        // Eliminar registros relacionados en la tabla 'punto_atencion'
        await trx.update(schema.puntoAtencion)
          .set({ empleadoId: null })
          .where(eq(schema.puntoAtencion.empleadoId, id));

        // Eliminar usuarios asociados
        await trx.delete(schema.usuario)
          .where(eq(schema.usuario.empleadoId, id));

        // Finalmente, eliminar el empleado
        await trx.delete(schema.empleado)
          .where(eq(schema.empleado.id, id));

        // Verificar la eliminación
        const [remainingEmployee] = await trx.select({ count: sql<number>`count(*)` })
          .from(schema.empleado)
          .where(eq(schema.empleado.id, id));

        if (remainingEmployee.count > 0) {
          throw new Error('No se pudo eliminar el empleado completamente');
        }
      });

      set.status = 200;
      return { message: 'Empleado y todos los registros relacionados eliminados exitosamente' };
    } catch (error) {
      console.error('Error al eliminar el empleado:', error);
      set.status = 500;
      return { error: "Error al eliminar el empleado y los registros relacionados", details: error instanceof Error ? error.message : String(error) };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });

  export const empleadosUsuarios=new Elysia({prefix:'empleados-con-usuarios'})
  .use(authMiddleware)
  .get('/', async ({ set }) => {
    const empleadosConUsuarios = await db.select({
      id: schema.empleado.id,
      nombres: schema.empleado.nombres,
      apellidos: schema.empleado.apellidos,
      estado: schema.empleado.estado,
      usuarios: sql`GROUP_CONCAT(DISTINCT CONCAT('{', 
        '"id":"', ${schema.usuario.id}, '",',
        '"username":"', ${schema.usuario.username}, '",',
        '"email":"', ${schema.usuario.email}, '",',
        '"empleadoId":"', ${schema.usuario.empleadoId}, '",',
        '"rolId":"', ${schema.usuario.rolId}, '",',
        '"activo":', IF(${schema.usuario.activo}, 'true', 'false'), 
      '}') SEPARATOR ',')`
    })
    .from(schema.empleado)
    .leftJoin(schema.usuario, eq(schema.empleado.id, schema.usuario.empleadoId))
    .groupBy(schema.empleado.id);
    
    // Parse the GROUP_CONCAT result into a proper JSON array
    const result = empleadosConUsuarios.map(emp => ({
      ...emp,
      usuarios: emp.usuarios ? JSON.parse(`[${emp.usuarios}]`) : []
    }));
  
    set.status = 200;
    return result;
  })
  
  .get('/:id', async ({ params, set }) => {
    const empleadoConUsuarios = await db.select({
      id: schema.empleado.id,
      nombres: schema.empleado.nombres,
      apellidos: schema.empleado.apellidos,
      estado: schema.empleado.estado,
      usuarios: sql`GROUP_CONCAT(DISTINCT CONCAT('{', 
        '"id":"', ${schema.usuario.id}, '",',
        '"username":"', ${schema.usuario.username}, '",',
        '"email":"', ${schema.usuario.email}, '",',
        '"empleadoId":"', ${schema.usuario.empleadoId}, '",',
        '"rolId":"', ${schema.usuario.rolId}, '",',
        '"activo":', IF(${schema.usuario.activo}, 'true', 'false'), 
      '}') SEPARATOR ',')`
    })
    .from(schema.empleado)
    .leftJoin(schema.usuario, eq(schema.empleado.id, schema.usuario.empleadoId))
    .where(eq(schema.empleado.id, params.id))
    .groupBy(schema.empleado.id)
    .limit(1);
  
    if (empleadoConUsuarios.length === 0) {
      set.status = 404;
      return { error: 'Empleado not found' };
    }
  
    // Parse the GROUP_CONCAT result into a proper JSON array
    const result = {
      ...empleadoConUsuarios[0],
      usuarios: empleadoConUsuarios[0].usuarios ? JSON.parse(`[${empleadoConUsuarios[0].usuarios}]`) : []
    };
  
    set.status = 200;
    return result;
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // CRUD for Usuarios
export const usuarios=new Elysia({prefix:'usuarios'})
  .use(authMiddleware)
  .get('/', async ({ set }) => {
    const usuarios = await db.select().from(schema.usuario);
    set.status = 200;
    return usuarios;
  })
  .get('/:id', async ({ params, set }) => {
    const usuario = await db.select().from(schema.usuario).where(eq(schema.usuario.id, params.id)).limit(1);
    if (usuario.length === 0) {
      set.status = 404;
      return { error: 'Usuario not found' };
    }
    set.status = 200;
    return usuario[0];
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  .post('/', async ({ body, set }) => {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(body.password, 10);
    await db.insert(schema.usuario).values({
      id,
      username: body.username,
      password: hashedPassword,
      email: body.email,
      rolId: body.rolId,
      empleadoId: body.empleadoId,
      activo: body.activo
    });
    set.status = 201;
    return { id, ...body, password: undefined };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
      email: t.String(),
      rolId: t.String(),
      empleadoId: t.String(),
      activo: t.Boolean()
    })
  })
  .put('/:id', async ({ params, body, set }) => {
    
    const updateData: any = {
      username: body.username,
      email: body.email,
      rolId: body.rolId,
      empleadoId: body.empleadoId,
      activo: body.activo
    };
    if (body.password) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }
    await db.update(schema.usuario)
      .set(updateData)
      .where(eq(schema.usuario.id, params.id));
    set.status = 200;
    return { id: params.id, ...body, password: undefined };
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      username: t.String(),
      password: t.Optional(t.String()),
      email: t.String(),
      rolId: t.String(),
      empleadoId: t.String(),
      activo: t.Boolean()
    })
  })
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      await db.transaction(async (trx) => {
        // Check if user exists
        const [user] = await trx.select()
          .from(schema.usuario)
          .where(eq(schema.usuario.id, id))
          .limit(1);

        if (!user) {
          set.status = 404;
          return { error: 'Usuario no encontrado' };
        }

        // Delete user
        await trx.delete(schema.usuario)
          .where(eq(schema.usuario.id, id));

        // Verify deletion
        const [remainingUser] = await trx.select({ count: sql<number>`count(*)` })
          .from(schema.usuario)
          .where(eq(schema.usuario.id, id));

        if (remainingUser.count > 0) {
          throw new Error('No se pudo eliminar el usuario completamente');
        }
      });

      set.status = 200;
      return { message: 'Usuario eliminado exitosamente' };
    } catch (error) {
      console.error('Error al eliminar el usuario:', error);
      set.status = 500;
      return { error: "Error al eliminar el usuario", details: error instanceof Error ? error.message : String(error) };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });

  
  // CRUD for Roles
export const roles=new Elysia({prefix:'roles'})
  .use(authMiddleware)
  .get('/', async ({ set }) => {
    const roles = await db.select().from(schema.rol);
    set.status = 200;
    return roles;
  })
  
  .get('/:id', async ({ params, set }) => {
    const rol = await db.select().from(schema.rol).where(eq(schema.rol.id, params.id)).limit(1);
    if (rol.length === 0) {
      set.status = 404;
      return { error: 'Rol not found' };
    }
    set.status = 200;
    return rol[0];
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  .post('/', async ({ body, set }) => {
    const id = uuidv4();
    await db.insert(schema.rol).values({
      id,
      nombre: body.nombre,
      descripcion: body.descripcion,
      permisos: body.permisos
    });
    set.status = 201;
    return { id, ...body };
  }, {
    body: t.Object({
      nombre: t.String(),
      descripcion: t.Optional(t.String()),
      permisos: t.Array(t.String())
    })
  })
  
  .put('/:id', async ({ params, body, set }) => {
    await db.update(schema.rol)
      .set({
        nombre: body.nombre,
        descripcion: body.descripcion,
        permisos: body.permisos
      })
      .where(eq(schema.rol.id, params.id));
    set.status = 200;
    return { id: params.id, ...body };
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      nombre: t.String(),
      descripcion: t.Optional(t.String()),
      permisos: t.Array(t.String())
    })
  })
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      await db.transaction(async (trx) => {
        // Check if role exists
        const [role] = await trx.select()
          .from(schema.rol)
          .where(eq(schema.rol.id, id))
          .limit(1);

        if (!role) {
          set.status = 404;
          return { error: 'Rol no encontrado' };
        }

        // Check if there are users with this role
        const [userCount] = await trx.select({ count: sql<number>`count(*)` })
          .from(schema.usuario)
          .where(eq(schema.usuario.rolId, id));

        if (userCount.count > 0) {
          set.status = 400;
          return { error: 'No se puede eliminar el rol porque hay usuarios asociados a él' };
        }

        // Delete role
        await trx.delete(schema.rol)
          .where(eq(schema.rol.id, id));

        // Verify deletion
        const [remainingRole] = await trx.select({ count: sql<number>`count(*)` })
          .from(schema.rol)
          .where(eq(schema.rol.id, id));

        if (remainingRole.count > 0) {
          throw new Error('No se pudo eliminar el rol completamente');
        }
      });

      set.status = 200;
      return { message: 'Rol eliminado exitosamente' };
    } catch (error) {
      console.error('Error al eliminar el rol:', error);
      set.status = 500;
      return { error: "Error al eliminar el rol", details: error instanceof Error ? error.message : String(error) };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
});
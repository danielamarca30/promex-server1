import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { staticPlugin } from '@elysiajs/static';
import bcrypt from 'bcryptjs';
import { db } from './db';
import * as schema from './schema';
import { eq, and, sql, desc, not, or,lte,gte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile, stat } from 'fs/promises';
import authModule from './authModule';
import authMiddleware from './authMiddleware';
import {printTicket} from './printer';
import path from 'path';
import 'dotenv/config';


//vidoes y comunicaods:

const UPLOAD_DIR = './uploads';
const PUBLIC_DIR = './public';

async function ensureDirectoryExists(dir: string) {
  if (!existsSync(dir)) {
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error);
    }
  }
}

// Ensure both UPLOAD_DIR and PUBLIC_DIR exist
await ensureDirectoryExists(UPLOAD_DIR);
await ensureDirectoryExists(PUBLIC_DIR);



// Types
type EstadoFicha = 'Pendiente' | 'Llamado' | 'En_Atencion' | 'Atendido' | 'Cancelado' | 'No_Presentado';
type EstadoEmpleado = 'Disponible' | 'Ocupado';
const EstadoEmpleado = t.Enum({
  Disponible: 'Disponible',
  Ocupado: 'Ocupado'
})
interface SolicitudServicio {
  servicioId: string;
}

interface AtenderFicha {
  fichaId: string;
  empleadoId: string;
  puntoAtencionId: string;
}

interface FinalizarAtencion {
  fichaId: string;
  resultado: string;
}

async function generateDailyCode(categoriaNombre: string): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Consultar la última ficha del día para la categoría dada
  const lastFicha = await db.select({ codigo: schema.ficha.codigo })
    .from(schema.ficha)
    .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
    .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
    .where(
      and(
        eq(schema.categoriaServicio.nombre, categoriaNombre),
        sql`DATE(${schema.ficha.createdAt}) = CURDATE()`
      )
    )
    .orderBy(desc(schema.ficha.codigo))
    .limit(1);

  let newNumber = 1;  // Inicializar el número con 1 por defecto
  // Si hay una ficha anterior en el día actual
  if (lastFicha.length > 0) {
    const lastCode = lastFicha[0].codigo;  // Obtener el código de la última ficha
    const parts = lastCode.split('-');  // Dividir el código en partes

    // Comprobar que el código tiene el formato esperado
    if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
      const lastNumber = parseInt(parts[1]);  // Convertir la segunda parte en un número
      newNumber = lastNumber + 1;  // Incrementar el número
    } else {
      throw new Error(`El código no tiene el formato esperado o no es un número válido: ${lastCode}`);
    }
  }

  // Retornar el código generado en el formato correcto
  return `${categoriaNombre.charAt(0)}-${newNumber.toString().padStart(3, '0')}`;
}

async function updateMetrics(servicioId: string, puntoAtencionId: string) {
  const [currentMetrics] = await db.select()
    .from(schema.metricaTiempoReal)
    .where(
      and(
        eq(schema.metricaTiempoReal.servicioId, servicioId),
        eq(schema.metricaTiempoReal.puntoAtencionId, puntoAtencionId)
      )
    )
    .limit(1);

  const [atenciones] = await db.select({
    tiempoEsperaPromedio: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${schema.ficha.createdAt}, ${schema.atencion.inicioAtencion}))`,
    tiempoAtencionPromedio: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${schema.atencion.inicioAtencion}, ${schema.atencion.finAtencion}))`,
    cantidadAtendidos: sql<number>`COUNT(*)`,
  })
  .from(schema.atencion)
  .innerJoin(schema.ficha, eq(schema.atencion.fichaId, schema.ficha.id))
  .where(
    and(
      eq(schema.ficha.servicioId, servicioId),
      eq(schema.ficha.puntoAtencionId, puntoAtencionId),
      sql`DATE(${schema.atencion.inicioAtencion}) = CURDATE()`
    )
  );

  const [fichasPendientes] = await db.select({
    cantidadEnEspera: sql<number>`COUNT(*)`
  })
  .from(schema.ficha)
  .where(
    and(
      eq(schema.ficha.servicioId, servicioId),
      eq(schema.ficha.puntoAtencionId, puntoAtencionId),
      eq(schema.ficha.estado, 'Pendiente')
    )
  );

  const newMetrics = {
    id: currentMetrics?.id || uuidv4(),
    servicioId,
    puntoAtencionId,
    tiempoEsperaPromedio: Math.round(atenciones?.tiempoEsperaPromedio || 0),
    tiempoAtencionPromedio: Math.round(atenciones?.tiempoAtencionPromedio || 0),
    cantidadEnEspera: fichasPendientes?.cantidadEnEspera || 0,
    cantidadAtendidos: atenciones?.cantidadAtendidos || 0,
    version: (currentMetrics?.version || 0) + 1,
  };

  await db.insert(schema.metricaTiempoReal)
    .values(newMetrics)
    .onDuplicateKeyUpdate({ set: newMetrics });

  return newMetrics;
}

const app = new Elysia()
  // .use(cors({
  //   origin: ['http://localhost:5173','http://localhost:5174','http://localhost:5175', 'http://localhost:1420', 'http://localhost:1421'],
  //   credentials: true,
  // }))
  .use(cors({
    origin: '*', // Permite todas las origenes
    credentials: true,
  }))
  .use(swagger())
  .use(authModule)

  .ws('/ws', {
    message: (ws, message) => {
      
    },
    open: (ws) => {
      
    },
    close: (ws) => {
      
    },
  })
  .derive(() => {
    return {
      notifyWebSocket: (event: string, data: any) => {
        app.server?.publish(event, data);
      }
    };
  })
  .get('/ping', async ({ set }) => {
    set.status = 200;
    return null;
  })
  .group('/api', app => {
    return app
    .use(authMiddleware)
// CRUD for Categories
.get('/categorias', async ({ set }) => {
  const categories = await db.select().from(schema.categoriaServicio);
  set.status = 200;
  return categories;
})
.post('/categorias', async ({ body, set }) => {
  const id = uuidv4();
  await db.insert(schema.categoriaServicio).values({
    id,
    nombre: body.nombre,
    descripcion: body.descripcion
  });
  set.status = 201;
  return { id, ...body };
}, {
  body: t.Object({
    nombre: t.String(),
    descripcion: t.Optional(t.String())
  })
})
.put('/categorias/:id', async ({ params, body, set }) => {
  await db.update(schema.categoriaServicio)
    .set({ nombre: body.nombre, descripcion: body.descripcion })
    .where(eq(schema.categoriaServicio.id, params.id));
  set.status = 200;
  return { id: params.id, ...body };
}, {
  params: t.Object({
    id: t.String()
  }),
  body: t.Object({
    nombre: t.String(),
    descripcion: t.Optional(t.String())
  })
})
.delete('/categorias/:id', async ({ params, set }) => {
  
  await db.delete(schema.categoriaServicio).where(eq(schema.categoriaServicio.id, params.id));
  set.status = 204;
}, {
  params: t.Object({
    id: t.String()
  })
})

// CRUD for Subcategories
.get('/subcategorias', async ({ set }) => {
  const subcategories = await db.select().from(schema.subCategoriaServicio);
  set.status = 200;
  return subcategories;
})
.get('/subcategorias/:categoriaId', async ({ params, set }) => {
  const subcategories = await db.select()
    .from(schema.subCategoriaServicio)
    .where(eq(schema.subCategoriaServicio.categoriaId, params.categoriaId));
  set.status = 200;
  return subcategories;
}, {
  params: t.Object({
    categoriaId: t.String()
  })
})
.post('/subcategorias', async ({ body, set }) => {
  const id = uuidv4();
  await db.insert(schema.subCategoriaServicio).values({
    id,
    nombre: body.nombre,
    descripcion: body.descripcion,
    categoriaId: body.categoriaId
  });
  set.status = 201;
  return { id, ...body };
}, {
  body: t.Object({
    nombre: t.String(),
    descripcion: t.Optional(t.String()),
    categoriaId: t.String()
  })
})
.put('/subcategorias/:id', async ({ params, body, set }) => {
  await db.update(schema.subCategoriaServicio)
    .set({ nombre: body.nombre, descripcion: body.descripcion, categoriaId: body.categoriaId })
    .where(eq(schema.subCategoriaServicio.id, params.id));
  set.status = 200;
  return { id: params.id, ...body };
}, {
  params: t.Object({
    id: t.String()
  }),
  body: t.Object({
    nombre: t.String(),
    descripcion: t.Optional(t.String()),
    categoriaId: t.String()
  })
})
.delete('/subcategorias/:id', async ({ params, set }) => {
  await db.delete(schema.subCategoriaServicio).where(eq(schema.subCategoriaServicio.id, params.id));
  set.status = 204;
}, {
  params: t.Object({
    id: t.String()
  })
})

    // // Get all categories
    // .get('/categorias', async ({ set }) => {
    //   const listCategories = await db.select()
    //     .from(schema.categoriaServicio)
    //   set.status = 200;
    //   return listCategories;
    // })
    
    // // Get subcategories for a specific category
    // .get('/subcategorias/:categoriaId', async ({ params, set }) => {
    //   const { categoriaId } = params;
    //   const listSubcategories = await db.select()
    //     .from(schema.subCategoriaServicio)
    //     .where(eq(schema.subCategoriaServicio.categoriaId, categoriaId));
    //   set.status = 200;
    //   return listSubcategories;
    // })


        // Get services for a specific category and subcategory

// CRUD for Services
.get('/servicios/categoria/:categoriaId/:subCategoriaId?', async ({ params, set }) => {
  const { categoriaId, subCategoriaId } = params;
  let listServices;
  if (subCategoriaId) {
    listServices = db.select()
    .from(schema.servicio)
    .where(and(eq(schema.servicio.categoriaId, categoriaId),eq(schema.servicio.subCategoriaId, subCategoriaId)));
  }else{
    listServices=db.select()
    .from(schema.servicio)
    .where(eq(schema.servicio.categoriaId, categoriaId));
  }
  set.status = 200;
  return listServices;
})
// CRUD for Services
.get('/servicios', async ({ set }) => {
  const servicios = await db.select().from(schema.servicio);
  set.status = 200;
  return servicios;
})

.get('/servicios/:id', async ({ params, set }) => {
  const servicio = await db.select().from(schema.servicio).where(eq(schema.servicio.id, params.id)).limit(1);
  if (servicio.length === 0) {
    set.status = 404;
    return { error: 'Servicio not found' };
  }
  set.status = 200;
  return servicio[0];
}, {
  params: t.Object({
    id: t.String()
  })
})

.post('/servicios', async ({ body, set }) => {
  const id = uuidv4();
  await db.insert(schema.servicio).values({
    id,
    nombre: body.nombre,
    descripcion: body.descripcion,
    categoriaId: body.categoriaId,
    subCategoriaId: body.subCategoriaId,
    tiempoEstimado: body.tiempoEstimado,
    activo: body.activo
  });
  set.status = 201;
  return { id, ...body };
}, {
  body: t.Object({
    nombre: t.String(),
    descripcion: t.Optional(t.String()),
    categoriaId: t.String(),
    subCategoriaId: t.Optional(t.String()),
    tiempoEstimado: t.Number(),
    activo: t.Boolean()
  })
})

.put('/servicios/:id', async ({ params, body, set }) => {
  await db.update(schema.servicio)
    .set({
      nombre: body.nombre,
      descripcion: body.descripcion,
      categoriaId: body.categoriaId,
      subCategoriaId: body.subCategoriaId,
      tiempoEstimado: body.tiempoEstimado,
      activo: body.activo
    })
    .where(eq(schema.servicio.id, params.id));
  set.status = 200;
  return { id: params.id, ...body };
}, {
  params: t.Object({
    id: t.String()
  }),
  body: t.Object({
    nombre: t.String(),
    descripcion: t.Optional(t.String()),
    categoriaId: t.String(),
    subCategoriaId: t.Optional(t.String()),
    tiempoEstimado: t.Number(),
    activo: t.Boolean()
  })
})

.delete('/servicios/:id', async ({ params, set }) => {
  await db.delete(schema.servicio).where(eq(schema.servicio.id, params.id));
  set.status = 204;
}, {
  params: t.Object({
    id: t.String()
  })
})

// CRUD for Puntos de Atención
.get('/puntos-atencion', async ({ set }) => {
  const puntosAtencion = await db.select().from(schema.puntoAtencion);
  set.status = 200;
  return puntosAtencion;
})

.get('/puntos-atencion/:id', async ({ params, set }) => {
  const puntoAtencion = await db.select().from(schema.puntoAtencion).where(eq(schema.puntoAtencion.id, params.id)).limit(1);
  if (puntoAtencion.length === 0) {
    set.status = 404;
    return { error: 'Punto de atención not found' };
  }
  set.status = 200;
  return puntoAtencion[0];
}, {
  params: t.Object({
    id: t.String()
  })
})

.post('/puntos-atencion', async ({ body, set }) => {
  const id = uuidv4();
  await db.insert(schema.puntoAtencion).values({
    id,
    nombre: body.nombre,
    categoriaId: body.categoriaId,
    empleadoId: body.empleadoId,
    activo: body.activo
  });
  set.status = 201;
  return { id, ...body };
}, {
  body: t.Object({
    nombre: t.String(),
    categoriaId: t.String(),
    empleadoId: t.Optional(t.String()),
    activo: t.Boolean()
  })
})

.put('/puntos-atencion/:id', async ({ params, body, set }) => {
  await db.update(schema.puntoAtencion)
    .set({
      nombre: body.nombre,
      categoriaId: body.categoriaId,
      empleadoId: body.empleadoId,
      activo: body.activo
    })
    .where(eq(schema.puntoAtencion.id, params.id));
  set.status = 200;
  return { id: params.id, ...body };
}, {
  params: t.Object({
    id: t.String()
  }),
  body: t.Object({
    nombre: t.String(),
    categoriaId: t.String(),
    empleadoId: t.Optional(t.String()),
    activo: t.Boolean()
  })
})

.delete('/puntos-atencion/:id', async ({ params, set }) => {
  await db.delete(schema.puntoAtencion).where(eq(schema.puntoAtencion.id, params.id));
  set.status = 204;
}, {
  params: t.Object({
    id: t.String()
  })
})






.get('/empleados', async ({ set }) => {
  const empleados = await db.select().from(schema.empleado)
  set.status = 200
  return empleados
})

.get('/empleados/:id', async ({ params, set }) => {
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

.post('/empleados', async ({ body, set }) => {
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

.put('/empleados/:id', async ({ params, body, set }) => {
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

.delete('/empleados/:id', async ({ params, set }) => {
  await db.delete(schema.empleado).where(eq(schema.empleado.id, params.id))
  set.status = 204
}, {
  params: t.Object({
    id: t.String()
  })
})
.get('/empleados-con-usuarios', async ({ set }) => {
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

.get('/empleados-con-usuarios/:id', async ({ params, set }) => {
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
.get('/usuarios', async ({ set }) => {
  const usuarios = await db.select().from(schema.usuario);
  set.status = 200;
  return usuarios;
})

.get('/usuarios/:id', async ({ params, set }) => {
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

.post('/usuarios', async ({ body, set }) => {
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

.put('/usuarios/:id', async ({ params, body, set }) => {
  
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

.delete('/usuarios/:id', async ({ params, set }) => {
  await db.delete(schema.usuario).where(eq(schema.usuario.id, params.id));
  set.status = 204;
}, {
  params: t.Object({
    id: t.String()
  })
})

// CRUD for Roles
.get('/roles', async ({ set }) => {
  const roles = await db.select().from(schema.rol);
  set.status = 200;
  return roles;
})

.get('/roles/:id', async ({ params, set }) => {
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

.post('/roles', async ({ body, set }) => {
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

.put('/roles/:id', async ({ params, body, set }) => {
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

.delete('/roles/:id', async ({ params, set }) => {
  await db.delete(schema.rol).where(eq(schema.rol.id, params.id));
  set.status = 204;
}, {
  params: t.Object({
    id: t.String()
  })
})


    // Generate new ticket
    .post('/ficha', async ({ body, set, notifyWebSocket }) => {
      const { servicioId } = body as { servicioId: string };
      
      const [servicio] = await db.select()
        .from(schema.servicio)
        .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
        .where(eq(schema.servicio.id, servicioId))
        .limit(1);

      if (!servicio) {
        set.status = 404;
        return { mensaje: 'Servicio no encontrado' };
      }

      const codigo = await generateDailyCode(servicio.categoria_servicio.nombre);
      const id = uuidv4();

      const nuevaFicha = {
        id,
        codigo,
        estado: 'Pendiente' as EstadoFicha,
        servicioId,
      };

      await db.insert(schema.ficha).values(nuevaFicha);

      notifyWebSocket('nuevaFicha', { id, codigo, categoria: servicio.categoria_servicio.nombre });

      // Print the ticket
      const printerName = 'TM-T20IIIL'; // Ensure this is the correct printer name

      const fecha = new Date();
      const opciones: Intl.DateTimeFormatOptions = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      };
      const fechaFormateada = fecha.toLocaleDateString('es-ES', opciones).replace(/\//g, '/');
      try {
        await printTicket(printerName, {
          ticketNumber: codigo,
          servicePoint: servicio.categoria_servicio.nombre,
          date: fechaFormateada
        });
        
      } catch (error) {
        console.error('Failed to print ticket:', error);
        // Optionally, you might want to notify the client about the printing failure
        // set.status = 500;
        // return { mensaje: 'Ficha creada pero no se pudo imprimir el ticket', id, codigo };
      }

      set.status = 201;
      return { mensaje: 'Ficha creada', id, codigo };
    }, {
      body: t.Object({
        servicioId: t.String(),
      })
    })

// Get pending tickets
.get('/fichas-pendientes/:categoria?', async ({ params, set }) => {
  
  const { categoria } = params;
  
  let fichasPendientes;
  
  if (categoria) {
    fichasPendientes = await db.select({
      id: schema.ficha.id,
      codigo: schema.ficha.codigo,
      estado: schema.ficha.estado,
      createdAt: schema.ficha.createdAt,
      servicio: schema.servicio.nombre,
      categoria: schema.categoriaServicio.nombre
    })
      .from(schema.ficha)
      .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
      .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
      .where(
        and(
          eq(schema.ficha.estado, 'Pendiente'),
          eq(schema.categoriaServicio.nombre, categoria)
        )
      )
      .orderBy(schema.ficha.createdAt)
      .limit(10);
  } else {
    fichasPendientes = await db.select({
      id: schema.ficha.id,
      codigo: schema.ficha.codigo,
      estado: schema.ficha.estado,
      createdAt: schema.ficha.createdAt,
      servicio: schema.servicio.nombre,
      categoria: schema.categoriaServicio.nombre
    })
      .from(schema.ficha)
      .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
      .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
      .where(eq(schema.ficha.estado, 'Pendiente'))
      .orderBy(schema.ficha.createdAt)
      .limit(10);
  }

  

  set.status = 200;
  return fichasPendientes;
})

    // Get next ticket for attention
    .get('/proxima-ficha/:puntoAtencionId', async ({ params, set }) => {
      const { puntoAtencionId } = params;
      const [puntoAtencion] = await db.select()
      .from(schema.puntoAtencion)
      .where(eq(schema.puntoAtencion.id, puntoAtencionId))
      .limit(1);
      
      if (!puntoAtencion) {
        set.status = 404;
        return { mensaje: 'Punto de atención no encontrado' };
      }
      
      const proximaFicha = await db.select()
      .from(schema.ficha)
      .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
      .where(
        and(
          eq(schema.ficha.estado, 'Pendiente'),
          eq(schema.servicio.categoriaId, puntoAtencion.categoriaId)
        )
      )
      .orderBy(schema.ficha.createdAt)
      .limit(1);
      
      if(!proximaFicha[0]){
        set.status = 200;
        return { error: 'Rol not found' };
      }
      if (proximaFicha.length === 0) {
        set.status = 200;
        return null;
      }
      return proximaFicha[0].ficha;
    })

    .get('/fichas-en-atencion', async ({ set }) => {
      const fichasEnAtencion = await db.select({
        id: schema.ficha.id,
        codigo: schema.ficha.codigo,
        estado: schema.ficha.estado,
        puntoAtencion: schema.puntoAtencion.nombre,
        empleado: sql`COALESCE(CONCAT(${schema.empleado.nombres}, ' ', ${schema.empleado.apellidos}), 'No asignado')`,
      })
        .from(schema.ficha)
        .leftJoin(schema.puntoAtencion, eq(schema.ficha.puntoAtencionId, schema.puntoAtencion.id))
        .leftJoin(schema.empleado, eq(schema.ficha.empleadoId, schema.empleado.id))
        .where(eq(schema.ficha.estado, 'En_Atencion'));
    
      set.status = 200;
      return fichasEnAtencion;
    })

    .get('/fichas-recientes', async ({ set }) => {
      const fichasRecientes = await db
        .select({
          id: schema.ficha.id,
          codigo: schema.ficha.codigo,
          estado: schema.ficha.estado,
          tipoAtencion: schema.categoriaServicio.nombre,
          empleadoId: schema.ficha.empleadoId,
          puntoAtencionId: schema.ficha.puntoAtencionId,
          puntoAtencionNombre: schema.puntoAtencion.nombre,
        })
        .from(schema.ficha)
        .leftJoin(schema.puntoAtencion, eq(schema.ficha.puntoAtencionId, schema.puntoAtencion.id))
        .leftJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
        .leftJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
        .where(
          or(
            eq(schema.ficha.estado, 'En_Atencion'),
            eq(schema.ficha.estado, 'Atendido'),
            eq(schema.ficha.estado, 'Llamado')
          )
        )
        .orderBy(desc(schema.ficha.updatedAt))
        .limit(5);
    
      set.status = 200;
      return fichasRecientes;
    })
    .post('/llamar-ficha/:fichaId', async ({ params, body, set, notifyWebSocket }) => {
      const { fichaId } = params;
      const { puntoAtencionId } = body as { puntoAtencionId: string };
    
      // Verificar si el punto de atención existe
      const [puntoAtencion] = await db.select()
        .from(schema.puntoAtencion)
        .where(eq(schema.puntoAtencion.id, puntoAtencionId))
        .limit(1);
    
      if (!puntoAtencion) {
        set.status = 404;
        return { mensaje: 'Punto de atención no encontrado' };
      }
    
      // Verificar si hay una ficha en estado "Llamado" en este punto de atención
      const [fichaLlamadaActual] = await db.select()
        .from(schema.ficha)
        .where(
          and(
            eq(schema.ficha.puntoAtencionId, puntoAtencionId),
            eq(schema.ficha.estado, 'Llamado')
          )
        )
        .limit(1);
    
      // Si hay una ficha llamada, cambiarla a "No se presentó"
      if (fichaLlamadaActual) {
        await db.update(schema.ficha)
          .set({ estado: 'No_Presentado' })
          .where(eq(schema.ficha.id, fichaLlamadaActual.id));
    
        notifyWebSocket('fichaNoSePresentó', { 
          fichaId: fichaLlamadaActual.id, 
          codigo: fichaLlamadaActual.codigo
        });
      }
    
      // Obtener la ficha que se va a llamar
      const [ficha] = await db.select()
        .from(schema.ficha)
        .where(eq(schema.ficha.id, fichaId))
        .limit(1);
    
      if (!ficha) {
        set.status = 404;
        return { mensaje: 'Ficha no encontrada' };
      }
    
      if (ficha.estado !== 'Pendiente') {
        set.status = 400;
        return { mensaje: 'La ficha no está en estado Pendiente' };
      }
    
      // Actualizar la ficha con el nuevo estado y punto de atención
      await db.update(schema.ficha)
        .set({ 
          estado: 'Llamado',
          puntoAtencionId: puntoAtencionId
        })
        .where(eq(schema.ficha.id, fichaId));
    
      // Obtener la ficha actualizada con el nombre del punto de atención
      const [updatedFicha] = await db.select({
        id: schema.ficha.id,
        codigo: schema.ficha.codigo,
        estado: schema.ficha.estado,
        puntoAtencionId: schema.ficha.puntoAtencionId,
        puntoAtencionNombre: schema.puntoAtencion.nombre
      })
      .from(schema.ficha)
      .leftJoin(schema.puntoAtencion, eq(schema.ficha.puntoAtencionId, schema.puntoAtencion.id))
      .where(eq(schema.ficha.id, fichaId))
      .limit(1);
    
      notifyWebSocket('fichaLlamada', { 
        fichaId: updatedFicha.id, 
        codigo: updatedFicha.codigo,
        puntoAtencionId: updatedFicha.puntoAtencionId,
        puntoAtencionNombre: updatedFicha.puntoAtencionNombre
      });
    
      set.status = 200;
      return { 
        mensaje: 'Ficha llamada exitosamente',
        ficha: updatedFicha
      };
    }, {
      body: t.Object({
        puntoAtencionId: t.String()
      })
    })
    .post('/cancelar-ficha/:fichaId', async ({ params, set, notifyWebSocket }) => {
      const { fichaId } = params;
    
      const [ficha] = await db.select()
        .from(schema.ficha)
        .where(eq(schema.ficha.id, fichaId))
        .limit(1);
    
      if (!ficha) {
        set.status = 404;
        return { mensaje: 'Ficha no encontrada' };
      }
    
      if (ficha.estado === 'Atendido' || ficha.estado === 'Cancelado') {
        set.status = 400;
        return { mensaje: 'No se puede cancelar una ficha ya atendida o cancelada' };
      }
    
      await db.update(schema.ficha)
        .set({ estado: 'Cancelado' })
        .where(eq(schema.ficha.id, fichaId));
    
      notifyWebSocket('fichaCancelada', { fichaId, codigo: ficha.codigo });
    
      set.status = 200;
      return { mensaje: 'Ficha cancelada exitosamente' };
    })
    // Start attending a ticket
    .post('/atender-ficha', async ({ body, set, notifyWebSocket }) => {
      const { fichaId, empleadoId, puntoAtencionId } = body as AtenderFicha;

      const [ficha] = await db.select()
        .from(schema.ficha)
        .where(eq(schema.ficha.id, fichaId))
        .limit(1);

      if (!ficha) {
        set.status = 404;
        return { mensaje: 'Ficha no encontrada' };
      }

      const [empleado] = await db.select()
        .from(schema.empleado)
        .where(eq(schema.empleado.id, empleadoId))
        .limit(1);

      if (!empleado) {
        set.status = 404;
        return { mensaje: 'Empleado no encontrado' };
      }

      await db.update(schema.ficha)
        .set({ estado: 'En_Atencion', empleadoId, puntoAtencionId })
        .where(eq(schema.ficha.id, fichaId));

      await db.insert(schema.atencion).values({
        id: uuidv4(),
        fichaId,
        empleadoId,
        inicioAtencion: new Date(),
      });

      await db.update(schema.empleado)
        .set({ estado: 'Ocupado' })
        .where(eq(schema.empleado.id, empleadoId));

      const updatedMetrics = await updateMetrics(ficha.servicioId, puntoAtencionId);
      notifyWebSocket('metricsUpdated', updatedMetrics);

      notifyWebSocket('fichaEnAtencion', { fichaId, empleadoId });

      set.status = 200;
      return { mensaje: 'Atención iniciada' };
    }, {
      body: t.Object({
        fichaId: t.String(),
        empleadoId: t.String(),
        puntoAtencionId: t.String()
      })
    })

    // Finish attending a ticket
    .post('/finalizar-atencion', async ({ body, set, notifyWebSocket }) => {
      const { fichaId, resultado } = body as FinalizarAtencion;

      const [ficha] = await db.select()
        .from(schema.ficha)
        .where(eq(schema.ficha.id, fichaId))
        .limit(1);

      if (!ficha) {
        set.status = 404;
        return { mensaje: 'Ficha no encontrada' };
      }

      const [atencion] = await db.select()
        .from(schema.atencion)
        .where(eq(schema.atencion.fichaId, fichaId))
        .orderBy(desc(schema.atencion.inicioAtencion))
        .limit(1);

      if (!atencion) {
        set.status = 404;
        return { mensaje: 'Atención no encontrada' };
      }

      const finAtencion = new Date();

      await db.update(schema.atencion)
        .set({ finAtencion, resultado })
        .where(eq(schema.atencion.id, atencion.id));

      await db.update(schema.ficha)
        .set({ estado: 'Atendido' })
        .where(eq(schema.ficha.id, fichaId));

      await db.update(schema.empleado)
        .set({ estado: 'Disponible' })
        .where(eq(schema.empleado.id, atencion.empleadoId));

      const updatedMetrics = await updateMetrics(ficha.servicioId, ficha.puntoAtencionId!);
      notifyWebSocket('metricsUpdated', updatedMetrics);

      notifyWebSocket('atencionFinalizada', { fichaId });

      set.status = 200;
      return { mensaje: 'Atención finalizada' };
    }, {
      body: t.Object({
        fichaId: t.String(),
        resultado: t.String()
      })
    })

    // Get current metrics
    .get('/metricas/:puntoAtencionId', async ({ params, set }) => {
      const { puntoAtencionId } = params;

      const [metrics] = await db.select()
        .from(schema.metricaTiempoReal)
        .where(eq(schema.metricaTiempoReal.puntoAtencionId, puntoAtencionId))
        .limit(1);

      if (!metrics) {
        set.status = 404;
        return { mensaje: 'Métricas no encontradas para este punto de atención' };
      }

      set.status = 200;
      return metrics;
    })

    // Get employee status
    .get('/estado-empleado/:empleadoId', async ({ params, set }) => {
      const { empleadoId } = params;

      const [empleado] = await db.select()
        .from(schema.empleado)
        .where(eq(schema.empleado.id, empleadoId))
        .limit(1);

      if (!empleado) {
        set.status = 404;
        return { mensaje: 'Empleado no encontrado' };
      }

      set.status = 200;
      return { estado: empleado.estado };
    })

    // Update employee status
    .post('/actualizar-estado-empleado', async ({ body, set, notifyWebSocket }) => {
      const { empleadoId, estado } = body as { empleadoId: string, estado: EstadoEmpleado };

      await db.update(schema.empleado)
        .set({ estado })
        .where(eq(schema.empleado.id, empleadoId));

      notifyWebSocket('estadoEmpleadoActualizado', { empleadoId, estado });

      set.status = 200;
      return { mensaje: 'Estado del empleado actualizado' };
    }, {
      body: t.Object({
        empleadoId: t.String(),
        estado: t.Union([t.Literal('Disponible'), t.Literal('Ocupado')])
      })
    })

    // Get daily report
    .get('/reporte-diario/:fecha', async ({ params, set }) => {
      const { fecha } = params;

      const reporte = await db.select({
        servicioId: schema.servicio.id,
        nombreServicio: schema.servicio.nombre,
        cantidadAtendidos: sql<number>`COUNT(${schema.atencion.id})`,
        tiempoPromedioAtencion: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${schema.atencion.inicioAtencion}, ${schema.atencion.finAtencion}))`,
        tiempoPromedioEspera: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${schema.ficha.createdAt}, ${schema.atencion.inicioAtencion}))`,
      })
      .from(schema.atencion)
      .innerJoin(schema.ficha, eq(schema.atencion.fichaId, schema.ficha.id))
      .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
      .where(sql`DATE(${schema.atencion.inicioAtencion}) = ${fecha}`)
      .groupBy(schema.servicio.id, schema.servicio.nombre);

      set.status = 200;
      return reporte;
    })
    // Generate personalized report
    .get('/reportes-personalizados', async ({ query }) => {
      const { fechaInicio, fechaFin, empleadoId, categoria, items } = query
  
      const itemsArray = items.split(',')
  
      const selectItems: Record<string, any> = {
        empleadoId: schema.empleado.id,
      }
  
      if (itemsArray.includes('empleadoNombre')) {
        selectItems.empleadoNombre = sql<string>`CONCAT(${schema.empleado.nombres}, ' ', ${schema.empleado.apellidos})`
      }
      if (itemsArray.includes('categoriaServicio')) {
        selectItems.categoriaServicio = schema.categoriaServicio.nombre
      }
      if (itemsArray.includes('cantidadAtendidos')) {
        selectItems.cantidadAtendidos = sql<number>`COUNT(DISTINCT ${schema.atencion.id})`
      }
      if (itemsArray.includes('tiempoPromedioAtencion')) {
        selectItems.tiempoPromedioAtencion = sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${schema.atencion.inicioAtencion}, ${schema.atencion.finAtencion}))`
      }
      if (itemsArray.includes('tiempoPromedioEspera')) {
        selectItems.tiempoPromedioEspera = sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${schema.ficha.createdAt}, ${schema.atencion.inicioAtencion}))`
      }
  
      let conditions = and(
        gte(schema.atencion.inicioAtencion, new Date(fechaInicio)),
        lte(schema.atencion.inicioAtencion, new Date(fechaFin))
      )
  
      if (empleadoId) {
        conditions = and(conditions, eq(schema.empleado.id, empleadoId))
      }
  
      if (categoria) {
        conditions = and(conditions, eq(schema.categoriaServicio.nombre, categoria))
      }
  
      const result = await db.select(selectItems)
        .from(schema.atencion)
        .innerJoin(schema.ficha, eq(schema.atencion.fichaId, schema.ficha.id))
        .innerJoin(schema.empleado, eq(schema.atencion.empleadoId, schema.empleado.id))
        .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
        .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
        .where(conditions)
        .groupBy(schema.empleado.id, schema.categoriaServicio.id)
  
      return result
    }, {
      query: t.Object({
        fechaInicio: t.String(),
        fechaFin: t.String(),
        empleadoId: t.Optional(t.String()),
        categoria: t.Optional(t.String()),
        items: t.String()
      })
    })
  })
  .use(staticPlugin({
    assets: PUBLIC_DIR,
    prefix: '/public'
  }))
  .group('/ext', app => app
    // Video endpoints
    .post('/videos', async ({ body }) => {
      
      const { title, description, video, usuarioId } = body;
      const id = uuidv4();
      const fileExtension = path.extname(video.name);
      const fileName = `${id}${fileExtension}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
    
      const buffer = await video.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));
    
      await db.insert(schema.videos).values({
        id,
        title,
        description,
        filePath: fileName,
        active: true,
        usuarioId,
      });
    
      return { id, title, description, filePath: fileName, active: true, usuarioId };
    }, {
      body: t.Object({
        title: t.String(),
        description: t.Optional(t.String()),
        video: t.File(),
        usuarioId: t.String(),
      })
    })

    .get('/videos', async () => {
      return await db.select().from(schema.videos).where(eq(schema.videos.active, true));
    })

    .get('/videos/:id', async ({ params }) => {
      const video = await db.select().from(schema.videos).where(eq(schema.videos.id, params.id)).limit(1);
      return video[0] || { error: 'Video not found' };
    })

    .put('/videos/:id', async ({ params, body }) => {
      const { title, description, active } = body;
      await db.update(schema.videos)
        .set({ title, description, active })
        .where(eq(schema.videos.id, params.id));
      return { message: 'Video updated successfully' };
    }, {
      body: t.Object({
        title: t.String(),
        description: t.Optional(t.String()),
        active: t.Boolean(),
      })
    })

    .delete('/videos/:id', async ({ params }) => {
      await db.delete(schema.videos).where(eq(schema.videos.id, params.id));
      return { message: 'Video deleted successfully' };
    })

    .get('/stream/:id', async ({ params, set }) => {
      const video = await db.select().from(schema.videos).where(eq(schema.videos.id, params.id)).limit(1);
      if (!video[0] || !video[0].active) {
        set.status = 404;
        return { error: 'Video not found or inactive' };
      }
      const filePath = path.join(UPLOAD_DIR, video[0].filePath);
      const fileStat = await stat(filePath);
      const fileSize = fileStat.size;
      const range = set.headers['range'];

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = createReadStream(filePath, { start, end });
        set.status = 206;
        set.headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
        set.headers['Accept-Ranges'] = 'bytes';
        set.headers['Content-Length'] = chunksize.toString();
        set.headers['Content-Type'] = 'video/mp4';
        return file;
      } else {
        set.headers['Content-Length'] = fileSize.toString();
        set.headers['Content-Type'] = 'video/mp4';
        return createReadStream(filePath);
      }
    })

    // Cotizaciones endpoints
    .post('/cotizaciones', async ({ body }) => {
      const id = uuidv4();
      const newCotizacion = {
        id,
        mineral: body.mineral,
        cotizacion: body.cotizacion,
        unidad: body.unidad,
        fecha: body.fecha ? new Date(body.fecha) : new Date(),
        active: body.active ?? true,
        usuarioId: body.usuarioId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    
      try {
        await db.insert(schema.cotizaciones).values(newCotizacion);
        return { message: 'Cotización created successfully', cotizacion: newCotizacion };
      } catch (error) {
        console.error('Error inserting cotización:', error);
        return { error: 'Failed to create cotización' };
      }
    }, {
      body: t.Object({
        mineral: t.String(),
        cotizacion: t.Number(),
        unidad: t.String(),
        fecha: t.Optional(t.String()),
        active: t.Optional(t.Boolean()),
        usuarioId: t.String(),
      })
    })
    .get('/cotizaciones', async () => {
      return await db.select().from(schema.cotizaciones).where(eq(schema.cotizaciones.active, true));
    })

    .get('/cotizaciones/:id', async ({ params }) => {
      const cotizacion = await db.select().from(schema.cotizaciones).where(eq(schema.cotizaciones.id, params.id)).limit(1);
      return cotizacion[0] || { error: 'Cotización not found' };
    })

    .put('/cotizaciones/:id', async ({ params, body }) => {
      const updateData: Partial<typeof schema.cotizaciones.$inferInsert> = {};
      if (body.mineral !== undefined) updateData.mineral = body.mineral;
      if (body.cotizacion !== undefined) updateData.cotizacion = body.cotizacion;
      if (body.unidad !== undefined) updateData.unidad = body.unidad;
      if (body.fecha !== undefined) updateData.fecha = new Date(body.fecha);
      if (body.active !== undefined) updateData.active = body.active;
    
      await db.update(schema.cotizaciones)
        .set(updateData)
        .where(eq(schema.cotizaciones.id, params.id));
      return { message: 'Cotización updated successfully' };
    }, {
      body: t.Object({
        mineral: t.Optional(t.String()),
        cotizacion: t.Optional(t.Number()),
        unidad: t.Optional(t.String()),
        fecha: t.Optional(t.String()),
        active: t.Optional(t.Boolean()),
      })
    })

    .delete('/cotizaciones/:id', async ({ params }) => {
      await db.delete(schema.cotizaciones).where(eq(schema.cotizaciones.id, params.id));
      return { message: 'Cotización deleted successfully' };
    })

    // Comunicados endpoints
    .post('/comunicados', async ({ body }) => {
      const id = uuidv4();
      await db.insert(schema.comunicados).values({ id, ...body });
      return { id, ...body };
    }, {
      body: t.Object({
        comunicado: t.String(),
        descripcion: t.String(),
        active: t.Optional(t.Boolean()),
        usuarioId: t.String(),
      })
    })

    .get('/comunicados', async () => {
      return await db.select().from(schema.comunicados).where(eq(schema.comunicados.active, true));
    })

    .get('/comunicados/:id', async ({ params }) => {
      const comunicado = await db.select().from(schema.comunicados).where(eq(schema.comunicados.id, params.id)).limit(1);
      return comunicado[0] || { error: 'Comunicado not found' };
    })

    .put('/comunicados/:id', async ({ params, body }) => {
      await db.update(schema.comunicados)
        .set(body)
        .where(eq(schema.comunicados.id, params.id));
      return { message: 'Comunicado updated successfully' };
    }, {
      body: t.Object({
        comunicado: t.Optional(t.String()),
        descripcion: t.Optional(t.String()),
        active: t.Optional(t.Boolean()),
      })
    })

    .delete('/comunicados/:id', async ({ params }) => {
      await db.delete(schema.comunicados).where(eq(schema.comunicados.id, params.id));
      return { message: 'Comunicado deleted successfully' };
    })
  )
  .listen({
    port: 3000,
    hostname: '0.0.0.0', // Esto hace que escuche en todas las interfaces
  });

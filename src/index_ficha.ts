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
  })
  .use(staticPlugin({
    assets: PUBLIC_DIR,
    prefix: '/public'
  }))
  .listen({
    port: 3000,
    hostname: '0.0.0.0', // Esto hace que escuche en todas las interfaces
  });

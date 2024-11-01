import { Elysia, t } from 'elysia';
import { db } from '../db';
import * as schema from '../schema';
import { eq, and, sql, desc, not, or,lte,gte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {printTicket} from '../printer';
import { authMiddleware, createAuthGuard } from '../authMiddleware';
import 'dotenv/config';

const EstadoFicha = {
    Pendiente: 'Pendiente',
    Llamado: 'Llamado',
    En_Atencion: 'En_Atencion',
    Atendido: 'Atendido',
    Cancelado: 'Cancelado',
    No_Presentado: 'No_Presentado'
  } as const;
  
  const EstadoFichaType = t.Enum(EstadoFicha);
  // Types
  type EstadoFicha = 'Pendiente' | 'Llamado' | 'En_Atencion' | 'Atendido' | 'Cancelado' | 'No_Presentado';
  type EstadoEmpleado = 'Disponible' | 'Ocupado';
  const EstadoEmpleado = t.Enum({
    Disponible: 'Disponible',
    Ocupado: 'Ocupado'
  })
  
  interface AtenderFicha {
    fichaId: string;
    empleadoId: string;
    puntoAtencionId: string;
  }
  
  interface FinalizarAtencion {
    fichaId: string;
    resultado: string;
  }
  
  async function generateDailyCode(subcategoriaNombre: string): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Consultar la última ficha del día para la categoría dada
    const lastFicha = await db.select({ codigo: schema.ficha.codigo })
      .from(schema.ficha)
      .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
      .innerJoin(schema.subCategoriaServicio, eq(schema.servicio.subCategoriaId, schema.subCategoriaServicio.id))
      .where(
        and(
          sql`LEFT(${schema.ficha.codigo}, 1) = ${subcategoriaNombre.charAt(0)}`,
          eq(schema.subCategoriaServicio.nombre, subcategoriaNombre),
          sql`DATE(${schema.ficha.createdAt}) = CURDATE()`
        )
      )
      .orderBy(desc(schema.ficha.codigo))
      .limit(1);
      console.log('lasta ficha',lastFicha);
  
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
    console.log('ficha actual',`${subcategoriaNombre.charAt(0)}-${newNumber.toString().padStart(3, '0')}`);
    return `${subcategoriaNombre.charAt(0)}-${newNumber.toString().padStart(3, '0')}`;
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
  interface Ficha {
    id: string;
    createdAt: Date;
    prioridad: number;
  }
  
  function selectNextTicket(tickets: Ficha[]): Ficha | null {
    if (tickets.length === 0) return null;
  
    const currentTime = new Date();
    const oneHour = 60 * 60 * 1000; // 1 hora en milisegundos
  
    // Función para calcular el peso total de una ficha
    const calculateWeight = (ticket: Ficha): number => {
      const waitingTime = currentTime.getTime() - ticket.createdAt.getTime();
      const waitingHours = waitingTime / oneHour;
      
      // Peso del tiempo: aumenta linealmente con el tiempo de espera
      const timeWeight = waitingHours;
      
      // Peso de la prioridad: se mantiene constante basado en la prioridad asignada
      const priorityWeight = ticket.prioridad;
      
      // Peso total: suma de los dos pesos
      // Puedes ajustar la importancia relativa de cada peso modificando estos multiplicadores
      return (timeWeight * 1) + (priorityWeight * 2);
    };
  
    // Seleccionar la ficha con el mayor peso total
    return tickets.reduce((heaviest, current) => {
      const heaviestWeight = calculateWeight(heaviest);
      const currentWeight = calculateWeight(current);
      return currentWeight > heaviestWeight ? current : heaviest;
    });
  }
  
export const fichas=new Elysia({prefix:'ficha'})
.use(authMiddleware)
.get('/recientes', async ({ set }) => {
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
        eq(schema.ficha.estado, 'Cancelado'),
        eq(schema.ficha.estado, 'Llamado')
      )
    )
    .orderBy(desc(schema.ficha.updatedAt))
    .limit(5);

  set.status = 200;
  return fichasRecientes;
}
)
.post('/', async ({ body, set }) => {
    const { servicioId } = body as { servicioId: string };
    
    const [servicio] = await db.select()
      .from(schema.servicio)
      .innerJoin(schema.subCategoriaServicio, eq(schema.servicio.subCategoriaId, schema.subCategoriaServicio.id))
      .where(eq(schema.servicio.id, servicioId))
      .limit(1);

    if (!servicio) {
      set.status = 404;
      return { mensaje: 'Servicio no encontrado' };
    }
    console.log('servicio subcategoria ficha', servicio.sub_categoria_servicio.nombre);
    const codigo = await generateDailyCode(servicio.sub_categoria_servicio.nombre);
    const id = uuidv4();

    const nuevaFicha = {
      id,
      codigo,
      estado: 'Pendiente' as EstadoFicha,
      servicioId,
    };
    console.log('nueva ficha');

    await db.insert(schema.ficha).values(nuevaFicha);
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
        servicePoint: servicio.sub_categoria_servicio.nombre,
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
  // Actualizar estado de una ficha
  .put('/:id', async ({ params, body, set }) => {
    const { id } = params;
    const { estado, empleadoId } = body as { estado: EstadoFicha, empleadoId?: string };

    const [ficha] = await db.select()
      .from(schema.ficha)
      .where(eq(schema.ficha.id, id))
      .limit(1);

    if (!ficha) {
      set.status = 404;
      return { mensaje: 'Ficha no encontrada' };
    }

    const updateData: Partial<typeof schema.ficha.$inferInsert> = { estado };
    if (empleadoId) {
      updateData.empleadoId = empleadoId;
    }

    await db.update(schema.ficha)
      .set(updateData)
      .where(eq(schema.ficha.id, id));

    set.status = 200;
    return { mensaje: 'Ficha actualizada exitosamente' };
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      estado: EstadoFichaType,
      empleadoId: t.Optional(t.String())
    })
  })

  // Eliminar una ficha
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      await db.transaction(async (trx) => {
        // Verificar si la ficha existe
        const [ficha] = await trx.select()
          .from(schema.ficha)
          .where(eq(schema.ficha.id, id))
          .limit(1);

        if (!ficha) {
          set.status = 404;
          return { mensaje: 'Ficha no encontrada' };
        }

        // Contar registros relacionados antes de eliminar
        const [atencionesCount] = await trx.select({ count: sql<number>`count(*)` })
          .from(schema.atencion)
          .where(eq(schema.atencion.fichaId, id));

        console.log(`Registros a eliminar - Atenciones: ${atencionesCount.count}`);

        // Eliminar registros de atención relacionados con esta ficha
        await trx.delete(schema.atencion)
          .where(eq(schema.atencion.fichaId, id));

        // Eliminar la ficha
        await trx.delete(schema.ficha)
          .where(eq(schema.ficha.id, id));

        // Verificar si la ficha aún existe
        const [remainingFicha] = await trx.select({ count: sql<number>`count(*)` })
          .from(schema.ficha)
          .where(eq(schema.ficha.id, id));

        if (remainingFicha.count > 0) {
          throw new Error('No se pudo eliminar la ficha completamente');
        }
      });

      set.status = 200;
      return { mensaje: 'Ficha y todos los registros relacionados eliminados exitosamente' };
    } catch (error) {
      console.error('Error al eliminar la ficha:', error);
      set.status = 500;
      return { error: "Error al eliminar la ficha y los registros relacionados", detalles: error instanceof Error ? error.message : String(error) };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  })

//   .get('/fichas-del-dia', async ({ query, set }) => {
//     const { empleadoId, categoriaServicioId } = query as { empleadoId?: string, categoriaServicioId?: string };
    
//     let conditions = [sql`DATE(${schema.ficha.createdAt}) = CURDATE()`];

//     if (empleadoId) {
//       conditions.push(eq(schema.ficha.empleadoId, empleadoId));
//     }

//     if (categoriaServicioId) {
//       conditions.push(eq(schema.servicio.categoriaId, categoriaServicioId));
//     }

//     const fichasDelDia = await db.select({
//       id: schema.ficha.id,
//       codigo: schema.ficha.codigo,
//       estado: schema.ficha.estado,
//       createdAt: schema.ficha.createdAt,
//       servicio: schema.servicio.nombre,
//       categoria: schema.categoriaServicio.nombre,
//       empleadoNombre: sql`CONCAT(${schema.empleado.nombres}, ' ', ${schema.empleado.apellidos})`,
//       puntoAtencion: schema.puntoAtencion.nombre
//     })
//       .from(schema.ficha)
//       .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
//       .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
//       .leftJoin(schema.empleado, eq(schema.ficha.empleadoId, schema.empleado.id))
//       .leftJoin(schema.puntoAtencion, eq(schema.ficha.puntoAtencionId, schema.puntoAtencion.id))
//       .where(and(...conditions))
//       .orderBy(schema.ficha.createdAt);

//     set.status = 200;
//     return fichasDelDia;
//   }, {
//     query: t.Object({
//       empleadoId: t.Optional(t.String()),
//       categoriaServicioId: t.Optional(t.String())
//     })
//   })
  .get('/fichas-del-dia', async ({ query, set }) => {
    const { empleadoId, categoriaServicioId } = query as { empleadoId?: string, categoriaServicioId?: string };
    
    let conditions = [sql`DATE(${schema.ficha.createdAt}) = CURDATE()`];

    if (empleadoId) {
      conditions.push(eq(schema.ficha.empleadoId, empleadoId));
    }

    if (categoriaServicioId) {
      conditions.push(eq(schema.servicio.categoriaId, categoriaServicioId));
    }

    const fichasDelDia = await db.select({
      id: schema.ficha.id,
      codigo: schema.ficha.codigo,
      estado: schema.ficha.estado,
      servicioId: schema.ficha.servicioId,
      empleadoId: schema.ficha.empleadoId,
      puntoAtencionId: schema.ficha.puntoAtencionId,
      createdAt: schema.ficha.createdAt,
      updatedAt: schema.ficha.updatedAt,})
      .from(schema.ficha)
      .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
      .innerJoin(schema.categoriaServicio, eq(schema.servicio.categoriaId, schema.categoriaServicio.id))
      .leftJoin(schema.empleado, eq(schema.ficha.empleadoId, schema.empleado.id))
      .leftJoin(schema.puntoAtencion, eq(schema.ficha.puntoAtencionId, schema.puntoAtencion.id))
      .where(and(...conditions))
      .orderBy(schema.ficha.createdAt);


    set.status = 200;
    return fichasDelDia;
  }, {
    query: t.Object({
      empleadoId: t.Optional(t.String()),
      categoriaServicioId: t.Optional(t.String())
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
        eq(schema.categoriaServicio.id, categoria),
        sql`DATE(${schema.ficha.createdAt}) = CURDATE()` // Añadimos esta condición
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
    .where(
      and(
        eq(schema.ficha.estado, 'Pendiente'),
        sql`DATE(${schema.ficha.createdAt}) = CURDATE()` // Añadimos esta condición
      )
    )
    .orderBy(schema.ficha.createdAt)
    .limit(10);
}
set.status = 200;
return fichasPendientes;
})
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

  const fichasPendientes = await db.select({
    id: schema.ficha.id,
    codigo: schema.ficha.codigo,
    estado: schema.ficha.estado,
    createdAt: schema.ficha.createdAt,
    prioridad: schema.servicio.prioridad,
    servicioNombre: schema.servicio.nombre
  })
    .from(schema.ficha)
    .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
    .where(
      and(
        eq(schema.ficha.estado, 'Pendiente'),
        eq(schema.servicio.categoriaId, puntoAtencion.categoriaId),
        sql`DATE(${schema.ficha.createdAt}) = CURDATE()`
      )
    );

  if (fichasPendientes.length === 0) {
    set.status = 200;
    return null;
  }

  const proximaFicha = selectNextTicket(fichasPendientes);

  if (!proximaFicha) {
    set.status = 200;
    return null;
  }

  const fichaSeleccionada = fichasPendientes.find(f => f.id === proximaFicha.id);

  set.status = 200;
  return {
    id: fichaSeleccionada!.id,
    codigo: fichaSeleccionada!.codigo,
    estado: fichaSeleccionada!.estado,
    createdAt: fichaSeleccionada!.createdAt,
    prioridad: fichaSeleccionada!.prioridad,
    servicioNombre: fichaSeleccionada!.servicioNombre,
    esFichaAntigua: proximaFicha.createdAt < new Date(Date.now() - 60 * 60 * 1000)
  };
})
// .get('/proxima-ficha/:puntoAtencionId', async ({ params, set }) => {
// const { puntoAtencionId } = params;
// const [puntoAtencion] = await db.select()
//   .from(schema.puntoAtencion)
//   .where(eq(schema.puntoAtencion.id, puntoAtencionId))
//   .limit(1);

// if (!puntoAtencion) {
//   set.status = 404;
//   return { mensaje: 'Punto de atención no encontrado' };
// }

// const proximaFicha = await db.select()
//   .from(schema.ficha)
//   .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
//   .where(
//     and(
//       eq(schema.ficha.estado, 'Pendiente'),
//       eq(schema.servicio.categoriaId, puntoAtencion.categoriaId),
//       // Añadimos esta condición para filtrar las fichas creadas hoy
//       sql`DATE(${schema.ficha.createdAt}) = CURDATE()`
//     )
//   )
//   .orderBy(schema.ficha.createdAt)
//   .limit(1);

// if (proximaFicha.length === 0) {
//   set.status = 200;
//   return null;
// }
// return proximaFicha[0].ficha;
// })

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

  .post('/llamar-ficha/:fichaId', async ({ params, body, set }) => {
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
      servicioId:schema.ficha.servicioId,
      empleadoId:schema.ficha.empleadoId,
      puntoAtencionId: schema.ficha.puntoAtencionId,
      puntoAtencionNombre: schema.puntoAtencion.nombre
    })
    .from(schema.ficha)
    .leftJoin(schema.puntoAtencion, eq(schema.ficha.puntoAtencionId, schema.puntoAtencion.id))
    .where(eq(schema.ficha.id, fichaId))
    .limit(1);
  
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
  .post('/cancelar/:fichaId', async ({params, body, set }) => {
    const { empleadoId, puntoAtencionId } = body as AtenderFicha;
    const { fichaId } = params;

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
      .set({ estado: 'Cancelado', empleadoId, puntoAtencionId })
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

    set.status = 200;
    return { mensaje: 'Ficha cancelada' };
  }, {
    body: t.Object({
      fichaId: t.String(),
      empleadoId: t.String(),
      puntoAtencionId: t.String()
    })
  })
  // Start attending a ticket
  .post('/atender-ficha', async ({ body, set }) => {
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
  .post('/finalizar-atencion', async ({ body, set }) => {
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


    set.status = 200;
    return { mensaje: 'Atención finalizada' };
  }, {
    body: t.Object({
      fichaId: t.String(),
      resultado: t.String()
    })
  })

export const metricas=new Elysia({prefix:'metricas'})
  .use(authMiddleware)
  .get('/:puntoAtencionId', async ({ params, set }) => {
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
  .post('/actualizar-estado-empleado', async ({ body, set }) => {
    const { empleadoId, estado } = body as { empleadoId: string, estado: EstadoEmpleado };

    await db.update(schema.empleado)
      .set({ estado })
      .where(eq(schema.empleado.id, empleadoId));
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
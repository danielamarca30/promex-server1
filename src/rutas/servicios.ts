import Elysia,{t} from "elysia";
import {v4 as uuidv4} from 'uuid';
import { eq, and,sql } from 'drizzle-orm';
import {db} from '../db';
import * as schema from '../schema';
import { authMiddleware, createAuthGuard } from '../authMiddleware';

// CRUD for Categories
export const categorias=new Elysia({prefix:'categorias'})
  .use(authMiddleware)
  .get('/', async ({ set }) => {
    const categories = await db.select().from(schema.categoriaServicio);
    set.status = 200;
    return categories;
  })
  .post('/', async ({ body, set }) => {
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
  .put('/:id', async ({ params, body, set }) => {
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
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      const result = await db.transaction(async (trx) => {
        // Contar registros antes de eliminar
        const [atencionCount, fichasCount, metricasCount, serviciosCount, subcategoriasCount, puntosAtencionCount] = await Promise.all([
          trx.select({ count: sql`count(*)` })
            .from(schema.atencion)
            .innerJoin(schema.ficha, eq(schema.atencion.fichaId, schema.ficha.id))
            .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
            .where(eq(schema.servicio.categoriaId, id)),
          trx.select({ count: sql`count(*)` })
            .from(schema.ficha)
            .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
            .where(eq(schema.servicio.categoriaId, id)),
          trx.select({ count: sql`count(*)` })
            .from(schema.metricaTiempoReal)
            .innerJoin(schema.servicio, eq(schema.metricaTiempoReal.servicioId, schema.servicio.id))
            .where(eq(schema.servicio.categoriaId, id)),
          trx.select({ count: sql`count(*)` }).from(schema.servicio).where(eq(schema.servicio.categoriaId, id)),
          trx.select({ count: sql`count(*)` }).from(schema.subCategoriaServicio).where(eq(schema.subCategoriaServicio.categoriaId, id)),
          trx.select({ count: sql`count(*)` }).from(schema.puntoAtencion).where(eq(schema.puntoAtencion.categoriaId, id))
        ]);

        console.log(`Registros a eliminar - Atención: ${atencionCount[0].count}, Fichas: ${fichasCount[0].count}, Métricas: ${metricasCount[0].count}, Servicios: ${serviciosCount[0].count}, Subcategorías: ${subcategoriasCount[0].count}, Puntos de Atención: ${puntosAtencionCount[0].count}`);

        // Eliminar registros de atención relacionados con las fichas de los servicios de esta categoría
        await trx.delete(schema.atencion)
          .where(
            sql`${schema.atencion.fichaId} IN (
              SELECT ${schema.ficha.id} FROM ${schema.ficha}
              INNER JOIN ${schema.servicio} ON ${schema.ficha.servicioId} = ${schema.servicio.id}
              WHERE ${schema.servicio.categoriaId} = ${id}
            )`
          );

        // Eliminar fichas relacionadas con los servicios de esta categoría
        await trx.delete(schema.ficha)
          .where(
            sql`${schema.ficha.servicioId} IN (
              SELECT id FROM ${schema.servicio}
              WHERE ${schema.servicio.categoriaId} = ${id}
            )`
          );

        // Eliminar métricas de tiempo real relacionadas con los servicios de esta categoría
        await trx.delete(schema.metricaTiempoReal)
          .where(
            sql`${schema.metricaTiempoReal.servicioId} IN (
              SELECT id FROM ${schema.servicio}
              WHERE ${schema.servicio.categoriaId} = ${id}
            )`
          );

        // Eliminar servicios relacionados con esta categoría
        await trx.delete(schema.servicio)
          .where(eq(schema.servicio.categoriaId, id));

        // Eliminar subcategorías relacionadas con esta categoría
        await trx.delete(schema.subCategoriaServicio)
          .where(eq(schema.subCategoriaServicio.categoriaId, id));

        // Eliminar puntos de atención relacionados con esta categoría
        await trx.delete(schema.puntoAtencion)
          .where(eq(schema.puntoAtencion.categoriaId, id));

        // Finalmente, eliminar la categoría
        await trx.delete(schema.categoriaServicio)
          .where(eq(schema.categoriaServicio.id, id));

        // Verificar si la categoría aún existe
        const [remainingCategory] = await trx.select({ count: sql`count(*)` })
          .from(schema.categoriaServicio)
          .where(eq(schema.categoriaServicio.id, id));

        return {
          atencionCount: atencionCount[0].count,
          fichasCount: fichasCount[0].count,
          metricasCount: metricasCount[0].count,
          serviciosCount: serviciosCount[0].count,
          subcategoriasCount: subcategoriasCount[0].count,
          puntosAtencionCount: puntosAtencionCount[0].count,
          categoryRemaining: remainingCategory.count
        };
      });

      console.log('Resultado de la eliminación de categoría:', result);

      if (result.categoryRemaining === 0) {
        set.status = 200;
        return { 
          message: "Categoría y todos los registros relacionados eliminados exitosamente",
          deletedCounts: {
            atencion: result.atencionCount,
            fichas: result.fichasCount,
            metricas: result.metricasCount,
            servicios: result.serviciosCount,
            subcategorias: result.subcategoriasCount,
            puntosAtencion: result.puntosAtencionCount
          }
        };
      } else {
        set.status = 500;
        return { error: "No se pudo eliminar la categoría completamente" };
      }
    } catch (error) {
      console.error('Error al eliminar la categoría:', error);
      set.status = 500;
      return { error: "Error al eliminar la categoría y los registros relacionados" };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });


export const subcategorias=new Elysia({prefix:'subcategorias'})
  .use(authMiddleware)
  .get('/', async ({ set }) => {
    const subcategories = await db.select().from(schema.subCategoriaServicio);
    set.status = 200;
    return subcategories;
  })
  .get('/:categoriaId', async ({ params, set }) => {
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
  .post('/', async ({ body, set }) => {
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
  .put('/:id', async ({ params, body, set }) => {
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
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      const result = await db.transaction(async (trx) => {
        // Contar registros antes de eliminar
        const [atencionCount, fichasCount, metricasCount, serviciosCount] = await Promise.all([
          trx.select({ count: sql`count(*)` })
            .from(schema.atencion)
            .innerJoin(schema.ficha, eq(schema.atencion.fichaId, schema.ficha.id))
            .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
            .where(eq(schema.servicio.subCategoriaId, id)),
          trx.select({ count: sql`count(*)` })
            .from(schema.ficha)
            .innerJoin(schema.servicio, eq(schema.ficha.servicioId, schema.servicio.id))
            .where(eq(schema.servicio.subCategoriaId, id)),
          trx.select({ count: sql`count(*)` })
            .from(schema.metricaTiempoReal)
            .innerJoin(schema.servicio, eq(schema.metricaTiempoReal.servicioId, schema.servicio.id))
            .where(eq(schema.servicio.subCategoriaId, id)),
          trx.select({ count: sql`count(*)` }).from(schema.servicio).where(eq(schema.servicio.subCategoriaId, id))
        ]);

        console.log(`Registros a eliminar - Atención: ${atencionCount[0].count}, Fichas: ${fichasCount[0].count}, Métricas: ${metricasCount[0].count}, Servicios: ${serviciosCount[0].count}`);

        // Eliminar registros de atención relacionados con las fichas de los servicios de esta subcategoría
        await trx.delete(schema.atencion)
          .where(
            sql`${schema.atencion.fichaId} IN (
              SELECT ${schema.ficha.id} FROM ${schema.ficha}
              INNER JOIN ${schema.servicio} ON ${schema.ficha.servicioId} = ${schema.servicio.id}
              WHERE ${schema.servicio.subCategoriaId} = ${id}
            )`
          );

        // Eliminar fichas relacionadas con los servicios de esta subcategoría
        await trx.delete(schema.ficha)
          .where(
            sql`${schema.ficha.servicioId} IN (
              SELECT id FROM ${schema.servicio}
              WHERE ${schema.servicio.subCategoriaId} = ${id}
            )`
          );

        // Eliminar métricas de tiempo real relacionadas con los servicios de esta subcategoría
        await trx.delete(schema.metricaTiempoReal)
          .where(
            sql`${schema.metricaTiempoReal.servicioId} IN (
              SELECT id FROM ${schema.servicio}
              WHERE ${schema.servicio.subCategoriaId} = ${id}
            )`
          );

        // Eliminar servicios relacionados con esta subcategoría
        await trx.delete(schema.servicio)
          .where(eq(schema.servicio.subCategoriaId, id));

        // Finalmente, eliminar la subcategoría
        await trx.delete(schema.subCategoriaServicio)
          .where(eq(schema.subCategoriaServicio.id, id));

        // Verificar si la subcategoría aún existe
        const [remainingSubcategory] = await trx.select({ count: sql`count(*)` })
          .from(schema.subCategoriaServicio)
          .where(eq(schema.subCategoriaServicio.id, id));

        return {
          atencionCount: atencionCount[0].count,
          fichasCount: fichasCount[0].count,
          metricasCount: metricasCount[0].count,
          serviciosCount: serviciosCount[0].count,
          subcategoryRemaining: remainingSubcategory.count
        };
      });

      console.log('Resultado de la eliminación de subcategoría:', result);

      if (result.subcategoryRemaining === 0) {
        set.status = 200;
        return { 
          message: "Subcategoría y todos los registros relacionados eliminados exitosamente",
          deletedCounts: {
            atencion: result.atencionCount,
            fichas: result.fichasCount,
            metricas: result.metricasCount,
            servicios: result.serviciosCount
          }
        };
      } else {
        set.status = 500;
        return { error: "No se pudo eliminar la subcategoría completamente" };
      }
    } catch (error) {
      console.error('Error al eliminar la subcategoría:', error);
      set.status = 500;
      return { error: "Error al eliminar la subcategoría y los registros relacionados" };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });

  // CRUD for Services
export const servicios=new Elysia({prefix:'servicios'})
    .use(authMiddleware)
    .get('/categoria/:categoriaId/:subCategoriaId?', async ({ params, set }) => {
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
  .get('/', async ({ set }) => {
    const servicios = await db.select().from(schema.servicio);
    set.status = 200;
    return servicios;
  })
  .get('/:id', async ({ params, set }) => {
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
  .post('/', async ({ body, set }) => {
    const id = uuidv4();
    await db.insert(schema.servicio).values({
      id,
      nombre: body.nombre,
      prioridad:body.prioridad,
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
      prioridad: t.Number(),
      descripcion: t.Optional(t.String()),
      categoriaId: t.String(),
      subCategoriaId: t.Optional(t.String()),
      tiempoEstimado: t.Number(),
      activo: t.Boolean()
    })
  })
  .put('/:id', async ({ params, body, set }) => {
    await db.update(schema.servicio)
      .set({
        nombre: body.nombre,
        prioridad:body.prioridad,
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
      prioridad: t.Number(),
      descripcion: t.Optional(t.String()),
      categoriaId: t.String(),
      subCategoriaId: t.Optional(t.String()),
      tiempoEstimado: t.Number(),
      activo: t.Boolean()
    })
  })
  .delete('/:id', async ({ params, set }) => {
    const { id } = params;

    try {
      const result = await db.transaction(async (trx) => {
        // Contar registros antes de eliminar
        const [atencionCount, fichasCount, metricasCount] = await Promise.all([
          trx.select({ count: sql`count(*)` })
            .from(schema.atencion)
            .innerJoin(schema.ficha, eq(schema.atencion.fichaId, schema.ficha.id))
            .where(eq(schema.ficha.servicioId, id)),
          trx.select({ count: sql`count(*)` }).from(schema.ficha).where(eq(schema.ficha.servicioId, id)),
          trx.select({ count: sql`count(*)` }).from(schema.metricaTiempoReal).where(eq(schema.metricaTiempoReal.servicioId, id))
        ]);

        console.log(`Registros a eliminar - Atención: ${atencionCount[0].count}, Fichas: ${fichasCount[0].count}, Métricas: ${metricasCount[0].count}`);

        // Eliminar registros de atención relacionados con las fichas de este servicio
        await trx.delete(schema.atencion)
          .where(
            sql`${schema.atencion.fichaId} IN (
              SELECT id FROM ${schema.ficha}
              WHERE ${schema.ficha.servicioId} = ${id}
            )`
          );

        // Eliminar fichas relacionadas con este servicio
        await trx.delete(schema.ficha)
          .where(eq(schema.ficha.servicioId, id));

        // Eliminar métricas de tiempo real relacionadas con este servicio
        await trx.delete(schema.metricaTiempoReal)
          .where(eq(schema.metricaTiempoReal.servicioId, id));

        // Finalmente, eliminar el servicio
        await trx.delete(schema.servicio)
          .where(eq(schema.servicio.id, id));

        // Contar registros después de eliminar para verificar
        const [remainingService] = await trx.select({ count: sql`count(*)` })
          .from(schema.servicio)
          .where(eq(schema.servicio.id, id));

        return {
          atencionCount: atencionCount[0].count,
          fichasCount: fichasCount[0].count,
          metricasCount: metricasCount[0].count,
          serviceRemaining: remainingService.count
        };
      });

      console.log('Resultado de la eliminación:', result);

      if (result.serviceRemaining === 0) {
        set.status = 200;
        return { 
          message: "Servicio y todos los registros relacionados eliminados exitosamente",
          deletedCounts: {
            atencion: result.atencionCount,
            fichas: result.fichasCount,
            metricas: result.metricasCount
          }
        };
      } else {
        set.status = 500;
        return { error: "No se pudo eliminar el servicio completamente" };
      }
    } catch (error) {
      console.error('Error al eliminar el servicio:', error);
      set.status = 500;
      return { error: "Error al eliminar el servicio y los registros relacionados" };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });

  // CRUD for Puntos de Atención
export const puntosAtencion=new Elysia({prefix:'puntos-atencion'})
.use(authMiddleware)
.get('/', async ({ set }) => {
  const puntosAtencion = await db.select().from(schema.puntoAtencion);
  set.status = 200;
  // console.log('putnos deatencion',puntosAtencion);
  return puntosAtencion;
})
.get('/:id', async ({ params, set }) => {
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
.post('/', async ({ body, set }) => {
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
.put('/:id', async ({ params, body, set }) => {
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
.delete('/:id', async ({ params, set }) => {
  const { id } = params;

  try {
    await db.transaction(async (trx) => {
      // Contar registros antes de eliminar
      const [fichasCount, metricasCount] = await Promise.all([
        trx.select({ count: sql<number>`count(*)` }).from(schema.ficha).where(eq(schema.ficha.puntoAtencionId, id)),
        trx.select({ count: sql<number>`count(*)` }).from(schema.metricaTiempoReal).where(eq(schema.metricaTiempoReal.puntoAtencionId, id))
      ]);

      console.log(`Registros a eliminar - Fichas: ${fichasCount[0].count}, Métricas: ${metricasCount[0].count}`);

      // Eliminar registros de atención relacionados con las fichas de este punto de atención
      await trx.delete(schema.atencion)
        .where(
          sql`${schema.atencion.fichaId} IN (
            SELECT id FROM ${schema.ficha}
            WHERE ${schema.ficha.puntoAtencionId} = ${id}
          )`
        );

      // Eliminar fichas relacionadas con este punto de atención
      await trx.delete(schema.ficha)
        .where(eq(schema.ficha.puntoAtencionId, id));

      // Eliminar métricas de tiempo real relacionadas con este punto de atención
      await trx.delete(schema.metricaTiempoReal)
        .where(eq(schema.metricaTiempoReal.puntoAtencionId, id));

      // Finalmente, eliminar el punto de atención
      await trx.delete(schema.puntoAtencion)
        .where(eq(schema.puntoAtencion.id, id));

      // Verificar si el punto de atención aún existe
      const [remainingPuntoAtencion] = await trx.select({ count: sql<number>`count(*)` })
        .from(schema.puntoAtencion)
        .where(eq(schema.puntoAtencion.id, id));

      if (remainingPuntoAtencion.count > 0) {
        throw new Error('No se pudo eliminar el punto de atención completamente');
      }
    });

    set.status = 200;
    return { message: "Punto de atención y todos los registros relacionados eliminados exitosamente" };
  } catch (error) {
    console.error('Error al eliminar el punto de atención:', error);
    set.status = 500;
    return { error: "Error al eliminar el punto de atención y los registros relacionados", details: error instanceof Error ? error.message : String(error) };
  }
}, {
  params: t.Object({
    id: t.String()
  })
})

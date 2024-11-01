import {Elysia, t} from 'elysia';
import {v4 as uuidv4} from 'uuid';
import {eq} from 'drizzle-orm';
import {db} from '../db';
import * as schema from '../schema';
import { authMiddleware, createAuthGuard } from '../authMiddleware';


    // Cotizaciones endpoints
    export const cotizaciones=new Elysia({prefix:'cotizaciones'})
    .use(authMiddleware)
    .post('/', async ({ body }) => {
        const id = uuidv4();
        const newCotizacion = {
            id,
            mineral: body.mineral,
            cotizacion: body.cotizacion.toString(), // Convertir a cadena
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
            cotizacion: t.Number(), // Aquí sigue como número, no necesitas cambiarlo
            unidad: t.String(),
            fecha: t.Optional(t.String()),
            active: t.Optional(t.Boolean()),
            usuarioId: t.String(),
        })
    })
      .get('', async () => {
        return await db.select().from(schema.cotizaciones).where(eq(schema.cotizaciones.active, true));
      })
  
      .get('/:id', async ({ params }) => {
        const cotizacion = await db.select().from(schema.cotizaciones).where(eq(schema.cotizaciones.id, params.id)).limit(1);
        return cotizacion[0] || { error: 'Cotización not found' };
      })
      .put('/:id', async ({ params, body }) => {
        const updateData: Partial<typeof schema.cotizaciones.$inferInsert> = {};
        
        if (body.mineral !== undefined) updateData.mineral = body.mineral;
        if (body.cotizacion !== undefined) updateData.cotizacion = body.cotizacion.toString(); // Convertir a cadena
        if (body.unidad !== undefined) updateData.unidad = body.unidad;
        if (body.fecha !== undefined) updateData.fecha = new Date();
        if (body.active !== undefined) updateData.active = body.active;
        
        try {
            await db.update(schema.cotizaciones)
                .set(updateData)
                .where(eq(schema.cotizaciones.id, params.id));
            return { message: 'Cotización updated successfully' };
        } catch (error) {
            console.error('Error updating cotización:', error);
            return { error: 'Failed to update cotización'};
        }
    }, {
        body: t.Object({
            mineral: t.Optional(t.String()),
            cotizacion: t.Optional(t.Number()), // Aquí sigue como número, no necesitas cambiarlo
            unidad: t.Optional(t.String()),
            fecha: t.Optional(t.String()),
            active: t.Optional(t.Boolean()),
        })
    })

  
      .delete('/:id', async ({ params }) => {
        await db.delete(schema.cotizaciones).where(eq(schema.cotizaciones.id, params.id));
        return { message: 'Cotización deleted successfully' };
      })
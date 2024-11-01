    
    import {Elysia, t} from 'elysia';
    import { v4 as uuidv4} from 'uuid';
    import { eq } from 'drizzle-orm';
    import {db} from '../db';
    import  * as schema  from '../schema';
    import { authMiddleware, createAuthGuard } from '../authMiddleware';


    // Comunicados endpoints
    export const comunicados=new Elysia({prefix:'/comunicados'})
    .use(authMiddleware)
    .post('/', async ({ body }) => {
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
  
      .get('/', async () => {
        return await db.select().from(schema.comunicados).where(eq(schema.comunicados.active, true));
      })
  
      .get('/:id', async ({ params }) => {
        const comunicado = await db.select().from(schema.comunicados).where(eq(schema.comunicados.id, params.id)).limit(1);
        return comunicado[0] || { error: 'Comunicado not found' };
      })
  
      .put('/:id', async ({ params, body }) => {
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
  
      .delete('/:id', async ({ params }) => {
        await db.delete(schema.comunicados).where(eq(schema.comunicados.id, params.id));
        return { message: 'Comunicado deleted successfully' };
      })
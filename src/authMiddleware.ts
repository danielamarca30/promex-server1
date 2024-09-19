import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_super_seguro';

const authMiddleware = (app: Elysia) => 
  app.derive(({ request, set }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      set.status = 401;
      throw new Error('No se proporcionó token de autenticación');
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { user: decoded };
    } catch (error) {
      set.status = 401;
      throw new Error('Token inválido');
    }
  })
  .onError(({ error, set }) => {
    set.status = 401;
    return { error: error.message };
  });

export default authMiddleware;
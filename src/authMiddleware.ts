import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_jwt_super_seguro';

type AuthContext = {
  request: Request;
  set: {
    status?: number | string;
    headers?: Record<string, string>;
  };
};

export const createAuthGuard = (requiredPermissions: string[] = []) => {
  return async ({ request, set }: AuthContext) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      set.status = 401;
      throw new Error('No se proporcionó token de autenticación');
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { 
        userId: string; 
        rolId: string; 
        permisos: string[] 
      };

      if (requiredPermissions.length > 0) {
        const hasPermission = requiredPermissions.every(permission => 
          decoded.permisos.includes(permission)
        );

        if (!hasPermission) {
          set.status = 403;
          throw new Error('No tienes permiso para acceder a este recurso');
        }
      }

      return { user: decoded };
    } catch (error) {
      set.status = 401;
      throw new Error('Token inválido o expirado');
    }
  };
};

export const authMiddleware = (app: Elysia) => 
  app.derive(async (context) => {
    const guard = createAuthGuard(['tokenBasico']);
    const result = await guard(context);
    return { user: result.user };
  });

export default authMiddleware;
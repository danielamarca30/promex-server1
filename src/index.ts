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
import fs,{ mkdir, writeFile, stat } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import authModule from './authModule';
import {printTicket} from './printer';
import path from 'path';
import 'dotenv/config';
import { comunicados,cotizaciones,videos,stream,categorias,subcategorias,servicios,puntosAtencion,empleados,usuarios,roles,empleadosUsuarios,fichas,metricas } from 'rutas';

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

const app = new Elysia()
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
    return {status:true};
  })
  .group('/api', app => {
    return app
    .use(fichas)
    .use(categorias)
    .use(subcategorias)
    .use(servicios)
    .use(puntosAtencion)
    .use(empleados)
    .use(usuarios)
    .use(roles)
    .use(empleadosUsuarios)
    .use(metricas)
  })
  .use(staticPlugin({
    assets: PUBLIC_DIR,
    prefix: '/public'
  }))
  .group('/ext',app => app
    .use(stream)
    .use(videos)
    .use(comunicados)
    .use(cotizaciones)
  )
  .listen({
    port: 3000,
    hostname: '0.0.0.0', // Esto hace que escuche en todas las interfaces
  });

import { Elysia, t } from 'elysia';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db } from '../db';
import fs, { mkdir, writeFile, stat, unlink } from 'fs/promises';
import * as schema from '../schema';
import { createReadStream, existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { eq, and, sql, desc, not, or, lte, gte } from 'drizzle-orm';
import { authMiddleware, createAuthGuard } from '../authMiddleware';

const UPLOAD_DIR = './uploads';
const PUBLIC_DIR = './public';

function processVideo(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .size('1280x?')  // 720p
      .videoBitrate('1000k')
      .audioBitrate('192k')
      .output(outputPath)
      .on('end', () => {
        resolve();
      })
      .on('error', (err: Error) => {
        console.error('Error al procesar el video:', err);
        reject(err);
      })
      .run();
  });
}

export const videos = new Elysia({ prefix: 'videos' })
  .use(authMiddleware)
  .post('/', async ({ body }) => {
    const { title, description, video, usuarioId } = body;
    const id = uuidv4();
    const fileExtension = path.extname(video.name);
    const originalFileName = `${id}-original${fileExtension}`;
    const processedFileName = `${id}.mp4`;
    const originalFilePath = path.join(UPLOAD_DIR, originalFileName);
    const processedFilePath = path.join(UPLOAD_DIR, processedFileName);

    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });

      const buffer = await video.arrayBuffer();
      await fs.writeFile(originalFilePath, Buffer.from(buffer));

      await processVideo(originalFilePath, processedFilePath);

      await fs.access(processedFilePath);

      await db.insert(schema.videos).values({
        id,
        title,
        description,
        filePath: processedFileName,
        active: true,
        usuarioId,
      });

      return { id, title, description, filePath: processedFileName, active: true, usuarioId };
    } catch (error) {
      console.error('Error al procesar y guardar el video:', error);
      throw new Error('No se pudo procesar el video');
    }
  }, {
    body: t.Object({
      title: t.String(),
      description: t.Optional(t.String()),
      video: t.File(),
      usuarioId: t.String(),
    })
  })
  .get('/', async () => {
    const videos = await db.select().from(schema.videos);
    return videos;
  })
  .get('/:id', async ({ params }) => {
    const video = await db.select().from(schema.videos).where(eq(schema.videos.id, params.id)).limit(1);
    return video[0] || { error: 'Video not found' };
  })
  .put('/:id', async ({ params, body }) => {
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
  .delete('/:id', async ({ params }) => {
    console.log('videos parametros', params);
    
    // Obtener la información del video antes de eliminarlo
    const video = await db.select().from(schema.videos).where(eq(schema.videos.id, params.id)).limit(1);
    
    if (video[0]) {
      const processedFilePath = path.join(UPLOAD_DIR, video[0].filePath);
      const originalFilePath = path.join(UPLOAD_DIR, `${video[0].id}-original${path.extname(video[0].filePath)}`);

      // Eliminar el video de la base de datos
      await db.delete(schema.videos).where(eq(schema.videos.id, params.id));

      // Eliminar los archivos físicos
      try {
        await unlink(originalFilePath);
        console.log(`Archivo original eliminado: ${originalFilePath}`);
      } catch (error) {
        console.error(`Error al eliminar el archivo original: ${error}`);
      }

      try {
        await unlink(processedFilePath);
        console.log(`Archivo procesado eliminado: ${processedFilePath}`);
      } catch (error) {
        console.error(`Error al eliminar el archivo procesado: ${error}`);
      }

      return { message: 'Video and associated files deleted successfully' };
    } else {
      return { error: 'Video not found' };
    }
  });

export const stream = new Elysia({ prefix: 'stream' })
  .get('/:id', async ({ params, set }) => {
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
  });
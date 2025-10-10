
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from 'multer';
import * as tar from 'tar';
import fs from 'fs';
import path from 'path';

export async function registerRoutes(app: Express): Promise<Server> {
  const upload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        // Create temp directory if it doesn't exist
        const tempDir = './temp_uploads';
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
      },
      filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
      }
    }),
    fileFilter: function (req, file, cb) {
      if (!file.originalname.match(/\.(tar|tar\.gz|tgz|tar\.bz2)$/i)) {
        return cb(new Error('Only .tar, .tar.gz, .tgz, or .tar.bz2 files are allowed!'));
      }
      cb(undefined, true);
    }
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const tarFilePath = req.file.path;
    const projectRoot = process.cwd();

    try {
      console.log(`[RESTORE] Starting extraction of ${req.file.originalname}`);
      console.log(`[RESTORE] Tar file path: ${tarFilePath}`);
      console.log(`[RESTORE] Project root: ${projectRoot}`);
      console.log(`[RESTORE] File size: ${req.file.size} bytes`);
      
      // First, list what's in the tar file
      const fileList: string[] = [];
      console.log('[RESTORE] Reading tar contents...');
      await tar.t({
        file: tarFilePath,
        onentry: (entry) => {
          console.log(`[RESTORE] Found in archive: ${entry.path}`);
          fileList.push(entry.path);
        }
      });
      console.log(`[RESTORE] Total files in archive: ${fileList.length}`);
      
      // Extract tar file to project root, replacing existing files
      console.log('[RESTORE] Beginning extraction...');
      await tar.x({
        file: tarFilePath,
        cwd: projectRoot,
        strip: 0,
        onentry: (entry) => {
          console.log(`[RESTORE] Extracting: ${entry.path}`);
        }
      });

      console.log('[RESTORE] Extraction complete! Files have been replaced.');

      // Clean up the temporary tar file
      console.log('[RESTORE] Cleaning up temp file...');
      fs.unlinkSync(tarFilePath);

      console.log('[RESTORE] Sending success response to client');
      res.status(200).json({ 
        message: 'Backup restored successfully. Files have been extracted and replaced. Server will restart.',
        filename: req.file.originalname,
        filesExtracted: fileList.length
      });

      // Force server restart to load new files - give it more time
      setTimeout(() => {
        console.log('[RESTORE] Forcing server restart to load new files...');
        process.exit(0);
      }, 2000);
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tarFilePath)) {
        fs.unlinkSync(tarFilePath);
      }
      
      console.error('[RESTORE] ERROR during extraction:', error);
      res.status(500).json({ 
        error: 'Failed to extract backup file',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

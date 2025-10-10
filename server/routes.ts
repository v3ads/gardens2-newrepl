
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
      console.log(`Extracting ${req.file.originalname} to ${projectRoot}`);
      
      // Extract tar file to project root, replacing existing files
      await tar.x({
        file: tarFilePath,
        cwd: projectRoot,
        strip: 0, // Adjust this if your tar has a parent directory
      });

      console.log('Extraction complete');

      // Clean up the temporary tar file
      fs.unlinkSync(tarFilePath);

      console.log('Sending success response');
      res.status(200).json({ 
        message: 'Backup restored successfully. Files have been extracted and replaced.',
        filename: req.file.originalname 
      });
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tarFilePath)) {
        fs.unlinkSync(tarFilePath);
      }
      
      console.error('Error extracting tar file:', error);
      res.status(500).json({ 
        error: 'Failed to extract backup file',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

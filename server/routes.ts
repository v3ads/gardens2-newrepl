import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from 'multer';

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  const upload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, './uploads/'); // Specify the upload directory
      },
      filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Append timestamp to filename
      }
    }),
    fileFilter: function (req, file, cb) {
      // Accept tar files with various compression formats
      if (!file.originalname.match(/\.(tar|tar\.gz|tgz|tar\.bz2)$/i)) {
        return cb(new Error('Only .tar, .tar.gz, .tgz, or .tar.bz2 files are allowed!'));
      }
      cb(undefined, true);
    }
  });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    res.status(200).send(`File uploaded successfully: ${req.file.filename}`);
  });


  const httpServer = createServer(app);

  return httpServer;
}
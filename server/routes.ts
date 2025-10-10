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
      // Accept only tar files
      if (!file.originalname.match(/\.(tar)$/)) {
        return cb(new Error('Only .tar files are allowed!'));
      }
      cb(undefined, true);
    }
  });

  app.post('/api/upload', upload.single('tarFile'), (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    res.status(200).send(`File uploaded successfully: ${req.file.filename}`);
  });


  const httpServer = createServer(app);

  return httpServer;
}
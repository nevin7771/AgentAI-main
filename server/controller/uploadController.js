import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url"; // Required for __dirname in ESM

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure the temporary upload directory exists
const UPLOAD_DIR = path.join(__dirname, "..", "..", "tmp", "user_logs");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer configuration for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const sessionId = req.body.sessionId || "general";
    const userUploadPath = path.join(UPLOAD_DIR, sessionId);
    if (!fs.existsSync(userUploadPath)) {
      fs.mkdirSync(userUploadPath, { recursive: true });
    }
    cb(null, userUploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  },
});

// File filter for validation
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "text/plain" || file.originalname.endsWith(".log")) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only .log and .txt files are allowed."),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB limit
  },
  fileFilter: fileFilter,
});

router.post(
  "/log",
  upload.single("logFile"),
  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No file uploaded or file rejected by filter." });
    }
    const filePath = req.file.path;
    res.status(200).json({
      message: "Log file uploaded successfully.",
      filePath: filePath,
      fileName: req.file.filename,
    });
  },
  (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    }
    if (error) {
      return res.status(400).json({ message: error.message });
    }
    next();
  }
);

export default router;

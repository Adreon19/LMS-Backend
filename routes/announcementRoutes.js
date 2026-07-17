import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Konfigurasi Folder Storage VPS ---
const uploadDir = "public/uploads/announcements";

// Cek jika folder belum ada, buat otomatis
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate nama file unik: announcement-timestamp-random.jpg
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "announcement-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Batasan file 2MB
  fileFilter: (req, file, cb) => {
    // Validasi tipe file
    const fileTypes = /jpeg|jpg|png|webp/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Hanya file gambar (jpg, png, webp) yang diperbolehkan!"));
    }
  },
});

/* ============================================
   POST Create Announcement
   Endpoint: POST /api/announcements
============================================ */
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    const { title, content, category, target_type, target_id } = req.body;
    const author_id = req.users.id; // Diambil dari middleware verifyToken

    // Ambil path file jika ada gambar yang diupload
    const imagePath = req.file
      ? `/uploads/announcements/${req.file.filename}`
      : null;

    const query = `
      INSERT INTO announcements 
      (title, content, category, target_type, target_id, image_url, author_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      title,
      content,
      category || "general",
      target_type,
      target_type === "class" ? target_id : null,
      imagePath,
      author_id,
    ];

    const { rows } = await pool.query(query, values);

    res.status(201).json({
      message: "Announcement successfully published!",
      announcement: rows[0],
    });
  } catch (err) {
    console.error("ERROR POST ANNOUNCEMENT:", err);
    res.status(500).json({ error: "Server error: Gagal membuat pengumuman" });
  }
});

/* ============================================
   GET All Announcements (Untuk Dashboard)
============================================ */
router.get("/", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, u.username as author_name 
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.id
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
   GET Single Announcement
   Endpoint: GET /api/announcements/:id
============================================ */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
      SELECT a.*, u.username as author_name
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.id = $1
    `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    res.json({ announcement: rows[0] });
  } catch (err) {
    console.error("ERROR GET ANNOUNCEMENT:", err);
    res.status(500).json({ error: "Server error: Gagal mengambil pengumuman" });
  }
});

/* ============================================
   PUT Update Announcement
   Endpoint: PUT /api/announcements/:id
============================================ */
router.put("/:id", verifyToken, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, target_type, target_id } = req.body;

    // 1. Cek data lama untuk hapus foto lama jika ada upload baru
    const oldData = await pool.query(
      "SELECT image_url FROM announcements WHERE id = $1",
      [id],
    );
    if (oldData.rows.length === 0)
      return res.status(404).json({ error: "Not found" });

    let imagePath = oldData.rows[0].image_url;

    // 2. Jika ada file baru, hapus yang lama dan pakai yang baru
    if (req.file) {
      if (imagePath) {
        const oldFilePath = path.join("public", imagePath);
        if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
      }
      imagePath = `/uploads/announcements/${req.file.filename}`;
    }

    const query = `
      UPDATE announcements 
      SET title = $1, content = $2, category = $3, target_type = $4, target_id = $5, image_url = $6
      WHERE id = $7 RETURNING *
    `;
    const values = [
      title,
      content,
      category,
      target_type,
      target_id,
      imagePath,
      id,
    ];
    const { rows } = await pool.query(query, values);

    res.json({ message: "Announcement updated!", announcement: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal update data" });
  }
});

/* ============================================
   DELETE Announcement
   Endpoint: DELETE /api/announcements/:id
============================================ */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Ambil info gambar dulu
    const { rows } = await pool.query(
      "SELECT image_url FROM announcements WHERE id = $1",
      [id],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Data tidak ditemukan" });

    // 2. Hapus file fisik jika ada
    if (rows[0].image_url) {
      const filePath = path.join("public", rows[0].image_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // 3. Hapus dari DB
    await pool.query("DELETE FROM announcements WHERE id = $1", [id]);
    res.json({ message: "Announcement deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus data" });
  }
});

export default router;

// routes/jawabanSiswaRoutes.js
import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { safeUnlink } from "../utils/safeFile.js";

const router = express.Router();

const UPLOAD_ROOT = "/var/www/uploads";
const uploadDir = path.join(UPLOAD_ROOT, "jawaban_siswa_file");

/* =========================
   PASTIKAN FOLDER ADA
========================= */
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

/* =========================
   UPLOAD FILE JAWABAN (DB)
========================= */
router.post(
  "/upload-multiple",
  verifyToken,
  upload.array("files"),
  async (req, res) => {
    try {
      const { soal_id, bank_soal_id, materi_id } = req.body;
      const userId = req.users.id;

      if (!req.files?.length) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const saved = [];

      for (const file of req.files) {
        const relativePath = `/uploads/jawaban_siswa_file/${file.filename}`;

        const result = await pool.query(
          `
                    INSERT INTO jawaban_siswa
                        (user_id, soal_id, bank_soal_id, materi_id,
                         file_jawaban_siswa, file_mime, file_name, file_size, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
                    ON CONFLICT (user_id, soal_id, bank_soal_id)
                    DO UPDATE SET
                        file_jawaban_siswa = EXCLUDED.file_jawaban_siswa,
                        file_mime = EXCLUDED.file_mime,
                        file_name = EXCLUDED.file_name,
                        file_size = EXCLUDED.file_size,
                        created_at = NOW()
                    RETURNING *
                    `,
          [
            userId,
            soal_id || null,
            bank_soal_id,
            materi_id || null,
            relativePath,
            file.mimetype,
            file.originalname,
            file.size,
          ],
        );

        saved.push(result.rows[0]);
      }

      res.json({
        message: "Upload jawaban siswa berhasil",
        files: saved.map((r) => ({
          id: r.id,
          nama_file: r.file_name,
          mime: r.file_mime,
          url: `${req.protocol}://${req.get("host")}${r.file_jawaban_siswa}`,
          created_at: r.created_at,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.users.id;

    // 🔥 FIX: terima array atau object
    const jawabanList = Array.isArray(req.body) ? req.body : req.body.jawaban;

    if (!Array.isArray(jawabanList) || jawabanList.length === 0) {
      return res.status(400).json({
        message: "Jawaban harus berupa array dan tidak boleh kosong",
      });
    }

    const inserted = [];

    for (const j of jawabanList) {
      if (!j.soal_id || !j.bank_soal_id) continue;

      const result = await pool.query(
        `
                INSERT INTO jawaban_siswa
                    (user_id, soal_id, bank_soal_id, jawaban,
                     jawaban_essai, refleksi_siswa, materi_id, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                ON CONFLICT (user_id, soal_id, bank_soal_id)
                DO UPDATE SET
                    jawaban = EXCLUDED.jawaban,
                    jawaban_essai = EXCLUDED.jawaban_essai,
                    refleksi_siswa = EXCLUDED.refleksi_siswa,
                    materi_id = EXCLUDED.materi_id,
                    created_at = NOW()
                RETURNING *
                `,
        [
          userId,
          j.soal_id,
          j.bank_soal_id,
          j.jawaban || null,
          j.jawaban_essai || null,
          j.refleksi_siswa || null,
          j.materi_id || null,
        ],
      );

      inserted.push(result.rows[0]);
    }

    res.json({
      message: "Jawaban berhasil disimpan",
      data: inserted,
    });
  } catch (err) {
    console.error("Error simpan jawaban:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   GET JAWABAN SISWA (LOGIN)
========================= */
router.get("/", verifyToken, async (req, res) => {
  const userId = req.users.id;

  const result = await pool.query(
    `
        SELECT
            id,
            soal_id,
            bank_soal_id,
            jawaban,
            jawaban_essai,
            refleksi_siswa,
            nilai,
            file_jawaban_siswa,
            file_name,
            file_mime,
            created_at
        FROM jawaban_siswa
        WHERE user_id = $1
    `,
    [userId],
  );

  res.json(
    result.rows.map((r) => ({
      ...r,
      file_url: r.file_jawaban_siswa
        ? `${req.protocol}://${req.get("host")}${r.file_jawaban_siswa}`
        : null,
    })),
  );
});

/* =========================
   GET SEMUA JAWABAN (GURU)
========================= */
router.get("/all", verifyToken, async (req, res) => {
  try {
    const { bank_soal_id } = req.query;

    if (!bank_soal_id) {
      return res.status(400).json({ message: "bank_soal_id required" });
    }

    const result = await pool.query(
      `
            SELECT js.*, u.username, u.photo_url
            FROM jawaban_siswa js
            JOIN users u ON u.id = js.user_id
            WHERE js.bank_soal_id = $1
            `,
      [bank_soal_id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetch jawaban all:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   UPDATE NILAI
========================= */
router.put("/nilai", verifyToken, async (req, res) => {
  try {
    const { user_id, bank_soal_id, nilai } = req.body;

    if (!user_id || !bank_soal_id || nilai === undefined) {
      return res.status(400).json({
        message: "user_id, bank_soal_id, nilai required",
      });
    }

    const result = await pool.query(
      `
            UPDATE jawaban_siswa
            SET nilai = $1
            WHERE user_id = $2 AND bank_soal_id = $3
            RETURNING *
            `,
      [nilai, user_id, bank_soal_id],
    );

    res.json({
      message: "Score updated sucessfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error update nilai:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   GET JAWABAN + SOAL
========================= */
router.get("/by-bank-soal/:bank_soal_id", verifyToken, async (req, res) => {
  const bankSoalId = Number(req.params.bank_soal_id);

  const result = await pool.query(
    `
    SELECT
      js.id AS jawaban_id,
      js.user_id,
      u.username,
      js.soal_id,
      js.jawaban,
      js.jawaban_essai,
      js.refleksi_siswa,
      js.nilai,
      js.file_jawaban_siswa,
      js.file_name,
      js.file_mime,
      js.created_at,

      sp.pertanyaan,
      sp.pg_a, sp.pg_b, sp.pg_c, sp.pg_d, sp.pg_e,
      sp.kunci_jawaban,
      sp.pertanyaan_essai
    FROM jawaban_siswa js
    JOIN users u ON u.id = js.user_id
    LEFT JOIN soal_pilgan sp ON js.soal_id = sp.id
    WHERE js.bank_soal_id = $1
    ORDER BY u.username, js.created_at
  `,
    [bankSoalId],
  );

  res.json(
    result.rows.map((r) => ({
      ...r,
      tipe: r.file_jawaban_siswa
        ? "file"
        : r.refleksi_siswa
        ? "refleksi"
        : r.jawaban_essai
        ? "essay"
        : r.jawaban
        ? "pilgan"
        : "unknown",
      file_url: r.file_jawaban_siswa
        ? `${req.protocol}://${req.get("host")}${r.file_jawaban_siswa}`
        : null,
    })),
  );
});

/* =========================
   REVIEW JAWABAN SISWA
========================= */
router.get("/review/:bank_soal_id", verifyToken, async (req, res) => {
  const { bank_soal_id } = req.params;
  const userId = req.users.id;

  const result = await pool.query(
    `
        SELECT
            sp.id AS soal_id,
            sp.pertanyaan,
            sp.pg_a,
            sp.pg_b,
            sp.pg_c,
            sp.pg_d,
            sp.pg_e,
            sp.kunci_jawaban,
            js.jawaban AS jawaban_siswa,
            js.jawaban_essai,
            js.refleksi_siswa
        FROM soal_pilgan sp
        LEFT JOIN jawaban_siswa js
            ON js.soal_id = sp.id
           AND js.user_id = $1
        WHERE sp.bank_soal_id = $2
        `,
    [userId, bank_soal_id],
  );

  res.json(result.rows);
});

/* =========================
   FILE BY BANK SOAL
========================= */
router.get(
  "/files-by-bank-siswa/:bank_soal_id",
  verifyToken,
  async (req, res) => {
    const { bank_soal_id } = req.params;
    const userId = req.users.id;

    const result = await pool.query(
      `
        SELECT id, file_name, file_mime, file_jawaban_siswa, created_at
        FROM jawaban_siswa
        WHERE bank_soal_id = $1
          AND user_id = $2
          AND file_jawaban_siswa IS NOT NULL
        ORDER BY created_at DESC
    `,
      [bank_soal_id, userId],
    );

    res.json(
      result.rows.map((r) => ({
        id: r.id,
        file_name: r.file_name,
        file_mime: r.file_mime,
        url: `${req.protocol}://${req.get("host")}${r.file_jawaban_siswa}`,
        created_at: r.created_at,
      })),
    );
  },
);

// GET FILE JAWABAN PER SOAL
router.get(
  "/files-by-soal/:bank_soal_id/:soal_id",
  verifyToken,
  async (req, res) => {
    const { bank_soal_id, soal_id } = req.params;
    const userId = req.users.id;

    const result = await pool.query(
      `
      SELECT id, soal_id, file_name, file_mime, created_at
      FROM jawaban_siswa
      WHERE bank_soal_id = $1
        AND soal_id = $2
        AND user_id = $3
        AND file_jawaban_siswa IS NOT NULL
      ORDER BY created_at DESC
      `,
      [bank_soal_id, soal_id, userId],
    );

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        soal_id: row.soal_id,
        nama_file: row.file_name,
        mime: row.file_mime,
        url: `${req.protocol}://${req.get("host")}/api/jawaban-siswa/download/${
          row.id
        }`,
        created_at: row.created_at,
      })),
    );
  },
);

/* =========================
   DELETE FILE JAWABAN SISWA
========================= */
router.delete("/file/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.users.id;

  const result = await pool.query(
    `
        DELETE FROM jawaban_siswa
        WHERE id = $1 AND user_id = $2
        RETURNING file_jawaban_siswa
        `,
    [id, userId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: "Not found" });
  }

  const relativePath = result.rows[0].file_jawaban_siswa;
  if (relativePath) {
    const absolutePath = path.join("/var/www", relativePath);
    await safeUnlink(absolutePath);
  }

  res.json({ message: "File deleted successfully" });
});

/* =========================
   UPDATE FILE JAWABAN SISWA
========================= */
router.put(
  "/file/:id",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.users.id;

      if (!req.file) {
        return res.status(400).json({ message: "File is required" });
      }

      /* 🔴 AMBIL FILE LAMA (INI YANG KAMU TANYA) */
      const old = await pool.query(
        `SELECT file_jawaban_siswa FROM jawaban_siswa WHERE id=$1 AND user_id=$2`,
        [id, userId],
      );

      if (!old.rowCount) {
        return res.status(404).json({ message: "Not found" });
      }

      const oldPath = old.rows[0].file_jawaban_siswa
        ? path.join("/var/www", old.rows[0].file_jawaban_siswa)
        : null;

      const relativePath = `/uploads/jawaban_siswa_file/${req.file.filename}`;

      const result = await pool.query(
        `
                UPDATE jawaban_siswa SET
                    file_jawaban_siswa = $1,
                    file_mime = $2,
                    file_name = $3,
                    file_size = $4,
                    created_at = NOW()
                WHERE id = $5 AND user_id = $6
                RETURNING *
                `,
        [
          relativePath,
          req.file.mimetype,
          req.file.originalname,
          req.file.size,
          id,
          userId,
        ],
      );

      /* 🟢 HAPUS FILE LAMA SETELAH UPDATE SUKSES */
      if (oldPath) {
        await safeUnlink(oldPath);
      }

      const row = result.rows[0];

      res.json({
        message: "File updated successfully",
        file: {
          id: row.id,
          file_name: row.file_name,
          file_mime: row.file_mime,
          url: `${req.protocol}://${req.get("host")}${row.file_jawaban_siswa}`,
          created_at: row.created_at,
        },
      });
    } catch (err) {
      console.error("Update file error:", err);
      res.status(500).json({ message: err.message });
    }
  },
);
/* =========================
   DOWNLOAD FILE JAWABAN SISWA
========================= */
router.get(
  "/files-by-bank-guru/:bank_soal_id",
  verifyToken,
  async (req, res) => {
    const { bank_soal_id } = req.params;

    const result = await pool.query(
      `
        SELECT id, user_id, file_name, file_mime, file_jawaban_siswa, created_at
        FROM jawaban_siswa
        WHERE bank_soal_id = $1
          AND file_jawaban_siswa IS NOT NULL
        ORDER BY created_at DESC
    `,
      [bank_soal_id],
    );

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        file_name: row.file_name,
        file_mime: row.file_mime,
        url: `${req.protocol}://${req.get("host")}${row.file_jawaban_siswa}`, // 🔥 STATIC
        created_at: row.created_at,
      })),
    );
  },
);

export default router;

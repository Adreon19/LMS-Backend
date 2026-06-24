import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const router = express.Router();
const BASE_UPLOAD_DIR = "/var/www/uploads";
const MATERI_DIR = path.join(BASE_UPLOAD_DIR, "materi");
const SOAL_DIR = path.join(BASE_UPLOAD_DIR, "soal");

[MATERI_DIR, SOAL_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "file") {
      cb(null, MATERI_DIR);
    } else {
      cb(null, SOAL_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const uploadUnified = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const uploadMateriPDF = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF allowed"));
    }
    cb(null, true);
  },
});

/* ================= GET MODULE (GURU) ================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    const guruId = req.users.id;
    const { rows } = await pool.query(
      `SELECT mp.*, 
              CONCAT(gl.grade_lvl,' ',nr.number,' - ',dm.nama_mapel) AS kelas_nama
       FROM module_pembelajaran mp
       LEFT JOIN kelas k ON k.id = mp.kelas_id
       LEFT JOIN rombel r ON k.rombel_id = r.id
       LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
       LEFT JOIN grade_level gl ON r.grade_id = gl.id
       LEFT JOIN db_mapel dm ON k.id_mapel = dm.id
       WHERE mp.guru_id = $1
       ORDER BY mp.created_at DESC`,
      [guruId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "failed to retrieve module" });
  }
});

/* ================= GET MODULE (Admin) ================= */
router.get("/admin/:id", verifyToken, async (req, res) => {
  try {
    const guruId = req.params.id;
    const result = await pool.query(
      `SELECT mp.*, 
              CONCAT(gl.grade_lvl,' ',nr.number,' - ',dm.nama_mapel) AS kelas_nama
       FROM module_pembelajaran mp
       LEFT JOIN kelas k ON k.id = mp.kelas_id
       LEFT JOIN rombel r ON k.rombel_id = r.id
       LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
       LEFT JOIN grade_level gl ON r.grade_id = gl.id
       LEFT JOIN db_mapel dm ON k.id_mapel = dm.id
       WHERE mp.guru_id = $1
       ORDER BY mp.created_at DESC`,
      [guruId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "failed to retrieve module" });
  }
});

/* ================= GET BY ID ================= */
router.get("/by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, judul, video_url, deskripsi, guru_id, bank_soal_id,
              judul_penugasan, link_zoom, kelas_id, pass_code, created_at, file_url
       FROM module_pembelajaran
       WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Material not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("SELECT /module-pembelajaran/by-id/:id", error);
    res.status(500).json({ message: "Failed to retrieve material by ID" });
  }
});

/* ================= GET SISWA PER KELAS ================= */
router.get("/siswa/:userId/kelas/:kelasId", verifyToken, async (req, res) => {
  const { userId, kelasId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT
          mp.id, mp.judul, mp.video_url, mp.deskripsi,
          mp.judul_penugasan, mp.bank_soal_id, mp.created_at,
          p.langkah_aktif, p.pdf_selesai, p.video_selesai, p.status_selesai,
          u.photo_url AS guru_foto
       FROM module_pembelajaran mp
       LEFT JOIN progress_materi p ON p.materi_id = mp.id AND p.user_id = $1
       LEFT JOIN users u ON u.id = mp.guru_id
       WHERE mp.kelas_id = $2
       ORDER BY mp.created_at DESC`,
      [userId, kelasId],
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetch materi siswa per kelas:", err);
    res.status(500).json({ message: "Failed fetch materi" });
  }
});

/* ================= GET SISWA ALL ================= */
router.get("/siswa/:userId", verifyToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `SELECT DISTINCT
          mp.id, mp.materi_uuid, mp.judul, mp.video_url, mp.deskripsi,
          mp.judul_penugasan, mp.link_zoom, mp.bank_soal_id, mp.kelas_id,
          mp.guru_id, mp.created_at, p.pdf_selesai, p.video_selesai,
          dm.nama_mapel, u.photo_url AS guru_foto, gl.grade_lvl, nr.number
       FROM module_pembelajaran mp
       JOIN kelas_diikuti ks ON ks.kelas_id = mp.kelas_id AND ks.user_id = $1
       LEFT JOIN progress_materi p ON p.materi_id = mp.id AND p.user_id = $1
       JOIN users u ON u.id = mp.guru_id
       LEFT JOIN kelas k ON k.id = mp.kelas_id
       LEFT JOIN db_mapel dm ON dm.id = k.id_mapel
       LEFT JOIN rombel r ON k.rombel_id = r.id
       LEFT JOIN grade_level gl ON r.grade_id = gl.id
       LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
       ORDER BY mp.created_at DESC`,
      [userId],
    );
    const rows = result.rows.map((row) => ({
      ...row,
      rombel: {
        type: "regular",
        grade_lvl: row.grade_lvl,
        name_rombel: row.number,
      },
    }));
    res.json(rows);
  } catch (err) {
    console.error("Error fetch materi siswa:", err);
    res.status(500).json({ message: "Failed fetch materi siswa" });
  }
});

/* ================= GET HISTORY ================= */
router.get("/kelas/:kelasId/history", verifyToken, async (req, res) => {
  try {
    const { kelasId } = req.params;
    const userId = req.users.id;
    const { rows } = await pool.query(
      `SELECT m.*, p.refleksi,
              COALESCE(p.status_selesai, false) AS status_selesai,
              p.updated_at AS selesai_at
       FROM module_pembelajaran m
       LEFT JOIN progress_materi p ON p.materi_id = m.id AND p.user_id = $2
       WHERE m.kelas_id = $1 AND p.status_selesai = true
       ORDER BY p.updated_at DESC`,
      [kelasId, userId],
    );
    res.json(rows);
  } catch (err) {
    console.error("GET HISTORY ERROR:", err);
    res.status(500).json({ message: "Failed to retrieve history material" });
  }
});

/* ================= GET KELAS (GURU) ================= */
router.get("/kelas/:kelasId", verifyToken, async (req, res) => {
  try {
    const { kelasId } = req.params;
    const userId = req.users.id;
    const result = await pool.query(
      `SELECT
          m.id, m.judul, m.video_url, m.deskripsi, m.guru_id,
          m.bank_soal_id, m.judul_penugasan, m.link_zoom, m.kelas_id,
          m.pass_code, m.created_at, jm.status_selesai,
          u.photo_url AS guru_foto
       FROM module_pembelajaran m
       LEFT JOIN progress_materi jm ON jm.materi_id = m.id AND jm.user_id = $2
       LEFT JOIN users u ON u.id = m.guru_id
       WHERE m.kelas_id = $1 AND m.guru_id = $2
       ORDER BY m.created_at DESC`,
      [kelasId, userId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET /module-pembelajaran/kelas/:kelasId", error);
    res.status(500).json({ message: "Failed retrieve Module by id" });
  }
});

/* ================= GET PARENT VIEW ================= */
router.get("/parent/kelas/:kelasId", verifyToken, async (req, res) => {
  try {
    const { kelasId } = req.params;
    const { rows } = await pool.query(
      `SELECT
          m.id, m.judul, m.deskripsi, m.video_url,
          m.bank_soal_id, m.judul_penugasan, m.link_zoom, m.created_at,
          u.photo_url AS guru_foto
       FROM module_pembelajaran m
       LEFT JOIN users u ON u.id = m.guru_id
       WHERE m.kelas_id = $1
       ORDER BY m.created_at DESC`,
      [kelasId],
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /parent/kelas/:kelasId ERROR:", err);
    res.status(500).json({ message: "Failed to retrieve modules" });
  }
});

/* ================= GET PDF ================= */
router.get("/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT file_url FROM module_pembelajaran WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0 || !result.rows[0].file_url) {
      return res.status(404).json({ message: "PDF not found" });
    }
    const filePath = path.join("/var/www", result.rows[0].file_url);
    res.sendFile(filePath);
  } catch (err) {
    console.error("PDF VIEW ERROR:", err);
    res.status(500).json({ message: "Failed to load PDF" });
  }
});

/* ================= POST MODULE + SOAL (UNIFIED) ================= */
router.post("/", verifyToken, uploadUnified.any(), async (req, res) => {
  const client = await pool.connect();
  try {
    const bodyData = JSON.parse(req.body.data);
    const {
      judul,
      video_url,
      deskripsi,
      judul_penugasan,
      link_zoom,
      pass_code,
      kelas_ids,
      soal_list,
    } = bodyData;

    const materiFile = req.files.find((f) => f.fieldname === "file");
    if (!materiFile) {
      return res.status(400).json({ message: "PDF materi wajib diunggah" });
    }

    const guru_id = req.users.id;
    const file_url = `/uploads/materi/${materiFile.filename}`;
    const materi_uuid = uuidv4();

    await client.query("BEGIN");

    let newBankSoalId = null;
    if (soal_list && soal_list.length > 0) {
      const bankSoalRes = await client.query(
        `INSERT INTO bank_soal (judul_penugasan, guru_id) VALUES ($1, $2) RETURNING id`,
        [judul_penugasan || `Tugas: ${judul}`, guru_id],
      );
      newBankSoalId = bankSoalRes.rows[0].id;

      for (let i = 0; i < soal_list.length; i++) {
        const pgImage = req.files.find((f) => f.fieldname === `pg_image_${i}`);
        const essaiImage = req.files.find(
          (f) => f.fieldname === `essai_image_${i}`,
        );
        await client.query(
          `INSERT INTO soal_pilgan (
              pertanyaan, pg_a, pg_b, pg_c, pg_d, pg_e,
              kunci_jawaban, gambar, pertanyaan_essai, gambar_soal_essai, bank_soal_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            soal_list[i].pertanyaan || null,
            soal_list[i].pg_a || null,
            soal_list[i].pg_b || null,
            soal_list[i].pg_c || null,
            soal_list[i].pg_d || null,
            soal_list[i].pg_e || null,
            soal_list[i].kunci_jawaban || null,
            pgImage ? `/uploads/soal/${pgImage.filename}` : null,
            soal_list[i].pertanyaan_essai || null,
            essaiImage ? `/uploads/soal/${essaiImage.filename}` : null,
            newBankSoalId,
          ],
        );
      }
    }

    for (const kelasId of kelas_ids) {
      await client.query(
        `INSERT INTO module_pembelajaran
         (materi_uuid, judul, video_url, deskripsi, guru_id,
          bank_soal_id, judul_penugasan, link_zoom, kelas_id, pass_code, file_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          materi_uuid,
          judul,
          video_url,
          deskripsi,
          guru_id,
          newBankSoalId,
          judul_penugasan || (newBankSoalId ? `Tugas: ${judul}` : null),
          link_zoom,
          kelasId,
          pass_code,
          file_url,
        ],
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Materi dan Tugas berhasil dibuat" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("UNIFIED POST ERROR:", err);
    res.status(500).json({ message: "Gagal menyimpan: " + err.message });
  } finally {
    client.release();
  }
});

/* ================= UPDATE KELAS ================= */
router.put("/:id/kelas", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { kelas_ids } = req.body;

  const { rows } = await pool.query(
    "SELECT materi_uuid FROM module_pembelajaran WHERE id=$1",
    [id],
  );
  if (!rows.length) {
    return res.status(404).json({ message: "Material not found" });
  }

  const materi_uuid = rows[0].materi_uuid;
  const existing = await pool.query(
    "SELECT kelas_id FROM module_pembelajaran WHERE materi_uuid=$1",
    [materi_uuid],
  );

  const oldSet = new Set(existing.rows.map((r) => r.kelas_id));
  const newSet = new Set(kelas_ids);
  const toDelete = [...oldSet].filter((x) => !newSet.has(x));
  const toInsert = [...newSet].filter((x) => !oldSet.has(x));

  await pool.query("BEGIN");
  try {
    if (toDelete.length) {
      await pool.query(
        `DELETE FROM module_pembelajaran WHERE materi_uuid=$1 AND kelas_id = ANY($2)`,
        [materi_uuid, toDelete],
      );
    }
    if (toInsert.length) {
      const template = await pool.query(
        `SELECT * FROM module_pembelajaran WHERE id=$1`,
        [id],
      );
      const m = template.rows[0];
      for (const kelasId of toInsert) {
        await pool.query(
          `INSERT INTO module_pembelajaran
           (materi_uuid, judul, video_url, deskripsi, guru_id,
            bank_soal_id, judul_penugasan, link_zoom, kelas_id, pass_code, file_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            m.materi_uuid,
            m.judul,
            m.video_url,
            m.deskripsi,
            m.guru_id,
            m.bank_soal_id,
            m.judul_penugasan,
            m.link_zoom,
            kelasId,
            m.pass_code,
            m.file_url,
          ],
        );
      }
    }
    await pool.query("COMMIT");
    res.json({ message: "Class updated" });
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
});

/* ================= UPDATE PDF ================= */
router.put(
  "/:id/pdf",
  verifyToken,
  uploadMateriPDF.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ message: "PDF file required" });
      }
      const materiRes = await pool.query(
        `SELECT materi_uuid, file_url FROM module_pembelajaran WHERE id = $1`,
        [id],
      );
      if (!materiRes.rows.length) {
        return res.status(404).json({ message: "Material not found" });
      }
      const { materi_uuid, file_url: oldFile } = materiRes.rows[0];
      const newFile = `/uploads/materi/${req.file.filename}`;
      await pool.query(
        `UPDATE module_pembelajaran SET file_url = $1 WHERE materi_uuid = $2`,
        [newFile, materi_uuid],
      );
      const check = await pool.query(
        `SELECT COUNT(*) FROM module_pembelajaran WHERE file_url = $1`,
        [oldFile],
      );
      if (check.rows[0].count === "0") {
        fs.unlink(path.join("/var/www", oldFile), (err) => {
          if (err) console.warn("Old file not deleted:", err.message);
        });
      }
      res.json({
        message: "PDF updated for all classes safely",
        file_url: newFile,
      });
    } catch (err) {
      console.error("PDF UPDATE ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  },
);

/* ================= FAST UPDATE (NO FILE) ================= */
router.put("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { judul, video_url, deskripsi, link_zoom, pass_code, bank_soal_id } =
    req.body;
  const { rowCount } = await pool.query(
    `UPDATE module_pembelajaran
     SET judul=$1, video_url=$2, deskripsi=$3, link_zoom=$4, pass_code=$5, bank_soal_id=$6
     WHERE id=$7`,
    [judul, video_url, deskripsi, link_zoom, pass_code, bank_soal_id, id],
  );
  if (!rowCount) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Updated" });
});

/* ================= DELETE BY UUID ================= */
router.delete("/uuid/:materiUuid", verifyToken, async (req, res) => {
  try {
    const { materiUuid } = req.params;
    const guruId = req.users.id;
    const result = await pool.query(
      `DELETE FROM module_pembelajaran WHERE materi_uuid = $1 AND guru_id = $2`,
      [materiUuid, guruId],
    );
    res.json({
      message: "Material successfully removed from all classes",
      deleted: result.rowCount,
    });
  } catch (error) {
    console.error("DELETE BY UUID ERROR:", error);
    res.status(500).json({ message: "Failed to delete material" });
  }
});

/* ================= DELETE BY ID ================= */
router.delete("/:id", verifyToken, async (req, res) => {
  await pool.query("DELETE FROM module_pembelajaran WHERE id=$1", [
    req.params.id,
  ]);
  res.json({ message: "Deleted" });
});

export default router;

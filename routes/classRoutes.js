import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ============================================
   GET All Kelas (Public/General View)
   Digunakan untuk Parent/Admin melihat semua kelas
============================================ */
router.get("/all/list", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
          k.id,
          k.link_wallpaper_kelas,
          k.kode_kelas,
          nr.number AS name_rombel,
          gl.grade_lvl,
          m.nama_mapel,
          u.username AS guru_name,
          u.photo_url AS guru_photo
      FROM kelas k
      LEFT JOIN rombel r ON k.rombel_id = r.id
      LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
      LEFT JOIN grade_level gl ON r.grade_id = gl.id
      LEFT JOIN db_mapel m ON k.id_mapel = m.id
      LEFT JOIN users u ON k.guru_id = u.id
      ORDER BY gl.grade_lvl ASC, nr.number ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("ERROR GET ALL LIST KELAS:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
   GET Single kelas + modules (VERSI FIX SD)
============================================ */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `         
        SELECT
            k.id AS kelas_id,
            k.link_wallpaper_kelas,
            k.kode_kelas,
            m.nama_mapel,
            gl.grade_lvl,
            nr.number AS name_rombel,
            u.username AS guru_name,
            u.photo_url AS guru_photo,
            (
                SELECT COUNT(*)
                FROM kelas_diikuti kd
                WHERE kd.kelas_id = k.id
            ) AS student_count,
            mp.id AS module_id,
            mp.judul,
            mp.deskripsi,
            mp.video_url,
            mp.file_url,
            mp.created_at,
            mp.bank_soal_id
        FROM kelas k
        LEFT JOIN rombel r ON k.rombel_id = r.id
        LEFT JOIN grade_level gl ON r.grade_id = gl.id
        LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
        LEFT JOIN db_mapel m ON k.id_mapel = m.id
        LEFT JOIN users u ON k.guru_id = u.id
        LEFT JOIN module_pembelajaran mp ON mp.kelas_id = k.id
        WHERE k.id = $1
        ORDER BY mp.created_at DESC`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Class not found" });
    }

    const base = rows[0];

    res.json({
      kelas_id: base.kelas_id,
      nama_mapel: base.nama_mapel,
      kode_kelas: base.kode_kelas || "N/A",
      guru_name: base.guru_name,
      guru_photo: base.guru_photo,
      link_wallpaper_kelas: base.link_wallpaper_kelas,
      student_count: Number(base.student_count),
      rombel: {
        grade_lvl: base.grade_lvl ?? null,
        name_rombel: base.name_rombel ?? null,
      },
      modules: rows
        .filter((r) => r.module_id !== null)
        .map((r) => ({
          id: r.module_id,
          judul: r.judul,
          deskripsi: r.deskripsi,
          video_url: r.video_url,
          file_url: r.file_url,
          created_at: r.created_at,
          bank_soal_id: r.bank_soal_id ?? null,
        })),
    });
  } catch (err) {
    console.error("ERROR GET SINGLE KELAS:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
   GET Student Dashboard 
============================================ */
router.get("/student/dashboard", verifyToken, async (req, res) => {
  try {
    const userId = Number(req.users.id);

    // 1. Ambil data profil siswa (Grade & Rombel)
    const userProfileQuery = await pool.query(
      `SELECT u.id, u.rombel_id, r.grade_id 
       FROM users u 
       LEFT JOIN rombel r ON u.rombel_id = r.id 
       WHERE u.id = $1`,
      [userId],
    );

    const { rows } = await pool.query(
      `SELECT k.id, k.link_wallpaper_kelas, k.kode_kelas, m.nama_mapel, 
              u.id AS guru_id, u.username AS guru_name, u.photo_url AS guru_photo, 
              gl.grade_lvl, r.id AS rombel_id, r.grade_id, -- Tambahkan field ini
              nr.number AS name_rombel, (kd.user_id IS NOT NULL) AS sudah_diikuti
       FROM kelas k
       LEFT JOIN db_mapel m ON k.id_mapel = m.id
       LEFT JOIN users u ON k.guru_id = u.id
       LEFT JOIN rombel r ON k.rombel_id = r.id
       LEFT JOIN grade_level gl ON r.grade_id = gl.id
       LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
       LEFT JOIN kelas_diikuti kd ON kd.kelas_id = k.id AND kd.user_id = $1
       ORDER BY k.id DESC`,
      [userId],
    );

    const joined = [];
    const other = [];

    for (const row of rows) {
      const kelas = {
        id: row.id,
        link_wallpaper_kelas: row.link_wallpaper_kelas,
        kode_kelas: row.kode_kelas,
        nama_mapel: row.nama_mapel,
        guru_id: row.guru_id,
        guru_name: row.guru_name,
        guru_photo: row.guru_photo,
        rombel: {
          id: row.rombel_id,
          grade_id: row.grade_id,
          grade_lvl: row.grade_lvl ?? null,
          name_rombel: row.name_rombel ?? null,
        },
        sudah_diikuti: row.sudah_diikuti,
      };
      row.sudah_diikuti ? joined.push(kelas) : other.push(kelas);
    }

    res.json({
      userProfile: userProfileQuery.rows[0],
      joined,
      other,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================
   Check code sebelum bergabung
============================================ */
router.get("/check-code/:kode", verifyToken, async (req, res) => {
  try {
    const { kode } = req.params;
    const userId = req.users.id;

    const { rows } = await pool.query(
      `SELECT 
          k.id AS kelas_id, 
          m.nama_mapel, 
          u_guru.username as guru_name,
          gl_kelas.grade_lvl AS kelas_grade_name,
          nr_kelas.number AS kelas_rombel_name,
          gl_user.grade_lvl AS user_grade_name,
          nr_user.number AS user_rombel_name,
          r_kelas.grade_id AS kelas_grade_id,
          r_kelas.name_rombel AS kelas_rombel_val,
          u_login.grade_id AS user_grade_id,
          u_login.rombel_id AS user_rombel_val
       FROM kelas k 
       JOIN db_mapel m ON k.id_mapel = m.id 
       JOIN users u_guru ON k.guru_id = u_guru.id 
       JOIN rombel r_kelas ON k.rombel_id = r_kelas.id
       JOIN grade_level gl_kelas ON r_kelas.grade_id = gl_kelas.id
       JOIN number_rombel nr_kelas ON r_kelas.name_rombel = nr_kelas.id
       JOIN users u_login ON u_login.id = $2
       -- Ambil info rombel user login untuk pesan error
       LEFT JOIN rombel r_user ON u_login.rombel_id = r_user.id
       LEFT JOIN grade_level gl_user ON u_login.grade_id = gl_user.id
       LEFT JOIN number_rombel nr_user ON u_login.rombel_id = nr_user.id
       WHERE k.kode_kelas = $1`,
      [kode.toUpperCase(), userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Class code not found." });
    }

    const data = rows[0];

    const isGradeMatch = data.kelas_grade_id == data.user_grade_id;
    const isRombelMatch = data.kelas_rombel_val == data.user_rombel_val;

    if (isGradeMatch && isRombelMatch) {
      return res.json(data);
    } else {
      const userClass = `${data.user_grade_name || data.user_grade_id}-${
        data.user_rombel_name || data.user_rombel_val
      }`;
      const targetClass = `${data.kelas_grade_name || data.kelas_grade_id}-${
        data.kelas_rombel_name || data.kelas_rombel_val
      }`;

      return res.status(403).json({
        message: `Your class (${userClass}) does not match the target class (${targetClass})`,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
   GET All kelas (Guru)
============================================ */
router.get("/", verifyToken, async (req, res) => {
  try {
    const guruId = req.users.id;
    const result = await pool.query(
      `
            SELECT 
                k.id,
                k.rombel_id,
                k.id_mapel,
                k.link_wallpaper_kelas,
                k.kode_kelas,
                nr.number AS name_rombel,
                gl.grade_lvl,
                m.nama_mapel,
                u.username AS guru_name,
                u.photo_url AS guru_photo
            FROM kelas k
            LEFT JOIN rombel r ON k.rombel_id = r.id
            LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
            LEFT JOIN grade_level gl ON r.grade_id = gl.id
            LEFT JOIN db_mapel m ON k.id_mapel = m.id
            LEFT JOIN users u ON k.guru_id = u.id
            WHERE k.guru_id = $1
            ORDER BY k.id ASC
        `,
      [guruId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /kelas:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
    GET All Kelas for a specific Guru (Admin View)
   ============================================ */
router.get("/admin/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params; // Ini adalah ID Guru/User

    const { rows } = await pool.query(
      `SELECT 
          k.id,
          k.link_wallpaper_kelas,
          k.kode_kelas,
          nr.number AS name_rombel,
          gl.grade_lvl,
          m.nama_mapel,
          u.username AS guru_name
       FROM kelas k
       LEFT JOIN rombel r ON k.rombel_id = r.id
       LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
       LEFT JOIN grade_level gl ON r.grade_id = gl.id
       LEFT JOIN db_mapel m ON k.id_mapel = m.id
       LEFT JOIN users u ON k.guru_id = u.id
       WHERE k.guru_id = $1
       ORDER BY k.id ASC`,
      [id],
    );

    res.json(rows);
  } catch (err) {
    console.error("ERROR GET ADMIN KELAS:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ROUTE LAIN (FOLLOW, UNFOLLOW, POST, DELETE, PUT) TETAP SAMA SEPERTI SEBELUMNYA

router.post("/follow/:kelasId", verifyToken, async (req, res) => {
  try {
    const userId = req.users.id;
    const kelasId = req.params.kelasId;

    console.log(`User ${userId} mencoba join kelas ${kelasId}`);

    if (!kelasId || kelasId === "undefined") {
      return res.status(400).json({ message: "ID Kelas tidak valid." });
    }

    const check = await pool.query(
      `SELECT id FROM kelas_diikuti WHERE user_id = $1 AND kelas_id = $2`,
      [userId, kelasId],
    );

    if (check.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "Kamu sudah terdaftar di kelas ini." });
    }

    await pool.query(
      `INSERT INTO kelas_diikuti (user_id, kelas_id) VALUES ($1, $2)`,
      [userId, kelasId],
    );

    res.status(201).json({ message: "Berhasil bergabung!" });
  } catch (err) {
    console.error("ERROR FOLLOW KELAS:", err);
    res
      .status(500)
      .json({ message: "Gagal memproses permintaan: " + err.message });
  }
});

router.delete("/unfollow/:kelasId", verifyToken, async (req, res) => {
  try {
    const userId = req.users.id;
    const kelasId = Number(req.params.kelasId);
    await pool.query(
      `DELETE FROM kelas_diikuti WHERE user_id = $1 AND kelas_id = $2`,
      [userId, kelasId],
    );
    res.json({ message: "Unfollow success" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const { rombel_id, link_wallpaper_kelas, id_mapel, kode_kelas } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO kelas (guru_id, link_wallpaper_kelas, rombel_id, id_mapel, kode_kelas) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.users.id,
        link_wallpaper_kelas || "default_wallpaper.jpg",
        rombel_id,
        id_mapel,
        kode_kelas,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
   GET Students by Kelas ID
============================================ */
router.get("/students/:kelasId", verifyToken, async (req, res) => {
  try {
    const { kelasId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT 
        u.id AS user_id, 
        u.username AS name, 
        u.photo_url 
      FROM kelas_diikuti kd
      JOIN users u ON kd.user_id = u.id
      WHERE kd.kelas_id = $1
      ORDER BY u.username ASC
      `,
      [kelasId],
    );

    res.json(rows);
  } catch (err) {
    console.error("ERROR GET STUDENTS BY KELAS:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { link_wallpaper_kelas, rombel_id, id_mapel } = req.body;
    const { rows } = await pool.query(
      `UPDATE kelas SET link_wallpaper_kelas = COALESCE($1, link_wallpaper_kelas), rombel_id = COALESCE($2, rombel_id), id_mapel = COALESCE($3, id_mapel) WHERE id = $4 RETURNING *`,
      [link_wallpaper_kelas, rombel_id, id_mapel, id],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM kelas WHERE id = $1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

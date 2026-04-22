import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =====================================================
   GET ALL BY TEACHER (USER)
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const guruId = req.users.id;

    const result = await pool.query(
      `
      SELECT rr.*,
             rb.name_rombel,
             COALESCE(dm_kelas.nama_mapel, dm_lama.nama_mapel) AS subject,
             u.username AS teacher_name,
             dg.name AS instructor_name,
             g.grade_lvl AS name_grade
      FROM rpk_refleksi rr
      LEFT JOIN kelas k ON k.id = rr.kelas_id
      LEFT JOIN rombel rb ON rb.id = k.rombel_id
      LEFT JOIN db_mapel dm_kelas ON dm_kelas.id = k.id_mapel
      LEFT JOIN db_mapel dm_lama ON dm_lama.id = rr.mapel_id
      LEFT JOIN users u ON rr.guru_id = u.id
      LEFT JOIN db_guru dg ON rr.instructor = dg.id
      LEFT JOIN grade_level g ON rb.grade_id = g.id
      WHERE rr.guru_id = $1
    `,
      [guruId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch rpk_refleksi error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =====================================================
   GET ALL BY TEACHER (ADMIN)
===================================================== */
router.get("/all-rpk2/:id", verifyToken, async (req, res) => {
  try {
    const guruId = req.params.id;

    const result = await pool.query(
      `
      SELECT rr.*,
             rb.name_rombel,
             COALESCE(dm_kelas.nama_mapel, dm_lama.nama_mapel) AS subject,
             u.username AS teacher_name,
             dg.name AS instructor_name,
             g.grade_lvl AS name_grade
      FROM rpk_refleksi rr
      LEFT JOIN kelas k ON rr.kelas_id = k.id
      LEFT JOIN rombel rb ON rb.id = k.rombel_id  
      LEFT JOIN db_mapel dm_kelas ON dm_kelas.id = k.id_mapel
      LEFT JOIN db_mapel dm_lama ON dm_lama.id = rr.mapel_id
      LEFT JOIN grade_level g ON rb.grade_id = g.id
      LEFT JOIN users u ON rr.guru_id = u.id
      LEFT JOIN db_guru dg ON rr.instructor = dg.id
      WHERE rr.guru_id = $1
    `,
      [guruId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch rpk_refleksi admin error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =====================================================
   GET BY ID
===================================================== */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT 
          rr.*,
          rb.id AS rombel_id,
          rb.name_rombel,
          COALESCE(dm_kelas.nama_mapel, dm_lama.nama_mapel) AS subject,
          u.username AS teacher_name,
          dg.name AS instructor_name,
          g.grade_lvl AS name_grade
      FROM rpk_refleksi rr
      LEFT JOIN kelas k ON rr.kelas_id = k.id
      LEFT JOIN rombel rb ON k.rombel_id = rb.id
      LEFT JOIN db_mapel dm_kelas ON k.id_mapel = dm_kelas.id
      LEFT JOIN db_mapel dm_lama ON rr.mapel_id = dm_lama.id
      LEFT JOIN users u ON rr.guru_id = u.id
      LEFT JOIN db_guru dg ON rr.instructor = dg.id
      LEFT JOIN grade_level g ON rb.grade_id = g.id
      WHERE rr.id = $1
      LIMIT 1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Learning Reflection not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Fetch rpk_refleksi by ID error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* =====================================================
   CREATE
===================================================== */
router.post("/", verifyToken, async (req, res) => {
  try {
    const guruId = req.users.id;
    const {
      kelas_ids,
      rombel_id,
      hari_tanggal,
      instructor,
      waktu,
      refleksi_siswa,
      refleksi_guru,
      tngkt_pencapaian,
      desk_pencapaian,
      follow_up,
      pendampingan_siswa,
      keterangan,
    } = req.body;

    // console.log("UPDATE BODY:", req.body);

    for (const kelasId of kelas_ids) {
      await pool.query(
        `
                INSERT INTO rpk_refleksi (
                    kelas_id, rombel_id, hari_tanggal, instructor, waktu,
                    refleksi_siswa, refleksi_guru, tngkt_pencapaian,
                    desk_pencapaian, follow_up, pendampingan_siswa,
                    keterangan, guru_id
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                RETURNING *
                `,
        [
          kelasId,
          rombel_id,
          hari_tanggal,
          instructor,
          waktu,
          refleksi_siswa,
          refleksi_guru,
          tngkt_pencapaian,
          desk_pencapaian,
          follow_up,
          pendampingan_siswa,
          keterangan,
          guruId,
        ],
      );
    }
    res.json({ message: "Learning Reflection created successfully" });
  } catch (err) {
    console.error("Insert rpk_refleksi error:", err);
    res.status(500).json({ message: "Insert failed" });
  }
});

/* =====================================================
   UPDATE
===================================================== */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      kelas_id,
      rombel_id,
      hari_tanggal,
      instructor = null,
      waktu,
      refleksi_siswa,
      refleksi_guru,
      tngkt_pencapaian,
      desk_pencapaian,
      follow_up,
      pendampingan_siswa,
      keterangan,
    } = req.body;

    const result = await pool.query(
      `
           UPDATE rpk_refleksi
                SET
                kelas_id = $1,
                rombel_id = $2,
                instructor = $3,
                hari_tanggal = $4,
                waktu = $5,
                refleksi_siswa = $6,
                refleksi_guru = $7,
                tngkt_pencapaian = $8,
                desk_pencapaian = $9,
                follow_up = $10,
                pendampingan_siswa = $11,
                keterangan = $12
                WHERE id = $13
            RETURNING *
        `,
      [
        kelas_id,
        rombel_id,
        instructor,
        hari_tanggal,
        waktu,
        refleksi_siswa,
        refleksi_guru,
        tngkt_pencapaian,
        desk_pencapaian,
        follow_up,
        pendampingan_siswa,
        keterangan,
        id,
      ],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE rpk_refleksi error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   DELETE
===================================================== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM rpk_refleksi WHERE id = $1`, [id]);
    res.json({ message: "Learning Reflection deleted" });
  } catch (err) {
    console.error("Delete rpk_refleksi error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

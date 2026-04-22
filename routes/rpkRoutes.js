import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ===========================
// GET ALL RPK (FILTER BY GURU ID)
// ===========================
router.get("/all-rpk/:id", verifyToken, async (req, res) => {
  try {
    const guruId = req.params.id;

    const result = await pool.query(
      `
            SELECT 
                rpk.*,
                nr.number AS name_rombel, -- AMBIL DARI NUMBER_ROMBEL
                gl.grade_lvl,
                dm.nama_mapel AS subject,
                p.phase,
                t.username AS teacher_name,
                i.name AS instructor_name
            FROM rpk_db rpk
            LEFT JOIN kelas k            ON rpk.kelas_id = k.id
            LEFT JOIN db_mapel dm        ON k.id_mapel = dm.id
            LEFT JOIN rombel r           ON k.rombel_id = r.id
            LEFT JOIN number_rombel nr   ON r.name_rombel = nr.id 
            LEFT JOIN grade_level gl     ON r.grade_id = gl.id
            LEFT JOIN db_phase p         ON rpk.phase_id = p.id
            LEFT JOIN users t            ON rpk.guru_id = t.id
            LEFT JOIN db_guru i          ON rpk.instructor = i.id
            WHERE rpk.guru_id = $1
            ORDER BY rpk.hari_tanggal DESC, rpk.created_at DESC
        `,
      [guruId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetch all RPK:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===========================
// GET DETAIL RPK BY ID
// ===========================
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
            SELECT 
                rpk.*,
                nr.number AS name_rombel,  
                gl.grade_lvl,               
                dm.nama_mapel  AS subject,
                p.phase,
                t.username     AS teacher_name,
                i.name         AS instructor_name,

                mem.memahami,
                mem.asesmen_memahami,
                mem.berkesadaran AS memahami_berkesadaran,
                mem.bermakna     AS memahami_bermakna,
                mem.menggembirakan AS memahami_menggembirakan,

                ma.mengaplikasikan,
                ma.asesmen_mengaplikasikan,
                ma.berkesadaran AS mengaplikasikan_berkesadaran,
                ma.bermakna     AS mengaplikasikan_bermakna,
                ma.menggembirakan AS mengaplikasikan_menggembirakan,

                me.merefleksi,
                me.asesmen_merefleksi,
                me.berkesadaran AS merefleksi_berkesadaran,
                me.bermakna     AS merefleksi_bermakna,
                me.menggembirakan AS merefleksi_menggembirakan

            FROM rpk_db rpk
            LEFT JOIN kelas k           ON rpk.kelas_id = k.id
            LEFT JOIN db_mapel dm       ON k.id_mapel = dm.id
            LEFT JOIN rombel r          ON k.rombel_id = r.id
            LEFT JOIN number_rombel nr  ON r.name_rombel = nr.id 
            LEFT JOIN grade_level gl    ON r.grade_id = gl.id
            LEFT JOIN db_phase p        ON rpk.phase_id = p.id
            LEFT JOIN users t           ON rpk.guru_id = t.id
            LEFT JOIN db_guru i         ON rpk.instructor = i.id
            LEFT JOIN rpk_memahami mem  ON rpk.memahami_id = mem.id
            LEFT JOIN rpk_mengaplikasikan ma ON rpk.mengaplikasikan_id = ma.id
            LEFT JOIN rpk_merefleksi me ON rpk.merefleksi_id = me.id

            WHERE rpk.id = $1
            LIMIT 1;
        `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "RPK not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error get detail RPK:", error);
    res.status(500).json({ message: "Internal Server error" });
  }
});

// ===========================
// GET RPK FOR PARENT DASHBOARD
// ===========================
router.get("/parent/dashboard", verifyToken, async (req, res) => {
  try {
    // 1. Ambil SEMUA RPK hari ini
    const todayResult = await pool.query(
      `
        SELECT 
            rpk.*, 
            dm.nama_mapel AS subject, 
            t.username AS teacher_name,
            gl.grade_lvl,
            nr.number AS name_rombel
        FROM rpk_db rpk
        LEFT JOIN kelas k ON rpk.kelas_id = k.id
        LEFT JOIN db_mapel dm ON k.id_mapel = dm.id
        LEFT JOIN rombel r ON k.rombel_id = r.id
        LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
        LEFT JOIN grade_level gl ON r.grade_id = gl.id
        LEFT JOIN users t ON rpk.guru_id = t.id
        WHERE rpk.hari_tanggal = CURRENT_DATE
        ORDER BY rpk.waktu ASC
      `,
    );

    // 2. Ambil Riwayat (Hari-hari sebelumnya)
    const recentResult = await pool.query(
      `
      SELECT 
            rpk.*, 
            dm.nama_mapel AS subject, 
            gl.grade_lvl, 
            nr.number AS name_rombel,
            t.username AS teacher_name
        FROM rpk_db rpk
        LEFT JOIN kelas k ON rpk.kelas_id = k.id
        LEFT JOIN db_mapel dm ON k.id_mapel = dm.id
        LEFT JOIN rombel r ON k.rombel_id = r.id
        LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
        LEFT JOIN grade_level gl ON r.grade_id = gl.id
        LEFT JOIN users t ON rpk.guru_id = t.id
        WHERE rpk.hari_tanggal < CURRENT_DATE
        ORDER BY rpk.hari_tanggal DESC, rpk.waktu DESC
        LIMIT 5
      `,
    );

    res.json({
      today: todayResult.rows,
      recent: recentResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================
// CREATE
// ===========================
router.post("/", verifyToken, async (req, res) => {
  try {
    const guruId = req.users.id;
    const {
      tutor,
      hari_tanggal,
      waktu,
      tujuan_pembelajaran,
      lintas_disiplin_ilmu,
      pemanfaatan_digital,
      kemitraan_pembelajaran,
      dpl_1,
      dpl_2,
      dpl_3,
      dpl_4,
      dpl_5,
      dpl_6,
      dpl_7,
      dpl_8,
      phase_id,
      rombel_id,
      kelas_ids,
      instructor,
      memahami_id,
      mengaplikasikan_id,
      merefleksi_id,
    } = req.body;

    for (const kelasId of kelas_ids) {
      await pool.query(
        `
                INSERT INTO rpk_db (
                    tutor, hari_tanggal, waktu, tujuan_pembelajaran,
                    lintas_disiplin_ilmu, pemanfaatan_digital, kemitraan_pembelajaran,
                    dpl_1, dpl_2, dpl_3, dpl_4, dpl_5, dpl_6, dpl_7, dpl_8,
                    phase_id, rombel_id, kelas_id, guru_id, instructor,
                    memahami_id, mengaplikasikan_id, merefleksi_id
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,
                    $8,$9,$10,$11,$12,$13,$14,$15,
                    $16,$17,$18,$19,$20,$21,$22,$23
                    )
                RETURNING *
                `,
        [
          tutor,
          hari_tanggal,
          waktu,
          tujuan_pembelajaran,
          lintas_disiplin_ilmu,
          pemanfaatan_digital,
          kemitraan_pembelajaran,
          dpl_1,
          dpl_2,
          dpl_3,
          dpl_4,
          dpl_5,
          dpl_6,
          dpl_7,
          dpl_8,
          phase_id,
          rombel_id,
          kelasId,
          guruId,
          instructor,
          memahami_id,
          mengaplikasikan_id,
          merefleksi_id,
        ],
      );
    }
    res.json({ message: "Learning Plan created successfully" });
  } catch (err) {
    console.error("Error create RPK:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===========================
// UPDATE (hapus mapel_id juga)
// ===========================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const guruId = req.users.id; // ✅ dari token

    const {
      tutor,
      hari_tanggal,
      waktu,
      tujuan_pembelajaran,
      lintas_disiplin_ilmu,
      pemanfaatan_digital,
      kemitraan_pembelajaran,
      dpl_1,
      dpl_2,
      dpl_3,
      dpl_4,
      dpl_5,
      dpl_6,
      dpl_7,
      dpl_8,
      phase_id,
      rombel_id,
      kelas_id,
      instructor,
      memahami_id,
      mengaplikasikan_id,
      merefleksi_id,
    } = req.body;

    const result = await pool.query(
      `
            UPDATE rpk_db
            SET
                tutor = COALESCE($1, tutor),
                hari_tanggal = COALESCE($2, hari_tanggal),
                waktu = COALESCE($3, waktu),
                tujuan_pembelajaran = COALESCE($4, tujuan_pembelajaran),
                lintas_disiplin_ilmu = COALESCE($5, lintas_disiplin_ilmu),
                pemanfaatan_digital = COALESCE($6, pemanfaatan_digital),
                kemitraan_pembelajaran = COALESCE($7, kemitraan_pembelajaran),

                dpl_1 = COALESCE($8, dpl_1),
                dpl_2 = COALESCE($9, dpl_2),
                dpl_3 = COALESCE($10, dpl_3),
                dpl_4 = COALESCE($11, dpl_4),
                dpl_5 = COALESCE($12, dpl_5),
                dpl_6 = COALESCE($13, dpl_6),
                dpl_7 = COALESCE($14, dpl_7),
                dpl_8 = COALESCE($15, dpl_8),

                phase_id = COALESCE($16, phase_id),
                rombel_id = COALESCE($17, rombel_id),
                kelas_id = COALESCE($18, kelas_id),
                instructor = COALESCE($19, instructor),

                memahami_id = COALESCE($20, memahami_id),
                mengaplikasikan_id = COALESCE($21, mengaplikasikan_id),
                merefleksi_id = COALESCE($22, merefleksi_id)

            WHERE id = $23
              AND guru_id = $24
            RETURNING *;
        `,
      [
        tutor,
        hari_tanggal,
        waktu,
        tujuan_pembelajaran,
        lintas_disiplin_ilmu,
        pemanfaatan_digital,
        kemitraan_pembelajaran,

        dpl_1,
        dpl_2,
        dpl_3,
        dpl_4,
        dpl_5,
        dpl_6,
        dpl_7,
        dpl_8,

        phase_id,
        rombel_id,
        kelas_id,
        instructor,

        memahami_id,
        mengaplikasikan_id,
        merefleksi_id,

        id,
        guruId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "RPK not found or unauthorized" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating RPK:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===========================
// DELETE
// ===========================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM rpk_db WHERE id = $1`, [id]);
    res.json({ message: "Learning Plan deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

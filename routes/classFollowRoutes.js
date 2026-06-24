import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ambil semua kelas yang diikuti siswa
router.get("/diikuti/:studentId", verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const q = `
    SELECT 
        k.id,
        k.kode_kelas,
        m.nama_mapel,
        u.username AS guru_name,
        g.grade_lvl,
        nr.number AS name_rombel
    FROM kelas k
    JOIN kelas_diikuti kd ON kd.kelas_id = k.id
    LEFT JOIN db_mapel m ON k.id_mapel = m.id
    LEFT JOIN users u ON k.guru_id = u.id
    LEFT JOIN rombel r ON k.rombel_id = r.id 
    LEFT JOIN grade_level g ON r.grade_id = g.id
    LEFT JOIN number_rombel nr ON r.name_rombel = nr.id 
    WHERE kd.user_id = $1
    ORDER BY k.id ASC
`;

    const { rows } = await pool.query(q, [studentId]);
    res.json(rows);
  } catch (err) {
    console.error("Error GET /kelas-diikuti/diikuti/:studentId:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

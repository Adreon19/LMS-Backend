import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET semua forum milik guru yang sedang login
router.get("/", verifyToken, async (req, res) => {
  const guruId = req.users?.id || req.user?.id;
  try {
    const result = await pool.query(
      `SELECT 
          f.id,
          f.nama_grup,
          f.link_grup,
          u.username AS guru_name,
          g.grade_lvl,
          nr.number AS name_rombel, 
          m.nama_mapel,
          k.link_wallpaper_kelas
        FROM forum_discus f
        JOIN users u ON f.guru_id = u.id
        JOIN kelas k ON f.kelas_id = k.id
        JOIN rombel r ON k.rombel_id = r.id
        JOIN grade_level g ON r.grade_id = g.id
        JOIN db_mapel m ON k.id_mapel = m.id
        JOIN number_rombel nr ON r.name_rombel = nr.id 
        WHERE f.guru_id = $1
        ORDER BY f.id DESC`,
      [guruId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /forum-discuss:", err.message);
    res.status(500).json({ message: "Failed to retrieve forum data" });
  }
});

// POST forum baru (bisa multiple sekaligus)
router.post("/", verifyToken, async (req, res) => {
  const data = req.body;

  if (!Array.isArray(data)) {
    return res
      .status(400)
      .json({ message: "Data must be an array of objects" });
  }

  try {
    const inserted = [];
    for (const d of data) {
      const result = await pool.query(
        `INSERT INTO forum_discus (nama_grup, link_grup, guru_id, kelas_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [d.nama_grup, d.link_grup, d.guru_id, d.kelas_id],
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error("Error POST /forum-discuss:", err.message);
    res.status(500).json({ message: "Failed to save forum" });
  }
});

// GET forum berdasarkan kelas_id (untuk tampilan di sisi siswa/umum)
router.get("/kelas/:kelasId", verifyToken, async (req, res) => {
  const { kelasId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
          f.id,
          f.nama_grup,
          f.link_grup,
          u.username AS guru_name,
          r.name_rombel,
          g.grade_lvl,
          m.nama_mapel,
          k.link_wallpaper_kelas
        FROM forum_discus f
        JOIN users u ON f.guru_id = u.id
        JOIN kelas k ON f.kelas_id = k.id
        JOIN rombel r ON k.rombel_id = r.id
        JOIN grade_level g ON r.grade_id = g.id
        JOIN db_mapel m ON k.id_mapel = m.id
        WHERE f.kelas_id = $1
        ORDER BY f.id DESC`,
      [kelasId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /forum-discuss/:kelasId:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE forum by ID
router.delete("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM forum_discus WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Forum not found" });
    }

    res.json({ message: "Deleted successfully", data: result.rows[0] });
  } catch (err) {
    console.error("Error DELETE /forum-discuss:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

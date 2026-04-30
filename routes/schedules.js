import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ============================================
    GET Master Time Slots
============================================ */
router.get("/master-slots", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM master_time_slots ORDER BY start_time ASC",
    );
    res.json(rows);
  } catch (err) {
    console.error("ERROR GET MASTER SLOTS:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
   GET Real-time Schedule
============================================ */
router.get("/now", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const currentDay = days[now.getDay()];
    const currentTime = now.toTimeString().split(" ")[0];

    const { rows } = await pool.query(
      `
      SELECT 
        mts.name AS slot_name,
        mts.is_global,
        k.id AS kelas_id,
        nr.number AS rombel_huruf, 
        gl.grade_lvl AS rombel_angka,
        m.nama_mapel,
        u.username AS guru_name,
        u.photo_url AS guru_photo
      FROM master_time_slots mts
      LEFT JOIN schedules s ON mts.id = s.slot_id AND s.day_name = $1
      LEFT JOIN kelas k ON s.class_id = k.id
      LEFT JOIN rombel r ON k.rombel_id = r.id
      LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
      LEFT JOIN grade_level gl ON r.grade_id = gl.id
      LEFT JOIN db_mapel m ON k.id_mapel = m.id
      LEFT JOIN users u ON k.guru_id = u.id
      WHERE $2::TIME BETWEEN mts.start_time AND mts.end_time
    `,
      [currentDay, currentTime],
    );

    if (rows.length === 0) {
      return res.json({
        slot_name: "Luar Jam Sekolah",
        is_global: false,
        schedule: [],
      });
    }

    const firstRow = rows[0];

    res.json({
      day: currentDay,
      time: currentTime,
      slot_name: firstRow.slot_name,
      is_global: firstRow.is_global,
      schedule: firstRow.is_global
        ? []
        : rows
            .filter((r) => r.kelas_id !== null)
            .map((r) => ({
              kelas_id: r.kelas_id,
              nama_mapel: r.nama_mapel,
              guru_name: r.guru_name,
              guru_photo: r.guru_photo,
              grade_lvl: r.rombel_angka,
              name_rombel: r.rombel_huruf,
            })),
    });
  } catch (err) {
    console.error("ERROR GET REALTIME SCHEDULE:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================
    GET ALL SCHEDULES (Untuk Grid Admin)
    Sekarang JOIN mapel dan guru via tabel kelas
============================================ */
router.get("/all", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        s.id,
        s.day_name,
        s.slot_id,
        s.class_id,
        m.nama_mapel,
        u.username AS guru_name,
        gl.grade_lvl,
        nr.number AS rombel_huruf
      FROM schedules s
      LEFT JOIN kelas k ON s.class_id = k.id
      LEFT JOIN rombel r ON k.rombel_id = r.id
      LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
      LEFT JOIN grade_level gl ON r.grade_id = gl.id
      LEFT JOIN db_mapel m ON k.id_mapel = m.id
      LEFT JOIN users u ON k.guru_id = u.id
      ORDER BY s.slot_id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("ERROR GET ALL SCHEDULES:", err);
    res.status(500).json({ error: "Gagal mengambil semua jadwal" });
  }
});

/* ============================================
    CREATE SCHEDULE
    Hanya butuh day, slot, dan class_id
============================================ */
router.post("/", verifyToken, async (req, res) => {
  const { day_name, slot_id, class_id } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO schedules (day_name, slot_id, class_id) 
       VALUES ($1, $2, $3) RETURNING *`,
      [day_name, slot_id, class_id],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("ERROR POST SCHEDULE:", err);
    res.status(500).json({ error: "Gagal menambah jadwal" });
  }
});

/* ============================================
    UPDATE SCHEDULE
============================================ */
router.put("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { class_id } = req.body;
  try {
    await pool.query(`UPDATE schedules SET class_id = $1 WHERE id = $2`, [
      class_id,
      id,
    ]);
    res.json({ message: "Jadwal berhasil diupdate" });
  } catch (err) {
    console.error("ERROR PUT SCHEDULE:", err);
    res.status(500).json({ error: "Gagal update jadwal" });
  }
});

/* ============================================
    DELETE SCHEDULE
============================================ */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedules WHERE id = $1", [req.params.id]);
    res.json({ message: "Jadwal dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus jadwal" });
  }
});

/* ============================================
    ADMIN: CREATE/UPDATE/DELETE MASTER SLOTS
   ============================================ */
router.post("/master-slots", verifyToken, async (req, res) => {
  const { name, start_time, end_time, is_global } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO master_time_slots (name, start_time, end_time, is_global) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, start_time, end_time, is_global],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Gagal nambah jam master" });
  }
});

router.put("/master-slots/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { name, start_time, end_time, is_global } = req.body;
  try {
    const result = await pool.query(
      `UPDATE master_time_slots 
       SET name = $1, start_time = $2, end_time = $3, is_global = $4 
       WHERE id = $5 RETURNING *`,
      [name, start_time, end_time, is_global, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Slot tidak ditemukan" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Gagal update master slot" });
  }
});

router.delete("/master-slots/:id", verifyToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM master_time_slots WHERE id = $1", [
      req.params.id,
    ]);
    res.json({ message: "Slot waktu dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal hapus master slot" });
  }
});

export default router;

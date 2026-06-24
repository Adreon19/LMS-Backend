import express from "express";
import {
  register,
  login,
  registerUser,
  resetPassword,
} from "../controllers/authController.js";
// import { register, login, registerTeacher, verifyEmail, verifyLoginCode } from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/register-internal", registerUser);
router.put("/reset-password", resetPassword);
// router.post("/verify-email", verifyEmail);
// router.post("/verify-login-code", verifyLoginCode);

/* ==========================================================================
   NAIK KELAS MASSAL (ADMIN ONLY)
   - Mengubah kelas lama menjadi terarsip (is_archived = true) agar tetap muncul di riwayat bawah
   - Menaikkan grade_id murid aktif dan mengosongkan rombel_id untuk penataan baru
   - Mengubah murid kelas akhir (kelas 6) menjadi role 'alumni'
   ========================================================================== */
router.post("/naik-kelas-massal", verifyToken, async (req, res) => {
  if (req.users.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Hanya admin yang dapat melakukan aksi ini" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ambil semua data murid aktif saat ini
    const { rows: students } = await client.query(
      "SELECT id, grade_id FROM users WHERE role = 'student'",
    );

    for (const student of students) {
      await client.query(
        `UPDATE kelas_diikuti 
         SET is_archived = true 
         WHERE user_id = $1 AND is_archived = false`,
        [student.id],
      );

      // Langkah B: Update status tingkatan akademik user di tabel users
      if (student.grade_id === 6) {
        await client.query(
          `UPDATE users 
           SET role = 'alumni', 
               grade_id = NULL, 
               rombel_id = NULL 
           WHERE id = $1`,
          [student.id],
        );
      } else if (student.grade_id !== null) {
        const nextGradeId = student.grade_id + 1;
        await client.query(
          `UPDATE users 
           SET grade_id = $1, 
               rombel_id = NULL 
           WHERE id = $2`,
          [nextGradeId, student.id],
        );
      }
    }

    await client.query("COMMIT");
    res.json({
      message:
        "Proses kenaikan kelas massal dan pengarsipan riwayat berhasil dijalankan!",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error proses kenaikan kelas massal:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET all profile
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        p.id,
        p.username,
        p.role,
        p.phone_number,
        p.photo_url AS photo_url,
        p.teacher_subject,
        p.grade_id,
        p.rombel_id,
        g.grade_lvl,
        r.number
     FROM users p
     LEFT JOIN grade_level g ON p.grade_id = g.id
     LEFT JOIN number_rombel r ON p.rombel_id = r.id
     ORDER BY p.id ASC`,
    );

    res.json({ profiles: result.rows });
  } catch (error) {
    console.error("Get all profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET profile by token
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.users.id;

    const result = await pool.query(
      `SELECT 
    u.id, 
    u.username, 
    u.email, 
    u.role, 
    u.photo_url,
    u.phone_number,
    u.teacher_subject,
    u.grade_id,   
    u.rombel_id, 
    gl.grade_lvl,
    nr.number AS name_rombel
    FROM users u
    LEFT JOIN grade_level gl ON u.grade_id = gl.id
    LEFT JOIN number_rombel nr ON u.rombel_id = nr.id
    WHERE u.id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get profile error detail:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// GET PROFILE TEACHER
router.get("/teacher", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, role, teacher_subject, photo_url, phone_number
       FROM users
       WHERE role = 'teacher'
       ORDER BY id ASC`,
    );
    res.json({ profiles: result.rows });
  } catch (error) {
    console.error("Error Get Teacher profile :", error);
    res.status(500).json({ error: error.message });
  }
});

// Get profile guru by Id
router.get("/teacher/:id", verifyToken, async (req, res) => {
  try {
    const guruId = req.params.id;

    const result = await pool.query(
      `SELECT id, username, teacher_subject, photo_url, phone_number
             FROM users
             WHERE id = $1
             LIMIT 1`,
      [guruId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetch teacher profile by ID :", error);
    res.status(500).json({ error: error.message });
  }
});

// Get profile student by Id
router.get("/student/:id", verifyToken, async (req, res) => {
  try {
    const studentId = req.params.id;

    const result = await pool.query(
      `SELECT 
            u.id, 
            u.username, 
            u.photo_url, 
            u.phone_number,
            nr.number AS name_rombel,
            g.grade_lvl 
             FROM users u
             LEFT JOIN rombel  r ON u.rombel_id = r.id
             LEFT JOIN grade_level g ON u.grade_id = g.id
             LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
             WHERE u.id = $1
             LIMIT 1`,
      [studentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetch student profile by ID :", error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE profile
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.users.id;
    const { username, phone_number, grade_id, rombel_id, teacher_subject } =
      req.body;

    const result = await pool.query(
      `UPDATE users
       SET username = $1, phone_number = $2, grade_id = $3, rombel_id = $4, teacher_subject = $5
       WHERE id = $6
       RETURNING id, username, phone_number, grade_id, rombel_id, teacher_subject`,
      [username, phone_number, grade_id, rombel_id, teacher_subject, userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: err.message });
  }
});

// update profiles by ID user (SUPER ADMIN)
router.put("/profile/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      phone_number,
      photo_url,
      grade_id,
      rombel_id,
      teacher_subject,
    } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET username = $1, 
           phone_number = $2, 
           photo_url = $3,
           grade_id = $4, 
           rombel_id = $5, 
           teacher_subject = $6
       WHERE id = $7
       RETURNING id, username, phone_number, photo_url, grade_id, rombel_id, teacher_subject`,
      [
        username || null,
        phone_number || null,
        photo_url || null,
        grade_id || null,
        rombel_id || null,
        teacher_subject || null,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update profile error details:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ message: "user deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

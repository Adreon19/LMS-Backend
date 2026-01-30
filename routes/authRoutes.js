import express from "express";
import { register, login, registerTeacher, resetPassword } from "../controllers/authController.js";
// import { register, login, registerTeacher, verifyEmail, verifyLoginCode } from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/register-teacher", registerTeacher);
router.put("/reset-password", resetPassword);
// router.post("/verify-email", verifyEmail);
// router.post("/verify-login-code", verifyLoginCode);

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
        p.jurusan_id,
        p.grade_id,
        p.rombel_id,
        j.nama_jurusan,
        g.grade_lvl,
        r.number
     FROM users p
     LEFT JOIN jurusan j ON p.jurusan_id = j.id
     LEFT JOIN grade_level g ON p.grade_id = g.id
     LEFT JOIN number_rombel r ON p.rombel_id = r.id
     ORDER BY p.id ASC`
        );

        res.json({ profiles: result.rows });   // <--- kirim hasil ke frontend
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
                u.phone_number,
                u.photo_url,
                u.jurusan_id,
                u.teacher_subject,
                u.grade_id,
                u.rombel_id,
                j.nama_jurusan,
                g.grade_lvl,
                r.number
            FROM users u
            LEFT JOIN jurusan j ON u.jurusan_id = j.id
            LEFT JOIN grade_level g ON u.grade_id = g.id
            LEFT JOIN number_rombel r ON u.rombel_id = r.id
            WHERE u.id = $1
            LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Get profile error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET PROFILE TEACHER
router.get("/teacher", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, role, teacher_subject, photo_url, phone_number
       FROM users
       WHERE role = 'teacher'
       ORDER BY id ASC`
        );
        res.json({ profiles: result.rows });
    } catch (error) {
        console.error("Error Get Teacher profile :", error)
        res.status(500).json({ error: err.message });
    }
})

// Get profile guru by Id 
router.get("/teacher/:id", verifyToken, async (req, res) => {
    try {
        const guruId = req.params.id;

        const result = await pool.query(
            `SELECT id, username, teacher_subject, photo_url, phone_number
             FROM users
             WHERE id = $1
             LIMIT 1`,
            [guruId]
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
            j.nama_jurusan,
            r.name_rombel,
            g.grade_lvl 
             FROM users u
             LEFT JOIN jurusan j ON u.jurusan_id = j.id
             LEFT JOIN rombel  r ON u.rombel_id = r.id
             LEFT JOIN grade_level g ON u.grade_id = g.id
             WHERE u.id = $1
             LIMIT 1`,
            [studentId]
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
        const {
            username,
            phone_number,
            grade_id,
            jurusan_id,
            rombel_id,
            teacher_subject
        } = req.body;

        const result = await pool.query(
            `UPDATE users
             SET username = $1,
                 phone_number = $2,
                 grade_id = $3,
                 jurusan_id = $4,
                 rombel_id = $5,
                 teacher_subject = $6
             WHERE id = $7
             RETURNING id, username, phone_number, teacher_subject`,
            [
                username,
                phone_number,
                grade_id,
                jurusan_id,
                rombel_id,
                teacher_subject,
                userId
            ]
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
        const { username, phone_number, photo_url, grade_id, jurusan_id, rombel_id, teacher_subject } = req.body;

        const result = await pool.query(
            `UPDATE users 
             SET username = $1, phone_number = $2, photo_url = $3,
                 grade_id = $4, jurusan_id = $5, rombel_id = $6, teacher_subject = $7
             WHERE id = $8
             RETURNING id, username, phone_number, photo_url, grade_id, jurusan_id, rombel_id, teacher_subject`,
            [username, phone_number, photo_url, grade_id, jurusan_id, rombel_id, teacher_subject, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Update profile error:", err);
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

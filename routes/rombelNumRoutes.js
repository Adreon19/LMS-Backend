import express from "express";
import { pool } from "../config/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
// GET all number rombel
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM number_rombel ORDER BY id ASC",
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

/* ============================================
    CREATE NEW ROMBEL NUMBER
============================================ */
router.post("/", verifyToken, async (req, res) => {
  const { number } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO number_rombel (number) 
       VALUES ($1) RETURNING *`,
      [number],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("ERROR POST Rombel Number:", err);
    res.status(500).json({ error: "Adding new rombel number failed" });
  }
});

export default router;

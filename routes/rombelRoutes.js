// routes/rombelRoutes.js
import express from "express";
import { RombelModel } from "../models/rombelModel.js";

const router = express.Router();

// =======================
// GET ALL ROMBEL
// =======================
router.get("/", async (req, res) => {
  try {
    const rombels = await RombelModel.getAll();
    res.json(rombels);
  } catch (err) {
    console.error("GET ROMBEL ERROR:", err);
    res.status(500).json({ message: "Error fetching rombel" });
  }
});

// =======================
// CREATE ROMBEL
// =======================
router.post("/", async (req, res) => {
  try {
    const { name_rombel, grade_id } = req.body;

    // Validasi: Di SD hanya butuh Grade (1-6) dan Huruf (A-C)
    if (!name_rombel || !grade_id) {
      return res.status(400).json({
        message: "name_rombel and grade_id are required",
      });
    }

    const rombel = await RombelModel.create({
      name_rombel,
      grade_id,
    });

    res.json(rombel);
  } catch (err) {
    console.error("CREATE ROMBEL ERROR:", err);
    res.status(500).json({ message: "Error creating Class" });
  }
});

// =======================
// UPDATE ROMBEL
// =======================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const data = {
      name_rombel: req.body.name_rombel,
      grade_id: req.body.grade_id,
    };

    const rombel = await RombelModel.update(id, data);
    res.json(rombel);
  } catch (err) {
    console.error("UPDATE ROMBEL ERROR:", err);
    res.status(500).json({ message: "Error updating Class" });
  }
});

// =======================
// DELETE
// =======================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await RombelModel.delete(id);
    res.json(response);
  } catch (err) {
    console.error("DELETE ROMBEL ERROR:", err);
    res.status(500).json({ message: "Error deleting Class" });
  }
});

export default router;

// models/rombelModel.js
import { pool } from "../config/db.js";

export const RombelModel = {
  // ========================
  // GET ALL
  // ========================
  async getAll() {
    const { rows } = await pool.query(`
        SELECT
            r.id,
            r.name_rombel,
            r.grade_id,
            gl.grade_lvl AS grade_name,
            nr.number AS rombel_number
        FROM rombel r
        LEFT JOIN grade_level gl ON gl.id = r.grade_id
        LEFT JOIN number_rombel nr ON nr.id = r.name_rombel
        ORDER BY gl.id ASC, nr.number ASC
    `);
    return rows;
  },

  // ========================
  // CREATE
  // ========================
  async create({ name_rombel, grade_id }) {
    const { rows } = await pool.query(
      `
            INSERT INTO rombel (name_rombel, grade_id)
            VALUES ($1, $2)
            RETURNING *
            `,
      [name_rombel, grade_id],
    );
    return rows[0];
  },

  // ========================
  // UPDATE
  // ========================
  async update(id, data) {
    const fields = [];
    const values = [];
    let index = 1;

    // Hanya izinkan update untuk kolom yang ada di struktur SD
    const allowedUpdates = ["name_rombel", "grade_id"];

    for (const key in data) {
      if (
        allowedUpdates.includes(key) &&
        data[key] !== undefined &&
        data[key] !== null
      ) {
        fields.push(`${key} = $${index}`);
        values.push(data[key]);
        index++;
      }
    }

    if (fields.length === 0) {
      return { message: "No valid fields to update" };
    }

    values.push(id);

    const query = `
        UPDATE rombel 
        SET ${fields.join(", ")}
        WHERE id = $${index}
        RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // ========================
  // DELETE
  // ========================
  async delete(id) {
    await pool.query("DELETE FROM rombel WHERE id = $1", [id]);
    return { message: "Rombel deleted" };
  },
};

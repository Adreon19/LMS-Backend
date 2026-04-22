import { pool } from "../config/db.js"; // pakai pg / mysql2 pool
import { verifyToken } from "../middleware/authMiddleware.js";

// Ambil semua penugasan
export const getPenugasan = [
    verifyToken,
    async (req, res) => {
        try {
            const guruId = req.users.id;

            const result = await pool.query(`
                SELECT
                    bs.id,
                    bs.judul_penugasan,
                    bs.created_at,

                        COALESCE(
                        ARRAY_AGG(
                            DISTINCT CONCAT(
                            gl.grade_lvl, ' ',
                            nr.number, ' - ',
                            dm.nama_mapel
                            )
                        ) FILTER (WHERE k.id IS NOT NULL),
                        ARRAY[]::text[]
                    ) AS kelas_list

                FROM bank_soal bs

                LEFT JOIN module_pembelajaran mp
                    ON mp.bank_soal_id = bs.id

                LEFT JOIN kelas k ON k.id = mp.kelas_id
                LEFT JOIN rombel r ON k.rombel_id = r.id
                LEFT JOIN number_rombel nr ON r.name_rombel = nr.id
                LEFT JOIN grade_level gl ON r.grade_id = gl.id
                LEFT JOIN db_mapel dm ON k.id_mapel = dm.id

                WHERE bs.guru_id = $1
                GROUP BY bs.id
                ORDER BY bs.created_at DESC
            `, [guruId]);

            res.json(result.rows);
        } catch (error) {
            console.error("bank soal :", error);
            res.status(500).json({ message: error.message });
        }
    }
];

// export const getPenugasanbyIdTeacher = async (req, res) => {
//     const { guruId } = req.params;
//     try {
//         const result = await pool.query(
//             `SELECT * FROM bank_soal WHERE guru_id = $1 ORDER BY created_at DESC`,
//             [guruId]
//         );
//         res.json(result.rows);
//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };


// Buat penugasan baru
export const buatPenugasanBaru = [verifyToken, async (req, res) => {
    const { judul_penugasan } = req.body;
    const guru_id = req.users.id;

    if (!judul_penugasan) {
        return res.status(400).json({ message: "Title is required" });
    }

    try {
        const result = await pool.query(
            "INSERT INTO bank_soal (judul_penugasan, guru_id) VALUES ($1, $2) RETURNING *",
            [judul_penugasan, guru_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}];

// Update penugasan berdasarkan id
export const updatePenugasan = async (req, res) => {
    const { id } = req.params;
    const { judul_penugasan } = req.body;

    if (!judul_penugasan) {
        return res.status(400).json({ message: "Assignment title is required" });
    }

    try {
        const result = await pool.query(
            `UPDATE bank_soal
             SET judul_penugasan = $1,
                 created_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [judul_penugasan, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Assignment not found" });
        }

        res.json({
            message: "Assignment updated successfully",
            data: result.rows[0],
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.error("error update judul soal :", error)
    }
};


// Submit soal PG dan Essay
// export const submitSemuaSoal = async (req, res) => {
//     const { id } = req.params; // bank_soal_id
//     const soalList = req.body; // array soal PG & Essay

//     if (!Array.isArray(soalList) || soalList.length === 0) {
//         return res.status(400).json({ message: "Minimal 1 soal harus diisi" });
//     }

//     try {
//         const inserted = [];
//         for (const soal of soalList) {
//             const result = await pool.query(
//                 `INSERT INTO soal_pilgan 
//         (bank_soal_id, pertanyaan, pg_a, pg_b, pg_c, pg_d, pg_e, kunci_jawaban, gambar, pertanyaan_essai, gambar_soal_essai)
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
//         RETURNING *`,
//                 [
//                     id,
//                     soal.pertanyaan || null,
//                     soal.pg_a || null,
//                     soal.pg_b || null,
//                     soal.pg_c || null,
//                     soal.pg_d || null,
//                     soal.pg_e || null,
//                     soal.kunci_jawaban || null,
//                     soal.gambar || null,
//                     soal.pertanyaan_essai || null,
//                     soal.gambar_soal_essai || null,
//                 ]
//             );
//             inserted.push(result.rows[0]);
//         }

//         res.status(201).json(inserted);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// Hapus penugasan + soal terkait
export const deleteData = async (req, res) => {
    const { id } = req.params; // id bank_soal
    try {
        // Hapus semua soal terkait dulu
        await pool.query("DELETE FROM soal_pilgan WHERE bank_soal_id = $1", [id]);

        // Baru hapus bank_soal
        const result = await pool.query(
            "DELETE FROM bank_soal WHERE id = $1 RETURNING *",
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Assignment not found" });
        }
        res.json({ message: "Question bank and all related questions have been successfully deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.error("cant delete the data :", error)
    }
};
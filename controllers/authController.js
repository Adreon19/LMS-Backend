import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  createUser,
  findUserByEmail,
  updateUser,
} from "../models/userModel.js";
import sendEmail from "../utils/sendEmail.js";

// Generate 6-digit OTP
const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// =============================
//      REGISTER STUDENT
// =============================
// export const register = async (req, res) => {
//     try {
//         const { email, username, password, confirmPassword } = req.body;

//         if (!email || !username || !password || !confirmPassword)
//             return res.status(400).json({ message: "All fields are required" });

//         if (password !== confirmPassword)
//             return res.status(400).json({ message: "Passwords do not match" });

//         const userExist = await findUserByEmail(email);
//         if (userExist)
//             return res.status(400).json({ message: "User already exists" });

//         const hashedPassword = await bcrypt.hash(password, 10);

//         const code = generateCode();
//         const expires = new Date(Date.now() + 10 * 60 * 1000);

//         const newUser = await createUser(
//             email,
//             username,
//             hashedPassword,
//             "student",
//             code,
//             expires
//         );

//         // Send email in a separate try/catch
//         try {
//             await sendEmail({
//                 to: email,
//                 subject: "Verify Your Account",
//                 text: `Your verification code is: ${code}`
//             });
//         } catch (emailErr) {
//             console.error("EMAIL SEND ERROR:", emailErr);
//         }

//         return res.json({
//             message: "Signup success, please verify your email",
//             email: newUser.email
//         });

//     } catch (err) {
//         console.error("REGISTER ERROR:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

export const register = async (req, res) => {
  try {
    const { email, username, password, confirmPassword } = req.body;

    if (!email || !username || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const userExist = await findUserByEmail(email);
    if (userExist) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // OTP DIMATIKAN → code & expires NULL
    const newUser = await createUser(
      email,
      username,
      hashedPassword,
      "student",
      null,
      null,
    );

    // LANGSUNG AKTIFKAN USER
    await updateUser(email, {
      is_verified: true,
      verification_code: null,
      verification_expires: null,
    });

    return res.json({
      message: "Signup success. Account is active.",
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// =============================
//       REGISTER USER (GENERAL)
// =============================
export const registerUser = async (req, res) => {
  try {
    const { email, username, password, confirmPassword, role } = req.body;

    // Tambahkan role ke pengecekan required
    if (!email || !username || !password || !confirmPassword || !role)
      return res.status(400).json({ message: "All fields are required" });

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    const userExist = await findUserByEmail(email);
    if (userExist)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await createUser(
      email,
      username,
      hashedPassword,
      role,
      null,
      null,
    );

    return res.json({
      message: `${
        role.charAt(0).toUpperCase() + role.slice(1)
      } registered successfully`,
      email: newUser.email,
    });
  } catch (err) {
    console.error("REGISTER USER ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================
//         VERIFY EMAIL
// =============================
// export const verifyEmail = async (req, res) => {
//     try {
//         const { email, code } = req.body;

//         const user = await findUserByEmail(email);
//         if (!user) return res.status(404).json({ message: "User not found" });

//         if (user.verification_code !== code)
//             return res.status(400).json({ message: "Invalid code" });

//         if (user.verification_expires < new Date())
//             return res.status(400).json({ message: "Code expired" });

//         await updateUser(email, {
//             is_verified: true,
//             verification_code: null,
//             verification_expires: null
//         });

//         const token = jwt.sign(
//             {
//                 id: user.id,
//                 role: user.role,
//                 username: user.username,
//                 email: user.email
//             },
//             process.env.JWT_SECRET,
//             { expiresIn: "24h" }
//         );

//         return res.json({
//             message: "Email verified successfully",
//             token,
//             user: {
//                 id: user.id,
//                 email: user.email,
//                 role: user.role,
//                 username: user.username
//             }
//         });

//     } catch (err) {
//         console.error("VERIFY ERROR:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

// =============================
//            LOGIN
// =============================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Email and password are required" });

    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ message: "User not found" });

    // Cek password dulu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // ============ OTP LOGIN =============
    // const code = Math.floor(100000 + Math.random() * 900000).toString();
    // const expires = new Date(Date.now() + 10 * 60 * 1000);

    // simpan code untuk login
    // await updateUser(email, {
    //     verification_code: code,
    //     verification_expires: expires
    // });

    // try {
    //     await sendEmail({
    //         to: email,
    //         subject: "Your Login Code",
    //         text: `Your login code is: ${code}`
    //     });
    // } catch (emailErr) {
    //     console.error("LOGIN EMAIL ERROR:", emailErr);
    // }

    // return res.json({
    //     message: "OTP sent to your email",
    //     email: user.email,
    //     nextStep: "verify-login-code"
    // });

    // === OTP DISABLED: langsung buat token ===
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    return res.json({
      message: "Login success",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// export const verifyLoginCode = async (req, res) => {
//     try {
//         const { email, code } = req.body;

//         const user = await findUserByEmail(email);
//         if (!user) return res.status(404).json({ message: "User not found" });

//         if (user.verification_code !== code)
//             return res.status(400).json({ message: "Invalid code" });

//         if (user.verification_expires < new Date())
//             return res.status(400).json({ message: "Code expired" });

//         // reset code
//         await updateUser(email, {
//             verification_code: null,
//             verification_expires: null
//         });

//         // buat JWT
//         const token = jwt.sign(
//             {
//                 id: user.id,
//                 email: user.email,
//                 role: user.role,
//                 username: user.username
//             },
//             process.env.JWT_SECRET,
//             { expiresIn: "24h" }
//         );

//         return res.json({
//             message: "Login success",
//             token,
//             user: {
//                 id: user.id,
//                 email: user.email,
//                 role: user.role,
//                 username: user.username
//             }
//         });

//     } catch (err) {
//         console.error("VERIFY LOGIN ERROR:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

// =============================
//      RESET PASSWORD (ADMIN)
// =============================
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // hash password baru
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // update password di DB
    await updateUser(email, {
      password: hashedPassword,
    });

    return res.json({
      message: "Password successfully reset",
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const express = require("express");
const mysql = require("mysql");
const cors = require("cors");

const app = express();

// กำหนดค่าการเชื่อมต่อ MySQL โดยตรง (ไม่ใช้ .env)
const db = mysql.createConnection({
  host: "localhost", // เปลี่ยนเป็นที่อยู่เซิร์ฟเวอร์ MySQL ถ้าไม่ใช่ localhost
  user: "root", // เปลี่ยนเป็นชื่อผู้ใช้ MySQL ของคุณ
  password: "", // เปลี่ยนเป็นรหัสผ่านของคุณ
  database: "library", // เปลี่ยนเป็นชื่อฐานข้อมูลของคุณ
});

db.connect((err) => {
  if (err) {
    console.error(" MySQL Connection Error:", err);
  } else {
    console.log("MySQL Connected");
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const path = require("path");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/register", (req, res) => {
  const { name, phone, username, password } = req.body;

  // เพิ่มข้อมูลสมัครสมาชิกลงในฐานข้อมูล
  const sql =
    "INSERT INTO member (name, phone, username, password) VALUES (?, ?, ?, ?)";
  db.query(sql, [name, phone, username, password], (err, result) => {
    if (err) {
      return res.status(500).send({ message: "เกิดข้อผิดพลาดในการลงทะเบียน" });
    }
    res
      .status(201)
      .send({ message: "ลงทะเบียนสำเร็จ", memberId: result.insertId });
  });
});
// ===================================================================================

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const query = "SELECT * FROM member WHERE username = ? AND password = ?";
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error("Error querying database:", err);
      return res.status(500).json({ error: "Server error" });
    }

    if (results.length > 0) {
      res.json({
        success: true,
        message: "Login successful!",
        user: results[0],
      });
    } else {
      res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }
  });
});

// 📌 CRUD Routes
const multer = require("multer");
const { error } = require("console");

// ใช้ memoryStorage เพื่อเก็บไฟล์ในหน่วยความจำชั่วคราว
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/book", upload.single("image"), (req, res) => {
  const { title, description } = req.body;
  const imageBuffer = req.file ? req.file.buffer : null;

  // SQL Statement สำหรับบันทึกข้อมูลหนังสือและรูป (ใช้ LONGBLOB สำหรับเก็บรูป)
  const sql = "INSERT INTO book (title, description, image) VALUES (?, ?, ?)";
  db.query(sql, [title, description, imageBuffer], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId, title, description });
  });
});

// Get Book หน้า Manage-books
app.get("/book", (req, res) => {
  // รับค่าจาก query string (เช่น /book?bookId=1)
  const { bookId } = req.query;

  if (bookId) {
    // ค้นหาหนังสือที่มี bookId ตรงกับที่ส่งมา
    const sql = "SELECT bookId, title, description FROM book WHERE bookId = ?";
    db.query(sql, [bookId], (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: "Book not found" });
      }
      // ส่งข้อมูลหนังสือเล่มนั้นกลับไป
      res.json(results[0]);
    });
  } else {
    const sql = "SELECT bookId, title, description FROM book";
    db.query(sql, (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    });
  }
});

// // UPDATE BOOK
app.put("/book/:id", upload.single("image"), (req, res) => {
  const { title, description } = req.body;
  const bookId = req.params.id;

  // ตรวจสอบข้อมูลที่จำเป็น: title, description และไฟล์ที่อัปโหลดต้องมี
  if (!title || !description || !req.file) {
    return res.status(400).json({
      error: "ต้องระบุชื่อหนังสือ, คำอธิบาย และรูปภาพ",
    });
  }

  // ใช้ Buffer ตรง ๆ เหมือนใน POST โดยไม่ต้องแปลงเป็น Base64
  const imageBuffer = req.file.buffer;

  // อัปเดตข้อมูลหนังสือในฐานข้อมูล
  db.query(
    "UPDATE book SET title = ?, description = ?, image = ? WHERE bookId = ?",
    [title, description, imageBuffer, bookId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "ไม่พบหนังสือที่ต้องการแก้ไข" });
      }
      res.json({ message: "อัปเดตหนังสือสำเร็จ", data: result });
    }
  );
});

// DELETE BOOK
app.delete("/book/:id", (req, res) => {
  db.query(
    "DELETE FROM book WHERE bookId = ?",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Book deleted successfully" });
    }
  );
});

// POST ORDER
app.post("/order", (req, res) => {
  const { name_customer, borrowDate, returnDate } = req.body;

  db.query(
    "INSERT INTO transaction (name_customer, borrowDate, returnDate) VALUES (?, ?, ?)",
    [name_customer, borrowDate, returnDate],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({
        message: "Order created successfully",
        data: result,
      });
    }
  );
});

// GET TRANSACTION
app.get("/transaction", (req, res) => {
  const sql =
    "SELECT transactionId, name_customer, DATE_FORMAT(borrowDate, '%d/%m/%Y') AS borrowDate, DATE_FORMAT(returnDate, '%d/%m/%Y') AS returnDate FROM transaction";

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

/* =============================================
   ส่วนของ API สำหรับจัดการธุรกรรมการยืมหนังสือ (Transactions)
============================================= */

// Get Image
app.get("/book/image", (req, res) => {
  const sql = "SELECT bookId, title, description, image FROM book";
  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "No books found" });
    }

    // แปลงข้อมูลของแต่ละหนังสือ
    const books = results.map((book) => {
      let imageUrl = null;
      if (book.image) {
        const base64Image = Buffer.from(book.image).toString("base64");
        imageUrl = `data:image/jpeg;base64,${base64Image}`;
      }

      return {
        bookId: book.bookId,
        title: book.title,
        description: book.description,
        image: imageUrl,
      };
    });

    res.json(books);
  });
});

// เริ่มเซิร์ฟเวอร์
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});

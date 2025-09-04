const mysql = require("mysql2");

// DB 설정
const pool = mysql.createPool({
  host: "localhost",
  user: "33090489",
  password: "Oh01046811253!",
  database: "f5",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise();

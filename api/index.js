const express = require("express");
const { sql } = require("@vercel/postgres");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Middleware to check the API key
const authenticate = (req, res, next) => {
  const providedKey = req.headers["x-api-key"];
  const validKey = process.env.API_KEY;

  if (!providedKey || providedKey !== validKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }

  next(); // Key is valid, proceed to the route
};

// Setup route (Unprotected so you can run it once easily, then you can remove this route)
app.get("/api/setup", async (req, res) => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS temperatures (
        id SERIAL PRIMARY KEY,
        temperature NUMERIC NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    res.status(200).json({ message: "Table created successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Save current temp AND delete entries older than 24 hours
// Notice we added the 'authenticate' middleware here
app.post("/api/temp", authenticate, async (req, res) => {
  try {
    const { temperature } = req.body;

    if (temperature === undefined) {
      return res.status(400).json({ error: "Temperature is required" });
    }

    // 1. Delete data older than 24 hours
    await sql`
      DELETE FROM temperatures 
      WHERE timestamp < NOW() - INTERVAL '24 hours';
    `;

    // 2. Insert the new temperature
    const result = await sql`
      INSERT INTO temperatures (temperature) 
      VALUES (${temperature}) 
      RETURNING *;
    `;

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to process data", details: error.message });
  }
});

// GET: Retrieve data
// Notice we added the 'authenticate' middleware here too
app.get("/api/temp", authenticate, async (req, res) => {
  try {
    const result = await sql`
      SELECT * FROM temperatures 
      ORDER BY timestamp DESC;
    `;

    res.status(200).json(result.rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch data", details: error.message });
  }
});

module.exports = app;

const express = require("express");
const { sql } = require("@vercel/postgres");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

const sensorTables = Object.freeze({
  outside: "outside_temperatures",
  inside: "inside_temperatures",
  garage: "garage_temperatures",
});

const getSensorTable = (sensor) =>
  Object.prototype.hasOwnProperty.call(sensorTables, sensor)
    ? sensorTables[sensor]
    : undefined;

// Middleware to check the API key
const authenticate = (req, res, next) => {
  const providedKey = req.headers["x-api-key"];
  const validKey = process.env.API_KEY;

  if (!validKey) {
    return res.status(500).json({ error: "API key is not configured" });
  }

  if (typeof providedKey !== "string" || providedKey !== validKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }

  next();
};

app.get("/api/setup", authenticate, async (req, res) => {
  try {
    await sql`
      DO $$
      BEGIN
        IF to_regclass('temperatures') IS NOT NULL
          AND to_regclass('outside_temperatures') IS NULL THEN
          ALTER TABLE temperatures RENAME TO outside_temperatures;
        END IF;
      END;
      $$;
    `;

    for (const tableName of Object.values(sensorTables)) {
      await sql.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          temperature NUMERIC NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    res.status(200).json({ message: "Temperature tables created successfully" });
  } catch (error) {
    console.error("Failed to create temperature tables:", error);
    res.status(500).json({ error: "Failed to create temperature tables" });
  }
});

// POST: Save current temp AND delete entries older than 24 hours
app.post("/api/temp/:sensor", authenticate, async (req, res) => {
  try {
    const tableName = getSensorTable(req.params.sensor);
    if (!tableName) {
      return res.status(404).json({ error: "Unknown temperature sensor" });
    }

    const temperature = req.body?.temperature;

    if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
      return res
        .status(400)
        .json({ error: "Temperature must be a finite number" });
    }
    // 1. Delete data older than 24 hours
    // 1. Delete data older than 24 hours
    await sql.query(`
      WHERE timestamp < NOW() - INTERVAL '24 hours';
      WHERE timestamp < NOW() - INTERVAL '24 hours';
    `);
    // 2. Insert the new temperature
    // 2. Insert the new temperature
    const result = await sql.query(
      `INSERT INTO ${tableName} (temperature) VALUES ($1) RETURNING *;`,
      [temperature]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to process temperature data:", error);
    res.status(500).json({ error: "Failed to process data" });
  }
});

// GET: Retrieve data
app.get("/api/temp/:sensor", authenticate, async (req, res) => {
  try {
    const tableName = getSensorTable(req.params.sensor);
    if (!tableName) {
      return res.status(404).json({ error: "Unknown temperature sensor" });
    }

    const result = await sql.query(
      `SELECT * FROM ${tableName} ORDER BY timestamp DESC;`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Failed to fetch temperature data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

module.exports = app;

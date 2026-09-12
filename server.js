const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

/* ==================================================
   ENVIRONMENT
================================================== */

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

/* ==================================================
   DATABASE
================================================== */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
});

/* ==================================================
   MIDDLEWARE
================================================== */

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ==================================================
   HELPERS
================================================== */

function generateReference(prefix = "MMA") {
  return (
    prefix +
    "_" +
    Date.now() +
    "_" +
    crypto.randomBytes(6).toString("hex")
  );
}

function generateAccountNumber() {
  const random = Math.floor(
    10000000 + Math.random() * 90000000
  );

  return "81" + random;
}

function money(kobo) {
  return Number(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

/* ==================================================
   AUTH MIDDLEWARE
================================================== */

function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Ba a shiga account ba."
      });
    }

    const token = header.substring(7);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Session ta ƙare ko token bai dace ba."
    });
  }
}

/* ==================================================
   DATABASE INITIALIZATION
================================================== */

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,

      name TEXT NOT NULL,

      phone TEXT UNIQUE,

      email TEXT UNIQUE,

      password_hash TEXT NOT NULL,

      pin_hash TEXT NOT NULL,

      account_number VARCHAR(10) UNIQUE NOT NULL,

      status TEXT NOT NULL DEFAULT 'ACTIVE',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,

      user_id BIGINT UNIQUE NOT NULL,

      balance BIGINT NOT NULL DEFAULT 0,

      currency VARCHAR(3) NOT NULL DEFAULT 'NGN',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT fk_wallet_user
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

      CONSTRAINT wallet_balance_positive
        CHECK(balance >= 0)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,

      reference VARCHAR(150) UNIQUE NOT NULL,

      user_id BIGINT NOT NULL,

      type VARCHAR(50) NOT NULL,

      amount BIGINT NOT NULL,

      balance_before BIGINT NOT NULL,

      balance_after BIGINT NOT NULL,

      status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',

      description TEXT,

      metadata JSONB,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT fk_transaction_user
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_account
      ON users(account_number);

    CREATE INDEX IF NOT EXISTS idx_users_phone
      ON users(phone);

    CREATE INDEX IF NOT EXISTS idx_users_email
      ON users(email);

    CREATE INDEX IF NOT EXISTS idx_transactions_user
      ON transactions(user_id);

    CREATE INDEX IF NOT EXISTS idx_transactions_created
      ON transactions(created_at DESC);
  `);

  console.log("Database initialized successfully.");
}

/* ==================================================
   HOME
================================================== */

app.get("/", (req, res) => {
  res.json({
    success: true,
    app: "MMA Bank",
    version: "2.0.0",
    message: "MMA Bank backend yana aiki."
  });
});

/* ==================================================
   HEALTH
================================================== */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      server: "online",
      database: "connected",
      time: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      server: "online",
      database: "offline"
    });
  }
});

/* ==================================================
   REGISTER
================================================== */

app.post("/api/auth/register", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      name,
      phone,
      email,
      password,
      pin
    } = req.body;

    if (!name || !password || !pin) {
      return res.status(400).json({
        success: false,
        message: "Suna, password da PIN dole ne."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password dole ta kasance akalla characters 6."
      });
    }

    if (!/^[0-9]{4}$/.test(String(pin))) {
      return res.status(400).json({
        success: false,
        message: "PIN dole ya kasance lambobi 4."
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const pinHash = await bcrypt.hash(
      String(pin),
      12
    );

    await client.query("BEGIN");

    let accountNumber = null;

    for (let i = 0; i < 20; i++) {
      const candidate = generateAccountNumber();

      const exists = await client.query(
        `
        SELECT id
        FROM users
        WHERE account_number = $1
        `,
        [candidate]
      );

      if (exists.rowCount === 0) {
        accountNumber = candidate;
        break;
      }
    }

    if (!accountNumber) {
      throw new Error(
        "ACCOUNT_NUMBER_GENERATION_FAILED"
      );
    }

    const result = await client.query(
      `
      INSERT INTO users
      (
        name,
        phone,
        email,
        password_hash,
        pin_hash,
        account_number
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING
        id,
        name,
        phone,
        email,
        account_number,
        status,
        created_at
      `,
      [
        String(name).trim(),
        phone ? String(phone).trim() : null,
        email ? String(email).trim() : null,
        passwordHash,
        pinHash,
        accountNumber
      ]
    );

    const user = result.rows[0];

    await client.query(
      `
      INSERT INTO wallets
      (
        user_id,
        balance,
        currency
      )
      VALUES ($1,0,'NGN')
      `,
      [user.id]
    );

    await client.query("COMMIT");

    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: "An ƙirƙiri MMA Bank account.",
      token,

      user,

      wallet: {
        balance: 0,
        balanceFormatted: "₦0.00",
        currency: "NGN",
        accountNumber: user.account_number
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "Phone ko email ya riga ya wanzu."
      });
    }

    res.status(500).json({
      success: false,
      message: "An kasa ƙirƙirar account."
    });

  } finally {
    client.release();
  }
});

/* ==================================================
   LOGIN
================================================== */

app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      identifier,
      password
    } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Saka phone/email/account number da password."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        phone,
        email,
        password_hash,
        account_number,
        status,
        created_at
      FROM users
      WHERE phone = $1
         OR email = $1
         OR account_number = $1
      LIMIT 1
      `,
      [String(identifier).trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Login details ba daidai ba ne."
      });
    }

    const user = result.rows[0];

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message:
          "An dakatar da wannan account."
      });
    }

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Login details ba daidai ba ne."
      });
    }

    delete user.password_hash;

    const token = signToken(user);

    res.json({
      success: true,
      message: "An shiga MMA Bank.",
      token,
      user
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Login ya kasa."
    });
  }
});

/* ==================================================
   CURRENT USER / DASHBOARD
================================================== */

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.account_number,
        u.status,
        u.created_at,

        w.balance,
        w.currency,
        w.updated_at AS wallet_updated_at

      FROM users u

      JOIN wallets w
        ON w.user_id = u.id

      WHERE u.id = $1
      `,
      [req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User bai wanzu ba."
      });
    }

    const row = result.rows[0];

    res.json({
      success: true,

      user: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        accountNumber: row.account_number,
        status: row.status,
        createdAt: row.created_at
      },

      wallet: {
        balance: Number(row.balance),
        balanceFormatted:
          "₦" + money(Number(row.balance)),
        currency: row.currency,
        updatedAt: row.wallet_updated_at
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "An kasa ɗauko dashboard."
    });
  }
});

/* ==================================================
   WALLET
================================================== */

app.get("/api/wallet", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        w.balance,
        w.currency,
        u.account_number
      FROM wallets w
      JOIN users u
        ON u.id = w.user_id
      WHERE w.user_id = $1
      `,
      [req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Wallet bai wanzu ba."
      });
    }

    const wallet = result.rows[0];

    res.json({
      success: true,

      wallet: {
        balance: Number(wallet.balance),

        balanceFormatted:
          "₦" + money(Number(wallet.balance)),

        currency: wallet.currency,

        accountNumber:
          wallet.account_number
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "An kasa ɗauko wallet."
    });
  }
});

/* ==================================================
   TRANSACTION HISTORY
================================================== */

app.get(
  "/api/transactions",
  auth,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          reference,
          type,
          amount,
          balance_before,
          balance_after,
          status,
          description,
          metadata,
          created_at

        FROM transactions

        WHERE user_id = $1

        ORDER BY id DESC

        LIMIT 100
        `,
        [req.userId]
      );

      res.json({
        success: true,

        transactions:
          result.rows.map(tx => ({
            id: tx.id,
            reference: tx.reference,
            type: tx.type,

            amount: Number(tx.amount),

            amountFormatted:
              "₦" + money(Number(tx.amount)),

            balanceBefore:
              Number(tx.balance_before),

            balanceAfter:
              Number(tx.balance_after),

            status: tx.status,

            description: tx.description,

            metadata: tx.metadata,

            createdAt: tx.created_at
          }))
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "An kasa ɗauko tarihin transactions."
      });
    }
  }
);

/* ==================================================
   FIND ACCOUNT
================================================== */

app.get(
  "/api/users/account/:accountNumber",
  auth,
  async (req, res) => {
    try {
      const accountNumber =
        String(req.params.accountNumber).trim();

      const result = await pool.query(
        `
        SELECT
          id,
          name,
          account_number,
          status
        FROM users
        WHERE account_number = $1
          AND status = 'ACTIVE'
        LIMIT 1
        `,
        [accountNumber]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Ba a sami wannan account number ba."
        });
      }

      const user = result.rows[0];

      res.json({
        success: true,

        user: {
          name: user.name,
          accountNumber:
            user.account_number
        }
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "An kasa bincika account."
      });
    }
  }
);

/* ==================================================
   INTERNAL MMA TRANSFER
================================================== */

app.post(
  "/api/transfers/internal",
  auth,
  async (req, res) => {

    const client = await pool.connect();

    try {
      const {
        accountNumber,
        amount,
        pin,
        description
      } = req.body;

      if (
        !accountNumber ||
        amount === undefined ||
        !pin
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Account number, amount da PIN dole ne."
        });
      }

      if (!/^[0-9]{4}$/.test(String(pin))) {
        return res.status(400).json({
          success: false,
          message:
            "PIN dole ya kasance lambobi 4."
        });
      }

      const numericAmount = Number(amount);

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Adadin kuɗi bai dace ba."
        });
      }

      const amountKobo =
        Math.round(numericAmount * 100);

      if (amountKobo < 100) {
        return res.status(400).json({
          success: false,
          message:
            "Mafi ƙarancin transfer shine ₦1."
        });
      }

      await client.query("BEGIN");

      /* ------------------------------------------
         SENDER WALLET LOCK
      ------------------------------------------ */

      const senderWallet =
        await client.query(
          `
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
          `,
          [req.userId]
        );

      if (senderWallet.rowCount === 0) {
        throw new Error(
          "SENDER_WALLET_NOT_FOUND"
        );
      }

      /* ------------------------------------------
         SENDER USER
      ------------------------------------------ */

      const senderUser =
        await client.query(
          `
          SELECT
            id,
            name,
            pin_hash,
            account_number
          FROM users
          WHERE id = $1
          `,
          [req.userId]
        );

      if (senderUser.rowCount === 0) {
        throw new Error(
          "SENDER_USER_NOT_FOUND"
        );
      }

      /* ------------------------------------------
         CHECK PIN
      ------------------------------------------ */

      const validPin =
        await bcrypt.compare(
          String(pin),
          senderUser.rows[0].pin_hash
        );

      if (!validPin) {
        await client.query("ROLLBACK");

        return res.status(401).json({
          success: false,
          message: "PIN bai dace ba."
        });
      }

      /* ------------------------------------------
         RECEIVER
      ------------------------------------------ */

      const receiver =
        await client.query(
          `
          SELECT
            id,
            name,
            account_number
          FROM users
          WHERE account_number = $1
            AND status = 'ACTIVE'
          LIMIT 1
          `,
          [String(accountNumber).trim()]
        );

      if (receiver.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message:
            "Ba a sami wannan account number ba."
        });
      }

      const receiverUser =
        receiver.rows[0];

      if (
        Number(receiverUser.id) ===
        Number(req.userId)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Ba za ka iya tura wa kanka ba."
        });
      }

      /* ------------------------------------------
         RECEIVER WALLET LOCK
      ------------------------------------------ */

      const receiverWallet =
        await client.query(
          `
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
          `,
          [receiverUser.id]
        );

      if (receiverWallet.rowCount === 0) {
        throw new Error(
          "RECEIVER_WALLET_NOT_FOUND"
        );
      }

      const senderBalance =
        Number(senderWallet.rows[0].balance);

      const receiverBalance =
        Number(receiverWallet.rows[0].balance);

      /* ------------------------------------------
         BALANCE CHECK
      ------------------------------------------ */

      if (senderBalance < amountKobo) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Kuɗin wallet bai isa ba."
        });
      }

      const senderAfter =
        senderBalance - amountKobo;

      const receiverAfter =
        receiverBalance + amountKobo;

      const reference =
        generateReference("TRF");

      /* ------------------------------------------
         UPDATE SENDER
      ------------------------------------------ */

      await client.query(
        `
        UPDATE wallets

        SET
          balance = $1,
          updated_at = NOW()

        WHERE user_id = $2
        `,
        [
          senderAfter,
          req.userId
        ]
      );

      /* ------------------------------------------
         UPDATE RECEIVER
      ------------------------------------------ */

      await client.query(
        `
        UPDATE wallets

        SET
          balance = $1,
          updated_at = NOW()

        WHERE user_id = $2
        `,
        [
          receiverAfter,
          receiverUser.id
        ]
      );

      /* ------------------------------------------
         SENDER TRANSACTION
      ------------------------------------------ */

      await client.query(
        `
        INSERT INTO transactions
        (
          reference,
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          status,
          description,
          metadata
        )

        VALUES
        (
          $1,
          $2,
          'TRANSFER_OUT',
          $3,
          $4,
          $5,
          'SUCCESS',
          $6,
          $7
        )
        `,
        [
          reference + "_OUT",

          req.userId,

          amountKobo,

          senderBalance,

          senderAfter,

          description ||
            `Transfer zuwa ${receiverUser.name}`,

          JSON.stringify({
            receiverAccount:
              receiverUser.account_number,

            receiverUserId:
              receiverUser.id,

            transferReference:
              reference
          })
        ]
      );

      /* ------------------------------------------
         RECEIVER TRANSACTION
      ------------------------------------------ */

      await client.query(
        `
        INSERT INTO transactions
        (
          reference,
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          status,
          description,
          metadata
        )

        VALUES
        (
          $1,
          $2,
          'TRANSFER_IN',
          $3,
          $4,
          $5,
          'SUCCESS',
          $6,
          $7
        )
        `,
        [
          reference + "_IN",

          receiverUser.id,

          amountKobo,

          receiverBalance,

          receiverAfter,

          `An karɓi kuɗi daga ${senderUser.rows[0].name}`,

          JSON.stringify({
            senderAccount:
              senderUser.rows[0].account_number,

            senderUserId:
              req.userId,

            transferReference:
              reference
          })
        ]
      );

      await client.query("COMMIT");

      /* ------------------------------------------
         SUCCESS
      ------------------------------------------ */

      return res.json({
        success: true,

        message:
          "An tura kuɗin cikin nasara.",

        reference,

        amount:
          numericAmount,

        amountFormatted:
          "₦" + money(amountKobo),

        receiver: {
          name:
            receiverUser.name,

          accountNumber:
            receiverUser.account_number
        },

        wallet: {
          balance:
            senderAfter,

          balanceFormatted:
            "₦" + money(senderAfter),

          currency: "NGN"
        }
      });

    } catch (error) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      console.error(error);

      return res.status(500).json({
        success: false,
        message:
          "An kasa kammala transfer."
      });

    } finally {
      client.release();
    }
  }
);

/* ==================================================
   404
================================================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route ba a samu ba.",
    path: req.originalUrl
  });
});

/* ==================================================
   GLOBAL ERROR HANDLER
================================================== */

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

/* ==================================================
   START SERVER
================================================== */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `MMA Bank server running on port ${PORT}`
      );
    });

  } catch (error) {
    console.error(
      "SERVER START FAILED:",
      error
    );

    process.exit(1);
  }
}

startServer();

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
==================================================
DATABASE
==================================================
*/

const db = new Database("./mma-bank.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/*
==================================================
CREATE TABLES
==================================================
*/

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    account_number TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'NGN',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    reference TEXT UNIQUE NOT NULL,

    user_id INTEGER NOT NULL,

    type TEXT NOT NULL,

    amount INTEGER NOT NULL,

    balance_before INTEGER NOT NULL,

    balance_after INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'SUCCESS',

    description TEXT,

    metadata TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user
  ON transactions(user_id);

  CREATE INDEX IF NOT EXISTS idx_transactions_reference
  ON transactions(reference);
`);

/*
==================================================
HELPER FUNCTIONS
==================================================
*/

function generateReference(prefix = "MMA") {
  return (
    prefix +
    "_" +
    Date.now() +
    "_" +
    crypto.randomBytes(5).toString("hex")
  );
}


function generateAccountNumber() {

  let accountNumber;

  while (true) {

    accountNumber =
      "81" +
      Math.floor(
        10000000 + Math.random() * 90000000
      );

    const exists = db
      .prepare(
        "SELECT id FROM users WHERE account_number = ?"
      )
      .get(accountNumber);

    if (!exists) {
      break;
    }
  }

  return accountNumber;
}


function getUser(userId) {

  return db
    .prepare(
      `
      SELECT
        id,
        name,
        phone,
        email,
        account_number,
        created_at
      FROM users
      WHERE id = ?
      `
    )
    .get(userId);
}


function getWallet(userId) {

  return db
    .prepare(
      `
      SELECT
        id,
        user_id,
        balance,
        currency,
        updated_at
      FROM wallets
      WHERE user_id = ?
      `
    )
    .get(userId);
}


function money(amount) {

  return Number(amount).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
}


/*
==================================================
HOME
==================================================
*/

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "MMA Bank server yana aiki.",
    version: "1.0.0"
  });

});


/*
==================================================
HEALTH CHECK
==================================================
*/

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    server: "online",
    database: "connected",
    time: new Date().toISOString()
  });

});


/*
==================================================
CREATE USER
==================================================
*/

app.post("/api/users", (req, res) => {

  try {

    const {
      name,
      phone,
      email
    } = req.body;

    if (!name) {

      return res.status(400).json({
        success: false,
        message: "Suna ya zama dole."
      });

    }

    const accountNumber =
      generateAccountNumber();

    const result = db
      .prepare(
        `
        INSERT INTO users
        (
          name,
          phone,
          email,
          account_number
        )
        VALUES (?, ?, ?, ?)
        `
      )
      .run(
        name,
        phone || null,
        email || null,
        accountNumber
      );

    const userId = result.lastInsertRowid;

    db.prepare(
      `
      INSERT INTO wallets
      (
        user_id,
        balance,
        currency
      )
      VALUES (?, 0, 'NGN')
      `
    ).run(userId);

    const user = getUser(userId);

    res.status(201).json({
      success: true,
      message: "An ƙirƙiri account.",
      user,
      wallet: getWallet(userId)
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "An samu matsala wajen ƙirƙirar account."
    });

  }

});


/*
==================================================
GET USER
==================================================
*/

app.get("/api/users/:id", (req, res) => {

  const userId = Number(req.params.id);

  const user = getUser(userId);

  if (!user) {

    return res.status(404).json({
      success: false,
      message: "Ba a sami user ba."
    });

  }

  res.json({
    success: true,
    user,
    wallet: getWallet(userId)
  });

});


/*
==================================================
GET WALLET BALANCE
==================================================
*/

app.get("/api/wallet/:userId", (req, res) => {

  const userId = Number(req.params.userId);

  const user = getUser(userId);

  if (!user) {

    return res.status(404).json({
      success: false,
      message: "User bai wanzu ba."
    });

  }

  const wallet = getWallet(userId);

  res.json({
    success: true,

    wallet: {
      userId: wallet.user_id,
      balance: wallet.balance,
      balanceFormatted:
        "₦" + money(wallet.balance),
      currency: wallet.currency,
      accountNumber:
        user.account_number
    }
  });

});


/*
==================================================
TRANSACTION HISTORY
==================================================
*/

app.get(
  "/api/wallet/:userId/transactions",
  (req, res) => {

    const userId = Number(req.params.userId);

    const user = getUser(userId);

    if (!user) {

      return res.status(404).json({
        success: false,
        message: "User bai wanzu ba."
      });

    }

    const transactions = db
      .prepare(
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
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 100
        `
      )
      .all(userId);

    res.json({
      success: true,
      transactions
    });

  }
);


/*
==================================================
TEST DEPOSIT
==================================================

IMPORTANT:
Wannan NA GWAJI ne kawai.

Kada a bar wannan endpoint
a production/live money.
==================================================
*/

app.post(
  "/api/test/deposit",
  (req, res) => {

    try {

      const {
        userId,
        amount
      } = req.body;

      const numericUserId =
        Number(userId);

      const numericAmount =
        Number(amount);

      if (!numericUserId) {

        return res.status(400).json({
          success: false,
          message: "userId ya zama dole."
        });

      }

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message: "Amount bai yi daidai ba."
        });

      }

      /*
      Muna amfani da Kobo a database.

      ₦100 = 10000 kobo

      Amma frontend zai nuna ₦100.00
      */

      const amountKobo =
        Math.round(numericAmount * 100);

      const user = getUser(
        numericUserId
      );

      if (!user) {

        return res.status(404).json({
          success: false,
          message: "User bai wanzu ba."
        });

      }

      const reference =
        generateReference("TESTDEP");

      const transaction =
        db.transaction(() => {

          const wallet =
            getWallet(numericUserId);

          const before =
            wallet.balance;

          const after =
            before + amountKobo;

          db.prepare(
            `
            UPDATE wallets
            SET
              balance = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            `
          ).run(
            after,
            numericUserId
          );

          db.prepare(
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
              description
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
            `
          ).run(
            reference,
            numericUserId,
            "DEPOSIT",
            amountKobo,
            before,
            after,
            "SUCCESS",
            "Test deposit"
          );

          return {
            before,
            after
          };

        });

      res.json({

        success: true,

        message:
          "An ƙara kuɗin TEST wallet.",

        reference,

        amount:
          numericAmount,

        balance:
          transaction.after / 100,

        balanceFormatted:
          "₦" +
          money(
            transaction.after / 100
          )

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "An kasa ƙara kuɗi."
      });

    }

  }
);


/*
==================================================
SPEND FROM WALLET
==================================================

Za mu yi amfani da wannan daga baya
ga Airtime / Data / Electricity.
==================================================
*/

function debitWallet({
  userId,
  amountKobo,
  type,
  description,
  metadata = {}
}) {

  const transaction =
    db.transaction(() => {

      const wallet =
        getWallet(userId);

      if (!wallet) {

        throw new Error(
          "WALLET_NOT_FOUND"
        );

      }

      if (
        amountKobo <= 0
      ) {

        throw new Error(
          "INVALID_AMOUNT"
        );

      }

      if (
        wallet.balance < amountKobo
      ) {

        throw new Error(
          "INSUFFICIENT_BALANCE"
        );

      }

      const before =
        wallet.balance;

      const after =
        before - amountKobo;

      const reference =
        generateReference(type);

      db.prepare(
        `
        UPDATE wallets
        SET
          balance = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        `
      ).run(
        after,
        userId
      );

      db.prepare(
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
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        reference,
        userId,
        type,
        amountKobo,
        before,
        after,
        "SUCCESS",
        description || null,
        JSON.stringify(metadata)
      );

      return {
        reference,
        before,
        after
      };

    });

  return transaction;
}


/*
==================================================
TEST WITHDRAW / DEBIT

NA GWAJI NE.

Daga baya Airtime/Transfer/Withdrawal
zai yi amfani da secure provider.
==================================================
*/

app.post(
  "/api/test/debit",
  (req, res) => {

    try {

      const {
        userId,
        amount
      } = req.body;

      const numericUserId =
        Number(userId);

      const numericAmount =
        Number(amount);

      if (!numericUserId) {

        return res.status(400).json({
          success: false,
          message:
            "userId ya zama dole."
        });

      }

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Amount bai yi daidai ba."
        });

      }

      const amountKobo =
        Math.round(
          numericAmount * 100
        );

      const result =
        debitWallet({

          userId:
            numericUserId,

          amountKobo,

          type:
            "TEST_DEBIT",

          description:
            "Test wallet debit"

        });

      res.json({

        success: true,

        message:
          "An cire kuɗi daga TEST wallet.",

        reference:
          result.reference,

        amount:
          numericAmount,

        balance:
          result.after / 100,

        balanceFormatted:
          "₦" +
          money(
            result.after / 100
          )

      });

    } catch (error) {

      console.error(error);

      if (
        error.message ===
        "INSUFFICIENT_BALANCE"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Kuɗin wallet bai isa ba."
        });

      }

      res.status(500).json({
        success: false,
        message:
          "An kasa cire kuɗi."
      });

    }

  }
);


/*
==================================================
START SERVER
==================================================
*/

app.listen(
  PORT,
  () => {

    console.log(
      `MMA Bank server yana aiki a port ${PORT}`
    );

    console.log(
      `http://localhost:${PORT}`
    );

  }
);

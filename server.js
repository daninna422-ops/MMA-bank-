const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

/*
==================================================
SERVER
==================================================
*/

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
==================================================
DATABASE
==================================================
*/

/*
Render zai iya amfani da DATA_DIR idan
an saita shi.

Idan babu DATA_DIR:
./data

Idan kana da Render Persistent Disk:
DATA_DIR = /var/data
*/

const DATA_DIR =
  process.env.DATA_DIR ||
  path.join(process.cwd(), "data");

/*
Tabbatar folder ɗin database yana wanzu.
Wannan shi ne gyaran babban error ɗinmu.
*/

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

const DB_PATH =
  path.join(DATA_DIR, "mma-bank.db");

console.log("Database path:", DB_PATH);

const db =
  new Database(DB_PATH);

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

    created_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER UNIQUE NOT NULL,

    balance INTEGER NOT NULL DEFAULT 0,

    currency TEXT NOT NULL DEFAULT 'NGN',

    updated_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

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

    status TEXT NOT NULL
      DEFAULT 'SUCCESS',

    description TEXT,

    metadata TEXT,

    created_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS
    idx_transactions_user
    ON transactions(user_id);

  CREATE INDEX IF NOT EXISTS
    idx_transactions_reference
    ON transactions(reference);
`);

/*
==================================================
HELPERS
==================================================
*/

function generateReference(prefix = "MMA") {
  return (
    prefix +
    "_" +
    Date.now() +
    "_" +
    crypto
      .randomBytes(5)
      .toString("hex")
  );
}


/*
==================================================
GENERATE ACCOUNT NUMBER
==================================================
*/

function generateAccountNumber() {
  let accountNumber;

  while (true) {

    accountNumber =
      "81" +
      Math.floor(
        10000000 +
        Math.random() * 90000000
      );

    const exists =
      db.prepare(
        `
        SELECT id
        FROM users
        WHERE account_number = ?
        `
      ).get(accountNumber);

    if (!exists) {
      return accountNumber;
    }
  }
}


/*
==================================================
GET USER
==================================================
*/

function getUser(userId) {

  return db.prepare(
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
  ).get(userId);
}


/*
==================================================
GET USER BY PHONE
==================================================
*/

function getUserByPhone(phone) {

  return db.prepare(
    `
    SELECT
      id,
      name,
      phone,
      email,
      account_number,
      created_at
    FROM users
    WHERE phone = ?
    `
  ).get(phone);
}


/*
==================================================
GET USER BY EMAIL
==================================================
*/

function getUserByEmail(email) {

  return db.prepare(
    `
    SELECT
      id,
      name,
      phone,
      email,
      account_number,
      created_at
    FROM users
    WHERE email = ?
    `
  ).get(email);
}


/*
==================================================
GET USER BY ACCOUNT NUMBER
==================================================
*/

function getUserByAccountNumber(accountNumber) {

  return db.prepare(
    `
    SELECT
      id,
      name,
      phone,
      email,
      account_number,
      created_at
    FROM users
    WHERE account_number = ?
    `
  ).get(accountNumber);
}


/*
==================================================
GET WALLET
==================================================
*/

function getWallet(userId) {

  return db.prepare(
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
  ).get(userId);
}


/*
==================================================
MONEY FORMAT
==================================================
*/

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
VALIDATE AMOUNT
==================================================
*/

function convertToKobo(amount) {

  const numericAmount =
    Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    return null;
  }

  return Math.round(
    numericAmount * 100
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

    message:
      "MMA Bank server yana aiki.",

    version:
      "1.0.0",

    database:
      "connected"
  });

});


/*
==================================================
HEALTH CHECK
==================================================
*/

app.get(
  "/api/health",
  (req, res) => {

    try {

      db.prepare(
        "SELECT 1"
      ).get();

      res.json({

        success: true,

        server:
          "online",

        database:
          "connected",

        time:
          new Date().toISOString()

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        success: false,

        server:
          "online",

        database:
          "error"

      });

    }

  }
);


/*
==================================================
CREATE USER
==================================================
*/

app.post(
  "/api/users",
  (req, res) => {

    try {

      const {
        name,
        phone,
        email
      } = req.body;

      if (!name || !String(name).trim()) {

        return res.status(400).json({

          success: false,

          message:
            "Suna ya zama dole."

        });

      }

      const cleanName =
        String(name).trim();

      const cleanPhone =
        phone
          ? String(phone).trim()
          : null;

      const cleanEmail =
        email
          ? String(email)
              .trim()
              .toLowerCase()
          : null;

      /*
      Check phone
      */

      if (cleanPhone) {

        const phoneExists =
          getUserByPhone(cleanPhone);

        if (phoneExists) {

          return res.status(409).json({

            success: false,

            message:
              "Wannan lambar waya tana da account."

          });

        }

      }

      /*
      Check email
      */

      if (cleanEmail) {

        const emailExists =
          getUserByEmail(cleanEmail);

        if (emailExists) {

          return res.status(409).json({

            success: false,

            message:
              "Wannan email yana da account."

          });

        }

      }

      const accountNumber =
        generateAccountNumber();

      const createUser =
        db.transaction(() => {

          const result =
            db.prepare(
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
            ).run(
              cleanName,
              cleanPhone,
              cleanEmail,
              accountNumber
            );

          const userId =
            result.lastInsertRowid;

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

          return Number(userId);

        });

      const user =
        getUser(createUser);

      const wallet =
        getWallet(createUser);

      res.status(201).json({

        success: true,

        message:
          "An ƙirƙiri account.",

        user,

        wallet

      });

    } catch (error) {

      console.error(
        "CREATE USER ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "An samu matsala wajen ƙirƙirar account."

      });

    }

  }
);


/*
==================================================
GET USER
==================================================
*/

app.get(
  "/api/users/:id",
  (req, res) => {

    const userId =
      Number(req.params.id);

    if (!Number.isInteger(userId)) {

      return res.status(400).json({

        success: false,

        message:
          "User ID bai yi daidai ba."

      });

    }

    const user =
      getUser(userId);

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "Ba a sami user ba."

      });

    }

    res.json({

      success: true,

      user,

      wallet:
        getWallet(userId)

    });

  }
);


/*
==================================================
GET USER BY ACCOUNT NUMBER
==================================================
*/

app.get(
  "/api/account/:accountNumber",
  (req, res) => {

    const accountNumber =
      String(
        req.params.accountNumber
      ).trim();

    const user =
      getUserByAccountNumber(
        accountNumber
      );

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "Ba a sami account ba."

      });

    }

    res.json({

      success: true,

      user,

      wallet:
        getWallet(user.id)

    });

  }
);


/*
==================================================
GET WALLET
==================================================
*/

app.get(
  "/api/wallet/:userId",
  (req, res) => {

    const userId =
      Number(req.params.userId);

    const user =
      getUser(userId);

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User bai wanzu ba."

      });

    }

    const wallet =
      getWallet(userId);

    if (!wallet) {

      return res.status(404).json({

        success: false,

        message:
          "Wallet bai wanzu ba."

      });

    }

    res.json({

      success: true,

      wallet: {

        userId:
          wallet.user_id,

        balance:
          wallet.balance / 100,

        balanceKobo:
          wallet.balance,

        balanceFormatted:
          "₦" +
          money(
            wallet.balance / 100
          ),

        currency:
          wallet.currency,

        accountNumber:
          user.account_number

      }

    });

  }
);


/*
==================================================
TRANSACTION HISTORY
==================================================
*/

app.get(
  "/api/wallet/:userId/transactions",
  (req, res) => {

    const userId =
      Number(req.params.userId);

    const user =
      getUser(userId);

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User bai wanzu ba."

      });

    }

    const transactions =
      db.prepare(
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
      ).all(userId);

    res.json({

      success: true,

      transactions:
        transactions.map(
          transaction => ({

            ...transaction,

            amount:
              transaction.amount / 100,

            amountFormatted:
              "₦" +
              money(
                transaction.amount / 100
              ),

            balanceBefore:
              transaction.balance_before / 100,

            balanceAfter:
              transaction.balance_after / 100

          })
        )

    });

  }
);


/*
==================================================
TEST DEPOSIT
==================================================

GWAJI KAWAI.

KADA A BAR SHI A LIVE
REAL MONEY SYSTEM.
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

      if (
        !Number.isInteger(
          numericUserId
        ) ||
        numericUserId <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "userId ya zama dole."

        });

      }

      const amountKobo =
        convertToKobo(amount);

      if (amountKobo === null) {

        return res.status(400).json({

          success: false,

          message:
            "Amount bai yi daidai ba."

        });

      }

      const user =
        getUser(numericUserId);

      if (!user) {

        return res.status(404).json({

          success: false,

          message:
            "User bai wanzu ba."

        });

      }

      const reference =
        generateReference(
          "TESTDEP"
        );

      const result =
        db.transaction(() => {

          const wallet =
            getWallet(
              numericUserId
            );

          if (!wallet) {

            throw new Error(
              "WALLET_NOT_FOUND"
            );

          }

          const before =
            wallet.balance;

          const after =
            before + amountKobo;

          db.prepare(
            `
            UPDATE wallets
            SET
              balance = ?,
              updated_at =
                CURRENT_TIMESTAMP
           

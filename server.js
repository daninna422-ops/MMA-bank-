const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

/*
==================================================
MMA BANK - TEST MODE
==================================================

Wannan version din TEST MODE ne.

BA YA TURA KUDI NA GASKE.
BA YA KARBAR KUDI NA GASKE.

Za mu hada real payment services daga baya.
==================================================
*/


/*
==================================================
MIDDLEWARE
==================================================
*/

app.use(cors());

app.use(express.json());


/*
==================================================
DATABASE FOLDER
==================================================
*/

/*
Render yana iya kasa bude database idan
folder din bai wanzu ba.

Saboda haka muna kirkirar folder din
kai tsaye kafin bude SQLite database.
*/

const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
        recursive: true
    });
}


/*
==================================================
DATABASE
==================================================
*/

const dbPath = path.join(
    dataDir,
    "mma-bank.db"
);

const db = new Database(dbPath);

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

    pin_hash TEXT,

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
HELPER - REFERENCE
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
HELPER - ACCOUNT NUMBER
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
            )
            .get(accountNumber);

        if (!exists) {

            break;

        }

    }

    return accountNumber;

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
    )
    .get(userId);

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
    )
    .get(userId);

}


/*
==================================================
FORMAT MONEY
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
HOME
==================================================
*/

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "MMA Bank server yana aiki.",

        mode:
            "TEST",

        version:
            "1.0.0"

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

        server:
            "online",

        database:
            "connected",

        mode:
            "TEST",

        time:
            new Date().toISOString()

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

                message:
                    "Suna ya zama dole."

            });

        }


        const accountNumber =
            generateAccountNumber();


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
            )
            .run(
                name,
                phone || null,
                email || null,
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
        )
        .run(userId);


        const user =
            getUser(userId);


        const wallet =
            getWallet(userId);


        res.status(201).json({

            success: true,

            message:
                "An kirkiri account.",

            user,

            wallet

        });


    } catch (error) {

        console.error(error);


        if (
            error.code ===
            "SQLITE_CONSTRAINT_UNIQUE"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Phone ko Email din yana cikin wani account."

            });

        }


        res.status(500).json({

            success: false,

            message:
                "An samu matsala wajen kirkirar account."

        });

    }

});


/*
==================================================
GET USER
==================================================
*/

app.get("/api/users/:id", (req, res) => {

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

});


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
            )
            .all(userId);


        const formatted =
            transactions.map(tx => ({

                id:
                    tx.id,

                reference:
                    tx.reference,

                type:
                    tx.type,

                amount:
                    tx.amount / 100,

                amountFormatted:
                    "₦" +
                    money(tx.amount / 100),

                balanceBefore:
                    tx.balance_before / 100,

                balanceAfter:
                    tx.balance_after / 100,

                status:
                    tx.status,

                description:
                    tx.description,

                metadata:
                    tx.metadata
                        ? JSON.parse(tx.metadata)
                        : null,

                createdAt:
                    tx.created_at

            }));


        res.json({

            success: true,

            transactions:
                formatted

        });

    }
);


/*
==================================================
TEST DEPOSIT
==================================================

WANNAN TEST NE KAWAI.

Misali:

POST /api/test/deposit

{
    "userId": 1,
    "amount": 1000
}

Zai kara ₦1,000 zuwa TEST wallet.
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


            if (
                !Number.isInteger(
                    numericUserId
                ) ||
                numericUserId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "userId bai yi daidai ba."

                });

            }


            if (
                !Number.isFinite(
                    numericAmount
                ) ||
                numericAmount <= 0
            ) {

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


            const amountKobo =
                Math.round(
                    numericAmount * 100
                );


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


                    const before =
                        wallet.balance;


                    const after =
                        before +
                        amountKobo;


                    db.prepare(
                        `
                        UPDATE wallets

                        SET
                            balance = ?,
                            updated_at =
                                CURRENT_TIMESTAMP

                        WHERE user_id = ?
                        `
                    )
                    .run(
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
                    )
                    .run(

                        reference,

                        numericUserId,

                        "TEST_DEPOSIT",

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

                })();


            res.json({

                success: true,

                mode:
                    "TEST",

                message:
                    "An kara kudin TEST wallet.",

                reference,

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


            res.status(500).json({

                success: false,

                message:
                    "An kasa kara kudin."

            });

        }

    }
);


/*
==================================================
DEBIT WALLET FUNCTION
==================================================
*/

function debitWallet({

    userId,

    amountKobo,

    type,

    description,

    metadata = {}

}) {

    return db.transaction(() => {

        const wallet =
            getWallet(userId);


        if (!wallet) {

            throw new Error(
                "WALLET_NOT_FOUND"
            );

        }


        if (
            !Number.isInteger(
                amountKobo
            ) ||
            amountKobo <= 0
        ) {

            throw new Error(
                "INVALID_AMOUNT"
            );

        }


        if (
            wallet.balance <
            amountKobo
        ) {

            throw new Error(
                "INSUFFICIENT_BALANCE"
            );

        }


        const before =
            wallet.balance;


        const after =
            before -
            amountKobo;


        const reference =
            generateReference(type);


        db.prepare(
            `
            UPDATE wallets

            SET
                balance = ?,
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE user_id = ?
            `
        )
        .run(
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
        )
        .run(

            reference,

            userId,

            type,

            amountKobo,

            before,

            after,

            "SUCCESS",

            description || null,

            JSON.stringify(
                metadata
            )

        );


        return {

            reference,

            before,

            after

        };

    })();

}


/*
==================================================
TEST DEBIT
==================================================

WANNAN MA TEST NE.

Ana iya amfani da shi yanzu domin
gwada cire kudi daga wallet.
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


            if (
                !Number.isInteger(
                    numericUserId
                ) ||
                numericUserId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "userId bai yi daidai ba."

                });

            }


            if (
                !Number.isFinite(
                    numericAmount
                ) ||
                numericAmount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Amount bai yi daidai ba."

                });

        

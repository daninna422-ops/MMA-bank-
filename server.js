const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve HTML/CSS/JS files
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// DEMO USER DATA
// ===============================

let user = {
  name: "Mubarak",
  accountNumber: "8123456789",
  balance: 1000
};

let transactions = [
  {
    type: "credit",
    name: "Initial Balance",
    description: "Demo wallet",
    amount: 1000,
    date: new Date().toLocaleString()
  }
];

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// GET ACCOUNT
// ===============================

app.get("/api/account", (req, res) => {
  res.json({
    success: true,
    user: {
      name: user.name,
      accountNumber: user.accountNumber,
      balance: user.balance
    },
    transactions
  });
});

// ===============================
// ADD MONEY
// ===============================

app.post("/api/deposit", (req, res) => {

  const amount = Number(req.body.amount);

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Shigar da adadin kuɗi daidai."
    });
  }

  user.balance += amount;

  transactions.unshift({
    type: "credit",
    name: "Add Money",
    description: "An ƙara kuɗi",
    amount: amount,
    date: new Date().toLocaleString()
  });

  res.json({
    success: true,
    message: "An ƙara kuɗi cikin wallet.",
    balance: user.balance
  });
});

// ===============================
// AIRTIME
// ===============================

app.post("/api/airtime", (req, res) => {

  const {
    phone,
    network,
    amount
  } = req.body;

  const airtimeAmount = Number(amount);

  // Check phone
  if (!phone || phone.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Lambar waya ba daidai ba ce."
    });
  }

  // Check network
  if (!network) {
    return res.status(400).json({
      success: false,
      message: "Da fatan zaɓi Network."
    });
  }

  // Check amount
  if (!airtimeAmount || airtimeAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Shigar da adadin kuɗi daidai."
    });
  }

  // Check balance
  if (airtimeAmount > user.balance) {
    return res.status(400).json({
      success: false,
      message: "Kuɗin da ke wallet ɗinka bai isa ba!"
    });
  }

  // Deduct money
  user.balance -= airtimeAmount;

  // Add transaction
  transactions.unshift({
    type: "debit",
    name: "Airtime",
    description: `${network} - ${phone}`,
    amount: airtimeAmount,
    date: new Date().toLocaleString()
  });

  res.json({
    success: true,
    message: "An karɓi umarnin Airtime.",
    network,
    phone,
    amount: airtimeAmount,
    balance: user.balance
  });
});

// ===============================
// TRANSFER
// ===============================

app.post("/api/transfer", (req, res) => {

  const {
    accountNumber,
    amount
  } = req.body;

  const transferAmount = Number(amount);

  if (!accountNumber) {
    return res.status(400).json({
      success: false,
      message: "Shigar da Account Number."
    });
  }

  if (!transferAmount || transferAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Shigar da adadin kuɗi daidai."
    });
  }

  if (transferAmount > user.balance) {
    return res.status(400).json({
      success: false,
      message: "Kuɗin da ke wallet bai isa ba."
    });
  }

  // Deduct
  user.balance -= transferAmount;

  transactions.unshift({
    type: "debit",
    name: "Transfer",
    description: ` zuwa ${accountNumber}`,
    amount: transferAmount,
    date: new Date().toLocaleString()
  });

  res.json({
    success: true,
    message: "An kammala transfer na DEMO.",
    accountNumber,
    amount: transferAmount,
    balance: user.balance
  });
});

// ===============================
// WITHDRAW
// ===============================

app.post("/api/withdraw", (req, res) => {

  const amount = Number(req.body.amount);

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Shigar da adadin kuɗi daidai."
    });
  }

  if (amount > user.balance) {
    return res.status(400).json({
      success: false,
      message: "Kuɗin da ke wallet bai isa ba."
    });
  }

  user.balance -= amount;

  transactions.unshift({
    type: "debit",
    name: "Withdraw",
    description: "Cire kuɗi",
    amount: amount,
    date: new Date().toLocaleString()
  });

  res.json({
    success: true,
    message: "An yi Withdraw na DEMO.",
    balance: user.balance
  });
});

// ===============================
// TRANSACTIONS
// ===============================

app.get("/api/transactions", (req, res) => {

  res.json({
    success: true,
    transactions
  });

});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`MMA Bank server yana gudana a http://localhost:${PORT}`);
});

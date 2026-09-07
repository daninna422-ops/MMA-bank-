const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
==================================================
  SECRET KEYS
==================================================

KADA KA SAKA SU A HTML.

Za mu saka su a .env
*/

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Wannan na Airtime Provider ne.
// Za mu saka API key ɗinsa daga baya.
const AIRTIME_API_KEY = process.env.AIRTIME_API_KEY;


/*
==================================================
  HOME / TEST
==================================================
*/

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MMA Bank Server yana aiki."
  });
});


/*
==================================================
  AIRTIME
==================================================

Frontend zai kira:

POST /api/airtime

Misali:

{
  phone: "08012345678",
  network: "MTN",
  amount: 100
}
*/

app.post("/api/airtime", async (req, res) => {

  try {

    const {
      phone,
      network,
      amount
    } = req.body;


    /*
    -------------------------
    VALIDATION
    -------------------------
    */

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Ba a shigar da lambar waya ba."
      });
    }


    if (!network) {
      return res.status(400).json({
        success: false,
        message: "Da fatan zaɓi Network."
      });
    }


    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Adadin kuɗi bai dace ba."
      });
    }


    /*
    -------------------------
    PHONE VALIDATION
    -------------------------
    */

    const phoneRegex = /^0[789][01]\d{8}$/;

    if (!phoneRegex.test(phone)) {

      return res.status(400).json({
        success: false,
        message: "Lambar waya ba daidai ba ce."
      });

    }


    /*
    -------------------------
    NETWORK VALIDATION
    -------------------------
    */

    const allowedNetworks = [
      "MTN",
      "AIRTEL",
      "GLO",
      "9MOBILE"
    ];

    if (!allowedNetworks.includes(network)) {

      return res.status(400).json({
        success: false,
        message: "Network ba a yarda da shi ba."
      });

    }


    /*
    -------------------------
    AMOUNT LIMIT
    -------------------------
    */

    if (amount < 50 || amount > 50000) {

      return res.status(400).json({
        success: false,
        message: "Airtime dole ya kasance tsakanin ₦50 da ₦50,000."
      });

    }


    /*
    ==================================================
      MU TSAYA ANAN NA DAN LOKACI
    ==================================================

    Wannan yana tabbatar mana cewa request
    daga frontend yana zuwa server lafiya.

    Daga baya za mu saka ainihin VTU API a nan.
    */


    console.log("AIRTIME REQUEST");

    console.log({
      phone,
      network,
      amount
    });


    /*
    ==================================================
      MISALIN ABIN DA ZA A YI DA PROVIDER
    ==================================================

    A nan ne za mu kira Airtime Provider.

    Misali:

    const response = await axios.post(
      "PROVIDER_AIRTIME_URL",
      {
        phone: phone,
        network: network,
        amount: amount
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTIME_API_KEY}`
        }
      }
    );

    */


    /*
    ==================================================
      TEMPORARY RESPONSE
    ==================================================
    */

    return res.json({

      success: true,

      message: "An karɓi Airtime request.",

      data: {
        phone: phone,
        network: network,
        amount: amount,
        status: "pending"
      }

    });


  } catch (error) {

    console.error("AIRTIME ERROR:", error.message);

    return res.status(500).json({

      success: false,

      message: "An samu matsala wajen sarrafa Airtime."

    });

  }

});


/*
==================================================
  PAYSTACK TEST
==================================================

Wannan route zai tabbatar mana cewa
PAYSTACK_SECRET_KEY yana backend.

Ba ya sayar da Airtime.
*/

app.get("/api/paystack-test", async (req, res) => {

  try {

    if (!PAYSTACK_SECRET_KEY) {

      return res.status(500).json({
        success: false,
        message: "PAYSTACK_SECRET_KEY bai kasance a .env ba."
      });

    }


    const response = await axios.get(
      "https://api.paystack.co/balance",
      {
        headers: {
          Authorization:
            `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );


    res.json({
      success: true,
      message: "Paystack connection yana aiki.",
      data: response.data.data
    });


  } catch (error) {

    console.error(
      "PAYSTACK ERROR:",
      error.response?.data || error.message
    );


    res.status(500).json({
      success: false,
      message: "Paystack connection ya kasa."
    });

  }

});


/*
==================================================
  SERVER
==================================================
*/

app.listen(PORT, () => {

  console.log(
    `MMA Bank Server yana aiki a port ${PORT}`
  );

});

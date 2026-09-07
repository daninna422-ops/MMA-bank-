const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();


// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());

app.use(express.json());


// ===============================
// ENV VARIABLES
// ===============================

const VTPASS_USERNAME =
  process.env.VTPASS_USERNAME;

const VTPASS_PASSWORD =
  process.env.VTPASS_PASSWORD;


// ===============================
// HOME TEST
// ===============================

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "MMA Bank server yana aiki."
  });

});


// ===============================
// AIRTIME
// ===============================

app.post("/api/airtime", async (req, res) => {

  try {

    const {
      phone,
      network,
      amount
    } = req.body;


    // ===============================
    // VALIDATION
    // ===============================

    if (!phone) {

      return res.status(400).json({
        success: false,
        message: "Lambar waya ba ta zo ba."
      });

    }


    if (!network) {

      return res.status(400).json({
        success: false,
        message: "Network ba a zaɓa ba."
      });

    }


    if (!amount) {

      return res.status(400).json({
        success: false,
        message: "Amount ba a shigar ba."
      });

    }


    if (!/^0\d{10}$/.test(phone)) {

      return res.status(400).json({
        success: false,
        message: "Lambar waya ba daidai ba ce."
      });

    }


    const airtimeAmount =
      Number(amount);


    if (
      !Number.isFinite(airtimeAmount) ||
      airtimeAmount < 50
    ) {

      return res.status(400).json({
        success: false,
        message: "Amount bai dace ba."
      });

    }


    // ===============================
    // NETWORK → VTPASS SERVICE ID
    // ===============================

    const services = {

      mtn: "mtn",

      airtel: "airtel",

      glo: "glo",

      etisalat: "etisalat"

    };


    const serviceID =
      services[network];


    if (!serviceID) {

      return res.status(400).json({
        success: false,
        message: "Network ɗin ba a tallafa masa ba."
      });

    }


    // ===============================
    // REQUEST ID
    // ===============================

    const requestId =
      "MMA_" +
      Date.now() +
      "_" +
      Math.floor(
        Math.random() * 100000
      );


    // ===============================
    // VTPASS REQUEST
    // ===============================

    const response = await axios.post(

      "https://vtpass.com/api/pay",

      {

        request_id: requestId,

        serviceID: serviceID,

        amount: airtimeAmount,

        phone: phone

      },

      {

        auth: {

          username:
            VTPASS_USERNAME,

          password:
            VTPASS_PASSWORD

        },

        headers: {

          "Content-Type":
            "application/json"

        },

        timeout: 30000

      }

    );


    const data =
      response.data;


    console.log(
      "VTpass response:",
      data
    );


    // ===============================
    // CHECK SUCCESS
    // ===============================

    if (
      data &&
      (
        data.code === "000" ||
        data.response_description ===
          "TRANSACTION SUCCESSFUL"
      )
    ) {

      return res.json({

        success: true,

        message:
          "Airtime an aika cikin nasara.",

        data: data

      });

    }


    // ===============================
    // FAILED
    // ===============================

    return res.status(400).json({

      success: false,

      message:
        data?.response_description ||
        "Airtime bai yi nasara ba.",

      data: data

    });


  } catch (error) {

    console.error(
      "AIRTIME ERROR:",
      error.response?.data ||
      error.message
    );


    return res.status(500).json({

      success: false,

      message:
        error.response?.data
          ?.response_description ||
        error.message ||
        "An samu matsala wajen sayen Airtime."

    });

  }

});


// ===============================
// SERVER
// ===============================

const PORT =
  process.env.PORT || 3000;


app.listen(
  PORT,
  () => {

    console.log(
      `MMA Bank server yana aiki a port ${PORT}`
    );

  }
);

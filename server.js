const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Saka Paystack Secret Key dinka a nan
const pk_test_840e43fa933f08f107c7f3f38316916d33a81eea"; 

// 1. Route din Duba Suna da Lambar Banki (Account Resolution)
app.post('/api/resolve-account', async (req, res) => {
    const { accountNumber, bankCode } = req.body;
    try {
        const response = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );
        res.json({ success: true, data: response.data.data });
    } catch (error) {
        res.status(400).json({ success: false, message: "Ba a samu sunan asusun ba." });
    }
});

// 2. Route din Tura Ainihin Kudi zuwa wani Bankin (Real Transfer)
app.post('/api/transfer', async (req, res) => {
    const { recipientCode, amountInNaira } = req.body;
    try {
        const response = await axios.post(
            'https://api.paystack.co/transfer',
            {
                source: "balance",
                amount: amountInNaira * 100, // Paystack yana lissafi a Kobo
                recipient: recipientCode,
                reason: "Tura kudi daga MMA Bank"
            },
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );
        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.response?.data?.message || "Tura kudin ba yiyi ba." });
    }
});

app.listen(3000, () => console.log('Server din MMA Bank tana aiki a port 3000'));

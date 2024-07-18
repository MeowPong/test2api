const express = require('express');
const sql = require('mssql');
const router = express.Router();

// Import the database configuration
const config = require('../config/dbConfig');

// save order
router.post('/sale/save', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();

        // Insert into BillSale
        const result = await request
            .input('customerName', sql.NVarChar, req.body.customerName)
            .input('customerPhone', sql.NVarChar, req.body.customerPhone)
            .input('customerAddress', sql.NVarChar, req.body.customerAddress)
            .input('payDate', sql.Date, new Date(req.body.payDate))
            .input('payTime', sql.Time, req.body.payTime)
            .query(`
                INSERT INTO BillSale (customerName, customerPhone, customerAddress, payDate, payTime)
                OUTPUT INSERTED.id
                VALUES (@customerName, @customerPhone, @customerAddress, @payDate, @payTime)
            `);

        const billSaleId = result.recordset[0].id;

        // Insert BillSaleDetails
        for (let item of req.body.carts) {
            const productResult = await request
                .input('productId', sql.Int, item.id)
                .query('SELECT cost, price FROM Product WHERE id = @productId');

            const product = productResult.recordset[0];

            await request
                .input('billSaleId', sql.Int, billSaleId)
                .input('productId', sql.Int, item.id)
                .input('cost', sql.Decimal(10, 2), product.cost)
                .input('price', sql.Decimal(10, 2), product.price)
                .query(`
                    INSERT INTO BillSaleDetail (billSaleId, productId, cost, price)
                    VALUES (@billSaleId, @productId, @cost, @price)
                `);
        }

        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});


// Sale Bill Report
router.get('/sale/list', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        const result = await request.query(`
            SELECT * FROM BillSale
            ORDER BY id DESC
        `);
        res.send({ results: result.recordset });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// bill info
router.get('/sale/billInfo/:billSaleId', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        const result = await request
            .input('billSaleId', sql.Int, parseInt(req.params.billSaleId))
            .query(`
                SELECT bsd.*, p.name AS productName
                FROM BillSaleDetail bsd
                JOIN Product p ON bsd.productId = p.id
                WHERE bsd.billSaleId = @billSaleId
                ORDER BY bsd.id DESC
            `);
        res.send({ results: result.recordset });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// update bill status to pay
router.get('/sale/updateStatusToPay/:billSaleId', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        await request
            .input('billSaleId', sql.Int, parseInt(req.params.billSaleId))
            .query(`
                UPDATE BillSale
                SET status = 'pay'
                WHERE id = @billSaleId
            `);
        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// update status to send
router.get('/sale/updateStatusToSend/:billSaleId', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        await request
            .input('billSaleId', sql.Int, parseInt(req.params.billSaleId))
            .query(`
                UPDATE BillSale
                SET status = 'send'
                WHERE id = @billSaleId
            `);
        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// update status to cancel
router.get('/sale/updateStatusToCancel/:billSaleId', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        await request
            .input('billSaleId', sql.Int, parseInt(req.params.billSaleId))
            .query(`
                UPDATE BillSale
                SET status = 'cancel'
                WHERE id = @billSaleId
            `);
        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// DashBoard
router.get('/sale/dashboard', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        let arr = [];
        let myDate = new Date();
        let year = myDate.getFullYear();

        for (let i = 1; i <= 12; i++) {
            const daysInMonth = new Date(year, i, 0).getDate();
            const result = await request
                .input('startDate', sql.Date, new Date(year, i-1, 1))
                .input('endDate', sql.Date, new Date(year, i-1, daysInMonth))
                .query(`
                    SELECT SUM(bsd.price) as sumPrice
                    FROM BillSale bs
                    JOIN BillSaleDetail bsd ON bs.id = bsd.billSaleId
                    WHERE bs.payDate BETWEEN @startDate AND @endDate
                `);

            const sumPrice = result.recordset[0].sumPrice || 0;
            arr.push({ month: i, sumPrice: sumPrice });
        }

        res.send({ results: arr });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

module.exports = router;
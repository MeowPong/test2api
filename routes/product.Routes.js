const express = require('express');
const sql = require('mssql');
const router = express.Router();
const fileUpload = require('express-fileupload');
const exceljs = require('exceljs');
const fs = require('fs');
const { uploadBlob, deleteBlob } = require('../services/azureBlobService');

// Import the database configuration
const config = require('../config/dbConfig');

router.use(fileUpload());

// create new product
router.post("/product/create", async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        await request
            .input('name', sql.NVarChar, req.body.name)
            .input('cost', sql.Decimal(10, 2), req.body.cost)
            .input('price', sql.Decimal(10, 2), req.body.price)
            .input('img', sql.NVarChar, req.body.img || '')
            .input('status', sql.NVarChar, 'use')
            .query(`
                INSERT INTO Product (name, cost, price, img, status)
                VALUES (@name, @cost, @price, @img, @status)
            `);

        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// get all product
router.get('/product/list', async (req, res) => {
    try {
        await sql.connect(config);
        
        const request = new sql.Request();
        const result = await request
            .input('status', sql.NVarChar, 'use')
            .query(`
                SELECT *
                FROM Product
                WHERE status = @status
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

// delete product
router.delete('/product/remove/:id', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        await request
            .input('id', sql.Int, parseInt(req.params.id))
            .input('status', sql.NVarChar, 'delete')
            .query(`
                UPDATE Product
                SET status = @status
                WHERE id = @id
            `);

        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// update product detail
router.put('/product/update', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();

        // Get old data
        const oldData = await request
            .input('id', sql.Int, parseInt(req.body.id))
            .query(`
                SELECT img
                FROM Product
                WHERE id = @id
            `);

        // Remove old image from Azure Blob Storage
        if (oldData.recordset[0].img) {
            await deleteBlob(oldData.recordset[0].img);
        }

        // Update product
        await request
            .input('id', sql.Int, parseInt(req.body.id))
            .input('name', sql.NVarChar, req.body.name)
            .input('cost', sql.Decimal(10, 2), req.body.cost)
            .input('price', sql.Decimal(10, 2), req.body.price)
            .input('img', sql.NVarChar, req.body.img || '')
            .query(`
                UPDATE Product
                SET name = @name, cost = @cost, price = @price, img = @img
                WHERE id = @id
            `);

        res.send({ message: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

// upload image and set new file name by date
router.post('/product/upload', async (req, res) => {
    try {
        if (req.files && req.files.img) {
            const img = req.files.img;
            const myDate = new Date();
            const newName = `${myDate.getFullYear()}${myDate.getMonth()+1}${myDate.getDate()}${myDate.getHours()}${myDate.getMinutes()}${myDate.getSeconds()}${myDate.getMilliseconds()}.${img.name.split('.').pop()}`;

            const blobUrl = await uploadBlob(newName, img.data);
            res.send({ newName: newName, url: blobUrl });
        } else {
            res.status(400).send('No image uploaded');
        }
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    }
});

// upload Excel file
router.post('/product/uploadFromExcel', async (req, res) => {
    try {
        if (req.files && req.files.fileExcel) {
            const fileExcel = req.files.fileExcel;
            const blobName = `excel_${Date.now()}.xlsx`;
            await uploadBlob(blobName, fileExcel.data);

            const workbook = new exceljs.Workbook();
            await workbook.xlsx.load(fileExcel.data);

            const ws = workbook.getWorksheet(1);

            await sql.connect(config);
            const request = new sql.Request();

            // ... (rest of the Excel processing code remains the same)

            await deleteBlob(blobName);
            res.send({ message: 'success' });
        } else {
            res.status(400).send({ message: 'No Excel file uploaded' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

module.exports = router;

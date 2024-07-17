const express = require('express');
const sql = require('mssql');
const router = express.Router();
const fileUpload = require('express-fileupload');
const exceljs = require('exceljs');
const fs = require('fs');
const { uploadBlob, deleteBlob } = require('../services/azureBlobService');
const multer = require('multer');


// Import the database configuration
const config = require('../config/dbConfig');

router.use(fileUpload());

// multer แทน express file upload
const upload = multer({ storage: multer.memoryStorage() });

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
router.put('/product/update', upload.single('img'), async (req, res) => {
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

        let newImageUrl = oldData.recordset[0].img;

        // Handle new image upload if provided
        if (req.file) {
            // Remove old image from Azure Blob Storage
            if (oldData.recordset[0].img) {
                await deleteBlob(oldData.recordset[0].img);
            }

            // Upload new image
            const myDate = new Date();
            const newName = `${myDate.getFullYear()}${myDate.getMonth()+1}${myDate.getDate()}${myDate.getHours()}${myDate.getMinutes()}${myDate.getSeconds()}${myDate.getMilliseconds()}.${req.file.originalname.split('.').pop()}`;
            newImageUrl = await uploadBlob(newName, req.file.buffer);
        }

        // Update product
        await request
            .input('id', sql.Int, parseInt(req.body.id))
            .input('name', sql.NVarChar, req.body.name)
            .input('cost', sql.Decimal(10, 2), req.body.cost)
            .input('price', sql.Decimal(10, 2), req.body.price)
            .input('img', sql.NVarChar, newImageUrl)
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
router.post('/product/upload', upload.single('img'), async (req, res) => {
    try {
        console.log('Upload request received');
        
        if (req.file) {
            console.log('Image file:', req.file.originalname);
            
            const myDate = new Date();
            const newName = `${myDate.getFullYear()}${myDate.getMonth()+1}${myDate.getDate()}${myDate.getHours()}${myDate.getMinutes()}${myDate.getSeconds()}${myDate.getMilliseconds()}.${req.file.originalname.split('.').pop()}`;
            console.log('New file name:', newName);

            console.log('Uploading to blob storage...');
            const blobUrl = await uploadBlob(newName, req.file.buffer);
            console.log('Blob URL:', blobUrl);
            
            res.send({ newName: newName, url: blobUrl });
        } else {
            console.log('No image file found in request');
            res.status(400).send('No image uploaded');
        }
    } catch (e) {
        console.error('Error in /product/upload:', e);
        res.status(500).send({ error: e.message });
    }
});

// upload Excel file
router.post('/product/uploadFromExcel', upload.single('fileExcel'), async (req, res) => {
    try {
        if (req.file) {
            const blobName = `excel_${Date.now()}.xlsx`;
            await uploadBlob(blobName, req.file.buffer);

            const workbook = new exceljs.Workbook();
            await workbook.xlsx.load(req.file.buffer);

            const ws = workbook.getWorksheet(1);

            await sql.connect(config);
            const request = new sql.Request();

            // Assuming the Excel structure is: Name, Cost, Price, Image URL
            for (let i = 2; i <= ws.rowCount; i++) {
                const row = ws.getRow(i);
                const name = row.getCell(1).value;
                const cost = row.getCell(2).value;
                const price = row.getCell(3).value;
                const img = row.getCell(4).value || '';

                await request
                    .input('name', sql.NVarChar, name)
                    .input('cost', sql.Decimal(10, 2), cost)
                    .input('price', sql.Decimal(10, 2), price)
                    .input('img', sql.NVarChar, img)
                    .input('status', sql.NVarChar, 'use')
                    .query(`
                        INSERT INTO Product (name, cost, price, img, status)
                        VALUES (@name, @cost, @price, @img, @status)
                    `);
            }

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

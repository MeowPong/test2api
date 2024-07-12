const express = require('express');
const sql = require('mssql');
const router = express.Router();
const fileUpload = require('express-fileupload');
const exceljs = require('exceljs');
const { BlobServiceClient } = require('@azure/storage-blob');

// Azure BLOB Storage
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = 'teddyblobstoragecontainer';

// Import the database configuration
const config = require('../config/dbConfig');

router.use(fileUpload());

// ... (keep the create, list, and delete routes as they are)

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

        // Remove old image from Blob Storage
        if (oldData.recordset[0].img) {
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            const containerClient = blobServiceClient.getContainerClient(containerName);
            const blockBlobClient = containerClient.getBlockBlobClient(oldData.recordset[0].img);
            await blockBlobClient.delete();
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

            // Create the BlobServiceClient object
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

            // Get a reference to a container
            const containerClient = blobServiceClient.getContainerClient(containerName);

            // Create a blob client for the new blob
            const blockBlobClient = containerClient.getBlockBlobClient(newName);

            // Upload data to the blob
            const uploadBlobResponse = await blockBlobClient.upload(img.data, img.data.length);

            console.log(`Upload block blob ${newName} successfully`, uploadBlobResponse.requestId);

            // Get the URL of the uploaded blob
            const blobUrl = blockBlobClient.url;

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

            // Upload Excel file to Blob Storage
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            const containerClient = blobServiceClient.getContainerClient(containerName);
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(fileExcel.data, fileExcel.data.length);

            // Read the Excel file from Blob Storage
            const workbook = new exceljs.Workbook();
            const blobDownloadResponse = await blockBlobClient.download();
            await workbook.xlsx.read(blobDownloadResponse.readableStreamBody);

            const ws = workbook.getWorksheet(1);

            await sql.connect(config);
            const request = new sql.Request();

            for (let i = 2; i <= ws.rowCount; i++) {
                const name = ws.getRow(i).getCell(1).value || "";
                const cost = ws.getRow(i).getCell(2).value || 0;
                const price = ws.getRow(i).getCell(3).value || 0;

                if (name && cost >= 0 && price >= 0) {
                    await request
                        .input('name', sql.NVarChar, name)
                        .input('cost', sql.Decimal(10, 2), cost)
                        .input('price', sql.Decimal(10, 2), price)
                        .input('status', sql.NVarChar, 'use')
                        .query(`
                            INSERT INTO Product (name, cost, price, img, status)
                            VALUES (@name, @cost, @price, '', @status)
                        `);
                }
            }

            // Delete the Excel file from Blob Storage after processing
            await blockBlobClient.delete();

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
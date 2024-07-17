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


// Azure Blob Storage setup
  // Assume you have your connection string in an environment variable
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

  // Create the BlobServiceClient object
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

  // Get a reference to a container
const containerName = 'uploads';
const containerClient = blobServiceClient.getContainerClient(containerName);


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
    let connection;
    try {
        console.log('Updating product. Request body:', req.body);
        console.log('File:', req.file);

        // Input validation
        if (!req.body.id || !req.body.name || req.body.cost === undefined || req.body.price === undefined) {
            return res.status(400).send({ error: 'Missing required fields' });
        }

        connection = await sql.connect(config);
        const request = new sql.Request(connection);

        // Get old data
        const oldData = await request
            .input('id', sql.Int, parseInt(req.body.id))
            .query(`
                SELECT img
                FROM Product
                WHERE id = @id
            `);

        if (oldData.recordset.length === 0) {
            return res.status(404).send({ error: 'Product not found' });
        }

        let newImageUrl = oldData.recordset[0].img;

        // Handle file upload if a new image is provided
        if (req.file) {
            const blobName = `product_${req.body.id}_${Date.now()}.${req.file.originalname.split('.').pop()}`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            
            console.log('\nUploading to Azure storage as blob:\n\t', blobName);

            // Upload data to the blob
            const uploadBlobResponse = await blockBlobClient.upload(req.file.buffer, req.file.buffer.length);
            console.log(`Blob was uploaded successfully. requestId: ${uploadBlobResponse.requestId}`);
            
            newImageUrl = blockBlobClient.url;

            // Delete old image if it exists
            if (oldData.recordset[0].img) {
                const oldBlobName = oldData.recordset[0].img.split('/').pop();
                const oldBlockBlobClient = containerClient.getBlockBlobClient(oldBlobName);
                await oldBlockBlobClient.delete();
                console.log(`Old blob ${oldBlobName} was deleted successfully.`);
            }
        }

        // Update product
        const result = await request
            .input('id', sql.Int, parseInt(req.body.id))
            .input('name', sql.NVarChar, req.body.name)
            .input('cost', sql.Decimal(10, 2), parseFloat(req.body.cost))
            .input('price', sql.Decimal(10, 2), parseFloat(req.body.price))
            .input('img', sql.NVarChar, newImageUrl)
            .query(`
                UPDATE Product
                SET name = @name, cost = @cost, price = @price, img = @img
                WHERE id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send({ error: 'Product not found or no changes made' });
        }

        res.send({ message: 'success', updatedImageUrl: newImageUrl });
    } catch (e) {
        console.error('Error in /product/update:', e);
        res.status(500).send({ error: e.message, stack: e.stack });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing database connection:', err);
            }
        }
    }
});

// upload image and set new file name by date
router.post('/product/upload', upload.single('img'), async (req, res) => {
    try {
        console.log('Upload request received');
        
        if (!req.file) {
            console.log('No image file found in request');
            return res.status(400).send('No image uploaded');
        }

        console.log('Image file:', req.file.originalname);
        
        const blobName = `product_${Date.now()}_${req.file.originalname}`;
        console.log('New blob name:', blobName);

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        console.log('Uploading to Azure Blob storage...');
        const uploadBlobResponse = await blockBlobClient.upload(
            req.file.buffer, 
            req.file.buffer.length
        );
        console.log('Blob uploaded successfully:', uploadBlobResponse.requestId);
        
        // Get the URL of the uploaded blob
        const imageUrl = blockBlobClient.url;
        
        res.status(200).json({ 
            message: 'Image uploaded successfully',
            imageUrl: imageUrl,
            blobName: blobName
        });
    } catch (error) {
        console.error('Error in /product/upload:', error);
        res.status(500).json({ 
            error: 'An error occurred during file upload',
            details: error.message
        });
    }
});

// upload Excel file
router.post('/product/uploadFromExcel', upload.single('fileExcel'), async (req, res) => {
    let connection;
    try {
        console.log('Excel upload request received');

        if (!req.file) {
            console.log('No Excel file found in request');
            return res.status(400).send('No Excel file uploaded');
        }

        console.log('Excel file:', req.file.originalname);

        // Upload Excel file to Azure Blob Storage
        const blobName = `excel_${Date.now()}.xlsx`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(req.file.buffer, req.file.buffer.length);
        console.log('Excel file uploaded to Azure Blob Storage:', blobName);

        // Process Excel file
        const workbook = new exceljs.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        // Connect to the database
        connection = await sql.connect(config);

        // Process each row in the Excel file
        let rowCount = 0;
        worksheet.eachRow({ includeEmpty: false }, async (row, rowNumber) => {
            if (rowNumber > 1) { // Assuming the first row is headers
                const [name, cost, price, img] = row.values.slice(1);

                try {
                    await sql.query`
                        INSERT INTO Product (name, cost, price, img, status)
                        VALUES (${name}, ${cost}, ${price}, ${img || ''}, 'use')
                        ON DUPLICATE KEY UPDATE
                        name = ${name}, cost = ${cost}, price = ${price}, img = ${img || ''}
                    `;
                    rowCount++;
                } catch (error) {
                    console.error(`Error processing row ${rowNumber}:`, error);
                }
            }
        });

        // Delete the Excel file from Azure Blob Storage
        await blockBlobClient.delete();
        console.log('Excel file deleted from Azure Blob Storage');

        res.status(200).json({
            message: 'Excel file processed successfully',
            productsUploaded: rowCount
        });
    } catch (error) {
        console.error('Error in /product/uploadFromExcel:', error);
        res.status(500).json({
            error: 'An error occurred during Excel file processing',
            details: error.message
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing database connection:', err);
            }
        }
    }
});

module.exports = router;

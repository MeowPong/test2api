// server.js
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 3000;

// Azure BLOB Storage
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = 'teddyblobstoragecontainer';

// Middlewares
app.use(cors());
app.use(express.json());

// Database config
const config = require('./config/dbConfig');

const connectDB = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to SQL Server');
    } catch (err) {
        console.log('connection failed', err);
    }
};

// Connect to the database
connectDB();

// Route import
const productRouter = require('./routes/product.Routes');
const saleRouter = require('./routes/sale.Routes');
const userRouter = require('./routes/user.Routes');


// Routes
app.use(productRouter);
app.use(saleRouter);
app.use(userRouter);


app.listen(port, () => console.log(`Server running on port ${port}`));

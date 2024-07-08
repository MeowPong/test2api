const express = require('express')
const sql = require('mssql');

const app = express()

// database url
const config = {
    user: 'teddy@teddyserver',
    password: 'Meow@1234',
    server: 'teddyserver.database.windows.net',
    database: 'teddydatabase',
    options: {
        encrypt: true,
        trustServerCertificate: false,
        hostNameInCertificate: '*.database.windows.net'
    }
};

// connect database
sql.connect(config)
   .then(() => console.log('Connected to SQL Server'))
   .catch(err => console.error('Database connection failed:', err));


app.get('/', (req, res) => {
  res.send('Hello World')
})


// get all from product table order desc
app.get('/list', async (req, res) => {
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



app.listen(3000, () => {
  console.log('Start server at port 3000.')
})
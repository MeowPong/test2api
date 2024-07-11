{/*


    // connect database
sql.connect(config)
   .then(() => console.log('Connected to SQL Server'))
   .catch(err => console.error('Database connection failed:', err));


app.get('/', (req, res) => {
  res.send('Hello World')
})






app.get('/list',async (req, res) => {
    try {
     // make sure that any items are correctly URL encoded in the connection string
     await sql.connect(config)
     const result = await sql.query`SELECT *
                FROM Product
                WHERE status = @status
                ORDER BY id DESC`
     console.dir(result)
     res.send({ results: result });
    } catch (err) {
     // ... error checks
    }
   })()


*/}
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Import the database configuration
const config = require('../config/dbConfig');

dotenv.config();

function checkSignIn(req, res, next) {
    try {
        const secret = process.env.JWT_SECRET;
        const token = req.headers['authorization'];
        const result = jwt.verify(token, secret);
        if (result != undefined) {
            next();
        }
    } catch (e) {
        console.error(e);
        res.status(401).send({ error: 'Unauthorized' });
    }
}

function getUserId(req, res) {
    try {
        const secret = process.env.JWT_SECRET;
        const token = req.headers['authorization'];
        const result = jwt.verify(token, secret);
        if (result != undefined) {
            return result.id;
        }
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    }
}

router.post('/user/signIn', async (req, res) => {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        const result = await request
            .input('user', sql.NVarChar, req.body.user)
            .input('pass', sql.NVarChar, req.body.pass)
            .query(`
                SELECT id, name
                FROM [User]
                WHERE [user] = @user AND pass = @pass AND status = 'use'
            `);

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            const secret = process.env.JWT_SECRET;
            const token = jwt.sign(user, secret, { expiresIn: '30d' });
            return res.send({ token: token });
        }
        res.status(401).send({ message: 'unauthorized' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

router.get('/user/info', checkSignIn, async (req, res) => {
    try {
        const userId = getUserId(req, res);
        await sql.connect(config);
        const request = new sql.Request();
        
        const result = await request
            .input('userId', sql.Int, userId)
            .query(`
                SELECT name
                FROM [User]
                WHERE id = @userId
            `);

        if (result.recordset.length > 0) {
            res.send({ result: result.recordset[0] });
        } else {
            res.status(404).send({ message: 'User not found' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    } finally {
        await sql.close();
    }
});

module.exports = router;

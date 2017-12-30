'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const app = express()

const db = require('./db')

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.get('/', (req, res) => {
    res.json({hello: 'world'})
})

app.listen(3000)


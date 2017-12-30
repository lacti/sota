'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const amqp = require('amqp')
const uuidv4 = require('uuid/v4')

const queueConnection = amqp.createConnection({ host: 'localhost' })
const db = require('./db')

queueConnection.on('error', function(e) {
    console.log("Error from amqp: ", e);
})

const messages = {}
let postExchange = null
let notifyExchange = null
queueConnection.on('ready', () => {
    console.log('Q connection is ready. I\'ll create post, pull and notify xchgs.')
    postExchange = queueConnection.exchange('post')

    let pullExchange = queueConnection.exchange('pull')
    queueConnection.queue('response', (queue) => {
        queue.bind('pull', 'response')
        console.log('Response Q and pull xchg is initialize successfully.')
        queue.subscribe(message => {
            console.log(`Receive message[${JSON.stringify(message)}] from response queue via pull xchg.`)
            messages[message._](message)
        })
    })
    notifyExchange = queueConnection.exchange('notify')
    queueConnection.queue('work', (queue) => {
        queue.bind('notify', 'work')
        console.log('Work Q and notify xchg is initialize successfully.')
    })
})

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.get('/', (req, res) => {
    res.json({status: 'ok'})
})

app.post('/', (req, res) => {
    console.log(`Receive message[${JSON.stringify(req.body)}] from a client.`)
    const queueId = req.body.uid
    if (!queueId) {
        res.json({error: 'no'})

    } else {
        const action = req.body.action
        console.log(`Q=[${queueId}], Action=[${action}]`)
        if (action) {
            const messageId = uuidv4()
            console.log(`Message id=[${messageId}] and I'll wait a response of it.`)
            const responsePromise = new Promise((resolve, reject) => {
                console.log(`Promise for [${messageId}] is completely setup.`)
                messages[messageId] = resolve
            })
            const requestMessage = Object.assign({_: messageId}, req.body)
            console.log(`Send a message[${JSON.stringify(requestMessage)}] to Q[${queueId}].`)
            postExchange.publish(queueId, requestMessage)

            console.log(`I'll wait a response message which is corelated with [${messageId}].`)
            responsePromise.then(msg => {
                console.log(`Promise for [${messageId}] is resolved!`)
                delete messages[messageId]

                console.log(`I'll send a message[${JSON.stringify(msg)}] as a response of [${messageId}].`)
                delete msg['_']
                res.json(msg)
            })

        } else {
            console.log(`There is no action, so I just declare a Q[${queueId}].`)
            queueConnection.queue(queueId, (queue) => {
                queue.bind('post', queueId);
                console.log(`Q[${queueId}] is binded with post xchg completed.`)

                const workMessage = {action: 'spawn', id: queueId}
                notifyExchange.publish('work', workMessage)
                console.log(`Notify the fact[${JSON.stringify(workMessage)}] to other workers.`)

                db.query(`REPLACE INTO queue (queue_id) VALUES (?)`, [queueId]).then(dbr => {
                    console.log(`Register Q[${queueId}] into mysql.`)
                })
            })
            res.json({status: 'ok'})
        }
    }
})

console.log('Server is ready.')
app.listen(3000)

'use strict'

const amqp = require('amqp')
const uuidv4 = require('uuid/v4')

const queueConnection = amqp.createConnection({ host: 'localhost' })
const queueOptions = {autoDelete: false, durable: true}
const db = require('./db')

queueConnection.on('error', function(e) {
    console.log("Error from amqp: ", e);
})

const contexts = {}
const dispatch = (id, msg, res) => {
    console.log(`Dispatch all things in there. Now, message is [${JSON.stringify(msg)}]`)
    if (msg.action === 'name') {
        console.log(`Update user[${id}]'s name to [${msg.value}]`)
        db.query(`REPLACE INTO user (user_id, context) VALUES (?, ?)`, [id, JSON.stringify({name: msg.value})])
            .then(dbr => res({status: 'ok'}))

    } else if (msg.action === 'chat') {
        console.log(`User[${id}] sends a chat message[${msg.value}]`)
        for (const ctx of Object.values(contexts)) {
            ctx.postbox.push({ id: id, text: msg.value })
        }
        res({status: 'ok'})

    } else if (msg.action === 'poll') {
        const postbox = contexts[id].postbox
        contexts[id].postbox = []
        console.log(`User[${id}] polls messages[${JSON.stringify(postbox)}] from zhis postbox`)
        res({messages: postbox})

    } else {
        res({status: 'unknown'})
    }
}

queueConnection.on('ready', () => {
    console.log('Q connection is ready. I\'ll create post, pull and notify xchgs.')
    let postExchange = queueConnection.exchange('post', queueOptions)
    let pullExchange = queueConnection.exchange('pull', queueOptions)
    queueConnection.queue('response', queueOptions, (queue) => {
        queue.bind('pull', 'response')
        console.log('Response Q and pull xchg is initialize successfully.')
    })

    const spawnQueue = (queueId) => {
        console.log(`Spawn a Q[${queueId}] and initialize it.`)
        queueConnection.queue(queueId, queueOptions, (queue) => {
            queue.bind('post', queueId)
            contexts[queueId] = {
                queue: queue,
                postbox: []
            }
            console.log(`Q[${queueId}] is registered to global map and will be subscribed soon.`)
            queue.subscribe(input => {
                console.log(`A message[${JSON.stringify(input)}] is received from Q[${queueId}].`)
                dispatch(queueId, input, (output) => {
                    const responseMessage = Object.assign({_: input._}, output)
                    pullExchange.publish('response', responseMessage)
                    console.log(`Input=[${JSON.stringify(input)}] and Output=[${JSON.stringify(output)}] via Q[${queueId}].`)
                })
            })
        })
    }
    const despawnQueue = (queueId) => {
        console.log(`Despawn a Q[${queueId}] and destroy it.`)
        const ctx = contexts[workMessage.id]
        if (ctx) {
            delete contexts[workMessage.id]
            ctx.queue.destroy()
        }
    }

    let notifyExchange = queueConnection.exchange('notify', queueOptions)
    queueConnection.queue('work', queueOptions, (workQueue) => {
        workQueue.bind('notify', 'work')
        console.log('Work Q and notify xchg is initialize successfully.')
        workQueue.subscribe(workMessage => {
            console.log(`Receive message[${JSON.stringify(workMessage)}] from work queue via notify xchg.`)
            if (workMessage.action === 'spawn') {
                spawnQueue(workMessage.id)

            } else if (workMessage.action === 'despawn') {
                despawnQueue(workMessage.id)
            }
        })
    })

    console.log(`Read Q list from mysql.`)
    db.query(`SELECT queue_id FROM queue`).then(tuples => {
        for (const tuple of tuples) {
            spawnQueue(tuple.queue_id)
        }
    })
    console.log('All about queues are ready.')
})

console.log('Server is ready.')

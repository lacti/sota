'use strict'

const amqp = require('amqp')
const uuidv4 = require('uuid/v4')

const queueConnection = amqp.createConnection({ host: 'localhost' })
const db = require('./db')

queueConnection.on('error', function(e) {
    console.log("Error from amqp: ", e);
})

const dispatch = (msg, res) => {
    console.log(`Dispatch all things in there. Now, message is [${JSON.stringify(msg)}]`)
    res({nothing: 'can be'})
}

const queues = []
queueConnection.on('ready', () => {
    console.log('Q connection is ready. I\'ll create post, pull and notify xchgs.')
    let postExchange = queueConnection.exchange('post')
    let pullExchange = queueConnection.exchange('pull')
    queueConnection.queue('response', (queue) => {
        queue.bind('pull', 'response')
        console.log('Response Q and pull xchg is initialize successfully.')
    })

    const spawnQueue = (queueId) => {
        console.log(`Spawn a Q[${queueId}] and initialize it.`)
        queueConnection.queue(queueId, (queue) => {
            queue.bind('post', queueId)
            queues[queueId] = queue
            console.log(`Q[${queueId}] is registered to global map and will be subscribed soon.`)
            queue.subscribe(input => {
                console.log(`A message[${JSON.stringify(input)}] is received from Q[${queueId}].`)
                dispatch(input, (output) => {
                    const responseMessage = Object.assign({_: input._}, output)
                    pullExchange.publish('response', responseMessage)
                    console.log(`Input=[${JSON.stringify(input)}] and Output=[${JSON.stringify(output)}] via Q[${queueId}].`)
                })
            })
        })
    }
    const despawnQueue = (queueId) => {
        console.log(`Despawn a Q[${queueId}] and destroy it.`)
        const queueToDestroy = queues[workMessage.id]
        if (queueToDestroy) {
            delete queues[workMessage.id]
            queueToDestroy.destroy()
        }
    }

    let notifyExchange = queueConnection.exchange('notify')
    queueConnection.queue('work', (workQueue) => {
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
    db.query(`SELECT queue_id FROM queue`).then(ids => {
        for (const queueId of ids) {
            spawnQueue(queueId)
        }
    })
    console.log('All about queues are ready.')
})

console.log('Server is ready.')

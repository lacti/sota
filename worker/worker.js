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
    let pullExchange = queueConnection.exchange('pull')
    let _pullQueue = null
    queueConnection.queue('response', (queue) => {
        queue.bind('pull', 'response')
        _pullQueue = queue
        console.log('Response Q and pull xchg is initialize successfully.')
    })
    let notifyExchange = queueConnection.exchange('notify')
    queueConnection.queue('work', (workQueue) => {
        workQueue.bind('notify', 'work')
        console.log('Work Q and notify xchg is initialize successfully.')
        workQueue.subscribe(workMessage => {
            console.log(`Receive message[${JSON.stringify(workMessage)}] from work queue via notify xchg.`)
            if (workMessage.action === 'spawn') {
                const queueId = workMessage.id
                console.log(`Spawn a Q[${queueId}] and initialize it.`)
                queueConnection.queue(queueId, (queue) => {
                    queue.bind('post', queueId)
                    queues[queueId] = queue
                    console.log(`Q[${queueId}] is registered to global map and will be subscribed soon.`)
                    queue.subscribe(input => {
                        console.log(`A message[${JSON.stringify(input)}] is received from Q[${queueId}].`)
                        dispatch(input, (output) => {
                            const responseMessage = Object.assign({_: input._}, output)
                            _pullQueue.publish('response', responseMessage)
                            console.log(`Input=[${JSON.stringify(input)}] and Output=[${JSON.stringify(output)}] via Q[${queueId}].`)
                        })
                    })
                })

            } else if (workMessage.action === 'despawn') {
                console.log(`Despawn a Q[${queueId}] and destroy it.`)
                const queueToDestroy = queues[workMessage.id]
                if (queueToDestroy) {
                    delete queues[workMessage.id]
                    queueToDestroy.destroy()
                }
            }
        })
    })
    console.log('All about queues are ready.')
})

console.log('Server is ready.')

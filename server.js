/** @format */

const fastify = require('fastify')({ logger: true })
const helmet = require('fastify-helmet')

const path = require('path')
const config = require('config')
const debug = require('debug')('server')
const XXHash = require('xxhash')

const authenticate = { realm: 'AI Server' }

fastify.register(require('fastify-mongodb'), {
  url: `mongodb://${config.mongodb.user}:${config.mongodb.password}@${config.mongodb.host}:${config.mongodb.port}/${config.mongodb.db}?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false`
})

function loadHandler() {
  var coll = db.getCollection('entries')
  if (coll === null) {
    coll = db.addCollection('entries')
  }
}

fastify.register(helmet, { contentSecurityPolicy: false })

fastify.register(require('fastify-cors'), {
  origin: '*',
})

fastify.register(require('fastify-auth'))
fastify.register(require('fastify-basic-auth'), { validate, authenticate })

async function validate(username, password, req, reply) {
  if (username !== config.auth.username || password !== config.auth.password) {
    return new Error('Not authenticated')
  }
}

fastify.register(require('fastify-static'), {
  root: path.join(__dirname, 'static'),
  prefix: '/',
})

fastify.after(() => {
  // use preHandler to authenticate all the routes
  //   fastify.addHook('preHandler', fastify.auth([fastify.basicAuth]))

  fastify.get('/', {
    // use onRequest to authenticate just this one
    onRequest: fastify.auth([fastify.basicAuth]),
    handler: async (req, reply) => {
      return { status: 'ok' }
    },
  })

  fastify.post('/', {
    handler: (req, reply) => {
      let coll = fastify.mongo.db.collection('actionitems')

      let meetingId = XXHash.hash(new Buffer(`${req.body.meeting}${req.body.meetingDate}`), 0xDD158914, `base64`)
      // Make sure the meetingId isn't already in the DB
      coll.find({ "Meeting.Id": meetingId }).toArray((err, items) => {
        if (err) {
          console.error(err)
          reply.send({ error: err })
        }
        if (items.length > 0) {
          reply.send({ error: `Meeting ID (${items[0].Meeting.Id}) already exists (${items.length} action items recorded)` })
        } else {

          // All clear, add the meeting to the DB
          let newEntries = []
          req.body.actionItems.forEach((actionitem) => {
            let newEntry = {
              Meeting: {
                Id: meetingId,
                Name: req.body.meeting,
                Date: new Date(req.body.meetingDate)
              },
              AI: actionitem.ai,
              Owner: actionitem.Owner,
              Levels: actionitem.levels
            }
            newEntries.push(newEntry)
          })
          coll.insertMany(newEntries)
          reply.send({ status: 'ok', inserted: newEntries.length })
        }
      })
    },
  })

  fastify.get('/list', {
    handler: async (req, reply) => {
      let coll = fastify.mongo.db.collection('actionitems')
      reply.send(await coll.find({}).toArray())
    },
  })
})

const start = async () => {
  try {
    await fastify.listen(config.port || 3000, '0.0.0.0')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()

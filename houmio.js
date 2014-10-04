var WebSocket = require('ws')
var util = require('util')
var events = require('events')

function Houmio(sitekey) {
    var ws = new WebSocket('wss://houm.herokuapp.com')
    ws.on('open', function () {
        ws.send(JSON.stringify({ "command": "publish", "data": { "sitekey": sitekey, "vendor": "knx" } }))
        console.log('Connected to Houmio')
        this.emit("started")
    }.bind(this))

    ws.on('close', function () {
        console.log('Disconnected from heroku')
        process.exit(1)
    })

    ws.on('ping', function () {
        ws.pong()
    })

    ws.on('message', function (data, flags) {
        console.log("Received message from houmio: " + data)
        var msg = JSON.parse(data)
        if (msg.command === 'set' && msg.data.command === 'groupwrite') {
            this.emit('lightstate', { id: msg.data.groupaddress, on: msg.data.value != 0, bri: parseInt(msg.data.value, 16), binary: false })
        } else if (msg.command === 'set' && msg.data.command === 'groupswrite') {
            this.emit('lightstate', { id: msg.data.groupaddress, on: msg.data.value != 0, bri: msg.data.value, binary: true })
        }
    }.bind(this))
    this.ws = ws
}

util.inherits(Houmio, events.EventEmitter)

Houmio.prototype.setLightState = function (lightstate) {
    var message = JSON.stringify({ command: 'knxbusdata', data: lightstate.id + ' ' + (lightstate.binary ? (lightstate.on ? 1 : 0) : new Number(lightstate.bri).toString(16)) })
    console.log("Send message to houmio: " + message)
    this.ws.send(message, {})
}

module.exports = Houmio

var fs = require('fs')
var ZWay = require('./zway.js')
var Houmio = require('./houmio.js')
var config = JSON.parse(fs.readFileSync('./config.json'))
var houm = new Houmio(config.sitekey)
var zw = new ZWay(config.zway.host, config.zway.port)

houm.on("started", function() {
    zw.start()
})

houm.on('lightstate', function(lightstate) {
    console.log("Lightstate from houmio " + JSON.stringify(lightstate))
    zw.setLightState(lightstate)
})

zw.on('lightstate', function(lightstate) {
    console.log("Lightstate from zwave " + JSON.stringify(lightstate))
    houm.setLightState(lightstate)
})

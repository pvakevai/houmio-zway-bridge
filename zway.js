var http = require('http')
var _ = require('underscore')
var fs = require('fs')
var util = require('util')
var events = require('events')

function ZWay(hostname, port) {
    this.updateTime = 0
    this.options = {
        hostname: hostname,
        port: port,
        method: 'POST',
        headers: [
            { 'Connection': 'keep-alive'}
        ]
    }
}

util.inherits(ZWay, events.EventEmitter)

module.exports = ZWay

ZWay.prototype.setLightState = function (lightstate) {
    var device   = lightstate.id.split("_")[0]
    var instance = lightstate.id.split("_")[1]
    var commandClass = lightstate.binary ? 37 : 38
    var level = lightstate.binary ? (lightstate.on ? 1 : 0) : scaleToZWayLevel(lightstate.bri)
    console.log("Send message to ZWay " + '/ZWaveAPI/Run/devices[' + device + '].instances[' + instance + '].commandClasses[' + commandClass + '].Set(' + level + ')')
    call(_.extend(this.options, { path: '/ZWaveAPI/Run/devices[' + device + '].instances[' + instance + '].commandClasses[' + commandClass + '].Set(' + level + ')'}))
}

ZWay.prototype.start = function () {
    call(_.extend(this.options, { path: '/ZWaveAPI/Data/' + this.updateTime}), function (update) {
        dump(update, 'z-way-dump-initial.json')
        logFailedDevices(update)
        _.chain(_.values(update.devices))
            .tail()
            .filter(isFailedDevice)
            .map(asInstancesOfDevice)
            .flatten()
            .filter(hasSupportedCommandClass)
            .map(asLightState)
            .each(emit.bind(this))
        this.updateTime = update.updateTime
        setInterval(updateState.bind(this), 1 * 1000)
        console.log("Connected to ZWay")
    }.bind(this))
}

function isFailedDevice(device) { return ! device.data.isFailed.value }
function asInstancesOfDevice(device) { return _.values(device.instances) }
function hasSupportedCommandClass(instance) { return instance.commandClasses[37] || instance.commandClasses[38] }
function emit(lightstate) { this.emit('lightstate', lightstate) }

function asLightState(instance) {
    var id = instance.data.name.replace(/devices.(\d+).instances.(\d+).*/, '$1_$2')
    var binary = instance.commandClasses[38] ? false : true
    var level = binary ? (instance.commandClasses[37].data.level.value ? 1 : 0) : scaleFromZWayLevel(instance.commandClasses[38].data.level.value)
    // TODO how to flag a multilevel light as binary when coming from zway? (payload being non dimmable)
    return { id: id, bri: level, on: level != 0, binary: binary }
}

function updateState() {
    if (isFetchInProgress(this)) return
    call(_.extend(this.options, { path: '/ZWaveAPI/Data/' + this.updateTime}), function (update) {
        dump(update, 'z-way-dump-' + update.updateTime + '.json')
        _.chain(_.pairs(update))
            .filter(isBinaryOrMultiLevelSwitchUpdate)
            .filter(isUpdateReflectionOfASentLightstate.bind(this))
            .map(pairAsLightstate)
            .each(emit.bind(this))
        this.updateTime = update.updateTime
    }.bind(this))
}

function isFetchInProgress(self) {
    if (self.updateTime && self.lastFetch === self.updateTime) return true
    self.lastFetch = self.updateTime
    return false
}

function isBinaryOrMultiLevelSwitchUpdate(pair) {
    return pair[0].match(/devices.\d+.instances.\d+.commandClasses.3[78].data.level/)
}

function isUpdateReflectionOfASentLightstate(pair) {
    return pair[1].invalidateTime <= this.updateTime
}

function pairAsLightstate(pair) {
    var device = pair[0].replace(/devices.(\d+).instances.\d+.commandClasses.3[78].data.level/, '$1')
    var instance = pair[0].replace(/devices.\d+.instances.(\d+).commandClasses.3[78].data.level/, '$1')
    var binary = pair[0].replace(/devices.\d+.instances.\d+.commandClasses.(3[78]).data.level/, '$1') === '37'

    return {id: device + '_' + instance, on: binary ? pair[1].value : pair[1].value != 0, bri: binary ? (pair[1].value ? 1 : 0) : scaleFromZWayLevel(pair[1].value), binary: binary }
}

function call(options, callback) {
//    console.log(options.method + " " + "http://" + options.hostname + ":" + options.port + options.path)
    var req = http.request(options, function (res) {
        res.setEncoding('utf8')
        var content = ""
        res.on('data', function (chunk) {
            content += chunk
        })

        res.on('end', function () {
            if (callback != null)
                callback(JSON.parse(content))
        })
    })

    req.on('error', function (e) {
        console.log('problem with request: ' + e.message)
    })
    req.end()
}


function dump(update, filename) {
    if (_.keys(update).length == 1) return
    fs.writeFile(filename, JSON.stringify(update, null, "\t"))
}

function logFailedDevices(update) {
    for (var d in update.devices) {
        if (update.devices[d].data.isFailed.value) {
            console.log("Device %d has failed", d)
        }
    }
}

function scaleToZWayLevel(level) { return Math.round(level * 100 / 255) }
function scaleFromZWayLevel(level) { return Math.round(level * 255 / 100) }

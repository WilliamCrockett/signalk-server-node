/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Transform = require('stream').Transform
const Writable = require('stream').Writable
const TimestampThrottle = require('./timestamp-throttle')

const N2KJsonToSignalK = require('./n2k-signalk')
const ActisenseSerialToJSON = require('./n2kAnalyzer')
const Nmea01832SignalK = require('./nmea0183-signalk')


function DeMultiplexer(options) {
  Writable.call(this)

  this.toTimestamped = new ToTimestamped()
  this.timestampThrottle = new TimestampThrottle({
    getMilliseconds: ts => ts
  })
  this.splitter = new Splitter();
  this.toTimestamped.pipe(this.timestampThrottle).pipe(this.splitter)
  this.toTimestamped.on('drain', this.emit.bind(this, 'drain'))
}
require('util').inherits(DeMultiplexer, Writable);

DeMultiplexer.prototype.pipe = function(target) {
  this.splitter.pipe(target)
}
DeMultiplexer.prototype.write = function(chunk, encoding, callback) {
  return this.toTimestamped.write(chunk, encoding, callback)
}

function Splitter() {
  Transform.call(this, {objectMode: true})

  this.fromN2KJson = new N2KJsonToSignalK();
  this.fromActisenseSerial = new ActisenseSerialToJSON()
  this.fromActisenseSerial.pipe(this.fromN2KJson)

  this.fromNMEA0183 = new Nmea01832SignalK()
}
require('util').inherits(Splitter, Transform);

Splitter.prototype._transform = function(msg, encoding, done) {
  switch(msg.discriminator) {
    case 'A':
      return this.fromActisenseSerial.write(msg.data, encoding, done)
      break
    case 'N':
      return this.fromNMEA0183.write(msg.data, encoding, done)
      break
    case 'I':
      this.push(JSON.parse(msg.data))
      done()
      break
    default:
      console.log("Unrecognized discriminator")
      done()

  }
}
Splitter.prototype.pipe = function(target) {
  this.fromN2KJson.pipe(target)
  this.fromNMEA0183.pipe(target)
  Transform.prototype.pipe.call(this, target)
}



function ToTimestamped() {
  Transform.call(this, {objectMode: true})
}
require('util').inherits(ToTimestamped, Transform);

ToTimestamped.prototype._transform = function(msg, encoding, done) {
  const parts = msg.toString().split(';');
  this.push({timestamp: parts[0], discriminator: parts[1], data: parts[2]})
  done()
}

module.exports = DeMultiplexer;

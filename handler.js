const melanite = require('melanite')
const request = require('request')
const AWSXRay = require('aws-xray-sdk')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const s3 = new AWS.S3();
   	
var matcher = null
var initQueue = []
var matcherRefreshTime = 0
var refreshing = false
var ttl = Number(process.env.TTL) || 30000 
if (ttl < 1000) throw new Error("Invalid value for TTL")

const url = process.env.DATA_FILE_URL 
const s3bucket = process.env.DATA_FILE_S3_BUCKET
const s3key = process.env.DATA_FILE_S3_PATH

if (!s3bucket && !s3key){
  if (!url) throw new Error("Missing DATA_FILE_URL or DATA_FILE_S3_BUCKET/DATA_FILE_S3_PATH pair")
}

var chaosErrorRate = Number(process.env.CHAOS_ERROR_RATE) || 0
if (chaosErrorRate < 0 || chaosErrorRate > 1) throw new Error("Invalid value for chaos error rate (must be between 0 and 1 inclusive)")

var chaosLatency = Number(process.env.CHAOS_LATENCY) || 0
if (chaosLatency < 0) throw new Error("Invalid value for chaos latency, if defined must be non-negative")

var staleCount = 0
var totalCount = 0
var loadFailCount = 0
var loadSuccessCount = 0
var errorCount = 0

function s3Load() {
  console.log("using s3")
  return new Promise((resolve, reject) => {
    var params = {
      Bucket: s3bucket,
      Key: s3key
    };
    s3.getObject(params, function(err, data) {
      if (err) {
        loadFailCount++
        reject(err)
      } else {
        resolve(data.Body)
      }
    })
  }) 
}

function networkLoad(){
  console.log("using network")
  return new Promise((resolve, reject) => {
    const args = Object.assign({ url, headers: { Accept: 'application/json' }})
    request(args, (error, response, body) => {
      if (error || response.statusCode !== 200){ 
        loadFailCount++
        reject(error || body)
      } else {
        resolve(body)
      }
    })
  })  
}

function injectChaos() {
  return new Promise((resolve, reject) => {
     setTimeout( () => { 
      if (Math.random() < chaosErrorRate){
        loadFailCount++
        reject("synthesized error")
      } else {
        resolve()
      }
    }, chaosLatency)
  })
}

function performLoad(){
  if (s3bucket){
     return s3Load()
  } else {
    return networkLoad()
  }
}

function loadMatcher() {
  return injectChaos()
    .then(performLoad)
    .then( handleSuccessfulLoad )
}

function handleSuccessfulLoad(body){
   config = JSON.parse(body)
   matcher = melanite.match(config)
   matcherRefreshTime = new Date().getTime() + ttl;
   loadSuccessCount++
}

function initializeMatcher(resolve, reject) {
  initQueue.push( [ resolve, reject ] )
  if (initQueue.length == 1){
     loadMatcher()
       .then( resolveInitQueue )
       .catch( rejectInitQueue )
  } else {
     console.log("queued whilst initialising");
  }
}

function resolveInitQueue() {
   initQueue.forEach((cb) => cb[0](matcher))
   initQueue = [] 
}

function rejectInitQueue(err) {
   initQueue.forEach( (cb) => cb[1](err) )
   initQueue = [] 
}

function refreshMatcher() {
  refreshing = true
  loadMatcher()
    .then(() => refreshing = false)
    .catch(err => refreshing = false)
}

function init () {
  return new Promise((resolve, reject) => {
    if (!matcher){
      initializeMatcher(resolve, reject)
    } else {
      remaining = matcherRefreshTime - new Date().getTime()
      if (remaining < 0){
        if ( !refreshing){
           refreshMatcher()
        } else {
           staleCount++
        }
      }
      resolve(matcher)
    }
  })
}

function metrics() {
   return {
     stale : staleCount,
     total : totalCount,
     loadFail : loadFailCount,
     loadSuccess :  loadSuccessCount,
     errorCount : errorCount
   }
}

function handler (event, context, callback) {
  totalCount++
  console.log(metrics())
  init()
    .then(match => match(event.ua))
    .then(response => callback(null, response))
    .catch(err => { errorCount++; callback(err); })
}

module.exports = {
 handler : handler,
 metrics : metrics
}

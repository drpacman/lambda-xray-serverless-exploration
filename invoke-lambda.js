const AWS = require('aws-sdk')
const lambda = new AWS.Lambda({region: 'eu-west-1', apiVersion: '2015-03-31'});
const fs = require('fs');

var event = fs.readFileSync('test.json', 'utf8');
// create JSON object for parameters for invoking Lambda function
var resolveParams = {
  FunctionName : 'device-lambda-dev-resolve',
  InvocationType : 'RequestResponse',
  Payload : event
};
var resolveResults;

function timedExecution(){
  var start = new Date().getTime();
  lambda.invoke(resolveParams, function(error, data) {
    duration = new Date().getTime() - start;
    if (!error){ 
      console.log("[" + duration + "] - " + data.Payload) 
    } else { 
      console.log("[" + duration + "] - Error! " + error) 
    }
  })
}

loops = 100
testDuration = 500
for (var i=0;i<loops;i++){
  setTimeout(timedExecution, Math.floor(Math.random() * testDuration)); 
}

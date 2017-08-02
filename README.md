Experiment to learn a bit of serverless, lambda, AWS x-ray.

To set up

```
npm install -g serverless
npm install
```

To invoke locally:

`serverless invoke local -f resolve --path test.json`

To invoke remotely:

`serverless invoke -f resolve --path test.json`

To run local test loop

`node invoke-lambda.js`

# Connect LiftCam to AWS

LiftCam has two AWS pieces: Amplify hosts the React app; Lambda calls Bedrock for the post-set coach. You do **not** need to create or paste an AWS API key into the frontend. Lambda uses its IAM execution role.

## 1. Publish the app with Amplify

1. Sign in to the [AWS console](https://console.aws.amazon.com/) and select a Region you will also use for Lambda and Bedrock.
2. Open **AWS Amplify → New app → Host web app**.
3. Choose **GitHub**, authorize access to the `EricxLuo/LiftCam` repository, and select its `main` branch.
4. Check the build settings: install `npm ci`, build `npm run build`, artifact directory `dist`.
5. Choose **Save and deploy**. Wait for the build to show **Deployed** and open the HTTPS `amplifyapp.com` URL. The Overview, Plan, Calendar, and Camera pages should load.

Amplify redeploys after subsequent GitHub pushes. The camera needs an HTTPS page when used from a phone.

## 2. Get access to a Bedrock model

1. Open **Amazon Bedrock** in the same AWS Region.
2. In the model catalog or playground, select a text model that supports the **Converse** API and that your account is allowed to invoke. Complete any model access steps the console requests.
3. Copy its **model ID** or **inference profile ID**. This is a model identifier, not a secret. You will put it in Lambda as `BEDROCK_MODEL_ID`.

Model availability and access requirements vary by Region and model. A test in the Bedrock playground is a quick way to confirm your account can invoke the model before wiring up LiftCam.

## 3. Create the coach Lambda

1. Open **AWS Lambda → Create function → Author from scratch**.
2. Name it `liftcam-coach`, choose **Node.js 22.x**, and create it with a new basic execution role.
3. Under **Code**, upload `liftcam-coach.zip` as the function's `.zip` deployment package. The package contains `index.mjs`, `package.json`, and `node_modules` at its root.
4. Set the handler to `index.handler`. Set timeout to **20 seconds** and memory to **256 MB**.
5. Under **Configuration → Environment variables**, add `BEDROCK_MODEL_ID` with the copied model or inference profile ID. You can set `ALLOWED_ORIGIN` to the exact Amplify origin, such as `https://main.example.amplifyapp.com`.
6. Open the execution role in IAM and add permission for `bedrock:InvokeModel` on the chosen model and, if needed, its inference profile. Keep the role's normal CloudWatch Logs permission so errors are visible.

The exact model ARN format depends on whether you selected a foundation model or an inference profile. AWS's **Access denied** error names the missing resource if the role is too narrow.

## 4. Give the frontend an endpoint

1. In Lambda, open **Configuration → Function URL → Create function URL**.
2. For an initial private prototype test, choose authorization type **NONE**. Set CORS to allow your Amplify origin, methods **POST** and **OPTIONS**, and the `content-type` header.
3. Copy the function URL, including `https://` and trailing slash.
4. In Amplify, open **Hosting → Environment variables** and set `VITE_COACH_API_URL` to that URL. Redeploy the frontend. Vite reads this variable during the build; changing it without a redeploy will not update the site.

`NONE` makes the function URL publicly callable, even if the URL is hard to guess. It can produce Bedrock charges. Use it only for your prototype, set an AWS Budget alert, and add authentication before leaving a public AI coach endpoint online. A budget alert sends a notification; it does not automatically cap spending.

## 5. Check that the API works

From PowerShell, replace the URL and run:

```powershell
$liftcamBody = @{
  exercise = 'Barbell Squat'
  reps = @(
    @{ duration = 2.1; ascent = 0.7; minKneeAngle = 90 }
    @{ duration = 2.2; ascent = 0.8; minKneeAngle = 88 }
    @{ duration = 2.5; ascent = 1.0; minKneeAngle = 91 }
    @{ duration = 3.0; ascent = 1.3; minKneeAngle = 93 }
  )
  slowdownPercent = 86
  proximity = 'possibly-near-failure'
  incompleteAttempt = $false
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri 'https://YOUR_FUNCTION_URL/' -ContentType 'application/json' -Body $liftcamBody
```

Success returns JSON with a `summary` field. Then complete a squat set in the deployed LiftCam app. The result should be labeled **AI coach · AWS Bedrock** and read aloud. **Local coach preview** means the API URL was not configured or the request failed.

If it fails:

- `403`: check the Lambda function URL authorization and the Lambda role's `bedrock:InvokeModel` permission.
- `502`: inspect the function's CloudWatch Logs; the response includes an error type when Bedrock fails.
- Browser CORS error: make sure the Amplify origin matches the Function URL CORS configuration and `ALLOWED_ORIGIN`.
- Local coaching preview with no Network request: check `VITE_COACH_API_URL` in Amplify and redeploy.

The weekly plan and calendar remain in browser local storage. Raw camera frames are never sent to Lambda; only numeric rep measurements are included in the coach request.

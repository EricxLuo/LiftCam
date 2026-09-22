# LiftCam

LiftCam is a mobile-first workout planner with a squat camera, rep timing, a post-set voice coach, and a consistency calendar.

## What works in this MVP

- Plan exercises from Monday through Sunday, including custom exercises.
- Mark today's exercises complete and see them on the calendar.
- Analyze a side-view squat set using MediaPipe Pose Landmarker in the browser.
- Count completed reps, show ascent time per rep, and flag substantial late-set slowdown.
- Hear a local coaching preview, or connect AWS Bedrock for generated coaching.

Camera analysis currently supports only barbell squats. Other exercises are manually logged. A slowdown is an observable clue, not a precise estimate of reps in reserve. The rep counter has not yet been benchmarked against labeled gym videos.

## Run in VS Code

1. Open this `LiftCam` folder in VS Code.
2. Run `npm install` in its terminal.
3. Run `npm run dev` and open the local address Vite prints.
4. Run `npm run build` before pushing.

Camera access requires HTTPS or localhost. To test on a phone, deploy to Amplify or use an HTTPS development tunnel. The MediaPipe WASM and model files load from public URLs, so the first launch needs internet access.

## GitHub and AWS hosting

1. Create an empty GitHub repository called `LiftCam` (do not add a generated README).
2. In this folder, run:

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/LiftCam.git
   git push -u origin main
   ```

3. In the AWS Amplify console, choose **New app → Host web app → GitHub**, select the `LiftCam` repository and `main` branch, and deploy. Amplify should detect the Vite build. If you enter settings manually, use `npm ci`, `npm run build`, and output directory `dist`.
4. Open the HTTPS Amplify URL on your phone. Grant camera permission when prompted.

## Connect the AI coach API

The app works without AWS Bedrock; it labels that mode **Local coach preview**. To enable AI coaching:

1. In Amazon Bedrock, choose a text model available in your AWS Region and make sure your account has access to invoke it. Copy its model ID or inference profile ID.
2. In AWS Lambda, create a Node.js 22 function named `liftcam-coach`. Set its handler to `index.handler`. Add environment variable `BEDROCK_MODEL_ID` with the ID from step 1. Optionally set `ALLOWED_ORIGIN` to your Amplify site origin.
3. In the Lambda execution role, add an IAM policy allowing `bedrock:InvokeModel` for the chosen model or inference profile. Keep the resource as narrow as your model setup permits.
4. From the `api` folder, run `npm install` and package `index.mjs`, `package.json`, and `node_modules` into a zip file. Upload that zip to the Lambda function. Keep the zip contents at the root, so Lambda finds `index.mjs`.
5. Create a Lambda Function URL with CORS enabled for your Amplify origin, `POST` method, and `content-type` header. For a personal prototype, `NONE` authorization is quick to set up, but makes the URL callable by anyone who finds it and may incur Bedrock charges. Set a low Lambda reserved concurrency and an AWS Budget before sharing the site. Use stronger authentication before making the coach endpoint public.
6. In Amplify **Hosting → Environment variables**, set `VITE_COACH_API_URL` to the Lambda Function URL, then redeploy the frontend. Vite embeds this URL at build time.

No AWS API key belongs in the browser. Lambda uses its IAM execution role to invoke Bedrock.

### Test the endpoint

In a terminal, replace the URL and run:

```bash
curl -X POST "https://YOUR_FUNCTION_URL/" -H "Content-Type: application/json" -d '{"exercise":"Barbell Squat","reps":[{"duration":2.1,"ascent":0.7,"minKneeAngle":90},{"duration":2.2,"ascent":0.8,"minKneeAngle":88},{"duration":2.5,"ascent":1.0,"minKneeAngle":91},{"duration":3.0,"ascent":1.3,"minKneeAngle":93}],"slowdownPercent":86,"proximity":"possibly-near-failure","incompleteAttempt":false}'
```

Expect JSON containing a `summary` string. Then open LiftCam, complete a squat set, and check the label above the response: **AI coach · AWS Bedrock** confirms the API worked. **Local coach preview** means no URL is configured or the request failed. In that case, inspect the browser Network tab and the Lambda CloudWatch logs.

## Privacy and limits

- Raw camera frames stay in the browser and are not uploaded.
- The weekly plan and calendar are saved in this browser's local storage. Clearing browser data erases them; there is no cross-device sync.
- Only numeric set measurements are sent to the coach endpoint when configured.
- This is an early prototype. Test rep count and slowdown heuristics with manually labeled sets before claiming accuracy in a resume or using the feedback to guide training decisions.

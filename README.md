# LiftCam

LiftCam is a mobile-first workout tracker with optional camera rep timing, a post-set voice coach, in-workout chat, and a consistency calendar. Its bottom navigation has Workout, Calendar, and Profile tabs. A fresh browser starts with local-profile setup and no routines or workout history; the repeating weekly schedule lives in Calendar.

## What works in this MVP

- Plan exercises from Monday through Sunday in Calendar, including custom exercises.
- Create named routines. A new routine starts with an empty session; search the exercise library, add exercise cards, and add as many weight/reps rows as you need. A running timer and Finish button float above the bottom tabs. Logged days appear on the calendar.
- Browse exercises by body area, with an illustration beside each one. Add Exercise appears below the last exercise card. After finishing a logged workout, a brief congratulations screen leads to the training calendar.
- After a routine has a completed workout, its previous exercises and sets appear as faded suggestions next time. Tap the check beside a set to reuse its previous values, or enter new weight and reps and then check to verify them. Only checked sets are logged. Edit routine changes its name and future set suggestions without changing earlier workout logs.
- Analyze supported side-view movements using MediaPipe Pose Landmarker in the browser.
- Count completed reps, show effort-phase time per rep, and flag substantial late-set slowdown.
- Hear a local coaching preview, or connect AWS Bedrock for generated coaching.
- Open the mini chat above the workout timer to ask about confirmed current sets, previous routine sets, and general training. Without AWS, chat offers limited local replies; open-ended AI answers require the configured Bedrock endpoint.
- Optionally use LiftCam vision during a supported exercise; its detected rep count fills a set row when you return.
- Enter a name and training focus on first launch, then see and edit them alongside local activity totals in Profile. This is **not** a secure login or cloud account.

Camera analysis is available for squats, lunges, leg press, deadlifts, presses, rows, pulldowns, pull-ups, push-ups, and curls. It tracks a visible knee, hip, or elbow angle with a simple repetition heuristic; the other exercises are manually logged. Camera position and occlusion can make counts inaccurate. A slowdown is an observable clue, not proof of failure or a precise estimate of reps in reserve. The rep counter has not yet been benchmarked against labeled gym videos.

## Run in VS Code

1. Open this `LiftCam` folder in VS Code.
2. Run `npm install` in its terminal.
3. Run `npm run dev` and open the local address Vite prints.
4. Run `npm run build` before pushing.

Camera access requires HTTPS or localhost. To test on a phone, deploy to Amplify or use an HTTPS development tunnel. The MediaPipe WASM and model files load from public URLs, so the first launch needs internet access.

## GitHub and AWS hosting

The repository is [EricxLuo/LiftCam](https://github.com/EricxLuo/LiftCam). This local checkout already has `origin` set to that repository. After signing in to GitHub from your local terminal, use `git push -u origin main` for future changes.

Follow [AWS_SETUP.md](AWS_SETUP.md) for Amplify deployment, Bedrock model access, Lambda setup, and API testing.

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
curl -X POST "https://YOUR_FUNCTION_URL/" -H "Content-Type: application/json" -d '{"exercise":"Barbell Squat","reps":[{"duration":2.1,"ascent":0.7,"minJointAngle":90},{"duration":2.2,"ascent":0.8,"minJointAngle":88},{"duration":2.5,"ascent":1.0,"minJointAngle":91},{"duration":3.0,"ascent":1.3,"minJointAngle":93}],"slowdownPercent":86,"proximity":"possibly-near-failure","incompleteAttempt":false}'
```

Expect JSON containing a `summary` string. Then open LiftCam, complete a squat set, and check the label above the response: **AI coach · AWS Bedrock** confirms the API worked. **Local coach preview** means no URL is configured or the request failed. In that case, inspect the browser Network tab and the Lambda CloudWatch logs.

## Privacy and limits

- Raw camera frames stay in the browser and are not uploaded.
- The weekly plan, saved routine suggestions, set log, and calendar are saved in this browser's local storage. Clearing browser data erases them; there is no cross-device sync. A new routine starts empty; after its first logged workout, the last confirmed sets are offered as unverified suggestions in the next session. Older logs created before routine-linked suggestions cannot be reliably matched to a routine.
- Chat sends your question, exercise names, and current/previous numeric set data to your configured AWS endpoint. Post-set coaching sends rep measurements. The profile name and camera video are not sent.
- This is an early prototype. Test rep count and slowdown heuristics with manually labeled sets before claiming accuracy in a resume or using the feedback to guide training decisions.

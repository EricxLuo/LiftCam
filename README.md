# LiftCam

LiftCam is a mobile-first workout tracker with optional camera-based rep analysis and coaching. It starts with an empty local profile—no sample routines or cloud account.

## Tech stack

- React, TypeScript, and Vite for the app; browser local storage for profiles, routines, and workout history.
- MediaPipe Pose Landmarker for on-device rep and pace estimates.
- Planned AWS integration: Amplify Hosting, Lambda, and Amazon Bedrock for AI coaching.

## MVP today

- Create and edit routines; browse exercises by muscle group; log verified weight/reps sets with a workout timer and previous-set suggestions.
- Optionally use LiftCam Vision on supported exercises. Rep counts and slowdown are rough estimates, not proof of training to failure.
- Ask the in-workout coach about current or previous sets. Without AWS, replies are limited local previews.
- See completed days on the calendar, build a Monday–Sunday schedule, and edit your local profile.

## Run in VS Code

Open this folder, then run `npm install` and `npm run dev` in the VS Code terminal. Open the local URL Vite prints. Run `npm run build` to verify the production build. Camera access requires localhost or HTTPS.

## AWS next

Deploy the frontend through Amplify, package `api/index.mjs` for Lambda, grant its role access to a Bedrock text model, and set `VITE_COACH_API_URL` to the Lambda Function URL. Do not place AWS keys in the browser. See [AWS_SETUP.md](AWS_SETUP.md) for the walkthrough and API tests.

Workout data stays in this browser unless you configure the coach endpoint. When configured, coaching sends rep measurements or chat text and numeric set context—not camera video. The local profile is not a secure login or cross-device account.

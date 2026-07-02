# FinWise Dashboard

A banking and finance management dashboard built as a static frontend with AWS-backed authentication and transaction storage.

## Features

- Cognito sign up, email confirmation, sign in, and sign out
- Protected dashboard after authentication
- INR-based finance metrics
- Accounts, Transactions, Budgets, Reports, and Settings views
- Transactions loaded from API Gateway, Lambda, and DynamoDB
- Responsive layout for desktop and mobile

## AWS Architecture

- Amazon Cognito handles user authentication and JWT tokens.
- Amazon API Gateway exposes `GET /transactions` and `POST /transactions`.
- AWS Lambda runs the backend transaction logic.
- Amazon DynamoDB stores user-specific transaction records.
- AWS Amplify Hosting serves the frontend.

## Local Development

Run a static server from this folder:

```bash
python3 -m http.server 4174
```

Open:

```txt
http://127.0.0.1:4174/
```

## Deployment

The production frontend is hosted with AWS Amplify:

```txt
https://prod.d22cvatd3f429t.amplifyapp.com/
```

API Gateway CORS must allow the Amplify origin so browser requests can include the Cognito `Authorization` token.

## Interview Summary

FinWise uses Cognito for managed identity, API Gateway as the secure HTTP entry point, Lambda for serverless backend logic, DynamoDB for scalable NoSQL storage, and Amplify Hosting for frontend deployment.


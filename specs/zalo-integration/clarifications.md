# Clarifications: Zalo Mini App Integration

## Q1: How to prevent ticket abuse?
**Answer:** In the initial version, we will allow simple ticket taking. For the next iteration, we will integrate Zalo OpenID to limit one ticket per user per service per day.

## Q2: SSE vs Polling for real-time updates?
**Answer:** We will attempt SSE first for efficiency. If Zalo Mini App's environment imposes restrictions, we will implement a smart polling mechanism (e.g., poll every 10s when far from the turn, every 2s when close).

## Q3: How to handle CORS and Domain Whitelisting?
**Answer:** We must add the Zalo Mini App's origin to the Bamso Backend's CORS configuration. The user will need to provide the Mini App ID to be whitelisted in the Zalo Developer Portal.

## Q4: Are push notifications required?
**Answer:** For the MVP, we focus on real-time tracking within the app. ZNS (Zalo Notification Service) will be considered as a Phase 2 enhancement due to costs and business verification requirements.

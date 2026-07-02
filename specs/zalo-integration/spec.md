# Specification: Zalo Mini App Integration

## 1. Overview
Integrate the Bamso queue management system with a Zalo Mini App to allow users to take tickets and track their queue status directly within Zalo.

## 2. User Stories
- **As a citizen,** I want to open the Bamso Zalo Mini App so that I can take a ticket without using a physical kiosk.
- **As a citizen,** I want to select a service from a list so that I get a ticket for the correct department.
- **As a citizen,** I want to see my ticket number and the current calling number in real-time so that I know when to approach the counter.
- **As a citizen,** I want a simple and fast interface so that I don't have to spend time learning how to use the app.

## 3. Functional Requirements
- **Service Listing:** The app must fetch and display the list of available services from the Bamso API.
- **Ticket Generation:** Upon selecting a service, the app must call the Bamso API to generate a ticket and display the ticket number to the user.
- **Real-time Tracking:** The app must periodically (or via SSE) fetch the current queue status for the user's service and display the current calling number.
- **Queue Status:** Clearly show the user's position in the queue (e.g., "There are 3 people ahead of you").

## 4. Non-Functional Requirements
- **Performance:** Ticket generation and status updates must be fast (< 2 seconds).
- **UX:** Follow Zalo Mini App design guidelines for a native experience.
- **Availability:** Gracefully handle cases where the Bamso Backend is offline.

## 5. Review & Acceptance Checklist
- [ ] User can select a service.
- [ ] User can successfully take a ticket.
- [ ] Ticket number is displayed correctly.
- [ ] Current calling number updates in real-time.
- [ ] Interface is responsive and follows Zalo standards.

# Business Service

- Source: /docs/arch/backend
- Mirror: /llms/pages/docs/arch/backend.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- Business Service Architecture (#business-service-overview)
- Request To Business Action (#request-to-business-action)
- Service Layer (#service-layer)
- Signal Surface (#signal-surface)
- Business Service Scenarios (#business-service-scenarios)

## Content

Business Service

Business Service Architecture

Akan business service is the server-side execution layer for business behavior. When a customer places an order, a manager adds stock, a reservation status changes, or a nightly report is generated, the business service decides what runs now, what changes stored data, what should run in the background, and which clients need to be notified.

Request actions

The user clicks a button and expects a clear result, such as submit order, add stock, or approve request.

Business services

Rules and orchestration live here: stock rules, payment status, reservation conflicts, and external APIs.

Background work

Slow, repeated, scheduled, or non-blocking tasks can run after the screen receives a quick response.

Realtime updates

When dashboards, devices, or other users should see a change, the business service publishes the updated result.

Request To Business Action

The most common business service path starts from a UI action. A generated client helper calls a signal endpoint, the endpoint delegates the business decision to a service, and the result updates stored data or returns a useful response to the screen.

Example: Article Server Module

A business service module can be read from right to left: traffic reaches the API port, signal exposes callable endpoints and auth boundaries, service makes the business decision, and document handles storage details.

Defines the archive rulebook: schema, query filters, sort options, and document-level helpers.

Owns business logic: who can change an article, how authors are added, and which document methods to call.

Exposes callable endpoints through 8282/api and applies auth boundaries before delegating to service logic.

Signal endpoints are exposed through the API port, so generated clients can call business actions through the same surface.

signal: phone operator

Receives calls for specific requests, filters spam or unsafe calls, manages operational pressure, and sends valid work to the right service.

service: business owner

Performs the actual work, decides how it should be done, and exchanges work with other domain owners when needed.

document: archive rulebook

Defines the document form, processing order, and organization rules used while the work is stored and handled.

Service Layer

A service is the business owner who performs the actual work. It decides how the work should be done, combines rules, saved data, other services, external APIs, and side effects into one meaningful business action.

Product stock

Check whether stock can be added, reserved, or reduced before updating inventory.

Payment flow

Coordinate a payment provider, order status, receipt record, and notification.

Reservation rule

Prevent overlapping bookings and decide whether a time slot can be confirmed.

Report generation

Gather data from several models and prepare a summary that can be viewed or exported.

A good rule of thumb: if the code answers a business question, put it in service logic. If it only draws a screen or stores temporary UI state, keep it on the UI side.

Dependency Injection

A service can receive the tools it needs instead of creating them by hand. This is how one business owner asks another domain owner, shared API, signal, or runtime adaptor for help.

Inject another domain service, such as admin using security or ticket using notification.

Inject configured values or external APIs such as storage, email, payment, or device APIs.

Inject a server signal when service logic needs to publish or call signal-level behavior.

Plug connects a service or runtime object to an adaptor role, such as queue, cache, storage, scheduler, or websocket.

An adaptor is a replaceable runtime connector. The same service can use solid, redis, local, or cloud-backed implementations.

Use memory for service-owned runtime state that may live locally or through a cache adaptor.

Signal Surface

A signal is like a phone operator for the business service. It receives calls from pages and generated clients, filters invalid or unsafe requests, manages the callable surface, and passes valid work to the right service.

User-callable actions exposed through the API surface. Endpoint can be HTTP-like query/mutation, or WebSocket-style message/pubsub.

Screen-readable list/detail surface. Slice combines guards, params, searches, and document filters so UI can load consistent screen data.

Server-only work that can be scheduled, queued, or executed by internal processes without exposing it as a public UI action.

Endpoint transport

Use query/mutation for request-response API work. Use message/pubsub when the screen needs WebSocket behavior, realtime messages, or room-based publish/subscribe.

Operation controls

Signal is also where request guards, parameters, search inputs, message inputs, cache hints, and throttling-style operational boundaries are described.

How To Choose A Signal Shape

Start from the product behavior. Does the user need an answer now, a live conversation, a broadcast to many screens, or a background job that finishes later?

Answer now

Use query or mutation when the screen asks once and expects one result. Good for loading a list, saving a form, approving a request, or adding stock.

Keep talking

Use message when an open screen needs a WebSocket-style conversation with the server, such as device control, live operation panels, or guided workflows.

Notify many screens

Use pubsub when one business change should be pushed to multiple open screens, dashboards, devices, or users.

Finish later

Use process, cron, interval, timeout, initialize, or destroy when work is queued, scheduled, repeated, or tied to server lifecycle.

Business Service Scenarios

Choose the business service path from the product situation. Some screens need a direct answer, some need a background worker, and some need to notify open screens after the data changes.

Simple request and response

Use this when the user clicks once and expects the result now, such as add stock, approve request, cancel reservation, or save profile.

Signal exposes the action as an endpoint. Service checks rules and updates data. The screen receives the result immediately.

Background operation

Use this when the business should run on a schedule, such as expiring old reservations, syncing partner data, or retrying failed device work every few minutes.

Internal signal declares the cron schedule. The batch runtime runs it repeatedly. Service finds the work that is due and applies the business rule.

Use this when the user asks for a heavy export, monthly summary, settlement file, or analytics report.

Endpoint starts the report job. Internal process builds the file or summary. Slice lets the screen read progress, status, and download result.

Realtime chat

Use this when a message written by one user should appear on other open chat screens immediately.

Endpoint receives the chat action and service saves the message. Pubsub publishes the saved chat to the chat room so every open screen can append it.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.


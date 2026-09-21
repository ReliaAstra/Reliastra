"""Email-only support desk.

Support at RELIASTRA is a mailbox, not a chat window. The product used to
carry a live conversation surface on both sides - a threaded console page with
five-second polling, and an admin workspace that refreshed every eight seconds
"so it reads as live chat". Both are gone. What replaces them is the loop the
company actually runs:

1. **A customer writes in.** Either from the console form
   (``POST /v1/support/requests``) or the public site form
   (``POST /v1/support/tickets``). Both land in the same ``feedback_tickets``
   queue.
2. **The team is alerted twice over.** Every new message is emailed to
   ``SUPPORT_NOTIFICATION_EMAILS`` *and* surfaces as a browser notification in
   the admin console (see ``GET /v1/admin/support/alerts``), so an operator can
   answer within the minute instead of on the next refresh.
3. **An admin answers from the admin inbox.** ``POST
   /v1/admin/support/tickets/{id}/reply`` sends the answer as email to the
   requester, records it on the ticket, and stops. There is no second live
   channel to keep in sync.

Why the removal is a correctness improvement, not a feature cut: a chat window
that only updates while the page is open is a promise the product cannot keep.
An email is delivered whether or not anyone has the tab focused, it survives a
closed laptop, and it gives both sides a durable record. Everything a thread
gave us - who wrote, when, what was said - stays on the ticket as email
history.

Nothing here is polled by the customer, and nothing here writes a message the
other side must be "watching" to receive.
"""

# Rollback boundary — 1.1.0-rc.3

1. Disable `SNICKERDOODLE_PAYMENTS_ENABLED` first to stop new Checkout Sessions; keep verified webhook settlement enabled when safe so existing obligations reconcile.
2. Preserve event receipts, reconciliation alerts, orders, and support obligations. Never roll a paid database backward to erase provider truth.
3. Roll application code back only to an immutable artifact whose environment contract and current forward schema are compatible.
4. Database changes are forward-only. Repair an applied schema with a separately reviewed forward fix; do not destructively reverse migrations on a customer-bearing system.
5. Reconcile Stripe/Supabase/mail state explicitly. An application rollback does not cancel/refund a Checkout Session, remove a webhook, restore a blob, or reverse a provider mutation.
6. Keep the service closed until schema/version, payment uniqueness, RLS/grants, queue, privacy tombstones, blob inventory, health, smoke, and customer obligations all pass.

SN07 proves these mechanics only with disposable local data. A production rollback target, immutable host binding, backup, operator, and action-time authority remain required.

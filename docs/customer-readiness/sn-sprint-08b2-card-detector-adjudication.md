# SN08B.2 card-detector adjudication

Status: **B false positive conclusively supported; RC.3 rule passes the exact hosted row read-only.**

No email address, numeric value, raw JSON, identifier, secret, payment value, or customer content is recorded here.

## Exact blocked-payload evidence

- Payload hash: `48c1040d46ef414f62bbddee70b3f9ed`.
- Matches: exactly 1.
- JSON path: `$.deliveryEmail`.
- Semantic class: email-address local-part submission timestamp suffix.
- Normalized digit count: 13.
- Separators present: no.
- Luhn: FAIL.
- Field shape: schema-typed string; syntactically valid email.
- Accepted location for payment-card data: NO.
- Unknown keys or field types: none.
- Free-text or arbitrary-content match: none.
- Independent non-card semantics: the 13-digit value has epoch-millisecond shape and is within five minutes of the row creation time.
- Pseudonymous match hash: `4271bb3e3e71b813e2ee5e4c86aacb09`.

A hosted read-only aggregate query selected only the payload hash and returned one
payload, one candidate, all-non-card true, no-separators true, typed-email-valid
true, allowlisted-keys true, and `rc3_detector_would_accept=true`. The row and
payload bytes were not changed, returned, copied into Git, or disclosed.

## Narrow correction

The RC.2 global guard rejected any 13–19 digit-shaped sequence anywhere in the
serialized JSON. RC.3 preserves every prior object/type/allowlist/size/secret
rule and preserves long-digit rejection for every field other than
`deliveryEmail`. A present `deliveryEmail` must pass the existing syntax and
length boundary. Candidates are inspected only in its local part, separator
characters are normalized, and Luhn-valid 13–19 digit candidates are rejected.
More-than-19-digit candidates and long digit runs in the domain are rejected.

The executable corpus rejects synthetic 13-, 16-, and 19-digit Luhn-valid PANs,
a separator-normalized PAN, card-like free text, an explicit payment field,
an unknown field, malformed email, credential material, an oversized payload,
and a Luhn-valid candidate embedded in a valid email local part. It accepts the
ordinary intake fixture and valid typed emails whose long local-part candidates
fail Luhn.

This adjudication is evidence for the exact RC.3 bytes only. It authorizes no
hosted DDL, migration retry, data correction, Stripe/Vercel/mail action, deploy,
push, customer-data processing, or commercial activation.

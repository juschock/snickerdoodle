# Snickerdoodle Mail Authentication Receipt

Date: 2026-09-04

## Scope

This receipt records the minimum production-mail authentication and monitored
mailbox proof for Snickerdoodle. It does not claim payment-production promotion,
owner AAL2 completion, or full launch readiness.

## Provider state

Domain: `racoben.com`

Mail provider: Microsoft 365

Authoritative DNS provider: GoDaddy

DKIM signing enabled: **YES**

Microsoft 365 reports that the domain is signing messages with DKIM signatures.

## DNS proof

Selector 1 authoritative resolution: **PASS**

Selector 2 authoritative resolution: **PASS**

Selector 1 public recursive resolution: **PASS**

Selector 2 public recursive resolution: **PASS**

Both selectors resolved to the exact provider-generated targets before DKIM
was enabled. The target values are intentionally omitted from this receipt.
No MX, SPF, DMARC, autodiscover, or unrelated DNS record was changed.

## Controlled message proof

Outbound message received externally: **PASS**

Inbound reply received by the Snickerdoodle mailbox: **PASS**

Reply-back received externally: **PASS**

The controlled messages contained only synthetic operational-check text and no
customer content.

## Authentication proof

Final outbound SPF: **PASS**

Final outbound DKIM: **PASS**

Final outbound DKIM signing-domain alignment: **PASS**

Final outbound DMARC: **PASS**

Reply-back SPF: **PASS**

Reply-back DKIM: **PASS**

Reply-back DKIM signing-domain alignment: **PASS**

Reply-back DMARC: **PASS**

The receiving provider exposed a DKIM signature on both accepted proof
messages. Only the authentication outcomes and alignment result were retained;
raw transport headers were not copied into this repository.

## Operational boundary

The `snickerdoodle@racoben.com` alias was independently shown to receive mail
and to send as the product identity. The mailbox is actively monitored through
the owner mailbox and its configured owner forwarding path.

Mailbox monitored: **YES**

## Data-handling boundary

This receipt contains no:

- credentials or session material
- mailbox message identifiers
- message bodies or attachments
- raw mail headers or transport addresses
- DKIM target values or private key material
- customer data
- unrelated mailbox content

## Result

Production mail authentication: **PASS**

Controlled send/receive/reply loop: **PASS**

Full launch readiness: **NOT CLAIMED**

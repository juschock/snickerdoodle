# Security policy

Please report suspected vulnerabilities using GitHub's private vulnerability reporting for this repository. Do not open a public issue or include credentials, payment data, customer data, or recovery codes in a report.

Include the affected URL or component, reproduction steps, and potential impact. Racoben Engineering will acknowledge, triage, and remediate valid reports as quickly as practical.

## Developer safeguards

Every pull request uses the committed lockfile, verifies npm registry signatures and attestations, audits production dependencies, and runs source, test, build, CodeQL, and full-history secret checks. To scan locally without installing Gitleaks globally, run `npm run security:secrets`. To scan only staged changes, run `npm run security:secrets:staged`.

The optional pre-commit configuration can be enabled with `pipx install pre-commit` followed by `pre-commit install`; Gitleaks itself is downloaded transiently and checksum-verified. Never suppress a finding by committing a real credential to an allowlist; revoke the credential, remove it from the repository, and document only a false-positive fingerprint when strictly necessary.

Update the scanner version and all platform checksums together from an official Gitleaks release, then verify both a clean history and a deliberately fake staged-secret fixture before merging.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const rehearsal = read('scripts/db/launch-recovery-rehearsal.sh');
const rebuildQueue = read('scripts/db/rebuild-intake-manager-queue.sql');
const postflight = read('scripts/db/sn06-recovery-postflight.sql');
const tombstone = read('scripts/db/sn06-replay-privacy-tombstone.sql');
const blobReconciliation = read('scripts/recovery/synthetic-blob-reconciliation.sh');
const contract = read('docs/recovery/recovery-contract.md');
const runbook = read('docs/recovery/launch-recovery-runbook.md');

describe('SN06 backup, restore, and launch recovery', () => {
  it('uses loopback-only disposable PostgreSQL 17 and restrictive backup custody', () => {
    expect(rehearsal).toContain('PostgreSQL 17 is required');
    expect(rehearsal).toContain('127.0.0.1');
    expect(rehearsal).toContain('umask 077');
    expect(rehearsal).toContain('chmod 600 "$current_dump"');
    expect(rehearsal).toContain('trap cleanup EXIT');
    expect(rehearsal).toContain('rm -rf -- "$tmp_dir"');
    expect(rehearsal).not.toContain('supabase link');
    expect(rehearsal).not.toContain('vercel');
  });

  it('destroys a distinct target and compares exact selected inventory before mutation', () => {
    expect(rehearsal).toContain('drop database if exists postgres with (force)');
    expect(rehearsal).toContain('create database postgres with template template0 owner postgres');
    expect(rehearsal).toContain('sn06_destroyed_sentinel');
    expect(rehearsal).toContain('restored_inventory="$(inventory "$target_url")"');
    expect(rehearsal).toContain('Current snapshot differs materially after restore');
    expect(rehearsal).toContain('supabase_migrations.schema_migrations');
  });

  it('rebuilds only the queue read model from authoritative inputs', () => {
    expect(rebuildQueue).toContain('lock table public.pending_intakes');
    expect(rebuildQueue).toContain('public.checkout_intents');
    expect(rebuildQueue).toContain('private.payment_reconciliation_alerts');
    expect(rebuildQueue).toContain('delete from private.intake_manager_queue');
    expect(rebuildQueue).toContain('private.sync_checkout_manager_queue(i.id)');
    expect(rebuildQueue).not.toContain('insert into public.orders');
    expect(rebuildQueue).not.toContain('insert into public.stripe_events');
    expect(contract).toContain('derived metadata-only read model');
  });

  it('proves payment, privacy, fulfillment, authorization, and isolation after restore', () => {
    expect(postflight).toContain('payment refund dispute and reconciliation evidence survived');
    expect(postflight).toContain('privacy anonymization and same-account/cross-account isolation survived');
    expect(postflight).toContain('assignment fulfillment and queue evidence survived');
    expect(postflight).toContain('provider and event uniqueness survived');
    expect(rehearsal).toContain('privileged-rpc-access-acceptance.sql');
    expect(rehearsal).toContain('payment-state-machine-acceptance.sql');
    expect(rehearsal).toContain('payment-state-machine-concurrency.sh');
    expect(rehearsal).toContain('payment-terminal-race-concurrency.sh');
  });

  it('migrates a prior snapshot forward and reapplies newer privacy tombstones', () => {
    expect(rehearsal).toContain('replay_migrations "$prior_url" 20');
    expect(rehearsal).toContain('implement_privacy_lifecycle_and_retention.sql');
    expect(rehearsal).toContain('sn06-replay-privacy-tombstone.sql');
    expect(tombstone).toContain('resurrected@sn06.example.invalid');
    expect(tombstone).toContain('SNICK_SN06_PRIVACY_TOMBSTONE_REPLAY_PASS');
    expect(runbook).toMatch(/replay durable privacy tombstones/i);
  });

  it('separates blob and provider recovery from database proof', () => {
    expect(blobReconciliation).toContain('blob-manifest.sha256');
    expect(blobReconciliation).toContain('tombstoned.txt');
    expect(runbook).toContain('A database dump does not cover blobs');
    expect(contract).toContain('Never claim a DB restore recreates/refunds/changes Stripe');
    expect(runbook).toContain('A database dump does not cover blobs, Stripe');
  });

  it('keeps reopen fail-closed and labels local RPO/RTO honestly', () => {
    expect(runbook).toContain('Failure or ambiguity at any step leaves the service closed');
    expect(runbook).toContain('Reopen only with explicit action-time authority');
    expect(runbook).toMatch(/neither result is a hosted cadence, RPO, RTO/i);
    expect(contract).toContain('hosted RPO/RTO remain approval/provider decisions');
  });
});

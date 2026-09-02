'use client';

import Link from 'next/link';
import { cloneElement, FormEvent, isValidElement, ReactElement, ReactNode, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  BriefFormData,
  Channel,
  briefFieldLimits,
  campaignFamilies,
  campaignTypes,
  channelOptions,
  emptyBrief,
  organizationTypes,
  toneOptions
} from '@/lib/intake';
import { PUBLIC_PREFIX } from '@/lib/site';
import { getTemplatesForIntakeFamily } from '@/lib/campaign-templates';

const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function Field({
  label,
  htmlFor,
  required,
  hint,
  children
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        ...(required ? { required: true, 'aria-required': true } : {}),
        ...(hintId ? { 'aria-describedby': hintId } : {})
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <>
            <span className="ml-0.5 text-primary" aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      {hint ? <p id={hintId} className="text-xs text-muted-foreground">{hint}</p> : null}
      {control}
    </div>
  );
}

function FormSection({
  step,
  title,
  description,
  children
}: {
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`brief-step-${step}`} className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary font-heading text-sm font-semibold text-primary">
          {step}
        </span>
        <h2 id={`brief-step-${step}`} className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      </div>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-6 grid gap-5">{children}</div>
    </section>
  );
}

export function BriefForm() {
  const [data, setData] = useState<BriefFormData>(emptyBrief);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const submissionAttempt = useRef<{ payload: string; key: string } | null>(null);
  const suggestedTemplates = getTemplatesForIntakeFamily(data.campaignFamily);

  function update<K extends keyof BriefFormData>(key: K, value: BriefFormData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function toggleChannel(channel: Channel) {
    setData((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((item) => item !== channel)
        : [...current.channels, channel]
    }));
  }

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const required = [
      ['primaryAction', 'Primary action'],
      ['organizationName', 'Organization name'],
      ['campaignName', 'Campaign name'],
      ['dateTime', 'Date & time'],
      ['locationOrLink', 'Location or link'],
      ['audience', 'Audience'],
      ['mainGoal', 'Main goal'],
      ['offerAsk', 'Offer / ask'],
      ['keyDetails', 'Key details'],
      ['deliveryEmail', 'Delivery email']
    ] as const;

    for (const [key, label] of required) {
      if (!String(data[key]).trim()) {
        showError(`${label} is required.`);
        return;
      }
    }
    if (data.campaignType === 'Other' && !data.campaignTypeOther.trim()) {
      showError('Please describe the campaign type.');
      return;
    }
    if (data.tone === 'Other' && !data.toneOther.trim()) {
      showError('Please describe the desired tone.');
      return;
    }
    if (data.channels.length === 0) {
      showError('Select at least one channel.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = JSON.stringify(data);
      if (submissionAttempt.current?.payload !== payload) {
        submissionAttempt.current = { payload, key: globalThis.crypto.randomUUID() };
      }

      const response = await fetch(`${PUBLIC_PREFIX}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submissionAttempt.current.key
        },
        body: payload
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (response.status === 409) submissionAttempt.current = null;
      if (!response.ok) throw new Error(result.error ?? 'Checkout could not be started.');
      if (result.url) {
        globalThis.location.assign(result.url);
        return;
      }
      throw new Error('Checkout did not return a secure payment URL. Please try again.');
    } catch (submissionError) {
      showError(submissionError instanceof Error ? submissionError.message : 'Checkout could not be started.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6" aria-busy={submitting}>
      <FormSection step="1" title="Campaign survey basics">
        <Field label="Organization Type" htmlFor="organizationType" required>
          <select
            id="organizationType"
            value={data.organizationType}
            onChange={(e) => update('organizationType', e.target.value as BriefFormData['organizationType'])}
            className={fieldClass}
          >
            {organizationTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Campaign Family"
          htmlFor="campaignFamily"
          required
          hint={
            suggestedTemplates.length > 0
              ? `Common packages: ${suggestedTemplates.map((t) => t.title).join('; ')}`
              : undefined
          }
        >
          <select
            id="campaignFamily"
            value={data.campaignFamily}
            onChange={(e) => update('campaignFamily', e.target.value as BriefFormData['campaignFamily'])}
            className={fieldClass}
          >
            {campaignFamilies.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Primary Action"
          htmlFor="primaryAction"
          required
          hint="What should people do? Examples: donate, book, visit, register, call, review, refer."
        >
          <input
            id="primaryAction"
            value={data.primaryAction}
            onChange={(e) => update('primaryAction', e.target.value)}
            placeholder="Book a grooming appointment, donate, attend, visit the store, register"
            className={fieldClass}
            maxLength={briefFieldLimits.primaryAction}
          />
        </Field>

        <Field label="Organization / Business Name" htmlFor="organizationName" required>
          <input
            id="organizationName"
            value={data.organizationName}
            onChange={(e) => update('organizationName', e.target.value)}
            placeholder="Example: Meadowline Animal Rescue"
            className={fieldClass}
            maxLength={briefFieldLimits.organizationName}
            autoComplete="organization"
          />
        </Field>

        <Field label="Campaign / Event Name" htmlFor="campaignName" required>
          <input
            id="campaignName"
            value={data.campaignName}
            onChange={(e) => update('campaignName', e.target.value)}
            placeholder="Example: Annual Dog Adoption Gala"
            className={fieldClass}
            maxLength={briefFieldLimits.campaignName}
          />
        </Field>

        <Field label="Campaign Type" htmlFor="campaignType" required>
          <select
            id="campaignType"
            value={data.campaignType}
            onChange={(e) => update('campaignType', e.target.value as BriefFormData['campaignType'])}
            className={fieldClass}
          >
            {campaignTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        {data.campaignType === 'Other' ? (
          <Field label="Describe campaign type" htmlFor="campaignTypeOther" required>
            <input
              id="campaignTypeOther"
              value={data.campaignTypeOther}
              onChange={(e) => update('campaignTypeOther', e.target.value)}
              className={fieldClass}
              maxLength={briefFieldLimits.campaignTypeOther}
            />
          </Field>
        ) : null}

        <Field label="Date & Time" htmlFor="dateTime" required hint="For events or campaign windows.">
          <input
            id="dateTime"
            value={data.dateTime}
            onChange={(e) => update('dateTime', e.target.value)}
            placeholder="Saturday, October 15, 6:00 PM — or — Campaign runs October 1–15"
            className={fieldClass}
            maxLength={briefFieldLimits.dateTime}
          />
        </Field>

        <Field label="Location or Online Link" htmlFor="locationOrLink" required>
          <input
            id="locationOrLink"
            value={data.locationOrLink}
            onChange={(e) => update('locationOrLink', e.target.value)}
            placeholder="123 Main Street, Herndon, VA — or — https://eventbrite.com/..."
            className={fieldClass}
            maxLength={briefFieldLimits.locationOrLink}
          />
        </Field>
      </FormSection>

      <FormSection step="2" title="Audience and goal">
        <Field label="Target Audience" htmlFor="audience" required>
          <input
            id="audience"
            value={data.audience}
            onChange={(e) => update('audience', e.target.value)}
            placeholder="Local families, animal lovers, past donors, young professionals, existing customers"
            className={fieldClass}
            maxLength={briefFieldLimits.audience}
          />
        </Field>

        <Field label="Main Goal" htmlFor="mainGoal" required>
          <input
            id="mainGoal"
            value={data.mainGoal}
            onChange={(e) => update('mainGoal', e.target.value)}
            placeholder="Sell 100 tickets, raise $5,000, get 50 sign-ups, bring 200 people to the store"
            className={fieldClass}
            maxLength={briefFieldLimits.mainGoal}
          />
        </Field>

        <Field label="Offer / Ask" htmlFor="offerAsk" required>
          <input
            id="offerAsk"
            value={data.offerAsk}
            onChange={(e) => update('offerAsk', e.target.value)}
            placeholder="$25 tickets, suggested $50 donation, free admission, 20% off this weekend"
            className={fieldClass}
            maxLength={briefFieldLimits.offerAsk}
          />
        </Field>

        <Field
          label="Key Details / Highlights"
          htmlFor="keyDetails"
          required
          hint="Special guests, deadlines, perks, speakers, entertainment, sponsors, parking, registration details, or anything that makes this special."
        >
          <textarea
            id="keyDetails"
            value={data.keyDetails}
            onChange={(e) => update('keyDetails', e.target.value)}
            rows={4}
            className={fieldClass}
            maxLength={briefFieldLimits.keyDetails}
          />
        </Field>
      </FormSection>

      <FormSection step="3" title="Tone and channels">
        <Field label="Desired Tone" htmlFor="tone" required>
          <select
            id="tone"
            value={data.tone}
            onChange={(e) => update('tone', e.target.value as BriefFormData['tone'])}
            className={fieldClass}
          >
            {toneOptions.map((tone) => (
              <option key={tone} value={tone}>
                {tone}
              </option>
            ))}
          </select>
        </Field>

        {data.tone === 'Other' ? (
          <Field label="Describe tone" htmlFor="toneOther" required>
            <input
              id="toneOther"
              value={data.toneOther}
              onChange={(e) => update('toneOther', e.target.value)}
              className={fieldClass}
              maxLength={briefFieldLimits.toneOther}
            />
          </Field>
        ) : null}

        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Channels Needed
            <span className="ml-0.5 text-primary" aria-hidden="true">*</span>
            <span className="sr-only"> (select at least one)</span>
          </legend>
          <p className="mt-1 text-xs text-muted-foreground">
            Not sure? A good starter set is Email, Facebook, Instagram, Flyer/Print, and Landing Page/Event Page.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {channelOptions.map((channel) => (
              <label
                key={channel}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-secondary/60"
              >
                <input
                  type="checkbox"
                  checked={data.channels.includes(channel)}
                  onChange={() => toggleChannel(channel)}
                  className="size-4 shrink-0 rounded border-input text-primary accent-primary"
                />
                {channel}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Website & Social Links" htmlFor="websiteSocial">
          <textarea
            id="websiteSocial"
            value={data.websiteSocial}
            onChange={(e) => update('websiteSocial', e.target.value)}
            rows={3}
            placeholder="Website, Facebook page, Instagram, Eventbrite, donation page, registration link, etc."
            className={fieldClass}
            maxLength={briefFieldLimits.websiteSocial}
          />
        </Field>
      </FormSection>

      <FormSection step="4" title="Requirements and notes">
        <Field label="Phrases to Include" htmlFor="phrasesInclude">
          <textarea
            id="phrasesInclude"
            value={data.phrasesInclude}
            onChange={(e) => update('phrasesInclude', e.target.value)}
            rows={2}
            placeholder={'“Adopt, don\'t shop” · “Support local families” · “Limited seats available”'}
            className={fieldClass}
            maxLength={briefFieldLimits.phrasesInclude}
          />
        </Field>

        <Field label="Phrases / Topics to Avoid" htmlFor="phrasesAvoid">
          <textarea
            id="phrasesAvoid"
            value={data.phrasesAvoid}
            onChange={(e) => update('phrasesAvoid', e.target.value)}
            rows={2}
            placeholder="Avoid sounding too salesy · Do not mention prior low attendance · Avoid political language"
            className={fieldClass}
            maxLength={briefFieldLimits.phrasesAvoid}
          />
        </Field>

        <Field label="Additional Notes" htmlFor="additionalNotes">
          <textarea
            id="additionalNotes"
            value={data.additionalNotes}
            onChange={(e) => update('additionalNotes', e.target.value)}
            rows={3}
            placeholder="Anything else we should know before preparing the package?"
            className={fieldClass}
            maxLength={briefFieldLimits.additionalNotes}
          />
        </Field>

        <Field label="Delivery Email" htmlFor="deliveryEmail" required hint="Where should we send the finished package?">
          <input
            id="deliveryEmail"
            type="email"
            value={data.deliveryEmail}
            onChange={(e) => update('deliveryEmail', e.target.value)}
            placeholder="you@example.com"
            className={fieldClass}
            maxLength={briefFieldLimits.deliveryEmail}
            autoComplete="email"
          />
        </Field>
      </FormSection>

      {error ? (
        <div
          ref={errorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
        <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={submitting}>
          {submitting ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Your survey is stored securely, then Stripe collects payment on its hosted checkout. Work begins only after payment is confirmed and the intake is complete.{' '}
          By continuing, you agree to our <Link className="underline" href="/terms">terms</Link> and{' '}
          <Link className="underline" href="/privacy">privacy notice</Link>. Fields marked with <span className="text-primary">*</span> are required.
        </p>
      </div>
    </form>
  );
}

import { z } from 'zod';
import {
  briefFieldLimits,
  campaignFamilies,
  campaignTypes,
  channelOptions,
  organizationTypes,
  toneOptions
} from '@/lib/intake';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default('');

export const briefCheckoutSchema = z.object({
  organizationType: z.enum(organizationTypes),
  campaignFamily: z.enum(campaignFamilies),
  primaryAction: requiredText(briefFieldLimits.primaryAction),
  organizationName: requiredText(briefFieldLimits.organizationName),
  campaignName: requiredText(briefFieldLimits.campaignName),
  campaignType: z.enum(campaignTypes),
  campaignTypeOther: optionalText(briefFieldLimits.campaignTypeOther),
  dateTime: requiredText(briefFieldLimits.dateTime),
  locationOrLink: requiredText(briefFieldLimits.locationOrLink),
  audience: requiredText(briefFieldLimits.audience),
  mainGoal: requiredText(briefFieldLimits.mainGoal),
  offerAsk: requiredText(briefFieldLimits.offerAsk),
  keyDetails: requiredText(briefFieldLimits.keyDetails),
  tone: z.enum(toneOptions),
  toneOther: optionalText(briefFieldLimits.toneOther),
  channels: z.array(z.enum(channelOptions)).min(1),
  websiteSocial: optionalText(briefFieldLimits.websiteSocial),
  phrasesInclude: optionalText(briefFieldLimits.phrasesInclude),
  phrasesAvoid: optionalText(briefFieldLimits.phrasesAvoid),
  deliveryEmail: z.string().trim().email().max(briefFieldLimits.deliveryEmail),
  additionalNotes: optionalText(briefFieldLimits.additionalNotes)
}).superRefine((brief, context) => {
  if (brief.campaignType === 'Other' && !brief.campaignTypeOther) {
    context.addIssue({ code: 'custom', path: ['campaignTypeOther'], message: 'Describe the campaign type.' });
  }
  if (brief.tone === 'Other' && !brief.toneOther) {
    context.addIssue({ code: 'custom', path: ['toneOther'], message: 'Describe the desired tone.' });
  }
});

export type CheckoutBrief = z.infer<typeof briefCheckoutSchema>;

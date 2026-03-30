'use server';
/**
 * @fileOverview An AI-powered assistant for merchant onboarding.
 *
 * - aiMerchantOnboardingAssistant - A function that handles the AI analysis for merchant onboarding.
 * - AiMerchantOnboardingAssistantInput - The input type for the aiMerchantOnboardingAssistant function.
 * - AiMerchantOnboardingAssistantOutput - The return type for the aiMerchantOnboardingAssistant function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AiMerchantOnboardingAssistantInputSchema = z
  .object({
    businessDescription: z
      .string()
      .optional()
      .describe("A detailed description of the merchant's business."),
    websiteUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "The merchant's website URL. The AI will analyze this URL to infer business details."
      ),
  })
  .refine(
    data => data.businessDescription || data.websiteUrl,
    'Either businessDescription or websiteUrl must be provided.'
  );
export type AiMerchantOnboardingAssistantInput = z.infer<
  typeof AiMerchantOnboardingAssistantInputSchema
>;

const AiMerchantOnboardingAssistantOutputSchema = z.object({
  suggestedCategories: z
    .array(z.string())
    .describe('A list of suggested business categories for the merchant.'),
  riskFactors: z
    .array(z.string())
    .describe(
      'Potential risk factors identified based on the business description or website content.'
    ),
  prefilledFields: z
    .object({
      companyName: z
        .string()
        .optional()
        .describe('Suggested company name derived from the input.'),
      businessType: z
        .string()
        .optional()
        .describe('Suggested general business type (e.g., "e-commerce", "retail").'),
      descriptionSummary: z
        .string()
        .optional()
        .describe('A brief summary of the business description.'),
    })
    .describe('Suggested fields to pre-fill in the merchant registration form.'),
});
export type AiMerchantOnboardingAssistantOutput = z.infer<
  typeof AiMerchantOnboardingAssistantOutputSchema
>;

export async function aiMerchantOnboardingAssistant(
  input: AiMerchantOnboardingAssistantInput
): Promise<AiMerchantOnboardingAssistantOutput> {
  return aiMerchantOnboardingAssistantFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiMerchantOnboardingAssistantPrompt',
  input: {schema: AiMerchantOnboardingAssistantInputSchema},
  output: {schema: AiMerchantOnboardingAssistantOutputSchema},
  prompt: `You are an AI-powered merchant onboarding assistant. Your goal is to help "Makers" quickly onboard new merchants by analyzing their business description or website URL.

Based on the provided information, you need to:
1. Suggest relevant business categories.
2. Identify potential risk factors for a payment gateway (e.g., high-risk industries, unusual business models, regulatory concerns).
3. Pre-fill common registration form fields.

Strictly return the output in JSON format according to the provided schema.

${'{{#if businessDescription}}'}
Business Description: {{{businessDescription}}}
${'{{/if}}'}

${'{{#if websiteUrl}}'}
Website URL: {{{websiteUrl}}}
(Analyze the URL to infer business details, categories, and potential risks.)
${'{{/if}}'}
`,
});

const aiMerchantOnboardingAssistantFlow = ai.defineFlow(
  {
    name: 'aiMerchantOnboardingAssistantFlow',
    inputSchema: AiMerchantOnboardingAssistantInputSchema,
    outputSchema: AiMerchantOnboardingAssistantOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('AI assistant failed to generate output.');
    }
    return output;
  }
);

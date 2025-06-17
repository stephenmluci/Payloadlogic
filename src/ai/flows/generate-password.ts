// src/ai/flows/generate-password.ts
'use server';

/**
 * @fileOverview Generates a secure password using Genkit.
 *
 * - generatePassword - A function that generates a password.
 * - GeneratePasswordInput - The input type for the generatePassword function.
 * - GeneratePasswordOutput - The return type for the generatePassword function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GeneratePasswordInputSchema = z.object({
  length: z.number().min(8).default(12).describe('The desired length of the password. Must be at least 8 characters.'),
  includeNumbers: z.boolean().default(true).describe('Whether to include numbers in the password.'),
  includeSymbols: z.boolean().default(true).describe('Whether to include symbols in the password.'),
});
export type GeneratePasswordInput = z.infer<typeof GeneratePasswordInputSchema>;

const GeneratePasswordOutputSchema = z.object({
  password: z.string().describe('The generated password.'),
});
export type GeneratePasswordOutput = z.infer<typeof GeneratePasswordOutputSchema>;

export async function generatePassword(input: GeneratePasswordInput): Promise<GeneratePasswordOutput> {
  return generatePasswordFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generatePasswordPrompt',
  input: {schema: GeneratePasswordInputSchema},
  output: {schema: GeneratePasswordOutputSchema},
  prompt: `You are a password generator. Generate a strong, unique password based on the following criteria:

Length: {{length}} characters
Include numbers: {{#if includeNumbers}}Yes{{else}}No{{/if}}
Include symbols: {{#if includeSymbols}}Yes{{else}}No{{/if}}

Ensure the password is truly random and hard to guess.

Output the generated password.
`,
});

const generatePasswordFlow = ai.defineFlow(
  {
    name: 'generatePasswordFlow',
    inputSchema: GeneratePasswordInputSchema,
    outputSchema: GeneratePasswordOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
